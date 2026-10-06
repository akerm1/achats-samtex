/* ------------------------------------------------------------------ */
/* Analyse — état et persistance (localStorage)                         */
/*                                                                     */
/* Même mécanique que store.js : une écriture sérialisée par une chaîne */
/* de promesses (aucune écriture concurrente), un `subscribe` pour les  */
/* vues, et un drapeau partagé avec le store pour la synchronisation.   */
/*                                                                     */
/* La synchronisation suit le chemin des factures : seuls le lien privé */
/* Cloudflare et la sauvegarde JSON emportent l'analyse — GitHub ne     */
/* voit jamais ces collections (voir sync.js).                          */
/* `onAnalysisChange` est branché par store.js ; ce module n'importe    */
/* jamais store.js : pas de dépendance circulaire.                     */
/*                                                                     */
/* Clé : `purchase-gros-analysis-v1`. Aucune donnée de démonstration.   */
/* ------------------------------------------------------------------ */

import { storage } from '../core/storage.js'
import { toast } from '../core/feedback.js'
import { toNumber, uid } from '../core/utils.js'
import {
  SALE_KINDS,
  dateKey,
  emptyAnalysis,
  mergeAnalysis,
  normalizeAnalysis,
  normalizeAnalysisSettings,
  normalizeHolding,
  normalizeHolderLabels,
  normalizeInvestment,
  normalizePlace,
  normalizePurchase,
  normalizeSale,
} from './analysis.js'

const KEY = 'purchase-gros-analysis-v1'
const SEEDED_KEY = 'purchase-gros-analysis-seeded-v1'
const SEED_URL = new URL('../../analysis.json', import.meta.url)

let state = emptyAnalysis()

/* Lecture locale : le document distant, lui, arrive par store.js. */
function loadLocal() {
  const raw = storage.get(KEY, null)
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    state = normalizeAnalysis(raw)
    storage.set(SEEDED_KEY, true) /* Déjà initialisé : on ne ré-ensemencera jamais. */
    return
  }
  if (storage.get(SEEDED_KEY, false)) return

  /* Si local vide et jamais ensemencé : on essaie d'abord le fichier `analysis.json`. */
  seedFromRepo()
}
loadLocal()

/* Ensemencement depuis `analysis.json` si `KEY` vide. */
async function seedFromRepo() {
  let payload = null
  try {
    const response = await fetch(SEED_URL, { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (response.ok) payload = await response.json()
  } catch {
    /* Hors-ligne ou erreur réseau : on ne pose pas le drapeau SEEDED_KEY, on réessaiera au prochain lancement. */
    return
  }
  storage.set(SEEDED_KEY, true) /* Le fichier a été lu (ou jugé absent / invalide) : on ne retentera plus. */

  const incoming = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null
  if (!incoming) return

  /* La synchronisation distante ou une saisie locale est arrivée pendant le fetch : on ignore le seed. */
  if (hasData()) return

  state = normalizeAnalysis(incoming)
  touch() /* Persiste localement et pousse vers le Worker. */
}


/* ------------------------------------------------------------------ */
/* Abonnements (la vue se redessine sur chaque mutation)               */
/* ------------------------------------------------------------------ */

const listeners = new Set()

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  for (const fn of [...listeners]) {
    try {
      fn(state)
    } catch (error) {
      console.error("Erreur d'abonnement Analyse :", error)
    }
  }
}

/* ------------------------------------------------------------------ */
/* Branchement sur la synchronisation (posé par store.js)              */
/* ------------------------------------------------------------------ */

let changeHandler = null

/** store.js enregistre ici sa routine « dirty + push » (comme touchBills). */
export function onAnalysisChange(fn) {
  changeHandler = typeof fn === 'function' ? fn : null
}

/* ------------------------------------------------------------------ */
/* Écriture sérialisée (même chaîne que store.js)                      */
/* ------------------------------------------------------------------ */

let writeChain = Promise.resolve()
let reportedFailure = ''

function persistAll() {
  let text = '{}'
  try {
    text = JSON.stringify(state)
  } catch {
    /* Circularité improbable : on n'écrit pas une chaîne cassée. */
  }
  const ok = storage.setRaw(KEY, state, text)
  const reason = ok ? '' : storage.failureReason()
  if (!reason) {
    reportedFailure = ''
    return true
  }
  /* Une seule alerte par épisode : l'utilisateur doit savoir que son
     analyse ne survivra pas au rechargement, une fois, pas trente. */
  if (reason !== reportedFailure) {
    reportedFailure = reason
    toast("Stockage du navigateur plein : l'analyse n'est pas enregistrée sur cet appareil. Exportez une sauvegarde JSON.", {
      type: 'error',
    })
  }
  return false
}

function queuePersist() {
  const run = () => persistAll()
  writeChain = writeChain.then(run, run)
  return writeChain
}

/** Mutation locale : écrire, dessiner, pousser (touch + push des factures). */
function touch() {
  queuePersist()
  emit()
  try {
    changeHandler?.()
  } catch (error) {
    console.error('Erreur de publication Analyse :', error)
  }
}

/* ------------------------------------------------------------------ */
/* Lecture                                                              */
/* ------------------------------------------------------------------ */

export const getAnalysis = () => state

/** Copie profonde pour le document publié / la sauvegarde. */
export function getSnapshot() {
  return {
    ...state,
    sales: state.sales.map((item) => ({ ...item })),
    purchases: state.purchases.map((item) => ({ ...item })),
    investments: state.investments.map((item) => ({ ...item })),
    holdings: state.holdings.map((item) => ({ ...item })),
    places: state.places.map((item) => ({ ...item })),
    settings: { ...state.settings },
    holderLabels: { ...state.holderLabels },
  }
}

/** Vrai si l'analyse porte quelque chose à publier (force push au démarrage). */
export function hasData() {
  return Boolean(
    state.sales.length || state.purchases.length || state.investments.length ||
    state.holdings.length || state.places.length,
  )
}

/* ------------------------------------------------------------------ */
/* Journées (Recettes)                                                  */
/* ------------------------------------------------------------------ */

function findSale(date) {
  return state.sales.find((item) => item.date === date) || null
}

function upsertSale(date, patch) {
  const existing = findSale(date)
  const next = normalizeSale({
    ...(existing || {}),
    ...patch,
    id: date,
    date,
    updatedAt: new Date().toISOString(),
  })
  state = {
    ...state,
    sales: existing ? state.sales.map((item) => (item.date === date ? next : item)) : [...state.sales, next],
  }
  touch()
  return next
}

/**
 * Enregistre la recette d'une journée (auto-enregistrement à la perte du
 * focus). Une valeur vide laisse la journée vide ; si aucune journée
 * n'existe encore, rien n'est écrit — la liste reste propre.
 */
export function setSaleAmount(date, value) {
  const amount = toNumber(value)
  const existing = findSale(date)
  if (amount === null && !existing) return null
  if (amount === null && existing?.kind !== SALE_KINDS.AMOUNT) return null
  return upsertSale(date, { kind: SALE_KINDS.AMOUNT, amount })
}

/** Bascule « aid » / « fermé » : déjà actif → journée vidée (comme Excel). */
export function toggleSaleKind(date, kind) {
  const target = kind === SALE_KINDS.CLOSED ? SALE_KINDS.CLOSED : SALE_KINDS.AID
  const existing = findSale(date)
  const nextKind = existing?.kind === target ? SALE_KINDS.AMOUNT : target
  return upsertSale(date, {
    kind: nextKind,
    amount: null,
  })
}

/** Remet la journée à vide (recette sans montant). */
export function clearSale(date) {
  if (!findSale(date)) return null
  return upsertSale(date, { kind: SALE_KINDS.AMOUNT, amount: null })
}

/* ------------------------------------------------------------------ */
/* Listes (achats, investissements, possession, détail)                 */
/* ------------------------------------------------------------------ */

function addItem(key, input, normalize, prefix) {
  const source = input && typeof input === 'object' ? input : {}
  const item = normalize({ ...source, id: source.id || uid(prefix) })
  state = { ...state, [key]: [...state[key], item] }
  touch()
  return item
}

function updateItem(key, id, changes, normalize) {
  const current = state[key].find((item) => item.id === id)
  if (!current) return null
  const next = normalize({
    ...current,
    ...(changes && typeof changes === 'object' ? changes : {}),
    id: current.id,
    updatedAt: new Date().toISOString(),
  })
  state = { ...state, [key]: state[key].map((item) => (item.id === id ? next : item)) }
  touch()
  return next
}

function deleteItem(key, id) {
  const index = state[key].findIndex((item) => item.id === id)
  if (index < 0) return null
  const item = state[key][index]
  state = { ...state, [key]: state[key].filter((entry) => entry.id !== id) }
  touch()
  return { item, index }
}

/* Achats — feuille « achats » : date | somme. */
export const addPurchase = (input = {}) =>
  addItem('purchases', { date: dateKey(new Date()), ...input }, normalizePurchase, 'purchase')
export const updatePurchase = (id, changes) => updateItem('purchases', id, changes, normalizePurchase)
export const deletePurchase = (id) => deleteItem('purchases', id)

/* Investissements — nom + somme. */
export const addInvestment = (input = {}) => addItem('investments', input, normalizeInvestment, 'inv')
export const updateInvestment = (id, changes) => updateItem('investments', id, changes, normalizeInvestment)
export const deleteInvestment = (id) => deleteItem('investments', id)

/* Possession — quatre colonnes de montants. */
export const addHolding = (input = {}) => addItem('holdings', input, normalizeHolding, 'hold')
export const updateHolding = (id, changes) => updateItem('holdings', id, changes, normalizeHolding)
export const deleteHolding = (id) => deleteItem('holdings', id)

/* Possession (détail) — libellé + montant. */
export const addPlace = (input = {}) => addItem('places', input, normalizePlace, 'place')
export const updatePlace = (id, changes) => updateItem('places', id, changes, normalizePlace)
export const deletePlace = (id) => deleteItem('places', id)

/* ------------------------------------------------------------------ */
/* Réglages & libellés                                                  */
/* ------------------------------------------------------------------ */

export function setAnalysisSettings(patch = {}) {
  const next = normalizeAnalysisSettings({ ...state.settings, ...(patch && typeof patch === 'object' ? patch : {}) })
  if (JSON.stringify(next) === JSON.stringify(state.settings)) return state.settings
  state = { ...state, settings: next }
  touch()
  return next
}

export function setHolderLabel(holder, label) {
  const next = normalizeHolderLabels({
    ...state.holderLabels,
    [holder]: String(label ?? '').trim() || holder,
  })
  if (JSON.stringify(next) === JSON.stringify(state.holderLabels)) return state.holderLabels
  state = { ...state, holderLabels: next }
  touch()
  return next
}

/* ------------------------------------------------------------------ */
/* Sauvegarde & synchronisation                                         */
/* ------------------------------------------------------------------ */

/**
 * Import d'une sauvegarde (v1/v2 sans analyse → no-op ; v3 → fusion ou
 * remplacement, comme produits et factures).
 * @param {'merge'|'replace'} mode
 */
export function importAnalysis(data, { mode = 'merge' } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { added: 0, updated: 0 }
  }
  if (mode === 'replace') {
    state = normalizeAnalysis(data)
    touch()
    return { added: state.sales.length + state.purchases.length, updated: 0 }
  }
  const merged = mergeAnalysis(state, data)
  state = merged.analysis
  touch()
  return { added: merged.added, updated: merged.updated }
}

/**
 * Application d'une lecture distante (le distant remplace, à égalité de
 * dirty — la règle des factures). Ne déclenche PAS la publication : la
 * lecture vient d'être faite, republier bouclerait.
 * @returns {boolean} vrai si l'état a changé.
 */
export function applyRemoteAnalysis(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return false
  const next = normalizeAnalysis(incoming)
  if (JSON.stringify(next) === JSON.stringify(state)) return false
  state = next
  queuePersist()
  emit()
  return true
}



