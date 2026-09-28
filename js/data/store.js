/* ------------------------------------------------------------------ */
/* Store — état global, synchronisation GitHub, actions métier         */
/*                                                                     */
/* Mécanisme de synchronisation, volontairement simple :                */
/*   - aucune scrutation en arrière-plan, aucun état « en direct » ;   */
/*   - une seule lecture distante, déclenchée par un rafraîchissement   */
/*     de la page, un clic sur la pastille ou le bouton « Actualiser »; */
/*   - les modifications locales sont poussées immédiatement, et        */
/*     republiées au prochain rafraîchissement si l'envoi a échoué ;     */
/*   - les jetons en échec restent affichés (bandeau, pastille,         */
/*     Réglages) au lieu d'être le résultat d'une scrutation silencieuse.*/
/* ------------------------------------------------------------------ */

import { storage } from '../core/storage.js'
import { toast } from '../core/feedback.js'
import { uid } from '../core/utils.js'
import { getThemePreference, setTheme } from '../core/theme.js'
import { STATUS, normalizeList, normalizeProduct } from './model.js'
import { canWrite, fetchRemoteList, putRemoteList, normalizeConfig, READ_ONLY_MESSAGE } from './github.js'
import { mergeProducts } from './backup.js'

/* Clés historiques conservées pour ne rien perdre sur les appareils existants. */
const PRODUCTS_KEY = 'purchase-gros-list-v2'
const CONFIG_KEY = 'purchase-gros-github-v1'
const PREFS_KEY = 'purchase-gros-prefs-v1'
const DIRTY_KEY = 'purchase-gros-dirty-v1'

export const DEFAULT_PREFS = {
  filter: 'todo',
  category: 'all',
  sort: 'recent',
  installHidden: false,
}

let products = []
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
    config,
    prefs,
    isConfigured: Boolean(config),
    /* Un dépôt public se lit sans jeton : seule l'écriture en exige un. */
    readOnly: Boolean(config) && !canWrite(config),
    hasToken: Boolean(config?.token),
    statusLabel: statusLabel(state.status),
    pendingCount: products.filter((product) => product.status === STATUS.TODO).length,
  }
}

export const getProducts = () => products
export const isLoaded = () => state.loaded
export const getStatus = () => state.status
export const getSyncMessage = () => state.message
export const getConfig = () => config
export const getLastSyncAt = () => state.lastSyncAt
export const getPrefs = () => ({ ...prefs })
export const isPending = () => state.pending

/* Réglages partagés entre appareils (le jeton et `installHidden` restent locaux). */
const SYNCED_PREFS = ['filter', 'category', 'sort']

function settingsSnapshot() {
  return {
    theme: getThemePreference(),
    filter: prefs.filter,
    category: prefs.category,
    sort: prefs.sort,
  }
}

/** Applique les réglages reçus de GitHub (le distant gagne). */
function applyRemoteSettings(settings) {
  if (!settings || typeof settings !== 'object') return false
  let changed = false
  for (const key of SYNCED_PREFS) {
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
    prefs = { ...prefs, ...rest }
    storage.set(PREFS_KEY, prefs)
  }
  emit()
  pushPrefs()
  return prefs
}

/* ------------------------------------------------------------------ */
/* Configuration GitHub                                                */
/* ------------------------------------------------------------------ */

export function saveConfig(input) {
  config = normalizeConfig(input)
  if (config) storage.set(CONFIG_KEY, config)
  else storage.remove(CONFIG_KEY)
  sha = null
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
  sha = null
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

function loadLocal() {
  /* Pas de démonstration : une liste vide reste vide, le partage GitHub
     (ou l'ajout manuel) reste la seule source de données — ainsi chaque
     appareil affiche exactement la même chose. */
  products = normalizeList(storage.get(PRODUCTS_KEY, null))
  persistLocal()
}

function persistLocal() {
  storage.set(PRODUCTS_KEY, products)
}

/* ------------------------------------------------------------------ */
/* Chargement & synchronisation                                        */
/* ------------------------------------------------------------------ */

/**
 * Point d'entrée unique de la lecture distante : appelé au démarrage
 * (donc à chaque rafraîchissement de la page) et par `refresh()`.
 * Les modifications locales non poussées gagnent, sinon la version
 * distante remplace la locale.
 */
async function syncWithRemote() {
  const remote = await fetchRemoteList(config)
  if (!remote.ok) return { ok: false, status: remote.status, message: remote.message }

  if (remote.list === null) {
    /* Le fichier n'existe pas encore sur GitHub : on publie la liste locale. */
    if (state.dirty || products.length) return push({ force: true })
    return markReady()
  }
  if (state.dirty) return push()

  const normalized = normalizeList(remote.list)
  sha = remote.sha
  let changed = false
  if (JSON.stringify(normalized) !== JSON.stringify(products)) {
    products = normalized
    persistLocal()
    changed = true
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

  if (!config) {
    loadLocal()
    state.status = 'local'
    state.loaded = true
    emit()
    return getState()
  }

  const result = await refresh()
  /* Échec : la liste locale reste affichée, l'erreur est signalée. */
  if (!result.ok) loadLocal()
  state.loaded = true
  emit()
  return getState()
}

/**
 * Actualise les données depuis GitHub. C'est le seul déclencheur de lecture
 * distante : un rafraîchissement de la page, un clic sur la pastille ou le
 * bouton « Synchroniser » des Réglages.
 */
export async function refresh() {
  if (!config) {
    persistLocal()
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

/** Publie la liste (GitHub si configuré, sinon stockage local). */
export async function push({ force = false } = {}) {
  if (!config) {
    persistLocal()
    state.dirty = false
    emit()
    return { ok: true, status: 'local' }
  }
  if (state.pending && !force) return { ok: true, status: state.status }

  state.pending = true
  state.status = 'saving'
  emit()

  const result = await putRemoteList(config, products, sha, settingsSnapshot())
  state.pending = false

  if (result.ok) {
    sha = result.sha
    state.dirty = false
    storage.remove(DIRTY_KEY)
    state.status = 'ready'
    state.message = ''
    state.messageKind = ''
    state.lastSyncAt = Date.now()
  } else {
    if (result.tokenRejected) markTokenRejected()
    state.dirty = true
    storage.set(DIRTY_KEY, true)
    persistLocal()
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
 *  ou un redémarrage ne peut jamais écraser la liste locale par la distante. */
function touch({ broadcast = true } = {}) {
  state.dirty = true
  storage.set(DIRTY_KEY, true)
  persistLocal()
  if (broadcast) emit()
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
  touch()
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

/* Lecture initiale : la configuration puis la liste. */
if (typeof document !== 'undefined') {
  load()
}