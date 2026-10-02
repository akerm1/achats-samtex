/* ------------------------------------------------------------------ */
/* Modèle métier — catégories, unités, priorités, lecture des données  */
/* Les données distantes restent tolérantes : tout champ inconnu est    */
/* conservé tel quel pour ne jamais rien perdre en synchronisation.    */
/* ------------------------------------------------------------------ */

import { round2, toNumber, uid } from '../core/utils.js'
import { colorFromText } from './colors.js'

export const STATUS = { TODO: 'todo', BOUGHT: 'bought' }

export const CATEGORIES = {
  ceinture: { label: 'Ceinture / Sash', unit: 'piece' },
  tissu: { label: 'Tissu', unit: 'metre' },
  tulle: { label: 'Tulle', unit: 'metre' },
  ruban: { label: 'Ruban', unit: 'rouleau' },
  fil: { label: 'Fil', unit: 'piece' },
  dentelle: { label: 'Dentelle', unit: 'metre' },
  accessoire: { label: 'Accessoire', unit: 'piece' },
  autre: { label: 'Autre', unit: 'piece' },
}
export const CATEGORY_VALUES = Object.keys(CATEGORIES)

export const UNITS = [
  { value: 'piece', label: 'pièce(s)', short: 'pc', plural: 'pièces' },
  { value: 'metre', label: 'mètre(s)', short: 'm', plural: 'mètres' },
  { value: 'rouleau', label: 'rouleau(x)', short: 'rlt', plural: 'rouleaux' },
]
const UNIT_VALUES = UNITS.map((unit) => unit.value)

export const PRIORITIES = [
  { value: 'haute', label: 'Prioritaire', rank: 0, badge: 'badge--red' },
  { value: 'normale', label: 'Normale', rank: 1, badge: '' },
  { value: 'basse', label: 'Basse', rank: 2, badge: 'badge--blue' },
]
const PRIORITY_VALUES = PRIORITIES.map((priority) => priority.value)

export const SORTS = [
  { value: 'recent', label: 'Ajout récent' },
  { value: 'name', label: 'Nom (A → Z)' },
  { value: 'price', label: 'Prix décroissant' },
  { value: 'qty', label: 'Quantité décroissante' },
  { value: 'priority', label: 'Priorité' },
]

/* Présentation de la liste : trois façons de montrer les mêmes produits.
   `card` garde la fiche complète (photo ou bande de couleur, prix, note,
   boutons) ; `mosaic` aligne des carrés pour voir d'un coup d'œil les
   teintes ; `row` tient une ligne par produit pour les longues listes.
   Les trois modes ouvrent toujours la fiche produit au clic : ce que le
   mode change, c'est la densité, jamais l'accès à l'information. */
export const CARD_LAYOUTS = [
  {
    value: 'card',
    label: 'Fiche',
    icon: 'store',
    hint: "La fiche complète : photo ou bande de couleur, prix, note et boutons. C'est le mode le plus détaillé.",
  },
  {
    value: 'mosaic',
    label: 'Mosaïque',
    icon: 'grid',
    hint: "Des carrés alignés, quatre par ligne sur ordinateur : on compare les teintes d'un seul regard.",
  },
  {
    value: 'row',
    label: 'Liste',
    icon: 'list',
    hint: 'Une ligne par produit, avec une petite vignette. Le mode le plus compact, pour les longues listes.',
  },
]
export const CARD_LAYOUT_VALUES = CARD_LAYOUTS.map((layout) => layout.value)

/** Nettoie une couleur RGB brute (n'importe quelle table 0-255). */
function normalizeRgb(raw) {
  if (!raw || typeof raw !== 'object') return null
  const r = Math.round(Number(raw.r))
  const g = Math.round(Number(raw.g))
  const b = Math.round(Number(raw.b))
  if ([r, g, b].some((value) => !Number.isFinite(value) || value < 0 || value > 255)) return null
  return { r, g, b }
}

/** Couleur CSS d'un produit, `null` si non définie (nom reconnu en repli). */
export function colorCss(product) {
  const rgb = product?.colorRgb
  if (rgb) return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
  return colorFromText(product?.color)
}

/** `#rrggbb` d'un produit, `null` si non définie (nom reconnu en repli). */
export function colorHex(product) {
  const rgb = product?.colorRgb
  if (rgb) {
    const hex = (value) => value.toString(16).padStart(2, '0')
    return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`
  }
  return colorFromText(product?.color)
}

/** Nom affiché : le libellé si présent, sinon un repli neutre. */
export function displayName(product) {
  return String(product?.name ?? '').trim() || 'Sans nom'
}

export function categoryLabel(type) {
  return CATEGORIES[type]?.label || CATEGORIES.autre.label
}

export function unitLabel(unit) {
  return UNITS.find((item) => item.value === unit)?.label || UNITS[0].label
}

export function unitShort(unit) {
  return UNITS.find((item) => item.value === unit)?.short || UNITS[0].short
}

export function priorityMeta(value) {
  return PRIORITIES.find((item) => item.value === value) || PRIORITIES[1]
}

export function defaultUnitFor(type) {
  return CATEGORIES[type]?.unit || 'piece'
}

/** Nettoie et complète un produit, quel que soit son âge. */
export function normalizeProduct(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const type = CATEGORY_VALUES.includes(source.type) ? source.type : 'autre'
  const status = source.status === STATUS.BOUGHT ? STATUS.BOUGHT : STATUS.TODO
  const price = toNumber(source.price)
  const createdAt = source.createdAt || new Date().toISOString()
  return {
    ...source,
    id: String(source.id || uid('local')),
    name: String(source.name ?? '').trim(),
    photo: typeof source.photo === 'string' ? source.photo : '',
    receipt: typeof source.receipt === 'string' ? source.receipt : '',
    note: String(source.note ?? '').trim(),
    type,
    color: String(source.color ?? '').trim(),
    colorRgb: normalizeRgb(source.colorRgb),
    supplier: String(source.supplier ?? '').trim(),
    qty: Math.max(1, Math.round(toNumber(source.qty) || 1)),
    unit: UNIT_VALUES.includes(source.unit) ? source.unit : defaultUnitFor(type),
    priority: PRIORITY_VALUES.includes(source.priority) ? source.priority : 'normale',
    price: price !== null && price > 0 ? round2(price) : null,
    status,
    boughtAt: status === STATUS.BOUGHT ? source.boughtAt || createdAt : null,
    receiptAt: source.receiptAt || null,
    createdAt,
    updatedAt: source.updatedAt || createdAt,
  }
}

export function normalizeList(list) {
  if (!Array.isArray(list)) return []
  return list.filter((item) => item && typeof item === 'object').map(normalizeProduct)
}

/** Vue calculée d'un produit (libellés, total de ligne, quantité). */
export function productView(product) {
  const qty = Math.max(1, Math.round(toNumber(product?.qty) || 1))
  const unit = UNIT_VALUES.includes(product?.unit) ? product.unit : defaultUnitFor(product?.type)
  const price = toNumber(product?.price)
  const lineTotal = price !== null && price > 0 ? round2(price * qty) : null
  return {
    ...product,
    qty,
    unit,
    price: lineTotal === null ? null : round2(price),
    lineTotal,
    typeLabel: categoryLabel(product?.type),
    priorityLabel: priorityMeta(product?.priority).label,
    qtyLabel: describeQty(qty, unit),
    hasPrice: lineTotal !== null,
    isBought: product?.status === STATUS.BOUGHT,
    colorCss: colorCss(product),
    name: displayName(product),
  }
}

/** « 25 pièces », « 40 m », « 3 rouleaux ». */
export function describeQty(qty, unit) {
  const value = Math.max(1, Math.round(toNumber(qty) || 1))
  if (unit === 'metre') return `${value} m`
  if (unit === 'rouleau') return value === 1 ? '1 rouleau' : `${value} rouleaux`
  return value === 1 ? '1 pièce' : `${value} pièces`
}

/** Recherche plein texte : nom, détails, couleur, fournisseur, catégorie. */
export function matchesQuery(product, query) {
  const needle = String(query ?? '').trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    product?.name,
    product?.note,
    product?.color,
    product?.supplier,
    categoryLabel(product?.type),
  ]
    .join(' ')
    .toLowerCase()
  return needle.split(/\s+/).every((token) => haystack.includes(token))
}

function byRecency(a, b) {
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
}

/**
 * Tri : les produits achetés descendent toujours en bas de liste.
 * @param {'recent'|'name'|'price'|'qty'|'priority'} key
 */
export function sortProducts(list, key = 'recent') {
  const items = [...(list || [])].map(productView)
  const comparators = {
    recent: byRecency,
    name: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' }),
    price: (a, b) => (b.lineTotal ?? -1) - (a.lineTotal ?? -1),
    qty: (a, b) => b.qty - a.qty,
    priority: (a, b) => priorityMeta(a.priority).rank - priorityMeta(b.priority).rank,
  }
  const compare = comparators[key] || byRecency
  items.sort((a, b) => (a.isBought !== b.isBought ? (a.isBought ? 1 : -1) : compare(a, b)))
  return items
}

/** Filtre statut + catégorie + recherche. */
export function filterProducts(list, { status = 'todo', category = 'all', query = '' } = {}) {
  return (list || []).filter((product) => {
    if (status === STATUS.TODO && product.status === STATUS.BOUGHT) return false
    if (status === STATUS.BOUGHT && product.status !== STATUS.BOUGHT) return false
    if (category !== 'all' && (product.type || 'autre') !== category) return false
    return matchesQuery(product, query)
  })
}

export function groupByCategory(list) {
  const groups = new Map()
  for (const item of list) {
    const type = item.type || 'autre'
    if (!groups.has(type)) groups.set(type, [])
    groups.get(type).push(item)
  }
  return groups
}

export function sumTotal(items) {
  let total = 0
  let priced = 0
  let unpriced = 0
  let units = 0
  for (const item of items || []) {
    units += item.qty || 0
    if (item.lineTotal === null || item.lineTotal === undefined) unpriced += 1
    else {
      total += item.lineTotal
      priced += 1
    }
  }
  return { total: round2(total), priced, unpriced, units }
}

/** Statistiques complètes : tableau de bord. */
export function computeStats(list) {
  const views = (list || []).map(productView)
  const todo = views.filter((item) => !item.isBought)
  const bought = views.filter((item) => item.isBought)
  const planned = sumTotal(todo)
  const spent = sumTotal(bought)

  const byCategory = CATEGORY_VALUES.map((type) => {
    const items = views.filter((item) => (item.type || 'autre') === type)
    if (!items.length) return null
    const todoItems = items.filter((item) => !item.isBought)
    const boughtItems = items.filter((item) => item.isBought)
    return {
      key: type,
      label: categoryLabel(type),
      count: items.length,
      todoCount: todoItems.length,
      boughtCount: boughtItems.length,
      total: sumTotal(todoItems).total,
      spent: sumTotal(boughtItems).total,
      units: sumTotal(todoItems).units,
    }
  })
    .filter(Boolean)
    .sort((a, b) => b.total - a.total || b.count - a.count)

  return {
    total: views.length,
    todoCount: todo.length,
    boughtCount: bought.length,
    planned,
    spent,
    byCategory,
    progress: views.length ? Math.round((bought.length / views.length) * 100) : 0,
    avgLine: planned.priced ? round2(planned.total / planned.priced) : 0,
    lastActivity: views.reduce((latest, item) => {
      const stamp = item.updatedAt || item.createdAt || ''
      return stamp > latest ? stamp : latest
    }, ''),
  }
}

/** Fournisseurs déjà utilisés (autocomplétion du formulaire). */
export function knownSuppliers(list) {
  const values = new Set()
  for (const item of list || []) {
    const supplier = String(item.supplier || '').trim()
    if (supplier) values.add(supplier)
  }
  return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
}

/** Récapitulatif texte prêt à partager (WhatsApp, SMS, e-mail…). */
export function listSummaryText(list, { status = STATUS.TODO, title = "Liste d'achat" } = {}) {
  const items = sortProducts(filterProducts(list, { status }), 'priority')
  const lines = [`*${title}* — ${items.length} produit(s)`]
  let total = 0
  for (const item of items) {
    const parts = [`• ${displayName(item)}`, item.qtyLabel]
    if (item.color) parts.push(`${item.color}${item.colorRgb ? ` (${colorCss(item)})` : ''}`)
    if (item.supplier) parts.push(`chez ${item.supplier}`)
    const price = item.lineTotal !== null ? ` — ${item.lineTotal.toFixed(2)} €` : ''
    if (item.lineTotal !== null) total += item.lineTotal
    lines.push(`${parts.join(' · ')}${price}`)
  }
  if (total) lines.push(`Total estimé : ${total.toFixed(2)} €`)
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* Factures (Bills) — tickets et factures fournisseurs                 */
/* ------------------------------------------------------------------ */

export const BILL_STATUS = { PENDING: 'pending', PAID: 'paid' }

export function normalizeBill(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const createdAt = source.createdAt || new Date().toISOString()
  const amount = toNumber(source.amount)
  return {
    ...source,
    id: String(source.id || uid('bill')),
    supplier: String(source.supplier ?? '').trim(),
    amount: amount !== null && amount > 0 ? round2(amount) : null,
    photo: typeof source.photo === 'string' ? source.photo : '',
    note: String(source.note ?? '').trim(),
    status: source.status === BILL_STATUS.PAID ? BILL_STATUS.PAID : BILL_STATUS.PENDING,
    paidAt: source.status === BILL_STATUS.PAID ? source.paidAt || createdAt : null,
    createdAt,
    updatedAt: source.updatedAt || createdAt,
  }
}

export function normalizeBillList(list) {
  if (!Array.isArray(list)) return []
  return list.filter((item) => item && typeof item === 'object').map(normalizeBill)
}

export function billView(bill) {
  const amount = toNumber(bill?.amount)
  return {
    ...bill,
    supplier: String(bill?.supplier ?? '').trim() || '—',
    amount: amount !== null && amount > 0 ? round2(amount) : null,
    hasAmount: amount !== null && amount > 0,
    isPaid: bill?.status === BILL_STATUS.PAID,
  }
}

export function sortBills(list, key = 'recent') {
  const items = [...(list || [])].map(billView)
  const comparators = {
    recent: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
    supplier: (a, b) => String(a.supplier || '').localeCompare(String(b.supplier || ''), 'fr', { sensitivity: 'base' }),
    amount: (a, b) => (b.amount ?? -1) - (a.amount ?? -1),
  }
  const compare = comparators[key] || comparators.recent
  items.sort((a, b) => (a.isPaid !== b.isPaid ? (a.isPaid ? 1 : -1) : compare(a, b)))
  return items
}

export function filterBills(list, { status = 'all', query = '' } = {}) {
  const needle = String(query ?? '').trim().toLowerCase()
  return (list || []).filter((bill) => {
    if (status === BILL_STATUS.PENDING && bill.status !== BILL_STATUS.PENDING) return false
    if (status === BILL_STATUS.PAID && bill.status !== BILL_STATUS.PAID) return false
    if (!needle) return true
    const haystack = [bill?.supplier, bill?.note].join(' ').toLowerCase()
    return needle.split(/\s+/).every((token) => haystack.includes(token))
  })
}

export function sumBills(bills) {
  let total = 0
  let paid = 0
  let pending = 0
  for (const bill of bills || []) {
    const amount = toNumber(bill?.amount)
    if (amount !== null && amount > 0) {
      total += amount
      if (bill.status === BILL_STATUS.PAID) paid += amount
      else pending += amount
    }
  }
  return { total: round2(total), paid: round2(paid), pending: round2(pending) }
}

export function knownBillSuppliers(list) {
  const values = new Set()
  for (const item of list || []) {
    const supplier = String(item.supplier || '').trim()
    if (supplier) values.add(supplier)
  }
  return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
}