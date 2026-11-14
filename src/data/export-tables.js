/* ------------------------------------------------------------------ */
/* Tables d'export — ce que l'on met dans le fichier                   */
/*                                                                     */
/* Une seule définition sert les deux formats : chaque table devient    */
/* une feuille dans le classeur Excel, et une section dans le CSV.      */
/* Les montants restent des nombres (Excel peut les additionner) ; les  */
/* dates restent au format AAAA-MM-JJ, que tout tableur comprend.      */
/* ------------------------------------------------------------------ */

import { CATEGORIES, PRIORITIES, UNITS } from './products-model.js'
import { categoryLabel, totalExpenses, totalInvestments, totalRevenues, remainingInvestments } from './expenses-model.js'

export const EXPORT_SCOPES = [
  { value: 'all', label: 'Toutes les données', short: 'tout' },
  { value: 'products', label: 'Produits', short: 'produits' },
  { value: 'expenses', label: 'Dépenses', short: 'depenses' },
  { value: 'revenues', label: 'Recettes', short: 'recettes' },
  { value: 'bills', label: 'Factures', short: 'factures' },
]

export const scopeLabel = (scope) => EXPORT_SCOPES.find((item) => item.value === scope)?.label || 'Toutes les données'
export const scopeShort = (scope) => EXPORT_SCOPES.find((item) => item.value === scope)?.short || 'tout'

const day = (value) => String(value || '').slice(0, 10)
const unitShort = (value) => UNITS.find((unit) => unit.value === value)?.short || value || ''
const priorityLabel = (value) => PRIORITIES.find((item) => item.value === value)?.label || ''
const categoryName = (value) => CATEGORIES[value]?.label || value || 'Autre'

/** Prix total d'une ligne, seulement quand le prix est connu. */
function lineTotal(product) {
  const price = Number(product.price)
  if (!Number.isFinite(price) || price <= 0) return null
  const qty = Number(product.qty) || 1
  return Math.round(price * qty * 100) / 100
}

function productRows(products) {
  return (products || []).map((product) => ({
    name: product.name || '(sans nom)',
    category: categoryName(product.type),
    color: product.color || '',
    supplier: product.supplier || '',
    qty: Number(product.qty) || 1,
    unit: unitShort(product.unit),
    price: typeof product.price === 'number' && product.price > 0 ? product.price : null,
    total: lineTotal(product),
    priority: priorityLabel(product.priority),
    status: product.status === 'bought' ? 'Acheté' : 'À acheter',
    boughtAt: day(product.boughtAt),
    note: product.note || '',
    createdAt: day(product.createdAt),
  }))
}

function expenseRows(expenses, categories, investments) {
  const byId = new Map((investments || []).map((item) => [item.id, item.name]))
  return (expenses || []).map((expense) => ({
    date: day(expense.date),
    category: categoryLabel(categories, expense.categoryId),
    amount: typeof expense.amount === 'number' ? expense.amount : null,
    kind: expense.isTransfer ? 'Transfert' : 'Dépense',
    investment: byId.get(expense.linkedInvestmentId) || '',
    note: expense.note || '',
  }))
}

function revenueRows(revenues) {
  return (revenues || []).map((revenue) => ({
    date: day(revenue.date),
    amount: typeof revenue.amount === 'number' ? revenue.amount : null,
    note: revenue.note || '',
  }))
}

function investmentRows(investments) {
  return (investments || []).map((item) => ({
    name: item.name || 'Investissement',
    amount: typeof item.amount === 'number' ? item.amount : 0,
    remaining: typeof item.remaining === 'number' ? item.remaining : 0,
    note: item.note || '',
    createdAt: day(item.createdAt),
  }))
}

function categoryRows(categories, expenses) {
  const counts = new Map()
  const totals = new Map()
  for (const expense of expenses || []) {
    counts.set(expense.categoryId, (counts.get(expense.categoryId) || 0) + 1)
    totals.set(expense.categoryId, (totals.get(expense.categoryId) || 0) + (expense.amount || 0))
  }
  return (categories || []).map((category, index) => ({
    order: index + 1,
    name: category.label,
    expenses: counts.get(category.id) || 0,
    total: Math.round((totals.get(category.id) || 0) * 100) / 100,
  }))
}

function billRows(bills) {
  return (bills || []).map((bill) => ({
    date: day(bill.createdAt),
    supplier: bill.supplier || '—',
    amount: typeof bill.amount === 'number' ? bill.amount : null,
    status: bill.status === 'paid' ? 'Payée' : 'En attente',
    paidAt: day(bill.paidAt),
    note: bill.note || '',
  }))
}

/** Chiffres clés : ce qu'on veut lire avant les lignes. */
function summarySheet(snapshot, currency) {
  const products = snapshot.products || []
  const bills = snapshot.bills || []
  const expenses = snapshot.expenses || {}
  const pending = products.filter((product) => product.status !== 'bought')
  const bought = products.filter((product) => product.status === 'bought')
  const pendingValue = pending.reduce((sum, product) => sum + (lineTotal(product) || 0), 0)
  const totalExpense = totalExpenses(expenses.expenses)
  const totalRevenue = totalRevenues(expenses.revenues)
  const invested = totalInvestments(expenses.investments)
  const remaining = remainingInvestments(expenses.investments)

  const rows = [
    { label: 'Exporté le', value: day(new Date().toISOString()) },
    { label: 'Devise', value: currency },
    { label: 'Produits', value: products.length },
    { label: 'Produits à acheter', value: pending.length },
    { label: 'Produits achetés', value: bought.length },
    { label: 'Valeur estimée des achats à faire', value: Math.round(pendingValue * 100) / 100 },
    { label: 'Dépenses', value: expenses.expenses?.length || 0 },
    { label: 'Total des dépenses', value: Math.round(totalExpense * 100) / 100 },
    { label: 'Recettes', value: expenses.revenues?.length || 0 },
    { label: 'Total des recettes', value: Math.round(totalRevenue * 100) / 100 },
    { label: 'Solde (recettes − dépenses)', value: Math.round((totalRevenue - totalExpense) * 100) / 100 },
    { label: 'Investissements', value: expenses.investments?.length || 0 },
    { label: 'Total investi', value: Math.round(invested * 100) / 100 },
    { label: 'Reste à récupérer', value: Math.round(remaining * 100) / 100 },
    { label: 'Factures', value: bills.length },
  ]
  return {
    name: 'Résumé',
    columns: [
      { key: 'label', label: 'Indicateur', width: 34 },
      { key: 'value', label: 'Valeur', width: 18 },
    ],
    rows,
  }
}

const PRODUCT_COLUMNS = [
  { key: 'name', label: 'Nom', width: 30 },
  { key: 'category', label: 'Catégorie', width: 16 },
  { key: 'color', label: 'Couleur', width: 16 },
  { key: 'supplier', label: 'Fournisseur', width: 22 },
  { key: 'qty', label: 'Quantité', width: 10 },
  { key: 'unit', label: 'Unité', width: 8 },
  { key: 'price', label: 'Prix unitaire', width: 13 },
  { key: 'total', label: 'Total', width: 12 },
  { key: 'priority', label: 'Priorité', width: 12 },
  { key: 'status', label: 'Statut', width: 11 },
  { key: 'boughtAt', label: 'Acheté le', width: 12 },
  { key: 'note', label: 'Détails', width: 32 },
  { key: 'createdAt', label: 'Ajouté le', width: 12 },
]

const EXPENSE_COLUMNS = [
  { key: 'date', label: 'Date', width: 12 },
  { key: 'category', label: 'Catégorie', width: 18 },
  { key: 'amount', label: 'Montant', width: 12 },
  { key: 'kind', label: 'Type', width: 12 },
  { key: 'investment', label: 'Investissement', width: 22 },
  { key: 'note', label: 'Note', width: 32 },
]

const REVENUE_COLUMNS = [
  { key: 'date', label: 'Date', width: 12 },
  { key: 'amount', label: 'Montant', width: 12 },
  { key: 'note', label: 'Note', width: 36 },
]

const INVESTMENT_COLUMNS = [
  { key: 'name', label: 'Investissement', width: 26 },
  { key: 'amount', label: 'Montant', width: 12 },
  { key: 'remaining', label: 'Reste à récupérer', width: 18 },
  { key: 'note', label: 'Note', width: 32 },
  { key: 'createdAt', label: 'Ajouté le', width: 12 },
]

const CATEGORY_COLUMNS = [
  { key: 'order', label: 'Ordre', width: 8 },
  { key: 'name', label: 'Catégorie', width: 22 },
  { key: 'expenses', label: 'Dépenses', width: 10 },
  { key: 'total', label: 'Total', width: 14 },
]

const BILL_COLUMNS = [
  { key: 'date', label: 'Date', width: 12 },
  { key: 'supplier', label: 'Fournisseur', width: 26 },
  { key: 'amount', label: 'Montant', width: 12 },
  { key: 'status', label: 'Statut', width: 12 },
  { key: 'paidAt', label: 'Payée le', width: 12 },
  { key: 'note', label: 'Note', width: 32 },
]

/**
 * Construit les feuilles (ou sections CSV) demandées.
 * @param {{products?: Array, bills?: Array, expenses?: object}} snapshot
 * @param {string} scope `all` ou une collection
 */
export function buildSheets(snapshot, scope = 'all') {
  const data = snapshot || {}
  const expenses = data.expenses || {}
  const categories = expenses.categories || []
  const currency = expenses.settings?.currency || 'DZD'

  const table = (name, columns, rows) => ({ name, columns, rows })

  const all = [
    summarySheet(data, currency),
    table('Produits', PRODUCT_COLUMNS, productRows(data.products)),
    table('Dépenses', EXPENSE_COLUMNS, expenseRows(expenses.expenses, categories, expenses.investments)),
    table('Recettes', REVENUE_COLUMNS, revenueRows(expenses.revenues)),
    table('Investissements', INVESTMENT_COLUMNS, investmentRows(expenses.investments)),
    table('Catégories', CATEGORY_COLUMNS, categoryRows(categories, expenses.expenses)),
    table('Factures', BILL_COLUMNS, billRows(data.bills)),
  ]

  if (scope === 'all') return all
  if (scope === 'products') return [all[1]]
  if (scope === 'expenses') return [all[2]]
  if (scope === 'revenues') return [all[3]]
  if (scope === 'bills') return [all[6]]
  return all
}
