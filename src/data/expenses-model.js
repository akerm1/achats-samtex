/* ------------------------------------------------------------------ */
/* Dépenses — modèle pur (catégories, normalisation, calculs)          */
/* ------------------------------------------------------------------ */

import { round2, toNumber, uid } from '../core/utils.js'

/** Catégories de dépenses par défaut (modifiables par l'utilisateur). */
export const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'rent', label: 'Loyer', icon: 'home', color: '#e53935', defaultAmount: 0 },
  { id: 'labor', label: 'Main d\'œuvre', icon: 'users', color: '#1e88e5', defaultAmount: 0 },
  { id: 'tools', label: 'Outils', icon: 'tool', color: '#43a047', defaultAmount: 0 },
  { id: 'gas', label: 'Gaz', icon: 'flame', color: '#fb8c00', defaultAmount: 0 },
  { id: 'car', label: 'Voiture', icon: 'car', color: '#6d4c41', defaultAmount: 0 },
  { id: 'transfer', label: 'Transfert d\'argent', icon: 'send', color: '#7b1fa2', defaultAmount: 0 },
]

export const CATEGORY_KEYS = DEFAULT_EXPENSE_CATEGORIES.map((c) => c.id)

/** Normalise une catégorie (tolérant aux données existantes). */
export function normalizeCategory(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    ...source,
    id: String(source.id || uid('cat')),
    label: String(source.label ?? '').trim() || 'Sans nom',
    icon: source.icon || 'tag',
    color: source.color || '#757575',
    defaultAmount: toNumber(source.defaultAmount) ?? 0,
    isDefault: Boolean(source.isDefault),
    order: Number.isInteger(source.order) ? source.order : 999,
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString(),
  }
}

/** Normalise la liste des catégories. Une liste existante est respectée
    telle quelle : supprimer « Gaz » ne doit pas le faire réapparaître au
    prochain chargement. */
export function normalizeCategoryList(list) {
  if (!Array.isArray(list)) return [...DEFAULT_EXPENSE_CATEGORIES].map(normalizeCategory)
  return list
    .filter((item) => item && typeof item === 'object')
    .map(normalizeCategory)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'fr'))
}

/** Normalise une dépense. */
export function normalizeExpense(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const amount = toNumber(source.amount)
  const date = String(source.date ?? '').trim()
  return {
    ...source,
    id: String(source.id || uid('exp')),
    categoryId: String(source.categoryId ?? '').trim(),
    amount: amount !== null ? round2(amount) : null,
    date: date || new Date().toISOString().slice(0, 10),
    note: String(source.note ?? '').trim(),
    isTransfer: Boolean(source.isTransfer),
    linkedInvestmentId: source.linkedInvestmentId || null,
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString(),
  }
}

export const normalizeExpenseList = (list) => {
  if (!Array.isArray(list)) return []
  return list.filter((item) => item && typeof item === 'object').map(normalizeExpense)
}

/** Normalise un investissement (pour liaison avec transferts). */
export function normalizeInvestment(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const amount = toNumber(source.amount)
  const remaining = toNumber(source.remaining)
  return {
    ...source,
    id: String(source.id || uid('inv')),
    name: String(source.name ?? '').trim() || 'Investissement',
    amount: amount !== null ? round2(amount) : 0,
    remaining: remaining !== null ? round2(remaining) : (amount !== null ? round2(amount) : 0),
    note: String(source.note ?? '').trim(),
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString(),
  }
}

export const normalizeInvestmentList = (list) => {
  if (!Array.isArray(list)) return []
  return list.filter((item) => item && typeof item === 'object').map(normalizeInvestment)
}

/** Normalise une recette (revenu quotidien). */
export function normalizeRevenue(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const amount = toNumber(source.amount)
  return {
    ...source,
    id: String(source.id || uid('rev')),
    date: String(source.date ?? '').trim() || new Date().toISOString().slice(0, 10),
    amount: amount !== null ? round2(amount) : 0,
    note: String(source.note ?? '').trim(),
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString(),
  }
}

export const normalizeRevenueList = (list) => {
  if (!Array.isArray(list)) return []
  return list.filter((item) => item && typeof item === 'object').map(normalizeRevenue)
}

/** Réglages par défaut des dépenses. La devise est le dinar algérien,
    affiché « DA » (voir `formatMoney`). */
export const DEFAULT_EXPENSE_SETTINGS = {
  currency: 'DZD',
  autoDeductTransfer: true,
}

/** Normalise les réglages et migre l'ancienne devise « MAD » vers « DZD ». */
export function normalizeExpenseSettings(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const settings = { ...DEFAULT_EXPENSE_SETTINGS, ...source }
  const code = String(settings.currency || 'DZD').toUpperCase()
  /* L'application n'a qu'une devise : on remplace l'ancien dirham et tout
     code invalide, sans jamais laisser un montant sans sigle. */
  settings.currency = code === 'MAD' || !/^[A-Z]{3}$/.test(code) ? 'DZD' : code
  return settings
}

/** État par défaut des dépenses. */
export function emptyExpenses() {
  return {
    categories: [...DEFAULT_EXPENSE_CATEGORIES].map(normalizeCategory),
    expenses: [],
    investments: [],
    revenues: [],
    settings: { ...DEFAULT_EXPENSE_SETTINGS },
  }
}

/** Fusionne deux états de dépenses (pour sync/sauvegarde). */
export function mergeExpenses(current, incoming) {
  const base = normalizeExpenses(current)
  const other = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {}
  const result = { ...base }
  let added = 0
  let updated = 0

  const mergeById = (arr, incomingArr, normalize) => {
    const map = new Map((arr || []).map((item) => [item.id, item]))
    let a = 0
    let u = 0
    for (const item of incomingArr || []) {
      if (!item || typeof item !== 'object') continue
      const existing = map.get(item.id)
      if (existing) {
        map.set(item.id, { ...existing, ...item, updatedAt: new Date().toISOString() })
        u += 1
      } else {
        map.set(item.id, normalize(item))
        a += 1
      }
    }
    return { list: [...map.values()], added: a, updated: u }
  }

  const catMerge = mergeById(base.categories, other.categories, normalizeCategory)
  result.categories = catMerge.list
  added += catMerge.added
  updated += catMerge.updated

  const expMerge = mergeById(base.expenses, other.expenses, normalizeExpense)
  result.expenses = expMerge.list
  added += expMerge.added
  updated += expMerge.updated

  const invMerge = mergeById(base.investments, other.investments, normalizeInvestment)
  result.investments = invMerge.list
  added += invMerge.added
  updated += invMerge.updated

  const revMerge = mergeById(base.revenues, other.revenues, normalizeRevenue)
  result.revenues = revMerge.list
  added += revMerge.added
  updated += revMerge.updated

  if (other.settings && typeof other.settings === 'object') {
    result.settings = normalizeExpenseSettings({ ...base.settings, ...other.settings })
  }

  return { expenses: result, added, updated }
}

export function normalizeExpenses(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    categories: normalizeCategoryList(source.categories),
    expenses: normalizeExpenseList(source.expenses),
    investments: normalizeInvestmentList(source.investments),
    revenues: normalizeRevenueList(source.revenues),
    settings: normalizeExpenseSettings(source.settings),
  }
}

/* ------------------------------------------------------------------ */
/* Calculs                                                             */
/* ------------------------------------------------------------------ */

export function sumByCategory(expenses, categories) {
  const map = new Map()
  for (const cat of categories) map.set(cat.id, { category: cat, total: 0, count: 0 })
  for (const exp of expenses || []) {
    if (exp.amount === null) continue
    const entry = map.get(exp.categoryId) || { category: { id: exp.categoryId, label: exp.categoryId }, total: 0, count: 0 }
    entry.total = round2(entry.total + exp.amount)
    entry.count += 1
    map.set(exp.categoryId, entry)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function totalExpenses(expenses) {
  let total = 0
  for (const exp of expenses || []) if (exp.amount !== null) total += exp.amount
  return round2(total)
}

export function totalInvestments(investments) {
  let total = 0
  for (const inv of investments || []) total += inv.amount || 0
  return round2(total)
}

export function remainingInvestments(investments) {
  let total = 0
  for (const inv of investments || []) total += inv.remaining || 0
  return round2(total)
}

export function totalRevenues(revenues, { startDate = '', endDate = '' } = {}) {
  let total = 0
  for (const rev of revenues || []) {
    if (startDate && rev.date < startDate) continue
    if (endDate && rev.date > endDate) continue
    total += rev.amount || 0
  }
  return round2(total)
}

export function revenueByDate(revenues) {
  const map = new Map()
  for (const rev of revenues || []) {
    const key = rev.date
    const current = map.get(key) || { date: key, total: 0, count: 0 }
    current.total = round2(current.total + (rev.amount || 0))
    current.count += 1
    map.set(key, current)
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export function expensesByDate(expenses) {
  const map = new Map()
  for (const exp of expenses || []) {
    const key = exp.date
    const current = map.get(key) || { date: key, total: 0, count: 0 }
    if (exp.amount !== null) {
      current.total = round2(current.total + exp.amount)
      current.count += 1
    }
    map.set(key, current)
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export function categoryLabel(categories, categoryId) {
  return categories.find((c) => c.id === categoryId)?.label || categoryId
}

export function categoryIcon(categories, categoryId) {
  return categories.find((c) => c.id === categoryId)?.icon || 'tag'
}

export function categoryColor(categories, categoryId) {
  return categories.find((c) => c.id === categoryId)?.color || '#757575'
}