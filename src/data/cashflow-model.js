/* ------------------------------------------------------------------ */
/* CashFlow — modèle (persons, transfers, cash calculations)             */
/* ------------------------------------------------------------------ */

import { round2, toNumber, uid } from '../core/utils.js'
import { DELETED, without } from './deletions.js'

/* ------------------------------------------------------------------ */
/* Persons (partenaires,Collaborateurs)                                */
/* ------------------------------------------------------------------ */

export function normalizePerson(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const amount = toNumber(source.balance)
  return {
    ...source,
    id: String(source.id || uid('person')),
    name: String(source.name ?? '').trim() || 'Nouvelle Personne',
    balance: amount !== null ? round2(amount) : 0,
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString(),
  }
}

export const normalizePersonList = (list) => {
  if (!Array.isArray(list)) return []
  return list.filter((item) => item && typeof item === 'object').map(normalizePerson)
}

/* ------------------------------------------------------------------ */
/* Transfers                                                            */
/* ------------------------------------------------------------------ */

export function normalizeTransfer(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const amount = toNumber(source.amount)
  return {
    ...source,
    id: String(source.id || uid('transfer')),
    from: String(source.from ?? '').trim(),
    to: String(source.to ?? '').trim(),
    amount: amount !== null ? round2(amount) : 0,
    date: String(source.date ?? '').trim() || new Date().toISOString().slice(0, 10),
    note: String(source.note ?? '').trim(),
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString(),
  }
}

export const normalizeTransferList = (list) => {
  if (!Array.isArray(list)) return []
  return list.filter((item) => item && typeof item === 'object').map(normalizeTransfer)
}

/* ------------------------------------------------------------------ */
/* Cash Flow Calculations                                               */
/* ------------------------------------------------------------------ */

/**
 * Calcule la trésorerie disponible: (recettes + investissements) - (dépenses + factures)
 */
export function calculateAvailableCash(revenues, bills, expenses, investments) {
  const totalRevenues = (revenues || []).reduce((sum, r) => sum + (r.amount || 0), 0)
  
  const totalBills = (bills || [])
    .filter(b => b.amount && b.amount > 0)
    .reduce((sum, b) => sum + b.amount, 0)
  
  const totalExpenses = (expenses || [])
    .filter(e => e.amount !== null)
    .reduce((sum, e) => sum + e.amount, 0)
  
  const totalInvestments = (investments || []).reduce((sum, i) => sum + (i.amount || 0), 0)
  
  return round2(totalRevenues + totalInvestments - totalBills - totalExpenses)
}

/**
 * Calcule le solde de chaque personne après les transferts
 * Balance = argent reçu - argent envoyé
 */
export function calculatePersonBalances(persons, transfers) {
  const balanceMap = new Map()
  
  // Initialiser les soldes à zéro
  for (const person of persons) {
    balanceMap.set(person.id, person.balance || 0)
  }
  
  // Appliquer les transferts
  for (const transfer of transfers || []) {
    const from = transfer.from
    const to = transfer.to
    const amount = transfer.amount || 0
    
    if (balanceMap.has(from)) {
      balanceMap.set(from, (balanceMap.get(from) || 0) - amount)
    }
    if (balanceMap.has(to)) {
      balanceMap.set(to, (balanceMap.get(to) || 0) + amount)
    }
  }
  
  // Retourner les soldes calculés
  const result = []
  for (const person of persons) {
    result.push({
      ...person,
      currentBalance: balanceMap.get(person.id) || 0,
    })
  }
  return result
}

/**
 * Solde total des personnes (somme des balances courantes)
 */
export function totalPersonBalances(personsWithBalances) {
  return (personsWithBalances || []).reduce((sum, p) => sum + (p.currentBalance || 0), 0)
}

/**
 * État vide par défaut
 */
export function emptyCashFlow() {
  return {
    persons: [],
    transfers: [],
    settings: {
      currency: 'DZD',
    },
  }
}

/**
 * Normalise l'état complet du cashflow
 */
export function normalizeCashFlow(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    persons: normalizePersonList(source.persons),
    transfers: normalizeTransferList(source.transfers),
    settings: {
      ...emptyCashFlow().settings,
      ...(source.settings || {}),
    },
  }
}

/**
 * Fusion de deux états de caisse, par `id` : le distant gagne sur un même
 * `id`, le local unique est conservé, et les pierres tombales écartent ce
 * qu'un autre appareil a supprimé.
 */
export function mergeCashFlow(current, incoming, deletedMap = null) {
  const local = normalizeCashFlow(current || {})
  const remote = normalizeCashFlow(incoming || {})
  const union = (a, b) => {
    const byId = new Map(a.map((item) => [item.id, item]))
    for (const item of b) byId.set(item.id, item)
    return [...byId.values()]
  }
  return {
    persons: without(deletedMap, DELETED.cashPersons, union(local.persons, remote.persons)),
    transfers: without(deletedMap, DELETED.cashTransfers, union(local.transfers, remote.transfers)),
    settings: { ...local.settings, ...remote.settings },
  }
}