/* ------------------------------------------------------------------ */
/* Factures (Bills) — tickets et factures fournisseurs                 */
/*                                                                     */
/* Hors de la liste produits : une facture a son propre cycle          */
/* (en attente → payée) et ne voyage que par le lien privé Cloudflare. */
/* ------------------------------------------------------------------ */

import { round2, toNumber, uid } from '../core/utils.js'

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
