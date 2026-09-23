/* ------------------------------------------------------------------ */
/* Store — état global, synchronisation GitHub, actions métier         */
/* ------------------------------------------------------------------ */

import { storage } from '../core/storage.js'
import { uid } from '../core/utils.js'
import { getThemePreference, setTheme } from '../core/theme.js'
import { STATUS, normalizeList, normalizeProduct } from './model.js'
import { fetchRemoteList, putRemoteList, normalizeConfig } from './github.js'
import { mergeProducts } from './backup.js'
import { buildSeedDb } from './seed.js'

/* Clés historiques conservées pour ne rien perdre sur les appareils existants. */
const PRODUCTS_KEY = 'purchase-gros-list-v2'
const CONFIG_KEY = 'purchase-gros-github-v1'
const PREFS_KEY = 'purchase-gros-prefs-v1'
const POLL_MS = 6000

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
  status: config ? 'syncing' : 'config',
  message: '',
  lastSyncAt: null,
  pending: false,
  dirty: false,
}
let sha = null
let pollTimer = null
const listeners = new Set()

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

export function statusLabel(status) {
  if (status === 'live') return 'En direct'
  if (status === 'config') return 'Local seul'
  if (status === 'syncing') return 'Connexion…'
  if (status === 'pending') return 'Envoi…'
  return 'Hors ligne'
}

export function getState() {
  return {
    ...state,
    products,
    config,
    prefs,
    isConfigured: Boolean(config),
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
  state.message = ''
  emit()
  return load()
}

export function clearConfig() {
  config = null
  storage.remove(CONFIG_KEY)
  sha = null
  state.status = 'config'
  state.message = ''
  emit()
  return state
}

/* ------------------------------------------------------------------ */
/* Stockage local                                                      */
/* ------------------------------------------------------------------ */

function loadLocal() {
  const list = normalizeList(storage.get(PRODUCTS_KEY, null))
  if (list.length) {
    products = list
  } else {
    products = normalizeList(buildSeedDb())
    persistLocal()
  }
}

function persistLocal() {
  storage.set(PRODUCTS_KEY, products)
}

/* ------------------------------------------------------------------ */
/* Chargement & synchronisation                                        */
/* ------------------------------------------------------------------ */

export async function load() {
  state.loaded = false
  emit()

  if (!config) {
    loadLocal()
    state.status = 'config'
    state.loaded = true
    state.lastSyncAt = Date.now()
    emit()
    return getState()
  }

  state.status = 'syncing'
  emit()
  const result = await syncWithRemote()
  if (!result.ok) {
    loadLocal()
    state.status = result.status === 'config' ? 'config' : 'offline'
    state.message = result.message || ''
  }
  state.loaded = true
  state.lastSyncAt = Date.now()
  emit()
  startPolling()
  return getState()
}

/**
 * Une seule règle : les modifications locales non poussées gagnent,
 * sinon la version distante remplace la locale.
 */
async function syncWithRemote() {
  const remote = await fetchRemoteList(config)
  if (!remote.ok) return { ok: false, status: remote.status, message: remote.message }

  if (remote.list === null) {
    /* Le fichier n'existe pas encore : on publie la liste locale. */
    if (state.dirty || products.length) return push({ force: true })
    return { ok: true, status: 'live' }
  }
  if (state.dirty) return push()

  const normalized = normalizeList(remote.list)
  sha = remote.sha
  if (JSON.stringify(normalized) !== JSON.stringify(products)) {
    products = normalized
    persistLocal()
    emit()
  }
  const settings = applyRemoteSettings(remote.settings)
  if (settings) emit()
  state.status = 'live'
  state.message = ''
  state.lastSyncAt = Date.now()
  return { ok: true, status: 'live' }
}

/** Relit la liste distante sans rien écrire. */
export async function loadFromRemote() {
  if (!config || !state.loaded || state.pending) return getState()
  const remote = await fetchRemoteList(config)
  if (!remote.ok) {
    state.status = remote.status === 'config' ? 'config' : 'offline'
    state.message = remote.message || ''
  } else {
    state.status = 'live'
    state.message = ''
    state.lastSyncAt = Date.now()
    if (remote.list !== null && !state.dirty) {
      const normalized = normalizeList(remote.list)
      sha = remote.sha
      if (JSON.stringify(normalized) !== JSON.stringify(products)) {
        products = normalized
        persistLocal()
      }
    }
    if (!state.dirty && applyRemoteSettings(remote.settings)) emit()
  }
  state.loaded = true
  state.lastSyncAt = Date.now()
  emit()
  return getState()
}

/** Publie la liste (GitHub si configuré, sinon stockage local). */
export async function push({ force = false } = {}) {
  if (!config) {
    persistLocal()
    state.dirty = false
    emit()
    return { ok: true, status: 'config' }
  }
  if (state.pending && !force) return { ok: true, status: state.status }

  state.pending = true
  state.status = 'pending'
  emit()

  const result = await putRemoteList(config, products, sha, settingsSnapshot())
  state.pending = false

  if (result.ok) {
    sha = result.sha
    state.dirty = false
    state.status = 'live'
    state.message = ''
    state.lastSyncAt = Date.now()
  } else {
    state.status = result.status === 'config' ? 'config' : 'offline'
    state.message = result.message || ''
    state.dirty = true
    persistLocal()
  }
  emit()
  return result
}

/** Synchronisation manuelle (pastille de la barre du haut). */
export async function syncNow() {
  if (!config) {
    persistLocal()
    return { ok: true, status: 'config' }
  }
  return state.dirty ? push({ force: true }) : loadFromRemote()
}

export function startPolling() {
  stopPolling()
  if (!config) return
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && !state.pending) loadFromRemote()
  }, POLL_MS)
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** Marque l'état comme modifié, persiste localement puis pousse. */
function touch({ broadcast = true } = {}) {
  state.dirty = true
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

/** Ajoute un produit en tête de liste (mode marché : « encore un »). */
export function duplicateProduct(id) {
  const source = find(id)
  if (!source) return null
  const copy = normalizeProduct({
    ...source,
    id: uid('local'),
    status: STATUS.TODO,
    boughtAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  products = [...products, copy]
  touch()
  push()
  return copy
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