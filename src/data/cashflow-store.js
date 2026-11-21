/* ------------------------------------------------------------------ */
/* CashFlow Store — état, persistance, synchronisation                    */
/* ------------------------------------------------------------------ */

import { storage } from '../core/storage.js'
import { toast } from '../core/feedback.js'
import { round2, toNumber } from '../core/utils.js'
import {
  emptyCashFlow,
  normalizeCashFlow,
  normalizePerson,
  normalizeTransfer,
} from './cashflow-model.js'

const KEY = 'purchase-gros-cashflow-v1'

let state = loadLocal()

/* Load from local storage */
function loadLocal() {
  const raw = storage.get(KEY, null)
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeCashFlow(raw)
  }
  return emptyCashFlow()
}

/* Persist to local storage */
function persist() {
  try {
    storage.set(KEY, state)
  } catch (error) {
    console.error('Failed to persist cashflow:', error)
  }
}

/* Subscriptions */
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
      console.error('Error in cashflow listener:', error)
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public API - State Access                                          */
/* ------------------------------------------------------------------ */

export function getCashFlow() {
  return { ...state }
}

export function getSnapshot() {
  return {
    persons: state.persons.map(p => ({ ...p })),
    transfers: state.transfers.map(t => ({ ...t })),
    settings: { ...state.settings },
  }
}

/* ------------------------------------------------------------------ */
/* Persons Management                                                 */
/* ------------------------------------------------------------------ */

function findPerson(id) {
  return state.persons.find(p => p.id === id) || null
}

export function addPerson(input = {}) {
  const person = normalizePerson({ ...input, id: input.id || `person_${Date.now()}` })
  state = {
    ...state,
    persons: [...state.persons, person],
  }
  persist()
  emit()
  return person
}

export function updatePerson(id, changes = {}) {
  const current = findPerson(id)
  if (!current) return null
  const next = normalizePerson({ ...current, ...changes, id: current.id })
  state = {
    ...state,
    persons: state.persons.map(p => (p.id === id ? next : p)),
  }
  persist()
  emit()
  return next
}

export function deletePerson(id) {
  const index = state.persons.findIndex(p => p.id === id)
  if (index < 0) return null
  
  // Supprimer les transferts liés à cette personne
  state = {
    ...state,
    persons: state.persons.filter(p => p.id !== id),
    transfers: state.transfers.filter(
      t => t.from !== id && t.to !== id
    ),
  }
  persist()
  emit()
  return { person: state.persons[index], index }
}

/* ------------------------------------------------------------------ */
/* Transfers Management                                               */
/* ------------------------------------------------------------------ */

function findTransfer(id) {
  return state.transfers.find(t => t.id === id) || null
}

export function addTransfer(input = {}) {
  const transfer = normalizeTransfer({
    ...input,
    id: input.id || `transfer_${Date.now()}`,
  })
  
  // Mettre à jour les soldes des personnes
  const fromPerson = findPerson(transfer.from)
  const toPerson = findPerson(transfer.to)
  
  if (fromPerson) {
    fromPerson.balance = round2((fromPerson.balance || 0) - (transfer.amount || 0))
  }
  if (toPerson) {
    toPerson.balance = round2((toPerson.balance || 0) + (transfer.amount || 0))
  }
  
  state = {
    ...state,
    persons: state.persons.map(p => {
      const updated = findPerson(p.id)
      return updated || p
    }),
    transfers: [...state.transfers, transfer],
  }
  
  persist()
  emit()
  toast(`Transfert de ${transfer.amount} ${state.settings.currency} effectué`, { type: 'ok' })
  return transfer
}

export function updateTransfer(id, changes = {}) {
  const current = findTransfer(id)
  if (!current) return null
  
  // Pour les changements de montant, il faut recalculer les soldes
  const oldAmount = current.amount || 0
  const newAmount = toNumber(changes.amount) || oldAmount
  const amountDiff = newAmount - oldAmount
  
  const next = normalizeTransfer({ ...current, ...changes, id: current.id })
  
  // Mettre à jour les soldes si le montant change
  if (amountDiff !== 0) {
    if (current.from) {
      const fromPerson = findPerson(current.from)
      if (fromPerson) {
        fromPerson.balance = round2((fromPerson.balance || 0) + amountDiff)
      }
    }
    if (current.to) {
      const toPerson = findPerson(current.to)
      if (toPerson) {
        toPerson.balance = round2((toPerson.balance || 0) - amountDiff)
      }
    }
  }
  
  state = {
    ...state,
    persons: state.persons.map(p => {
      const updated = findPerson(p.id)
      return updated || p
    }),
    transfers: state.transfers.map(t => (t.id === id ? next : t)),
  }
  
  persist()
  emit()
  return next
}

export function deleteTransfer(id) {
  const index = state.transfers.findIndex(t => t.id === id)
  if (index < 0) return null
  
  const transfer = state.transfers[index]
  
  // Restaurer les soldes des personnes
  if (transfer.from) {
    const fromPerson = findPerson(transfer.from)
    if (fromPerson) {
      fromPerson.balance = round2((fromPerson.balance || 0) + (transfer.amount || 0))
    }
  }
  if (transfer.to) {
    const toPerson = findPerson(transfer.to)
    if (toPerson) {
      toPerson.balance = round2((toPerson.balance || 0) - (transfer.amount || 0))
    }
  }
  
  state = {
    ...state,
    transfers: state.transfers.filter(t => t.id !== id),
    persons: state.persons.map(p => {
      const updated = findPerson(p.id)
      return updated || p
    }),
  }
  
  persist()
  emit()
  return { transfer: state.transfers[index] || transfer, index }
}

/* ------------------------------------------------------------------ */
/* Settings Management                                                */
/* ------------------------------------------------------------------ */

export function setSettings(patch = {}) {
  state = {
    ...state,
    settings: { ...state.settings, ...patch },
  }
  persist()
  emit()
  return state.settings
}

/* ------------------------------------------------------------------ */
/* Import/Export                                                      */
/* ------------------------------------------------------------------ */

export function importCashFlow(data, { mode = 'merge' } = {}) {
  if (!data || typeof data !== 'object') return { added: 0, updated: 0 }
  
  if (mode === 'replace') {
    state = normalizeCashFlow(data)
    persist()
    emit()
    return {
      added: state.persons.length + state.transfers.length,
      updated: 0,
    }
  }
  
  // Merge mode - simple union for now
  const merged = normalizeCashFlow(data)
  const addedPersons = merged.persons.filter(
    p => !state.persons.find(existing => existing.id === p.id)
  ).length
  const addedTransfers = merged.transfers.filter(
    t => !state.transfers.find(existing => existing.id === t.id)
  ).length
  
  state = {
    persons: [...state.persons, ...merged.persons],
    transfers: [...state.transfers, ...merged.transfers],
    settings: merged.settings,
  }
  
  persist()
  emit()
  return { added: addedPersons + addedTransfers, updated: 0 }
}

/* ------------------------------------------------------------------ */
/* Seeding - Create default persons                                  */
/* ------------------------------------------------------------------ */

export function seedDefaultPersons() {
  if (state.persons.length > 0) return state.persons
  
  const defaultPersons = ['Moh', 'Salim', 'Hakima'].map(name => ({
    id: `person_${name.toLowerCase()}`,
    name,
    balance: 0,
  }))
  
  state = {
    ...state,
    persons: defaultPersons,
  }
  persist()
  emit()
  return state.persons
}