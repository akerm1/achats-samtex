/* ------------------------------------------------------------------ */
/* Store — état global, synchronisation, actions métier                 */
/*                                                                     */
/* Deux fournisseurs de partage, une seule mécanique :                 */
/*   - `github` : `products.json` (jeton facultatif, lecture seule      */
/*     possible sans jeton sur un dépôt public) ;                      */
/*   - `worker` : un lien privé Cloudflare, sans jeton ni expiration.  */
/*                                                                      */
/* Les deux fournisseurs portent le même document complet : factures,
   dépenses et caisse. `products.json` n'est qu'un nom de fichier
   historique ; il contient tout ce qui est partagé. */
/*                                                                          */
/* Mécanisme de synchronisation, volontairement simple :                     */
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
import { BILL_STATUS, normalizeBill, normalizeBillList } from './bills-model.js'
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
import { mergeBills } from './backup.js'
import * as photoStore from './photo-store.js'
import * as expensesStore from './expenses-store.js'
import * as cashflowStore from './cashflow-store.js'
import * as deletions from './deletions.js'
import { DELETED, without } from './deletions.js'

/* Clé historique de l'ancienne liste de produits : effacée au chargement. */
const LEGACY_PRODUCTS_KEY = 'purchase-gros-list-v2'
/* Le nom de la clé est historique : elle contient aujourd'hui la config
   GitHub *ou* le lien privé, pour ne pas perdre les appareils existants. */
const CONFIG_KEY = 'purchase-gros-github-v1'
const PREFS_KEY = 'purchase-gros-prefs-v1'
const DIRTY_KEY = 'purchase-gros-dirty-v1'
/* Un document du lien privé a-t-il déjà porté les dépenses ? Sert une seule
   fois : à la première rencontre avec un Worker v6, on fusionne au lieu
   d'écraser (voir `syncWithRemote`). */
const EXPENSES_SEEN_KEY = 'purchase-gros-expenses-sync-v1'
/* L'utilisateur a demandé à rester hors GitHub : on ne reconnecte pas. */
const OPTOUT_KEY = 'purchase-gros-github-optout-v1'

/* Factures — hors du JSON local : le JSON ne garde que du texte, les tickets
   de facture vont dans IndexedDB avec les photos. */
const BILLS_KEY = 'purchase-gros-bills-v1'

export const DEFAULT_PREFS = {
  installHidden: false,
}

/* Les dépenses partagent le même drapeau : toute modification pousse. */
expensesStore.subscribe(() => {
  markChanged()
  emit()
  push()
})

/* La caisse suit exactement la même règle. */
cashflowStore.subscribe(() => {
  markChanged()
  emit()
  push()
})

/* Les préférences viennent du stockage local ET d'un fichier distant. */

let bills = []
let config = normalizeConfig(storage.get(CONFIG_KEY))
let prefs = { ...DEFAULT_PREFS, ...(storage.get(PREFS_KEY) || {}) }
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
/* Version du document publié par le Worker : 6 = il garde les dépenses.
   0 = pas encore su (aucun document lu ni écrit depuis l'ouverture). */
let remoteDocVersion = 0
/* Nombre de dépenses que le serveur porte réellement, d'après la dernière
   lecture : `null` = inconnu (aucune lecture, ou document d'avant la v6).
   C'est la seule preuve visible que la saisie d'un appareil est bien arrivée. */
let remoteExpensesCount = null
let lastNotified = { message: '', at: 0 }
const listeners = new Set()
const NOTIFY_COOLDOWN_MS = 8000
/* Reprise après coupure réseau : 5 s, puis doublement jusqu'à une minute. */
const RETRY_FIRST_MS = 5000
const RETRY_MAX_MS = 60000
/* Compteur des modifications locales. Il sert à ne pas déclarer « tout est
   publié » alors qu'une modification est arrivée PENDANT l'envoi : c'était
   la cause de « je supprime, ça revient » — le drapeau `dirty` était effacé
   par une publication partie avant la suppression, et la lecture suivante
   réinstallait l'élément depuis le serveur. */
let changeSeq = 0
let pushChain = Promise.resolve()
let queuedPush = null

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
  if (result.status === 'conflict') {
    /* Deux appareils publient au même instant : c'est normal, pas une panne.
       On garde l'état « prêt » avec un message calme ; le drapeau `dirty`
       est resté posé et une nouvelle publication part automatiquement. */
    state.status = 'ready'
    state.message = result.message || 'Synchronisation en cours avec les autres appareils.'
    state.messageKind = 'ok'
    state.lastSyncAt = Date.now()
    scheduleRetry()
    return
  }
  /* `offline` = réseau coupé ; `error` = dépôt inaccessible, écriture refusée… */
  state.status = result.status === 'offline' ? 'offline' : 'error'
  reportFailure(result)
  scheduleRetry()
}

/* Une reprise automatique, avec un délai qui double : une coupure de réseau
   de quelques secondes ne doit pas laisser l'application « hors ligne »
   jusqu'au prochain clic. Aucune scrutation quand tout va bien : ce minuteur
   n'existe qu'après un échec et s'arrête au premier succès. */
let retryTimer = null
let retryDelay = RETRY_FIRST_MS

function scheduleRetry() {
  if (retryTimer || typeof setTimeout !== 'function' || !config) return
  /* Lecture seule : réessayer n'y changera rien (il manque un jeton). */
  if (providerOf(config) === PROVIDER_GITHUB && !canWrite(config)) return
  retryTimer = setTimeout(async () => {
    retryTimer = null
    if (!config) return
    const result = state.dirty ? await push({ force: true }) : await refresh()
    if (result?.ok) {
      retryDelay = RETRY_FIRST_MS
      return
    }
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
    scheduleRetry()
  }, retryDelay)
}

/** Reprise immédiate (retour du réseau, application revenue au premier plan). */
export function wakeUp() {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  retryDelay = RETRY_FIRST_MS
  if (!config) return Promise.resolve({ ok: true, status: 'local' })
  return refresh()
}

/** Une synchronisation a réussi : plus rien à réessayer. */
function syncSucceeded() {
  retryDelay = RETRY_FIRST_MS
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
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
    /* L'écriture locale a échoué : l'utilisateur doit l'apprendre, sinon il
       croit avoir enregistré alors que la liste disparaîtra au rechargement.
       Le quota est signalé par `storageProblem` (localStorage ou IndexedDB). */
    storageProblem,
    storageFull: storageProblem === 'quota',
    photosSeparated,
    usage,
    /* Le partage transporte-t-il les dépenses ? GitHub oui, toujours (le
       document est écrit en v6). Un Worker v5 les reçoit puis les ignore :
       l'écran doit le dire, sinon la saisie reste sur un seul appareil sans
       que rien ne l'explique. */
    expensesSync: Boolean(config) && carriesExpenses(),
    expensesSyncKnown: Boolean(config) && remoteDocVersion > 0,
    /* Combien de dépenses le serveur en a : l'écran les affiche à côté des
       locales, pour que « rien n'est arrivé » se voie au lieu de se deviner. */
    expensesRemote: remoteExpensesCount,
    /* Même chose pour la caisse : GitHub porte toujours le document v8, un
       Worker v7 reçoit `cashflow` puis le jette. */
    cashflowSync: Boolean(config) && carriesCashflow(),
    cashflowSyncKnown: Boolean(config) && remoteDocVersion > 0,
  }
}

export const isStorageFull = () => storageProblem === 'quota'

/** Vrai quand les photos sont stockées à part (donc hors du quota du JSON). */
export const arePhotosSeparated = () => photosSeparated

export const getBills = () => bills
export const isLoaded = () => state.loaded
export const getStatus = () => state.status
export const getSyncMessage = () => state.message
export const getConfig = () => config
export const getLastSyncAt = () => state.lastSyncAt
export const getPrefs = () => ({ ...prefs })
export const isPending = () => state.pending

/* Réglages partagés entre appareils (le jeton et `installHidden` restent locaux). */
function settingsSnapshot() {
  return { theme: getThemePreference() }
}

/** Applique les réglages reçus de GitHub (le distant gagne). */
function applyRemoteSettings(settings) {
  if (!settings || typeof settings !== 'object') return false
  let changed = false
  if (settings.theme && settings.theme !== getThemePreference()) {
    setTheme(settings.theme)
    changed = true
  }
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
  const previous = config
  const next = normalizeConfig(input)
  /* Nouveau partage : l'appareil a peut-être des données que le distant ne
     connaît pas. On marque l'état « à publier » pour que la première lecture
     FUSIONNE au lieu de remplacer. Sur GitHub, un PUT sans SHA déclenche un
     conflit, donc la fusion par `id` — aucune donnée locale n'est perdue. */
  const switched =
    !previous ||
    providerOf(previous) !== providerOf(next) ||
    previous.owner !== next?.owner ||
    previous.repo !== next?.repo ||
    previous.branch !== next?.branch ||
    previous.endpoint !== next?.endpoint
  const publishLocal =
    switched &&
    providerOf(next) === PROVIDER_GITHUB &&
    canWrite(next) &&
    Boolean(bills.length || expensesStore.hasData())

  config = next
  if (config) storage.set(CONFIG_KEY, config)
  else storage.remove(CONFIG_KEY)
  /* Configuration choisie à la main : elle prime sur le dépôt par défaut. */
  storage.remove(OPTOUT_KEY)
  sha = null
  remoteRev = 0
  remoteDocVersion = 0
  remoteExpensesCount = null
  if (switched) storage.remove(EXPENSES_SEEN_KEY)
  /* Nouveau partage : les pierres tombales de l'ancien ne le concernent pas
     (le document distant garde les siennes et les redonnera à la lecture). */
  if (switched) deletions.clear()
  state.dirty = publishLocal
  if (publishLocal) storage.set(DIRTY_KEY, true)
  else storage.remove(DIRTY_KEY)
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
  remoteDocVersion = 0
  remoteExpensesCount = null
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
 * Charge les factures locales et réattache leurs photos.
 *
 * Le JSON local ne contient pas les photos : elles sont dans IndexedDB,
 * rattachées par `id`. On les remet dans `bill.photo` parce que tout le reste
 * de l'application — rendu, envoi distant, fusion, export — lit ce champ.
 */
async function loadLocal() {
  /* L'ancienne liste de produits n'existe plus : on efface sa clé locale
     pour ne pas laisser de données mortes sur les appareils existants. */
  storage.remove(LEGACY_PRODUCTS_KEY)
  bills = normalizeBillList(storage.get(BILLS_KEY, null))
  /* La base est testée au chargement, pas à la première photo : si elle est
     inaccessible, on garde les photos dans le JSON, comme avant. */
  await photoStore.ensureReady()
  await attachBillPhotos(bills)
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

/** Réinjecte les photos stockées à part dans les factures correspondantes. */
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
 * `persistBills()` est asynchrone (IndexedDB), alors que `touchBills()` reste
 * synchrone pour ne pas ralentir chaque frappe. Deux modifications rapides
 * lanceraient donc deux écritures concurrentes, qui pourraient se terminer
 * dans le désordre et laisser des factures périmées sur le disque. On les
 * enchaîne : la seconde attend la première, et l'état final est toujours le
 * dernier demandé.
 */
let writeChain = Promise.resolve(true)

/**
 * Le compte rendu d'un refus d'écriture, au même endroit pour toutes les
 * collections : une seule alerte, une seule porte de sortie. Avant, une
 * facture refusée disparaissait sans rien dire, et l'utilisateur croyait
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
 * Une facture range son ticket dans le champ `receipt`, relu ensuite dans
 * `bill.photo`. Les champs sont réécrits à chaque passe, y compris quand ils
 * sont vides — c'est ainsi qu'une photo retirée disparaît vraiment au lieu de
 * revenir au rechargement.
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
  for (const bill of bills) put(bill?.id, bill?.photo, 'receipt')
  const results = promises.length ? await Promise.all(promises) : []
  /* Les images des factures disparues ne doivent pas rester pour toujours.
     Même règle que ci-dessus : sans lecture de la base, on ne purge rien —
     on ne connaît alors que sa propre liste, pas l'état du disque. */
  if (photosHydrated) await photoStore.prune(bills.map((item) => item?.id).filter(Boolean))
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
 * Le ticket part dans IndexedDB, le JSON local ne garde que du texte. Si
 * IndexedDB refuse, on le remet dans le JSON plutôt que de le perdre, et
 * l'échec est signalé — une facture enregistrée sans le dire est une facture
 * perdue au rechargement.
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
  usage = measureUsage(bills, text, separate)
  if (separate) photosSeparated = !photoError
  const ok = storage.setRaw(BILLS_KEY, payload, text)
  const reason = photoError || (ok ? '' : storage.failureReason())
  if (!reason) {
    storageProblem = ''
    return true
  }
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
 * document plus ancien que celui qu'on a déjà publié. Écraser les factures
 * locales avec une révision inférieure perdrait des saisies — on ignore
 * donc ces lectures, exactement comme GitHub avec un SHA périmé.
 */
function isStaleRead(remote) {
  if (typeof remote?.rev !== 'number') return false
  if (remote.rev <= 0) return false
  return remoteRev > 0 && remote.rev < remoteRev
}

/**
 * Le fournisseur configuré peut-il transporter les dépenses ?
 *
 * GitHub écrit toujours le document en v6. Le lien privé dépend du Worker
 * déployé : un v5 reçoit les dépenses puis les jette, donc `false` — et
 * surtout, on ne lui pousse rien de force.
 */
function carriesExpenses() {
  const provider = providerOf(config)
  if (provider === PROVIDER_WORKER) return remoteDocVersion >= 6
  return provider === PROVIDER_GITHUB
}

/** Le fournisseur peut-il transporter la caisse ? (Worker v8, GitHub toujours.) */
function carriesCashflow() {
  const provider = providerOf(config)
  if (provider === PROVIDER_WORKER) return remoteDocVersion >= 8
  return provider === PROVIDER_GITHUB
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
  /* Les suppressions apprises comptent même sur une lecture en retard :
     elles ne font que croître, une lecture plus ancienne n'en oublie pas. */
  deletions.absorb(remote.deleted)
  /* Puis on retire du local ce qu'un autre appareil a supprimé : sans cela
     l'élément resterait affiché et repartirait à la publication suivante. */
  const cleaned = learnDeletions()
  if (isStaleRead(remote)) {
    /* Lecture arrivée après coup : on garde l'état local, déjà à jour. */
    if (typeof remote.rev === 'number') remoteRev = Math.max(remoteRev, remote.rev)
    return markReady(cleaned)
  }
  if (typeof remote.rev === 'number') remoteRev = Math.max(remoteRev, remote.rev)
  if (typeof remote.docVersion === 'number' && remote.docVersion > 0) {
    remoteDocVersion = remote.docVersion
  }

  if (remote.list === null) {
    /* Aucun document publié pour l'instant : on publie les données locales. */
    if (state.dirty || bills.length || expensesStore.hasData() || cashflowStore.hasData()) {
      return push({ force: true })
    }
    return markReady(cleaned)
  }
  if (state.dirty) return push()

  sha = remote.sha
  let changed = false
  /* `bills: null` = un document publié avant l'existence des factures, donc
     une version du Worker pas encore redéployée. On garde alors les factures
     locales : ce silence ne doit jamais coûter les siennes. Un tableau vide,
     lui, reste une suppression et s'applique. */
  if (Array.isArray(remote.bills)) {
    const remoteBills = normalizeBillList(deletions.without(deletions.snapshot(), DELETED.bills, remote.bills))
    if (JSON.stringify(remoteBills) !== JSON.stringify(bills)) {
      bills = remoteBills
      await queuePersistBills()
      changed = true
    }
  }
  /* `expenses: null` = document écrit avant les dépenses : on garde les locales. */
  if (remote.expenses) {
    const localHasData = expensesStore.hasData()
    const remoteCount = (remote.expenses.expenses?.length || 0)
      + (remote.expenses.investments?.length || 0)
      + (remote.expenses.revenues?.length || 0)
    /* Première rencontre avec un document qui porte les dépenses : les
       appareils qui ont saisi pendant que le Worker les ignorait en ont que
       le serveur ne connaît pas. On fusionne par `id` une seule fois — le
       distant gagne sur un même `id`, le local unique est conservé.

       Même règle quand le serveur est VIDE et l'appareil rempli : c'est ce
       qui se produit dès qu'un appareil sans dépenses publie avant celui qui
       en a. Remplacer le local par ce vide effacerait des semaines de saisie
       en une lecture — la fusion, elle, ne peut que conserver. */
    const firstWithExpenses = !storage.get(EXPENSES_SEEN_KEY, false)
    if (localHasData && (firstWithExpenses || remoteCount === 0)) {
      const merged = expensesStore.importExpenses(remote.expenses, { mode: 'merge' })
      storage.set(EXPENSES_SEEN_KEY, true)
      if (merged.added || merged.updated) changed = true
      remoteExpensesCount = expensesStore.getSnapshot().expenses.length
      /* La fusion doit repartir au serveur : sans cela la lecture suivante
         retrouverait un document vide et, cette fois, remplacerait le local. */
      return push({ force: true })
    }
    storage.set(EXPENSES_SEEN_KEY, true)
    if (expensesStore.applyRemoteExpenses(remote.expenses)) changed = true
  } else if (expensesStore.applyRemoteExpenses(remote.expenses)) {
    changed = true
  }
  /* Ce que le serveur porte vraiment, pour l'afficher à côté du local. */
  remoteExpensesCount = Array.isArray(remote.expenses?.expenses) ? remote.expenses.expenses.length : null
  /* `cashflow: null` = document écrit avant la caisse : on garde la locale.
     Un document dont la caisse est VIDE ne doit pas effacer celle d'un
     appareil qui en a : on la publie au lieu de l'adopter. */
  if (remote.cashflow) {
    const remoteCashCount = (remote.cashflow.persons?.length || 0) + (remote.cashflow.transfers?.length || 0)
    if (cashflowStore.hasData() && remoteCashCount === 0) return push({ force: true })
    if (cashflowStore.applyRemoteCashFlow(remote.cashflow)) changed = true
  } else if (carriesCashflow() && cashflowStore.hasData()) {
    return push({ force: true })
  }
  if (applyRemoteSettings(remote.settings)) changed = true
  /* Document écrit avant les dépenses (Worker < v6, ou products.json
     historique) : le partage sait maintenant les recevoir mais n'en a
     encore aucune. Un appareil qui ne fait que lire ne publierait jamais
     les siennes — on pousse donc une fois, explicitement, pour que le
     document porte enfin les dépenses. */
  if (remote.expenses == null && carriesExpenses() && expensesStore.hasData()) {
    return push({ force: true })
  }
  /* Des éléments locaux ont été écartés parce qu'un autre appareil les avait
     supprimés : on republie pour que le document serveur ne les garde pas. */
  if (cleaned) return push({ force: true })
  return markReady(changed)
}

/**
 * Applique au local les pierres tombales connues (factures, dépenses, caisse).
 * @returns {boolean} vrai si un élément a été retiré.
 */
function learnDeletions() {
  const map = deletions.snapshot()
  const keptBills = without(map, DELETED.bills, bills)
  let changed = false
  if (keptBills.length !== bills.length) {
    bills = keptBills
    queuePersistBills()
    changed = true
  }
  if (expensesStore.applyDeletions(map)) changed = true
  if (cashflowStore.applyDeletions(map)) changed = true
  return changed
}

/** État « à jour » : le libellé et l'horodatage ne changent qu'en cas de succès. */
function markReady(changed = false) {
  syncSucceeded()
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
     les mêmes données que l'application installée. */
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

  /* Les factures locales sont chargées AVANT la lecture distante. Sans cela
     elles n'existent pas en mémoire au moment du « lien encore vide », et un
     appareil qui se connecte pour la première fois afficherait des factures
     vides au lieu de publier les siennes. C'est aussi le repli si la lecture
     échoue. */
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
  if (typeof remote.docVersion === 'number') remoteDocVersion = remote.docVersion
  deletions.absorb(remote.deleted)
  /* Le document par défaut porte tout le partage : factures, dépenses et
     caisse aussi. Les ignorer ici donnerait un appareil neuf qui voit les
     recettes mais pas le reste — exactement le symptôme d'un partage à
     moitié chargé. */
  if (Array.isArray(remote.bills)) {
    bills = normalizeBillList(deletions.without(deletions.snapshot(), DELETED.bills, remote.bills))
    await queuePersistBills()
  }
  expensesStore.applyRemoteExpenses(remote.expenses)
  remoteExpensesCount = Array.isArray(remote.expenses?.expenses) ? remote.expenses.expenses.length : null
  cashflowStore.applyRemoteCashFlow(remote.cashflow)
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
    await queuePersistBills()
    return { ok: true, status: 'local' }
  }
  if (state.pending) {
    /* Une publication est en vol : l'attendre évite de lire un document plus
       ancien que ce qu'on vient d'envoyer (et donc de réafficher un élément
       supprimé). On ne renvoie plus « à jour » sans avoir rien lu. */
    await pushChain
  }

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

/**
 * Publie les données (GitHub ou lien privé si configuré, sinon stockage local).
 *
 * Les publications sont SÉRIALISÉES. Avant, une publication en vol faisait
 * simplement ignorer la suivante : une suppression faite pendant l'envoi
 * n'était jamais transmise, et le drapeau `dirty` était effacé au retour —
 * la lecture suivante réinstallait alors l'élément depuis le serveur.
 * Désormais la publication suivante attend son tour et relit l'état au
 * moment de partir, donc elle emporte la modification.
 */
export function push({ force = false } = {}) {
  /* Une publication déjà en file suffit : elle lira l'état à son départ. */
  if (queuedPush && !force) return queuedPush
  const run = () => {
    queuedPush = null
    return pushNow()
  }
  const next = pushChain.then(run, run)
  queuedPush = next
  pushChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

async function pushNow() {
  if (!config) {
    /* Attend l'écriture avant d'annoncer « rien à pousser » : sans cela un
       rafraîchissement immédiat repartirait d'un disque encore ancien. */
    await queuePersistBills()
    state.dirty = false
    storage.remove(DIRTY_KEY)
    emit()
    return { ok: true, status: 'local' }
  }

  const seq = changeSeq

  /* Le document publié est construit depuis `bills`, en mémoire. La base
     locale doit être à jour avant l'envoi : sinon une publication qui suit un
     rechargement partirait d'un JSON encore sans les photos de la session. */
  state.pending = true
  try {
    await queuePersistBills()
  } catch (error) {
    console.error('Écriture locale impossible avant publication :', error)
  }

  state.status = 'saving'
  emit()

  const result = await putRemoteList(
    config,
    /* Le document échangé garde un tableau `products` (contrat du Worker) :
       il est désormais toujours vide. */
    [],
    sha,
    settingsSnapshot(),
    bills,
    expensesStore.getSnapshot(),
    deletions.snapshot(),
    cashflowStore.getSnapshot(),
  )
  state.pending = false

  if (result.ok) {
    sha = result.sha
    if (typeof result.rev === 'number') remoteRev = Math.max(remoteRev, result.rev)
    if (typeof result.docVersion === 'number' && result.docVersion > 0) {
      remoteDocVersion = result.docVersion
    }
    /* Le conflit a pu apporter des pierres tombales : on les apprend avant
       d'adopter les listes fusionnées, sinon un élément supprimé ailleurs
       reviendrait par la fusion. */
    deletions.absorb(result.deleted)
    /* Les factures suivent la règle de la fusion : un conflit peut en avoir
       ramené une que cet appareil n'avait pas, et l'écran doit le montrer. */
    if (Array.isArray(result.bills)) {
      const mergedBills = normalizeBillList(deletions.without(deletions.snapshot(), DELETED.bills, result.bills))
      if (JSON.stringify(mergedBills) !== JSON.stringify(bills)) {
        bills = mergedBills
        await queuePersistBills()
      }
    }
    /* Idem pour les dépenses fusionnées par le 409 (objet, sinon `null`). */
    expensesStore.applyRemoteExpenses(result.expenses)
    /* Et pour la caisse fusionnée par le 409. */
    cashflowStore.applyRemoteCashFlow(result.cashflow)
    /* Ce que le serveur vient d'accepter, c'est ce que l'appareil a envoyé
       (ou la fusion retenue) : la preuve affichée sur l'écran Dépenses est
       donc à jour sans attendre une relecture. */
    if (carriesExpenses()) {
      remoteExpensesCount = expensesStore.getSnapshot().expenses.length
    }
    /* « À jour » seulement si RIEN n'a changé pendant l'envoi. Sinon la
       modification est plus récente que le document publié : le drapeau
       reste posé et la publication suivante (déjà en file) l'emporte. */
    if (changeSeq === seq) {
      state.dirty = false
      storage.remove(DIRTY_KEY)
    }
    syncSucceeded()
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
    await queuePersistBills()
    applyFailure(result)
  }
  emit()
  return result
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** Marque l'état comme modifié, persiste localement puis pousse.
 *  Le drapeau « modifications non poussées » est persistant : un rafraîchissement
 *  ou un redémarrage ne peut jamais écraser les données locales par les distantes. */
function markChanged() {
  changeSeq += 1
  state.dirty = true
  storage.set(DIRTY_KEY, true)
}

/**
 * L'équivalent pour une facture : même drapeau, même persistance.
 *
 * Le drapeau est partagé avec les dépenses et la caisse, et c'est nécessaire :
 * `syncWithRemote` saute le document distant dès qu'il est posé, donc une
 * facture nouvelle serait autrement écrasée au prochain rafraîchissement.
 */
function touchBills() {
  markChanged()
  queuePersistBills()
  emit()
}

/** Vide les factures (et leurs tickets) de cet appareil et du partage. */
export function clearAll() {
  deletions.mark(DELETED.bills, bills.map((item) => item.id), deletions.stampFor(bills))
  bills = []
  if (photoStore.isAvailable()) photoStore.clear()
  touchBills()
  push()
  return true
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
  deletions.unmark(DELETED.bills, bill.id)
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
  deletions.mark(DELETED.bills, id, deletions.stampFor(bill))
  touchBills()
  push()
  return { bill, index }
}

/** Réinsère une facture supprimée (action « Annuler »). */
export function restoreBill(bill, index = null) {
  if (!bill) return null
  const restored = normalizeBill(bill)
  deletions.unmark(DELETED.bills, restored.id)
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
  const incoming = normalizeBillList(list)
  deletions.unmark(DELETED.bills, incoming.map((item) => item.id).filter(Boolean))
  if (mode === 'replace') {
    const kept = new Set(incoming.map((item) => item.id))
    const gone = bills.filter((item) => !kept.has(item.id))
    deletions.mark(DELETED.bills, gone.map((item) => item.id), deletions.stampFor(gone))
    bills = incoming
    touchBills()
    push()
    return { added: bills.length, updated: 0 }
  }
  const result = mergeBills(bills, incoming, deletions.snapshot())
  bills = result.list
  touchBills()
  push()
  return { added: result.added, updated: result.updated }
}

/* Lecture initiale : la configuration puis la liste. */
if (typeof document !== 'undefined') {
  load()
}