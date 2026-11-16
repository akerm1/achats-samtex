/* ------------------------------------------------------------------ */
/* Store Dépenses — état, persistance, synchronisation                  */
/* ------------------------------------------------------------------ */

import { storage } from '../core/storage.js'
import { toast } from '../core/feedback.js'
import { round2 } from '../core/utils.js'
import {
  DEFAULT_EXPENSE_CATEGORIES,
  emptyExpenses,
  mergeExpenses,
  normalizeExpenses,
  normalizeExpense,
  normalizeCategory,
  normalizeInvestment,
  normalizeRevenue,
} from './expenses-model.js'
import { DELETED, mark, snapshot, stampFor, without } from './deletions.js'

const KEY = 'purchase-gros-expenses-v1'
const SEEDED_KEY = 'purchase-gros-expenses-seeded-v1'

let state = emptyExpenses()

/* Lecture locale. */
function loadLocal() {
  const raw = storage.get(KEY, null)
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    state = normalizeExpenses(raw)
    storage.set(SEEDED_KEY, true)
    return
  }
  if (storage.get(SEEDED_KEY, false)) return
}

loadLocal()

/* Abonnements. */
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
      console.error("Erreur d'abonnement Dépenses :", error)
    }
  }
}

/* Écriture sérialisée. */
let writeChain = Promise.resolve()
let reportedFailure = ''

function persistAll() {
  let text = '{}'
  try {
    text = JSON.stringify(state)
  } catch {
    /* Circularité improbable. */
  }
  const ok = storage.setRaw(KEY, state, text)
  const reason = ok ? '' : storage.failureReason()
  if (!reason) {
    reportedFailure = ''
    return true
  }
  if (reason !== reportedFailure) {
    reportedFailure = reason
    toast("Stockage du navigateur plein : les dépenses ne sont pas enregistrées sur cet appareil. Exportez une sauvegarde JSON.", {
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

/** Mutation locale : écrire, émettre. */
function touch() {
  queuePersist()
  emit()
}

/* ------------------------------------------------------------------ */
/* Lecture                                                             */
/* ------------------------------------------------------------------ */

export const getExpenses = () => state

export function getSnapshot() {
  return {
    ...state,
    categories: state.categories.map((c) => ({ ...c })),
    expenses: state.expenses.map((e) => ({ ...e })),
    investments: state.investments.map((i) => ({ ...i })),
    revenues: state.revenues.map((r) => ({ ...r })),
    settings: { ...state.settings },
  }
}

export function hasData() {
  return Boolean(state.expenses.length || state.investments.length || state.revenues.length || state.categories.length > DEFAULT_EXPENSE_CATEGORIES.length)
}

/* ------------------------------------------------------------------ */
/* Catégories                                                          */
/* ------------------------------------------------------------------ */

function findCategory(id) {
  return state.categories.find((c) => c.id === id) || null
}

export function addCategory(input = {}) {
  const cat = normalizeCategory({ ...input, id: input.id || `cat_${Date.now()}` })
  state = { ...state, categories: [...state.categories, cat] }
  touch()
  return cat
}

export function updateCategory(id, changes = {}) {
  const current = findCategory(id)
  if (!current) return null
  const next = normalizeCategory({ ...current, ...changes, id: current.id })
  state = { ...state, categories: state.categories.map((c) => (c.id === id ? next : c)) }
  touch()
  return next
}

export function deleteCategory(id) {
  const index = state.categories.findIndex((c) => c.id === id)
  if (index < 0) return null
  const cat = state.categories[index]
  state = { ...state, categories: state.categories.filter((c) => c.id !== id) }
  /* La suppression voyage : sans cette pierre tombale, la catégorie
     reviendrait à la prochaine fusion avec un autre appareil. */
  mark(DELETED.categories, id, stampFor(cat))
  touch()
  return { cat, index }
}

export function reorderCategories(orderedIds) {
  const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]))
  state = {
    ...state,
    categories: [...state.categories].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999)),
  }
  touch()
}

/* ------------------------------------------------------------------ */
/* Dépenses                                                            */
/* ------------------------------------------------------------------ */

function findExpense(id) {
  return state.expenses.find((e) => e.id === id) || null
}

export function addExpense(input = {}) {
  const exp = normalizeExpense({ ...input, id: input.id || `exp_${Date.now()}` })
  state = { ...state, expenses: [...state.expenses, exp] }

  /* Si c'est un transfert lié à un investissement, déduire du reste. */
  if (exp.isTransfer && exp.linkedInvestmentId && state.settings.autoDeductTransfer) {
    const inv = state.investments.find((i) => i.id === exp.linkedInvestmentId)
    if (inv && exp.amount !== null) {
      const newRemaining = Math.max(0, round2((inv.remaining || inv.amount || 0) - exp.amount))
      state = {
        ...state,
        investments: state.investments.map((i) =>
          i.id === exp.linkedInvestmentId ? { ...i, remaining: newRemaining, updatedAt: new Date().toISOString() } : i
        ),
      }
    }
  }

  touch()
  return exp
}

export function updateExpense(id, changes = {}) {
  const current = findExpense(id)
  if (!current) return null

  const wasTransfer = current.isTransfer
  const wasLinked = current.linkedInvestmentId
  const wasAmount = current.amount

  const next = normalizeExpense({ ...current, ...changes, id: current.id })

  /* Gérer la déduction d'investissement si le transfert change. */
  if (state.settings.autoDeductTransfer) {
    if (wasTransfer && wasLinked && wasAmount !== null) {
      const oldInv = state.investments.find((i) => i.id === wasLinked)
      if (oldInv) {
        const restored = round2((oldInv.remaining || oldInv.amount || 0) + wasAmount)
        state = {
          ...state,
          investments: state.investments.map((i) =>
            i.id === wasLinked ? { ...i, remaining: restored, updatedAt: new Date().toISOString() } : i
          ),
        }
      }
    }
    if (next.isTransfer && next.linkedInvestmentId && next.amount !== null) {
      const newInv = state.investments.find((i) => i.id === next.linkedInvestmentId)
      if (newInv) {
        const newRemaining = Math.max(0, round2((newInv.remaining || newInv.amount || 0) - next.amount))
        state = {
          ...state,
          investments: state.investments.map((i) =>
            i.id === next.linkedInvestmentId ? { ...i, remaining: newRemaining, updatedAt: new Date().toISOString() } : i
          ),
        }
      }
    }
  }

  state = { ...state, expenses: state.expenses.map((e) => (e.id === id ? next : e)) }
  touch()
  return next
}

export function deleteExpense(id) {
  const index = state.expenses.findIndex((e) => e.id === id)
  if (index < 0) return null
  const exp = state.expenses[index]

  /* Rétablir l'investissement si c'était un transfert. */
  if (exp.isTransfer && exp.linkedInvestmentId && exp.amount !== null && state.settings.autoDeductTransfer) {
    const inv = state.investments.find((i) => i.id === exp.linkedInvestmentId)
    if (inv) {
      const restored = round2((inv.remaining || inv.amount || 0) + exp.amount)
      state = {
        ...state,
        investments: state.investments.map((i) =>
          i.id === exp.linkedInvestmentId ? { ...i, remaining: restored, updatedAt: new Date().toISOString() } : i
        ),
      }
    }
  }

  state = { ...state, expenses: state.expenses.filter((e) => e.id !== id) }
  mark(DELETED.expenses, id, stampFor(exp))
  touch()
  return { exp, index }
}

/* ------------------------------------------------------------------ */
/* Investissements                                                     */
/* ------------------------------------------------------------------ */

function findInvestment(id) {
  return state.investments.find((i) => i.id === id) || null
}

export function addInvestment(input = {}) {
  const inv = normalizeInvestment({ ...input, id: input.id || `inv_${Date.now()}` })
  state = { ...state, investments: [...state.investments, inv] }
  touch()
  return inv
}

export function updateInvestment(id, changes = {}) {
  const current = findInvestment(id)
  if (!current) return null
  const next = normalizeInvestment({ ...current, ...changes, id: current.id })
  state = { ...state, investments: state.investments.map((i) => (i.id === id ? next : i)) }
  touch()
  return next
}

export function deleteInvestment(id) {
  const index = state.investments.findIndex((i) => i.id === id)
  if (index < 0) return null
  const inv = state.investments[index]

  /* Détacher les dépenses liées. */
  if (state.expenses.some((e) => e.linkedInvestmentId === id)) {
    state = {
      ...state,
      expenses: state.expenses.map((e) =>
        e.linkedInvestmentId === id ? { ...e, linkedInvestmentId: null, updatedAt: new Date().toISOString() } : e
      ),
    }
  }

  state = { ...state, investments: state.investments.filter((i) => i.id !== id) }
  mark(DELETED.expenseInvestments, id, stampFor(inv))
  touch()
  return { inv, index }
}

/* ------------------------------------------------------------------ */
/* Recettes (Revenus)                                                  */
/* ------------------------------------------------------------------ */

function findRevenue(id) {
  return state.revenues.find((r) => r.id === id) || null
}

export function addRevenue(input = {}) {
  const rev = normalizeRevenue({ ...input, id: input.id || `rev_${Date.now()}` })
  state = { ...state, revenues: [...state.revenues, rev] }
  touch()
  return rev
}

export function updateRevenue(id, changes = {}) {
  const current = findRevenue(id)
  if (!current) return null
  const next = normalizeRevenue({ ...current, ...changes, id: current.id })
  state = { ...state, revenues: state.revenues.map((r) => (r.id === id ? next : r)) }
  touch()
  return next
}

export function deleteRevenue(id) {
  const index = state.revenues.findIndex((r) => r.id === id)
  if (index < 0) return null
  const rev = state.revenues[index]
  state = { ...state, revenues: state.revenues.filter((r) => r.id !== id) }
  mark(DELETED.revenues, id, stampFor(rev))
  touch()
  return { rev, index }
}

/* ------------------------------------------------------------------ */
/* Réglages                                                            */
/* ------------------------------------------------------------------ */

export function setExpenseSettings(patch = {}) {
  const next = { ...state.settings, ...(patch && typeof patch === 'object' ? patch : {}) }
  if (JSON.stringify(next) === JSON.stringify(state.settings)) return state.settings
  state = { ...state, settings: next }
  touch()
  return next
}

/* ------------------------------------------------------------------ */
/* Import / Sauvegarde / Sync                                          */
/* ------------------------------------------------------------------ */

export function importExpenses(data, { mode = 'merge' } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { added: 0, updated: 0 }
  if (mode === 'replace') {
    const next = normalizeExpenses(data)
    /* Remplacer, c'est aussi supprimer ce qui n'est plus là : sans pierre
       tombale, le prochain conflit ramènerait les lignes écartées. */
    markMissing(DELETED.categories, state.categories, next.categories)
    markMissing(DELETED.expenses, state.expenses, next.expenses)
    markMissing(DELETED.expenseInvestments, state.investments, next.investments)
    markMissing(DELETED.revenues, state.revenues, next.revenues)
    state = next
    touch()
    return { added: state.expenses.length + state.investments.length + state.revenues.length, updated: 0 }
  }
  const merged = mergeExpenses(state, data, snapshot())
  state = merged.expenses
  touch()
  return { added: merged.added, updated: merged.updated }
}

/** Marque comme supprimé ce qui existait avant un remplacement complet. */
function markMissing(collection, previous, next) {
  const kept = new Set((next || []).map((item) => item?.id))
  for (const item of previous || []) {
    if (item?.id && !kept.has(item.id)) mark(collection, item.id, stampFor(item))
  }
}

/**
 * Applique les pierres tombales apprises du distant à l'état local.
 *
 * Une lecture distante ne suffit pas : le document peut avoir été écrit par
 * un appareil resté sur l'ancienne liste, et certaines collections ne sont
 * pas remplacées (documents antérieurs). Filtrer ici garantit qu'une
 * dépense supprimée ailleurs ne s'affiche ni ne reparte.
 * @returns {boolean} vrai si l'état local a changé.
 */
export function applyDeletions(map = snapshot()) {
  const categories = without(map, DELETED.categories, state.categories)
  const expenses = without(map, DELETED.expenses, state.expenses)
  const investments = without(map, DELETED.expenseInvestments, state.investments)
  const revenues = without(map, DELETED.revenues, state.revenues)
  if (
    categories.length === state.categories.length &&
    expenses.length === state.expenses.length &&
    investments.length === state.investments.length &&
    revenues.length === state.revenues.length
  ) {
    return false
  }
  state = { ...state, categories, expenses, investments, revenues }
  queuePersist()
  emit()
  return true
}

export function applyRemoteExpenses(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return false
  /* Le distant remplace, mais une ligne supprimée ICI ne doit pas revenir :
     sa pierre tombale est plus récente que le document lu. Sans ce filtre,
     chaque rafraîchissement réinstallait la dépense (le serveur la garde tant
     qu'un appareil ne republie pas), et le symptôme était exactement
     « je supprime, je recharge, elle est de retour ». */
  const map = snapshot()
  /* Le filtre passe AVANT la normalisation : `normalizeExpense` date une
     ligne dépourvue de `updatedAt` à l'instant présent, ce qui la rendrait
     plus récente que sa pierre tombale — elle reviendrait donc à chaque
     lecture. Sur la donnée brute, une date absente vaut 0 et la suppression
     gagne. */
  const keep = (key, collection) =>
    Array.isArray(incoming[key]) ? without(map, collection, incoming[key]) : incoming[key]
  const next = normalizeExpenses({
    ...incoming,
    categories: keep('categories', DELETED.categories),
    expenses: keep('expenses', DELETED.expenses),
    investments: keep('investments', DELETED.expenseInvestments),
    revenues: keep('revenues', DELETED.revenues),
  })
  if (JSON.stringify(next) === JSON.stringify(state)) return false
  state = next
  queuePersist()
  emit()
  return true
}