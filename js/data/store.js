/* ------------------------------------------------------------------ */
/* Store — état global, synchronisation, actions métier                 */
/*                                                                     */
/* Deux fournisseurs de partage, une seule mécanique :                 */
/*   - `github` : `products.json` (jeton facultatif, lecture seule      */
/*     possible sans jeton sur un dépôt public) ;                      */
/*   - `worker` : un lien privé Cloudflare, sans jeton ni expiration.  */
/*                                                                      */
/* Les produits voyagent par les deux. Les factures, par le lien privé   */
/* seul : `products.json` ne les porte pas, et une facture reste donc    */
/* locale tant que le lien privé n'est pas configuré. La vue Factures   */
/* le dit à l'écran plutôt que de le laisser découvrir.                  */
/*                                                                     */
/* Mécanisme de synchronisation, volontairement simple :                */
/*   - aucune scrutation en arrière-plan, aucun état « en direct » ;   */
/*   - une seule lecture distante, déclenchée par un rafraîchissement   */
/*     de la page, un clic sur la pastille ou le bouton « Actualiser »; */
/*   - les modifications locales sont poussées immédiatement, et        */
/*     republiées au prochain rafraîchissement si l'envoi a échoué ;     */
/*   - les échecs restent affichés (bandeau, pastille, Réglages) au      */
/*     lieu d'être le résultat d'une scrutation silencieuse.            */
/* ------------------------------------------------------------------ */

import { storage } from '../core/storage.js'
import { toast } from '../core/feedback.js'
import { uid } from '../core/utils.js'
import { getThemePreference, setTheme } from '../core/theme.js'
import { STATUS, CARD_LAYOUT_VALUES, normalizeList, normalizeProduct, normalizeBill, normalizeBillList, BILL_STATUS } from './model.js'
import {
  PROVIDER_GITHUB,
  PROVIDER_WORKER,
  canWrite,
  fetchDefaultConfig,
  fetchRemoteList,
  normalizeConfig,
  providerOf,
  putRemoteList,
  READ_ONLY_MESSAGE,
} from './sync.js'
import { mergeBills, mergeProducts } from './backup.js'
import * as photoStore from './photo-store.js'

/* Clés historiques conservées pour ne rien perdre sur les appareils existants. */
const PRODUCTS_KEY = 'purchase-gros-list-v2'
/* Le nom de la clé est historique : elle contient aujourd'hui la config
   GitHub *ou* le lien privé, pour ne pas perdre les appareils existants. */
const CONFIG_KEY = 'purchase-gros-github-v1'
const PREFS_KEY = 'purchase-gros-prefs-v1'
const DIRTY_KEY = 'purchase-gros-dirty-v1'
/* L'utilisateur a demandé à rester hors GitHub : on ne reconnecte pas. */
const OPTOUT_KEY = 'purchase-gros-github-optout-v1'

/* Factures — hors de la liste produits, et hors du JSON local : le JSON
   ne garde que du texte, les tickets de facture vont dans IndexedDB avec
   les photos, comme ceux des produits. */
const BILLS_KEY = 'purchase-gros-bills-v1'

export const DEFAULT_PREFS = {
  filter: 'todo',
  category: 'all',
  sort: 'recent',
  layout: 'card',
  installHidden: false,
}

/* Les préférences viennent du stockage local ET d'un fichier distant. Une
   valeur illisible ne doit pas produire une classe CSS qui n'existe pas :
   on retombe sur le mode par défaut plutôt que sur un écran cassé. */
function normalizeLayout(value) {
  return CARD_LAYOUT_VALUES.includes(value) ? value : DEFAULT_PREFS.layout
}

let products = []
let bills = []
let config = normalizeConfig(storage.get(CONFIG_KEY))
let prefs = { ...DEFAULT_PREFS, ...(storage.get(PREFS_KEY) || {}) }
prefs.layout = normalizeLayout(prefs.layout)
let state = {
  loaded: false,
  status: config ? 'connecting' : 'local',
  message: '',
  messageKind: '',
  lastSyncAt: null,
  pending: false,
  dirty: storage.get(DIRTY_KEY) === true,
}
let sha = null
/* Révision numérique du dernier document connu (lien privé uniquement). */
let remoteRev = 0
let lastNotified = { message: '', at: 0 }
const listeners = new Set()
const NOTIFY_COOLDOWN_MS = 8000

/* ------------------------------------------------------------------ */
/* Abonnement / émission                                               */
/* ------------------------------------------------------------------ */

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch (error) {
      console.error('Erreur dans un abonné du store :', error)
    }
  }
}

/* ------------------------------------------------------------------ */
/* Lecture de l'état                                                   */
/* ------------------------------------------------------------------ */

/** Libellé de la pastille : six états, tous compréhensibles sans survol. */
export function statusLabel(status) {
  if (status === 'ready') return 'À jour'
  if (status === 'connecting') return 'Connexion…'
  if (status === 'saving') return 'Envoi…'
  if (status === 'offline') return 'Hors ligne'
  if (status === 'error') return 'Erreur'
  return 'Local seul'
}

/** Record d'un échec (message + genre) puis notification, une seule fois. */
function reportFailure(result) {
  state.message = result.message || 'Synchronisation impossible.'
  state.messageKind = 'error'
  notify(state.message)
}

function applyFailure(result) {
  /* `offline` = réseau coupé ; `error` = dépôt inaccessible, écriture refusée… */
  state.status = result.status === 'offline' ? 'offline' : 'error'
  reportFailure(result)
}

/**
 * GitHub a refusé le jeton (expiré, révoqué, mauvais droits). On le met de
 * côté sans rien casser : un dépôt public reste lisible en anonyme.
 */
function markTokenRejected() {
  if (providerOf(config) !== PROVIDER_GITHUB) return false
  if (!config || !config.token || config.tokenRejected) return false
  config = { ...config, tokenRejected: true }
  storage.set(CONFIG_KEY, config)
  return true
}

/** Message non bloquant : la lecture fonctionne, l'écriture non. */
function readOnlyNote() {
  return config?.token
    ? 'Jeton refusé par GitHub — la liste est relue en anonyme (dépôt public). Ajoutez un jeton valide pour publier vos modifications.'
    : READ_ONLY_MESSAGE
}

function notify(message) {
  const now = Date.now()
  if (lastNotified.message === message && now - lastNotified.at < NOTIFY_COOLDOWN_MS) return
  lastNotified = { message, at: now }
  toast(message, { type: 'error', duration: 7000 })
}

export function getState() {
  return {
    ...state,
    products,
    bills,
    config,
    prefs,
    provider: providerOf(config),
    isConfigured: Boolean(config),
    /* Un dépôt public se lit sans jeton : seule l'écriture en exige un. */
    readOnly: Boolean(config) && !canWrite(config),
    hasToken: Boolean(config?.token),
    /* Modifications que le distant ne peut pas recevoir : l'utilisateur doit
       le savoir, sinon deux appareils affichent deux listes différentes. */
    unpublished: state.dirty && Boolean(config) && !canWrite(config),
    statusLabel: statusLabel(state.status),
    pendingCount: products.filter((product) => product.status === STATUS.TODO).length,
    /* L'écriture locale a échoué : l'utilisateur doit l'apprendre, sinon il
       croit avoir enregistré alors que la liste disparaîtra au rechargement.
       Le quota est signalé par `storageProblem` (localStorage ou IndexedDB). */
    storageProblem,
    storageFull: storageProblem === 'quota',
    photosSeparated,
    usage,
  }
}

export const isStorageFull = () => storageProblem === 'quota'

/** Vrai quand les photos sont stockées à part (donc hors du quota du JSON). */
export const arePhotosSeparated = () => photosSeparated

export const getProducts = () => products
export const getBills = () => bills
export const isLoaded = () => state.loaded
export const getStatus = () => state.status
export const getSyncMessage = () => state.message
export const getConfig = () => config
export const getLastSyncAt = () => state.lastSyncAt
export const getPrefs = () => ({ ...prefs })
export const isPending = () => state.pending

/* Réglages partagés entre appareils (le jeton et `installHidden` restent locaux). */
const SYNCED_PREFS = ['filter', 'category', 'sort', 'layout']

function settingsSnapshot() {
  return {
    theme: getThemePreference(),
    filter: prefs.filter,
    category: prefs.category,
    sort: prefs.sort,
    layout: prefs.layout,
  }
}

/** Applique les réglages reçus de GitHub (le distant gagne). */
function applyRemoteSettings(settings) {
  if (!settings || typeof settings !== 'object') return false
  let changed = false
  for (const key of SYNCED_PREFS) {
    if (key === 'layout') {
      const layout = normalizeLayout(settings[key])
      if (settings[key] !== undefined && layout !== prefs.layout) {
        prefs.layout = layout
        changed = true
      }
      continue
    }
    if (settings[key] !== undefined && settings[key] !== prefs[key]) {
      prefs[key] = settings[key]
      changed = true
    }
  }
  if (settings.theme && settings.theme !== getThemePreference()) {
    setTheme(settings.theme)
    changed = true
  }
  if (changed) storage.set(PREFS_KEY, prefs)
  return changed
}

let prefsQueue = Promise.resolve()

/* Les changements de réglages sont sérialisés pour ne rien perdre. */
function pushPrefs() {
  prefsQueue = prefsQueue.then(() => push())
}

export function setPrefs(patch = {}) {
  const { theme, ...rest } = patch
  if (theme) setTheme(theme)
  if (Object.keys(rest).length) {
    if ('layout' in rest) rest.layout = normalizeLayout(rest.layout)
    prefs = { ...prefs, ...rest }
    storage.set(PREFS_KEY, prefs)
  }
  emit()
  pushPrefs()
  return prefs
}

/* ------------------------------------------------------------------ */
/* Configuration de partage                                             */
/* ------------------------------------------------------------------ */

export function saveConfig(input) {
  config = normalizeConfig(input)
  if (config) storage.set(CONFIG_KEY, config)
  else storage.remove(CONFIG_KEY)
  /* Configuration choisie à la main : elle prime sur le dépôt par défaut. */
  storage.remove(OPTOUT_KEY)
  sha = null
  remoteRev = 0
  state.dirty = false
  storage.remove(DIRTY_KEY)
  state.message = ''
  state.messageKind = ''
  lastNotified = { message: '', at: 0 }
  emit()
  return load()
}

/* Message manuel de la ligne d'état (« Tester la connexion », pré-remplissage…). */
export function setSyncMessage(message = '', kind = '') {
  state.message = message
  state.messageKind = kind
  emit()
  return state
}

export function clearConfig() {
  config = null
  storage.remove(CONFIG_KEY)
  /* Déconnexion volontaire : on ne doit pas se reconnecter tout seul ensuite. */
  storage.set(OPTOUT_KEY, true)
  sha = null
  remoteRev = 0
  state.status = 'local'
  state.message = ''
  state.messageKind = ''
  state.dirty = false
  storage.remove(DIRTY_KEY)
  lastNotified = { message: '', at: 0 }
  emit()
  return state
}

/* ------------------------------------------------------------------ */
/* Stockage local                                                      */
/* ------------------------------------------------------------------ */

/**
 * Charge la liste locale et réattache les photos.
 *
 * Le JSON local ne contient plus les photos : elles sont dans IndexedDB,
 * rattachées par `id`. On les remet dans `product.photo` et `bill.photo`
 * parce que tout le reste de l'application — rendu, envoi distant, fusion,
 * export — lit ces champs. Si IndexedDB est indisponible, le JSON garde les
 * photos en ligne (voir `persistLocal`), donc cette étape ne perd rien.
 */
async function loadLocal() {
  /* Pas de démonstration : une liste vide reste vide, le partage GitHub
     (ou l'ajout manuel) reste la seule source de données — ainsi chaque
     appareil affiche exactement la même chose. */
  products = normalizeList(storage.get(PRODUCTS_KEY, null))
  bills = normalizeBillList(storage.get(BILLS_KEY, null))
  /* La base est testée au chargement, pas à la première photo : si elle est
     inaccessible, on garde les photos dans le JSON, comme avant. */
  await photoStore.ensureReady()
  await attachPhotos(products)
  await attachBillPhotos(bills)
  await queuePersist()
  await queuePersistBills()
}

/** Les deux collections d'images, une seule lecture de la base. */
async function photoMaps() {
  if (!photoStore.isAvailable()) return null
  if (!(await photoStore.ensureReady())) return null
  const maps = await photoStore.getAllWithReceipts()
  /* Une lecture réussie — même vide — fait autorité : à partir de là, une
     valeur vide en mémoire veut vraiment dire « pas de photo ». */
  if (maps) photosHydrated = true
  return maps
}

/** Réinjecte les photos stockées à part dans les produits correspondants. */
async function attachPhotos(list) {
  const maps = await photoMaps()
  if (!maps) return list
  for (const product of list) {
    if (product?.id) {
      if (!product.photo) product.photo = maps.photos.get(product.id) || ''
      if (!product.receipt) product.receipt = maps.receipts.get(product.id) || ''
    }
  }
  return list
}

/**
 * Même chose pour les factures : leur image de ticket est stockée dans le
 * champ `receipt`, comme celle d'un produit acheté, et se relit dans
 * `bill.photo` — le reste de l'application ne connaît que ce nom.
 */
async function attachBillPhotos(list) {
  const maps = await photoMaps()
  if (!maps) return list
  for (const bill of list) {
    if (bill?.id && !bill.photo) bill.photo = maps.receipts.get(bill.id) || ''
  }
  return list
}

/**
 * La liste locale, et sa taille réelle.
 *
 * Les photos sont des chaînes base64 intégrées au produit : c'est de loin la
 * source principale de poids, et c'est la raison pour laquelle le navigateur
 * peut refuser l'écriture. On mesure donc à chaque enregistrement plutôt que
 * de le deviner, pour pouvoir prévenir avant la perte.
 */
let usage = { bytes: 0, photos: 0, photoBytes: 0 }
/** La base d'images a-t-elle déjà été lue ? Une lecture manquée laisse des
 *  champs vides qu'il ne faut surtout pas prendre pour un retrait. */
let photosHydrated = false

/** Refus d'écriture local en cours, à montrer tant qu'il n'est pas résolu. */
let storageProblem = ''

/** Les photos vivent à part ; cette bascule le dit pour les réglages. */
let photosSeparated = false

/**
 * Les écritures locales sont sérialisées.
 *
 * `persistLocal()` est désormais asynchrone (IndexedDB), alors que `touch()`
 * reste synchrone pour ne pas ralentir chaque frappe. Deux modifications
 * rapides lanceraient donc deux écritures concurrentes, qui pourraient se
 * terminer dans le désordre et laisser une liste périmée sur le disque. On les
 * enchaîne : la seconde attend la première, et l'état final est toujours le
 * dernier demandé.
 */
let writeChain = Promise.resolve(true)

function queuePersist() {
  const run = () => persistLocal()
  writeChain = writeChain.then(run, run)
  return writeChain
}

/**
 * Enregistre la liste locale, photos mises à part.
 * Le JSON local ne porte plus que du texte, quelques kilo-octets : il ne peut
 * donc plus signaler un quota à cause des photos. Les photos vont dans
 * IndexedDB, par `id`. Le format d'échange, lui, est inchangé : le document
 * publié contient toujours les photos en base64.
 *
 * Si IndexedDB refuse (mode privé, quota disque), on ne perd rien : on
 * réécrit le JSON complet, photos comprises, et on remonte l'échec pour que
 * l'utilisateur le sache. C'est exactement le repli d'avant.
 */
async function persistLocal() {
  const separate = photoStore.isAvailable()
  const stripped = separate ? products.map((product) => ({ ...product, photo: '' })) : products

  let text = '[]'
  try {
    text = JSON.stringify(stripped)
  } catch {
    /* Circularité improbable, mais on n'écrit pas une chaîne cassée. */
  }
  usage = measureUsage(products, text, separate)

  /* Les deux écritures sont jugées ensemble : l'une des deux peut échouer
     alors que l'autre passe. Ici le JSON est du texte, donc cette étape ne
     peut plus tomber sur un quota de photos ; l'ordre compte quand même,
     parce qu'un succès isolé ne doit pas effacer l'échec de l'autre. */
  const photoError = separate ? await writePhotos() : ''

  /* Si les photos n'ont pas pu être mises à part, on les remet dans le JSON :
     c'est le seul endroit où elles survivront. Le repli d'avant, donc. */
  const jsonPayload = separate && photoError ? products : stripped
  let jsonText = text
  if (jsonPayload !== stripped) {
    try {
      jsonText = JSON.stringify(jsonPayload)
    } catch {
      jsonText = text
    }
  }
  const jsonOk = storage.setRaw(PRODUCTS_KEY, jsonPayload, jsonText)

  if (jsonOk) {
    photosSeparated = separate && !photoError
  }
  const reason = photoError || (jsonOk ? '' : storage.failureReason())
  if (!reason) {
    /* Tout est passé : l'éventuelle alerte précédente n'a plus lieu d'être. */
    storageProblem = ''
    state.message = ''
    state.messageKind = ''
    return true
  }

  return reportStorageProblem(reason)
}

/**
 * Le compte rendu d'un refus d'écriture, au même endroit pour les produits
 * et pour les factures : une seule alerte, une seule porte de sortie. Avant,
 * une facture refusée disparaissait sans rien dire, et l'utilisateur croyait
 * l'avoir enregistrée.
 * @returns {false} toujours : l'appelant n'a rien de bon à faire de plus.
 */
function reportStorageProblem(reason) {
  storageProblem = reason
  if (reason === 'quota') {
    state.message = 'Stockage du navigateur plein : les photos ne sont plus enregistrées sur cet appareil. Exportez une sauvegarde JSON, puis retirez des photos. Votre liste est encore affichée, mais elle disparaîtra à la fermeture.'
    state.messageKind = 'error'
    notify(state.message)
  }
  return false
}

/**
 * Écrit les photos dans IndexedDB, puis supprime celles qui n'appartiennent
 * plus à rien.
 *
 * Les deux collections y passent : une facture range son ticket dans le champ
 * `receipt`, comme un produit acheté. Les champs sont réécrits à chaque passe,
 * y compris quand ils sont vides — c'est ainsi qu'une photo retirée disparaît
 * vraiment au lieu de revenir au rechargement.
 * @returns {string} la raison de l'échec, ou une chaîne vide si tout est passé.
 */
async function writePhotos() {
  const promises = []
  /* Tant que la base n'a pas été lue, un champ vide ne prouve rien : il peut
     aussi bien signifier « pas de photo » que « on n'a pas su la relire ».
     Écrire ce vide supprimerait une image parfaitement saine ; on ne le fait
     donc pas, et la lecture ratée secorrigera au prochain chargement. */
  const put = (id, data, type) => {
    if (!id) return
    if (!data && !photosHydrated) return
    promises.push(photoStore.put(id, data || '', type))
  }
  for (const product of products) {
    put(product?.id, product?.photo, 'photo')
    put(product?.id, product?.receipt, 'receipt')
  }
  for (const bill of bills) put(bill?.id, bill?.photo, 'receipt')
  const results = promises.length ? await Promise.all(promises) : []
  /* Les images des éléments disparus ne doivent pas rester pour toujours.
     Les deux listes sont fournies : ne garder que les produits effacerait le
     ticket de chaque facture à la première modification de produit. Même règle
     que ci-dessus : sans lecture de la base, on ne purge rien — on ne connaît
     alors que sa propre liste, pas l'état du disque. */
  if (photosHydrated) await photoStore.prune([...products, ...bills].map((item) => item?.id).filter(Boolean))
  if (results.every((ok) => ok)) return ''
  return photoStore.failureReason() || 'unavailable'
}

/**
 * Poids total, nombre de photos et part occupée par les photos.
 *
 * Les tickets de facture comptent avec les photos : ce sont eux qui pèsent,
 * et les omettre ferait croire à un stockage bien plus léger qu'il n'est.
 */
function measureUsage(list, text, separate) {
  let photos = 0
  let photoBytes = 0
  for (const item of [...list, ...bills]) {
    const photo = item?.photo
    if (typeof photo === 'string' && photo) {
      photos += 1
      photoBytes += photo.length
    }
  }
  /* Quand les photos sont à part, le JSON local ne les compte plus : on
     annonce le poids réellement stocké, pas celui d'un document composite. */
  return { bytes: text.length, photos, photoBytes, separated: Boolean(separate) }
}

/* ------------------------------------------------------------------ */
/* Persistance des factures                                          */
/* ------------------------------------------------------------------ */

/**
 * Enregistre les factures, photos mises à part.
 *
 * Le chemin est celui des produits : le ticket part dans IndexedDB, le JSON
 * local ne garde que du texte. Si IndexedDB refuse, on le remet dans le
 * JSON plutôt que de le perdre, et l'échec est signalé — une facture
 * enregistrée sans le dire est une facture perdue au rechargement.
 */
async function persistBills() {
  const separate = photoStore.isAvailable()
  const photoError = separate ? await writePhotos() : ''
  const stripped = bills.map((bill) => ({ ...bill, photo: '' }))
  const payload = separate && photoError ? bills : separate ? stripped : bills

  let text = '[]'
  try {
    text = JSON.stringify(payload)
  } catch {
    /* Circularité improbable, mais on n'écrit pas une chaîne cassée. */
  }
  const ok = storage.setRaw(BILLS_KEY, payload, text)
  const reason = photoError || (ok ? '' : storage.failureReason())
  if (!reason) return true
  return reportStorageProblem(reason)
}

function queuePersistBills() {
  const run = () => persistBills()
  writeChain = writeChain.then(run, run)
  return writeChain
}


/* ------------------------------------------------------------------ */
/* Chargement & synchronisation                                        */
/* ------------------------------------------------------------------ */

/**
 * Le KV de Cloudflare est cohérent à terme : une lecture peut rendre un
 * document plus ancien que celui qu'on a déjà publié. Écraser la liste
 * locale avec une révision inférieure perdrait des produits — on ignore
 * donc ces lectures, exactement comme GitHub avec un SHA périmé.
 */
function isStaleRead(remote) {
  if (typeof remote?.rev !== 'number') return false
  if (remote.rev <= 0) return false
  return remoteRev > 0 && remote.rev < remoteRev
}

/**
 * Point d'entrée unique de la lecture distante : appelé au démarrage
 * (donc à chaque rafraîchissement de la page) et par `refresh()`.
 * Les modifications locales non poussées gagnent, sinon la version
 * distante remplace la locale.
 */
async function syncWithRemote() {
  const remote = await fetchRemoteList(config)
  if (!remote.ok) return { ok: false, status: remote.status, message: remote.message }
  if (isStaleRead(remote)) {
    /* Lecture arrivée après coup : on garde l'état local, déjà à jour. */
    if (typeof remote.rev === 'number') remoteRev = Math.max(remoteRev, remote.rev)
    return markReady(false)
  }
  if (typeof remote.rev === 'number') remoteRev = Math.max(remoteRev, remote.rev)

  if (remote.list === null) {
    /* Aucun document publié pour l'instant : on publie la liste locale. */
    if (state.dirty || products.length || bills.length) return push({ force: true })
    return markReady()
  }
  if (state.dirty) return push()

  const normalized = normalizeList(remote.list)
  sha = remote.sha
  let changed = false
  if (JSON.stringify(normalized) !== JSON.stringify(products)) {
    products = normalized
    /* Attend l'écriture : `load()` se termine sur cette valeur, et une
       lecture locale périmée repartirait au prochain rafraîchissement. */
    await queuePersist()
    changed = true
  }
  /* `bills: null` = un document publié avant l'existence des factures, donc
     une version du Worker pas encore redéployée. On garde alors les factures
     locales : ce silence ne doit jamais coûter les siennes. Un tableau vide,
     lui, reste une suppression et s'applique. */
  if (Array.isArray(remote.bills)) {
    const remoteBills = normalizeBillList(remote.bills)
    if (JSON.stringify(remoteBills) !== JSON.stringify(bills)) {
      bills = remoteBills
      await queuePersistBills()
      changed = true
    }
  }
  if (applyRemoteSettings(remote.settings)) changed = true
  return markReady(changed)
}

/** État « à jour » : le libellé et l'horodatage ne changent qu'en cas de succès. */
function markReady(changed = false) {
  state.status = 'ready'
  state.message = ''
  state.messageKind = ''
  state.lastSyncAt = Date.now()
  if (changed) emit()
  return { ok: true, status: 'ready' }
}

export async function load() {
  state.loaded = false
  emit()

  /* Appareil neuf : on tente le dépôt public par défaut, en lecture seule.
     C'est ce qui fait qu'ouvrir le lien GitHub dans un navigateur affiche
     la même liste que l'application installée. */
  if (!config && storage.get(OPTOUT_KEY) !== true) {
    if (await connectDefault()) {
      state.loaded = true
      emit()
      return getState()
    }
  }

  if (!config) {
    await loadLocal()
    state.status = 'local'
    state.loaded = true
    emit()
    return getState()
  }

  /* La liste locale est chargée AVANT la lecture distante. Sans cela elle
     n'existe pas en mémoire au moment du « lien encore vide », et un appareil
     qui se connecte pour la première fois afficherait une liste vide au lieu
     de publier la sienne. C'est aussi le repli si la lecture échoue. */
  await loadLocal()
  const result = await refresh()
  state.loaded = true
  emit()
  return getState()
}

/**
 * Connexion silencieuse au dépôt public par défaut. Sans jeton, donc en lecture
 * seule : si le dépôt est inaccessible, on renonce sans message d'erreur pour
 * qu'un appareil neuf ne se croie pas en panne.
 */
async function connectDefault() {
  const defaults = await fetchDefaultConfig()
  if (!defaults) return false
  const remote = await fetchRemoteList(defaults)
  if (!remote.ok) return false

  config = defaults
  sha = remote.sha
  products = normalizeList(remote.list || [])
  await queuePersist()
  if (applyRemoteSettings(remote.settings)) storage.set(PREFS_KEY, prefs)
  state.status = 'ready'
  state.lastSyncAt = Date.now()
  state.message = READ_ONLY_MESSAGE
  state.messageKind = 'ok'
  return true
}

/**
 * Actualise les données depuis GitHub. C'est le seul déclencheur de lecture
 * distante : un rafraîchissement de la page, un clic sur la pastille ou le
 * bouton « Synchroniser » des Réglages.
 */
export async function refresh() {
  if (!config) {
    await queuePersist()
    return { ok: true, status: 'local' }
  }
  if (state.pending) return { ok: true, status: state.status }

  state.status = 'connecting'
  emit()
  const result = await syncWithRemote()
  if (result.tokenRejected) markTokenRejected()
  if (!result.ok) {
    applyFailure(result)
  } else if (result.readOnly) {
    /* Lecture réussie sans jeton : informational, pas une erreur. */
    state.message = readOnlyNote()
    state.messageKind = 'ok'
  }
  emit()
  return result
}

/** Publie la liste (GitHub ou lien privé si configuré, sinon stockage local). */
export async function push({ force = false } = {}) {
  if (!config) {
    /* Attend l'écriture avant d'annoncer « rien à pousser » : sans cela un
       rafraîchissement immédiat repartirait d'un disque encore ancien. */
    await queuePersist()
    state.dirty = false
    emit()
    return { ok: true, status: 'local' }
  }
  if (state.pending && !force) return { ok: true, status: state.status }

  /* Le document publié est construit depuis `products`, en mémoire. La base
     locale doit être à jour avant l'envoi : sinon une publication qui suit un
     rechargement partirait d'un JSON encore sans les photos de la session.
     Le verrou est posé avant l'attente, sinon deux publications rapprochées
     passeraient toutes deux le test ci-dessus et enverraient en double. */
  state.pending = true
  try {
    await queuePersist()
  } catch (error) {
    state.pending = false
    console.error('Écriture locale impossible avant publication :', error)
  }

  state.status = 'saving'
  emit()

  const result = await putRemoteList(config, products, sha, settingsSnapshot(), bills)
  state.pending = false

  if (result.ok) {
    sha = result.sha
    if (typeof result.rev === 'number') remoteRev = Math.max(remoteRev, result.rev)
    if (Array.isArray(result.list)) {
      /* Une fusion propose la liste retenue : on l'adopte pour que l'écran et
         le distant affichent exactement la même chose. */
      const merged = normalizeList(result.list)
      if (JSON.stringify(merged) !== JSON.stringify(products)) {
        products = merged
        await queuePersist()
      }
    }
    /* Les factures suivent la même règle : un conflit peut en avoir ramené
       une que cet appareil n'avait pas, et l'écran doit le montrer. */
    if (Array.isArray(result.bills)) {
      const mergedBills = normalizeBillList(result.bills)
      if (JSON.stringify(mergedBills) !== JSON.stringify(bills)) {
        bills = mergedBills
        await queuePersistBills()
      }
    }
    state.dirty = false
    storage.remove(DIRTY_KEY)
    state.status = 'ready'
    /* Une synchronisation réussie ne doit pas effacer une alerte de stockage :
       le message distant est valide, mais les photos peuvent rester en échec
       d'écriture locale. On ne remet le message à zéro que si rien ne cloche
       de ce côté. */
    if (!storageProblem) {
      state.message = ''
      state.messageKind = ''
    }
    state.lastSyncAt = Date.now()
  } else {
    if (result.tokenRejected) markTokenRejected()
    state.dirty = true
    storage.set(DIRTY_KEY, true)
    await queuePersist()
    applyFailure(result)
  }
  emit()
  return result
}

/* ------------------------------------------------------------------ */
/* Migration GitHub -> lien privé                                       */
/* ------------------------------------------------------------------ */

/**
 * Copie la liste publiée sur GitHub vers le lien privé.
 * Le dépôt étant public, cette lecture se fait sans jeton : la migration
 * tient en un clic, sans rien configurer par ailleurs.
 * @returns {Promise<{ok:boolean, message:string, count?:number}>}
 */
export async function importFromGithub() {
  if (providerOf(config) !== PROVIDER_WORKER) {
    return { ok: false, message: "Sélectionnez d'abord « Lien privé » puis collez votre lien." }
  }
  const defaults = await fetchDefaultConfig()
  if (!defaults) {
    return { ok: false, message: 'Dépôt GitHub par défaut introuvable (sync-defaults.json).' }
  }
  const remote = await fetchRemoteList(defaults)
  if (!remote.ok) return { ok: false, message: remote.message || 'Liste GitHub illisible.' }
  if (remote.list === null) {
    return { ok: false, message: 'Aucune liste publiée sur GitHub à copier pour l\'instant.' }
  }

  const list = normalizeList(remote.list || [])
  /* Les produits viennent de GitHub, les factures restent locales : on ne
     copie que ce que GitHub sait porter. Sans cela, la copie viderait les
     factures d'un appareil qui en a. */
  const result = await putRemoteList(config, list, null, remote.settings, bills)
  if (!result.ok) return { ok: false, message: result.message || 'Publication impossible.' }

  sha = result.sha
  if (typeof result.rev === 'number') remoteRev = Math.max(remoteRev, result.rev)
  products = list
  persistLocal()
  state.dirty = false
  storage.remove(DIRTY_KEY)
  state.status = 'ready'
  state.lastSyncAt = Date.now()
  state.message = `${list.length} produit(s) copiés depuis GitHub.`
  state.messageKind = 'ok'
  emit()
  return { ok: true, count: list.length, message: state.message }
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** Marque l'état comme modifié, persiste localement puis pousse.
 *  Le drapeau « modifications non poussées » est persistant : un rafraîchissement
 *  ou un redémarrage ne peut jamais écraser la liste locale par la distante. */
function touch({ broadcast = true } = {}) {
  state.dirty = true
  storage.set(DIRTY_KEY, true)
  /* Volontairement sans `await` : `touch()` est synchrone, sinon chaque
     frappe attendrait IndexedDB. L'écriture est sérialisée par `queuePersist`,
     donc elle aboutit quand même, et l'ordre est respecté. */
  queuePersist()
  if (broadcast) emit()
}

/**
 * L'équivalent pour une facture : même drapeau, même persistance.
 *
 * Le drapeau est partagé avec les produits, et c'est nécessaire : `syncWithRemote`
 * saute le document distant dès qu'il est posé, donc une facture nouvelle
 * serait autrement écrasée au prochain rafraîchissement.
 */
function touchBills() {
  state.dirty = true
  storage.set(DIRTY_KEY, true)
  queuePersistBills()
  emit()
}

function find(id) {
  return products.find((item) => item.id === id) || null
}

export function addProduct(input = {}) {
  const product = normalizeProduct({
    ...input,
    id: input.id || uid('local'),
    status: STATUS.TODO,
    boughtAt: null,
  })
  products = [...products, product]
  touch()
  push()
  return product
}

export function updateProduct(id, changes = {}) {
  const current = find(id)
  if (!current) return null
  const next = normalizeProduct({
    ...current,
    ...changes,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  })
  products = products.map((item) => (item.id === id ? next : item))
  touch()
  push()
  return next
}

export function toggleBought(id) {
  const current = find(id)
  if (!current) return null
  const bought = current.status !== STATUS.BOUGHT
  const next = normalizeProduct({
    ...current,
    status: bought ? STATUS.BOUGHT : STATUS.TODO,
    boughtAt: bought ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  })
  products = products.map((item) => (item.id === id ? next : item))
  touch()
  push()
  return bought
}

/** Force un statut précis (mode marché, cases à cocher). */
export function setBought(id, bought) {
  const current = find(id)
  if (!current) return null
  if ((current.status === STATUS.BOUGHT) === Boolean(bought)) return current
  return toggleBought(id)
}

/**
 * Supprime un produit.
 * @returns {{product:object, index:number}|null} de quoi annuler la suppression.
 */
export function deleteProduct(id) {
  const index = products.findIndex((item) => item.id === id)
  if (index < 0) return null
  const product = products[index]
  products = products.filter((item) => item.id !== id)
  /* La photo part avec le produit, sinon elle resterait sur le disque pour
     toujours. L'annulation la réécrira si l'utilisateur revient en arrière. */
  if (photoStore.isAvailable()) photoStore.remove([id])
  touch()
  push()
  return { product, index }
}

/** Réinsère un produit supprimé (action « Annuler »). */
export function restoreProduct(product, index = null) {
  if (!product) return null
  const restored = normalizeProduct(product)
  const next = [...products]
  const position = Number.isInteger(index) ? Math.min(Math.max(index, 0), next.length) : next.length
  next.splice(position, 0, restored)
  products = next
  touch()
  push()
  return restored
}

export function clearBought() {
  const removed = products.filter((item) => item.status === STATUS.BOUGHT)
  if (!removed.length) return []
  products = products.filter((item) => item.status !== STATUS.BOUGHT)
  /* Les photos des produits achetés partants sont libérées ici aussi. */
  if (photoStore.isAvailable()) photoStore.remove(removed.map((item) => item.id))
  touch()
  push()
  return removed
}

/** Réinjecte des produits supprimés (action « Annuler »). */
export function restoreMany(list = []) {
  if (!list.length) return 0
  products = [...products, ...normalizeList(list)]
  touch()
  push()
  return list.length
}

export function clearAll() {
  products = []
  /* Les factures partent avec : les laisser derrière pointait vers des
     images déjà effacées. */
  bills = []
  if (photoStore.isAvailable()) photoStore.clear()
  touch()
  queuePersistBills()
  push()
  return true
}

/**
 * Import d'une sauvegarde.
 * @param {'merge'|'replace'} mode
 */
export function importProducts(list = [], { mode = 'merge' } = {}) {
  if (mode === 'replace') {
    products = normalizeList(list)
    touch()
    push()
    return { added: products.length, updated: 0 }
  }
  const result = mergeProducts(products, normalizeList(list))
  products = result.list
  touch()
  push()
  return { added: result.added, updated: result.updated }
}

export function replaceAll(list = []) {
  return importProducts(list, { mode: 'replace' })
}

/* ------------------------------------------------------------------ */
/* Mutations Factures                                                 */
/* ------------------------------------------------------------------ */

function findBill(id) {
  return bills.find((item) => item.id === id) || null
}

export function addBill(input = {}) {
  const bill = normalizeBill({
    ...input,
    id: input.id || uid('bill'),
  })
  bills = [...bills, bill]
  touchBills()
  push()
  return bill
}

export function updateBill(id, changes = {}) {
  const current = findBill(id)
  if (!current) return null
  const next = normalizeBill({
    ...current,
    ...changes,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  })
  bills = bills.map((item) => (item.id === id ? next : item))
  touchBills()
  push()
  return next
}

export function toggleBillPaid(id) {
  const current = findBill(id)
  if (!current) return null
  const paid = current.status !== BILL_STATUS.PAID
  const next = normalizeBill({
    ...current,
    status: paid ? BILL_STATUS.PAID : BILL_STATUS.PENDING,
    paidAt: paid ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  })
  bills = bills.map((item) => (item.id === id ? next : item))
  touchBills()
  push()
  return paid
}

/**
 * Supprime une facture.
 * @returns {{bill:object, index:number}|null} de quoi annuler la suppression.
 */
export function deleteBill(id) {
  const index = bills.findIndex((item) => item.id === id)
  if (index < 0) return null
  const bill = bills[index]
  bills = bills.filter((item) => item.id !== id)
  /* Le ticket part avec la facture : sinon il resterait sur le disque, et
     « vider la liste » ne viderait pas tout. */
  if (photoStore.isAvailable()) photoStore.remove([id])
  touchBills()
  push()
  return { bill, index }
}

/** Réinsère une facture supprimée (action « Annuler »). */
export function restoreBill(bill, index = null) {
  if (!bill) return null
  const restored = normalizeBill(bill)
  const next = [...bills]
  const position = Number.isInteger(index) ? Math.min(Math.max(index, 0), next.length) : next.length
  next.splice(position, 0, restored)
  bills = next
  touchBills()
  push()
  return restored
}

/**
 * Import d'une sauvegarde : les factures suivent le même sort que les
 * produits, pour qu'une restauration ramène les deux d'un coup.
 * @param {'merge'|'replace'} mode
 */
export function importBills(list = [], { mode = 'merge' } = {}) {
  if (!list.length) return { added: 0, updated: 0 }
  if (mode === 'replace') {
    bills = normalizeBillList(list)
    touchBills()
    push()
    return { added: bills.length, updated: 0 }
  }
  const result = mergeBills(bills, normalizeBillList(list))
  bills = result.list
  touchBills()
  push()
  return { added: result.added, updated: result.updated }
}

/* Lecture initiale : la configuration puis la liste. */
if (typeof document !== 'undefined') {
  load()
}