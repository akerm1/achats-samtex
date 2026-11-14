/* ------------------------------------------------------------------ */
/* Tables d'export — ce que l'on met dans le fichier                   */
/*                                                                     */
/* Règle : rien ne manque. Chaque collection de l'application a sa      */
/* feuille, avec l'identifiant et les dates de création/modification    */
/* pour pouvoir recouper avec une sauvegarde JSON. L'Analyse (ventes,   */
/* achats, investissements, possessions, lieux, paramètres) a les       */
/* siennes : elle vit dans un store à part et n'était exportée nulle    */
/* part — un export « complet » qui l'oublie est un export faux.        */
/*                                                                     */
/* Une seule définition sert les deux formats : chaque table est une    */
/* feuille du classeur, et une section du CSV. Les montants restent des */
/* nombres (Excel peut les additionner) ; les dates restent en          */
/* AAAA-MM-JJ, que tout tableur comprend.                              */
/*                                                                     */
/* Les photos ne sont pas exportées en tant qu'images : une cellule ne  */
/* contient pas 120 Ko de base64. Elles sont signalées (`oui`) et       */
/* voyagent par la sauvegarde JSON, qui est binaire-compatible.         */
/* ------------------------------------------------------------------ */

import { CATEGORIES, PRIORITIES, UNITS } from './products-model.js'
import { categoryLabel } from './expenses-model.js'
import { HOLDER_KEYS } from './analysis-model.js'

export const EXPORT_SCOPES = [
  { value: 'all', label: 'Toutes les données', short: 'tout' },
  { value: 'products', label: 'Produits', short: 'produits' },
  { value: 'expenses', label: 'Dépenses', short: 'depenses' },
  { value: 'revenues', label: 'Recettes', short: 'recettes' },
  { value: 'bills', label: 'Factures', short: 'factures' },
]

export const scopeLabel = (scope) => EXPORT_SCOPES.find((item) => item.value === scope)?.label || 'Toutes les données'
export const scopeShort = (scope) => EXPORT_SCOPES.find((item) => item.value === scope)?.short || 'tout'

/* --- Petites conversions ------------------------------------------- */

const day = (value) => String(value || '').slice(0, 10)
/** Date + heure, pour les champs de traçabilité (créé / modifié). */
const stamp = (value) => {
  const text = String(value || '')
  return text ? text.replace('T', ' ').slice(0, 16) : ''
}
const unitShort = (value) => UNITS.find((unit) => unit.value === value)?.short || value || ''
const priorityLabel = (value) => PRIORITIES.find((item) => item.value === value)?.label || ''
const categoryName = (value) => CATEGORIES[value]?.label || value || 'Autre'
const yesNo = (value) => (value ? 'oui' : '')
const money = (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null)

/** Somme d'une colonne, sans se laisser arrêter par les cellules vides. */
export function sumColumn(rows, key) {
  let total = 0
  for (const row of rows || []) {
    const value = row?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) total += value
  }
  return Math.round(total * 100) / 100
}

/** Nombre de lignes réellement renseignées dans une colonne. */
const filled = (rows, key) => (rows || []).filter((row) => row?.[key] !== null && row?.[key] !== undefined && row?.[key] !== '').length

/* --- Produits ------------------------------------------------------ */

/** Prix total d'une ligne, seulement quand le prix est connu. */
function lineTotal(product) {
  const price = Number(product.price)
  if (!Number.isFinite(price) || price <= 0) return null
  const qty = Number(product.qty) || 1
  return Math.round(price * qty * 100) / 100
}

function productRows(products) {
  return (products || []).map((product) => ({
    id: product.id,
    name: product.name || '(sans nom)',
    category: categoryName(product.type),
    color: product.color || '',
    hex: product.colorRgb || '',
    supplier: product.supplier || '',
    qty: Number(product.qty) || 1,
    unit: unitShort(product.unit),
    price: money(product.price),
    total: lineTotal(product),
    priority: priorityLabel(product.priority),
    status: product.status === 'bought' ? 'Acheté' : 'À acheter',
    boughtAt: day(product.boughtAt),
    photo: yesNo(product.photo),
    receipt: yesNo(product.receipt),
    note: product.note || '',
    createdAt: stamp(product.createdAt),
    updatedAt: stamp(product.updatedAt),
  }))
}

/* --- Dépenses / Recettes / Investissements / Catégories ------------ */

function expenseRows(expenses, categories, investments) {
  const byId = new Map((investments || []).map((item) => [item.id, item.name]))
  return (expenses || [])
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)))
    .map((expense) => ({
      id: expense.id,
      date: day(expense.date),
      category: categoryLabel(categories, expense.categoryId),
      categoryId: expense.categoryId || '',
      amount: money(expense.amount),
      kind: expense.isTransfer ? 'Transfert' : 'Dépense',
      investment: byId.get(expense.linkedInvestmentId) || '',
      note: expense.note || '',
      createdAt: stamp(expense.createdAt),
      updatedAt: stamp(expense.updatedAt),
    }))
}

function revenueRows(revenues) {
  return (revenues || [])
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)))
    .map((revenue) => ({
      id: revenue.id,
      date: day(revenue.date),
      amount: money(revenue.amount),
      note: revenue.note || '',
      createdAt: stamp(revenue.createdAt),
      updatedAt: stamp(revenue.updatedAt),
    }))
}

function investmentRows(investments, expenses) {
  const transferred = new Map()
  for (const expense of expenses || []) {
    if (!expense.linkedInvestmentId) continue
    const key = expense.linkedInvestmentId
    transferred.set(key, (transferred.get(key) || 0) + (Number(expense.amount) || 0))
  }
  return (investments || []).map((item) => ({
    id: item.id,
    name: item.name || 'Investissement',
    amount: money(item.amount),
    transferred: money(transferred.get(item.id) || 0),
    remaining: money(item.remaining),
    note: item.note || '',
    createdAt: stamp(item.createdAt),
    updatedAt: stamp(item.updatedAt),
  }))
}

function categoryRows(categories, expenses) {
  const counts = new Map()
  const totals = new Map()
  for (const expense of expenses || []) {
    counts.set(expense.categoryId, (counts.get(expense.categoryId) || 0) + 1)
    totals.set(expense.categoryId, (totals.get(expense.categoryId) || 0) + (Number(expense.amount) || 0))
  }
  return (categories || []).map((category, index) => ({
    id: category.id,
    order: index + 1,
    name: category.label,
    icon: category.icon || '',
    color: category.color || '',
    defaultAmount: money(category.defaultAmount) ?? 0,
    isDefault: category.isDefault ? 'oui' : '',
    expenses: counts.get(category.id) || 0,
    total: money(totals.get(category.id) || 0),
    createdAt: stamp(category.createdAt),
  }))
}

function billRows(bills) {
  return (bills || [])
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((bill) => ({
      id: bill.id,
      date: day(bill.createdAt),
      supplier: bill.supplier || '—',
      amount: money(bill.amount),
      status: bill.status === 'paid' ? 'Payée' : 'En attente',
      paidAt: day(bill.paidAt),
      receipt: yesNo(bill.photo),
      note: bill.note || '',
      createdAt: stamp(bill.createdAt),
      updatedAt: stamp(bill.updatedAt),
    }))
}

/* --- Analyse ------------------------------------------------------- */

const SALE_KIND_LABEL = { amount: 'Recette', aid: 'Férié', closed: 'Fermé' }

function analysisSaleRows(analysis) {
  return (analysis?.sales || [])
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((sale) => ({
      id: sale.id,
      date: day(sale.date),
      kind: SALE_KIND_LABEL[sale.kind] || 'Recette',
      amount: money(sale.amount),
      updatedAt: stamp(sale.updatedAt),
    }))
}

function analysisPurchaseRows(analysis) {
  return (analysis?.purchases || [])
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((purchase) => ({
      id: purchase.id,
      date: day(purchase.date),
      amount: money(purchase.amount),
      note: purchase.note || '',
      createdAt: stamp(purchase.createdAt),
      updatedAt: stamp(purchase.updatedAt),
    }))
}

function analysisInvestmentRows(analysis) {
  return (analysis?.investments || []).map((item) => ({
    id: item.id,
    name: item.name || '',
    amount: money(item.amount),
  }))
}

function analysisHoldingRows(analysis) {
  const labels = analysis?.holderLabels || {}
  return (analysis?.holdings || []).map((item) => ({
    id: item.id,
    holder: labels[item.holder] || item.holder || HOLDER_KEYS[0],
    amount: money(item.amount),
    note: item.note || '',
  }))
}

function analysisPlaceRows(analysis) {
  return (analysis?.places || []).map((item) => ({
    id: item.id,
    label: item.label || '',
    amount: money(item.amount),
  }))
}

function analysisSettingsRows(analysis) {
  const settings = analysis?.settings || {}
  const divisors = analysis?.holderLabels || {}
  return [
    { label: 'Diviseur A (moi + moh)', value: settings.divisorA ?? '' },
    { label: 'Diviseur B (avec hakima)', value: settings.divisorB ?? '' },
    { label: 'Déduction', value: money(settings.deduction) ?? 0 },
    { label: 'Report de recette', value: money(settings.openingRevenue) ?? 0 },
    { label: 'Report d’achats', value: money(settings.openingPurchases) ?? 0 },
    ...HOLDER_KEYS.map((key) => ({ label: `Libellé « ${key} »`, value: divisors[key] || key })),
  ]
}

/* --- Colonnes ------------------------------------------------------ */

const PRODUCT_COLUMNS = [
  { key: 'id', label: 'Identifiant', width: 22 },
  { key: 'name', label: 'Nom', width: 30 },
  { key: 'category', label: 'Catégorie', width: 16 },
  { key: 'color', label: 'Couleur', width: 16 },
  { key: 'hex', label: 'Teinte', width: 10 },
  { key: 'supplier', label: 'Fournisseur', width: 22 },
  { key: 'qty', label: 'Quantité', width: 10 },
  { key: 'unit', label: 'Unité', width: 8 },
  { key: 'price', label: 'Prix unitaire', width: 13 },
  { key: 'total', label: 'Total', width: 12 },
  { key: 'priority', label: 'Priorité', width: 12 },
  { key: 'status', label: 'Statut', width: 11 },
  { key: 'boughtAt', label: 'Acheté le', width: 12 },
  { key: 'photo', label: 'Photo', width: 8 },
  { key: 'receipt', label: 'Ticket', width: 8 },
  { key: 'note', label: 'Détails', width: 32 },
  { key: 'createdAt', label: 'Ajouté le', width: 17 },
  { key: 'updatedAt', label: 'Modifié le', width: 17 },
]

const EXPENSE_COLUMNS = [
  { key: 'id', label: 'Identifiant', width: 22 },
  { key: 'date', label: 'Date', width: 12 },
  { key: 'category', label: 'Catégorie', width: 18 },
  { key: 'categoryId', label: 'Clé catégorie', width: 14 },
  { key: 'amount', label: 'Montant', width: 12 },
  { key: 'kind', label: 'Type', width: 12 },
  { key: 'investment', label: 'Investissement', width: 22 },
  { key: 'note', label: 'Note', width: 32 },
  { key: 'createdAt', label: 'Saisie le', width: 17 },
  { key: 'updatedAt', label: 'Modifiée le', width: 17 },
]

const REVENUE_COLUMNS = [
  { key: 'id', label: 'Identifiant', width: 22 },
  { key: 'date', label: 'Date', width: 12 },
  { key: 'amount', label: 'Montant', width: 12 },
  { key: 'note', label: 'Note', width: 36 },
  { key: 'createdAt', label: 'Saisie le', width: 17 },
  { key: 'updatedAt', label: 'Modifiée le', width: 17 },
]

const INVESTMENT_COLUMNS = [
  { key: 'id', label: 'Identifiant', width: 22 },
  { key: 'name', label: 'Investissement', width: 26 },
  { key: 'amount', label: 'Montant', width: 12 },
  { key: 'transferred', label: 'Transféré', width: 12 },
  { key: 'remaining', label: 'Reste à récupérer', width: 18 },
  { key: 'note', label: 'Note', width: 32 },
  { key: 'createdAt', label: 'Ajouté le', width: 17 },
  { key: 'updatedAt', label: 'Modifié le', width: 17 },
]

const CATEGORY_COLUMNS = [
  { key: 'id', label: 'Identifiant', width: 16 },
  { key: 'order', label: 'Ordre', width: 8 },
  { key: 'name', label: 'Catégorie', width: 22 },
  { key: 'icon', label: 'Icône', width: 12 },
  { key: 'color', label: 'Couleur', width: 10 },
  { key: 'defaultAmount', label: 'Montant par défaut', width: 18 },
  { key: 'isDefault', label: 'Livrée avec l’app', width: 16 },
  { key: 'expenses', label: 'Dépenses', width: 10 },
  { key: 'total', label: 'Total', width: 14 },
  { key: 'createdAt', label: 'Créée le', width: 17 },
]

const BILL_COLUMNS = [
  { key: 'id', label: 'Identifiant', width: 22 },
  { key: 'date', label: 'Date', width: 12 },
  { key: 'supplier', label: 'Fournisseur', width: 26 },
  { key: 'amount', label: 'Montant', width: 12 },
  { key: 'status', label: 'Statut', width: 12 },
  { key: 'paidAt', label: 'Payée le', width: 12 },
  { key: 'receipt', label: 'Ticket', width: 8 },
  { key: 'note', label: 'Note', width: 32 },
  { key: 'createdAt', label: 'Créée le', width: 17 },
  { key: 'updatedAt', label: 'Modifiée le', width: 17 },
]

const SALE_COLUMNS = [
  { key: 'id', label: 'Identifiant', width: 14 },
  { key: 'date', label: 'Date', width: 12 },
  { key: 'kind', label: 'Type', width: 12 },
  { key: 'amount', label: 'Montant', width: 12 },
  { key: 'updatedAt', label: 'Modifiée le', width: 17 },
]

const PURCHASE_COLUMNS = [
  { key: 'id', label: 'Identifiant', width: 22 },
  { key: 'date', label: 'Date', width: 12 },
  { key: 'amount', label: 'Montant', width: 12 },
  { key: 'note', label: 'Note', width: 32 },
  { key: 'createdAt', label: 'Saisi le', width: 17 },
  { key: 'updatedAt', label: 'Modifié le', width: 17 },
]

const ANALYSIS_INVESTMENT_COLUMNS = [
  { key: 'id', label: 'Identifiant', width: 22 },
  { key: 'name', label: 'Nom', width: 26 },
  { key: 'amount', label: 'Montant', width: 12 },
]

const HOLDING_COLUMNS = [
  { key: 'id', label: 'Identifiant', width: 22 },
  { key: 'holder', label: 'Détenteur', width: 18 },
  { key: 'amount', label: 'Montant', width: 12 },
  { key: 'note', label: 'Note', width: 32 },
]

const PLACE_COLUMNS = [
  { key: 'id', label: 'Identifiant', width: 22 },
  { key: 'label', label: 'Lieu', width: 26 },
  { key: 'amount', label: 'Montant', width: 12 },
]

const SETTINGS_COLUMNS = [
  { key: 'label', label: 'Paramètre', width: 30 },
  { key: 'value', label: 'Valeur', width: 20 },
]

/* --- Résumé -------------------------------------------------------- */

/**
 * Chiffres clés, recalculés **à partir des lignes exportées**.
 *
 * C'est le point qui rend l'export vérifiable : si une ligne manquait, le
 * total du résumé ne correspondrait plus à celui de l'application, et le
 * banc de vérification le verrait.
 */
function summarySheet(tables, currency) {
  const products = tables.products.rows
  const expenses = tables.expenses.rows
  const revenues = tables.revenues.rows
  const investments = tables.investments.rows
  const categories = tables.categories.rows
  const bills = tables.bills.rows
  const sales = tables.sales.rows
  const purchases = tables.analysisPurchases.rows

  const pending = products.filter((row) => row.status === 'À acheter')
  const totalExpense = sumColumn(expenses, 'amount')
  const totalRevenue = sumColumn(revenues, 'amount')
  const totalInvested = sumColumn(investments, 'amount')
  const totalRemaining = sumColumn(investments, 'remaining')

  const rows = [
    { label: 'Exporté le', value: stamp(new Date().toISOString()) },
    { label: 'Devise', value: currency },

    { label: 'Produits — lignes', value: products.length },
    { label: 'Produits — à acheter', value: pending.length },
    { label: 'Produits — achetés', value: products.filter((row) => row.status === 'Acheté').length },
    { label: 'Produits — avec photo', value: filled(products, 'photo') },
    { label: 'Produits — valeur estimée des achats à faire', value: sumColumn(pending, 'total') },
    { label: 'Produits — valeur totale', value: sumColumn(products, 'total') },

    { label: 'Dépenses — lignes', value: expenses.length },
    { label: 'Dépenses — total', value: totalExpense },
    { label: 'Dépenses — lignes sans montant', value: expenses.length - filled(expenses, 'amount') },
    { label: 'Dépenses — transferts', value: expenses.filter((row) => row.kind === 'Transfert').length },

    { label: 'Recettes — lignes', value: revenues.length },
    { label: 'Recettes — total', value: totalRevenue },
    { label: 'Solde (recettes − dépenses)', value: Math.round((totalRevenue - totalExpense) * 100) / 100 },

    { label: 'Investissements — lignes', value: investments.length },
    { label: 'Investissements — total investi', value: totalInvested },
    { label: 'Investissements — reste à récupérer', value: totalRemaining },

    { label: 'Catégories — lignes', value: categories.length },
    { label: 'Catégories — total des dépenses rattachées', value: sumColumn(categories, 'total') },

    { label: 'Factures — lignes', value: bills.length },
    { label: 'Factures — total', value: sumColumn(bills, 'amount') },
    { label: 'Factures — impayées', value: bills.filter((row) => row.status === 'En attente').length },

    { label: 'Analyse — recettes saisies', value: sales.filter((row) => row.kind === 'Recette').length },
    { label: 'Analyse — total des recettes', value: sumColumn(sales, 'amount') },
    { label: 'Analyse — achats', value: purchases.length },
    { label: 'Analyse — total des achats', value: sumColumn(purchases, 'amount') },
    { label: 'Analyse — investissements', value: tables.analysisInvestments.rows.length },
    { label: 'Analyse — possessions', value: tables.holdings.rows.length },
    { label: 'Analyse — lieux', value: tables.places.rows.length },

    { label: 'Note', value: 'Les photos ne sont pas dans ce fichier (une cellule ne contient pas d’image) : la sauvegarde JSON les emporte.' },
  ]

  return {
    name: 'Résumé',
    columns: [
      { key: 'label', label: 'Indicateur', width: 46 },
      { key: 'value', label: 'Valeur', width: 26 },
    ],
    rows,
  }
}

/* --- Assemblage ---------------------------------------------------- */

/**
 * Construit les feuilles (ou sections CSV) demandées.
 * @param {{products?: Array, bills?: Array, expenses?: object, analysis?: object}} snapshot
 * @param {string} scope `all` ou une collection
 */
export function buildSheets(snapshot, scope = 'all') {
  const data = snapshot || {}
  const expensesState = data.expenses || {}
  const analysis = data.analysis || {}
  const categories = expensesState.categories || []
  const currency = expensesState.settings?.currency || 'DZD'

  const tables = {
    products: { name: 'Produits', columns: PRODUCT_COLUMNS, rows: productRows(data.products) },
    expenses: { name: 'Dépenses', columns: EXPENSE_COLUMNS, rows: expenseRows(expensesState.expenses, categories, expensesState.investments) },
    revenues: { name: 'Recettes', columns: REVENUE_COLUMNS, rows: revenueRows(expensesState.revenues) },
    investments: { name: 'Investissements (dépenses)', columns: INVESTMENT_COLUMNS, rows: investmentRows(expensesState.investments, expensesState.expenses) },
    categories: { name: 'Catégories', columns: CATEGORY_COLUMNS, rows: categoryRows(categories, expensesState.expenses) },
    bills: { name: 'Factures', columns: BILL_COLUMNS, rows: billRows(data.bills) },
    sales: { name: 'Analyse · Ventes', columns: SALE_COLUMNS, rows: analysisSaleRows(analysis) },
    analysisPurchases: { name: 'Analyse · Achats', columns: PURCHASE_COLUMNS, rows: analysisPurchaseRows(analysis) },
    analysisInvestments: { name: 'Analyse · Investissements', columns: ANALYSIS_INVESTMENT_COLUMNS, rows: analysisInvestmentRows(analysis) },
    holdings: { name: 'Analyse · Possessions', columns: HOLDING_COLUMNS, rows: analysisHoldingRows(analysis) },
    places: { name: 'Analyse · Lieux', columns: PLACE_COLUMNS, rows: analysisPlaceRows(analysis) },
    analysisSettings: { name: 'Analyse · Paramètres', columns: SETTINGS_COLUMNS, rows: analysisSettingsRows(analysis) },
  }

  if (scope === 'products') return [tables.products]
  if (scope === 'expenses') return [tables.expenses]
  if (scope === 'revenues') return [tables.revenues]
  if (scope === 'bills') return [tables.bills]

  return [
    summarySheet(tables, currency),
    tables.products,
    tables.expenses,
    tables.revenues,
    tables.investments,
    tables.categories,
    tables.bills,
    tables.sales,
    tables.analysisPurchases,
    tables.analysisInvestments,
    tables.holdings,
    tables.places,
    tables.analysisSettings,
  ]
}
