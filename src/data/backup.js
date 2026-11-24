/* ------------------------------------------------------------------ */
/* Sauvegarde — export / import JSON                                   */
/* ------------------------------------------------------------------ */

import { normalizeBillList } from './bills-model.js'
import { mergeExpenses as mergeExpensesState, normalizeExpenses } from './expenses-model.js'
import { DELETED, without } from './deletions.js'
import { downloadText } from '../core/utils.js'

/* v2 : + factures · v4 : + dépenses · v6 : sans produits
   (v1 produits seuls, v3 portait l'analyse retirée en 10.3.0). */
export const BACKUP_VERSION = 6

/**
 * La sauvegarde emporte factures ET dépenses : c'est le seul endroit où tout
 * sort du navigateur en un fichier. Le partage (GitHub ou lien privé) les
 * porte aussi, mais une sauvegarde reste le filet en cas de perte d'appareil.
 */
export function buildBackup(bills, expenses = null) {
  return {
    app: 'mes-achats',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    bills: bills || [],
    expenses: expenses && typeof expenses === 'object' && !Array.isArray(expenses)
      ? normalizeExpenses(expenses)
      : null,
  }
}

export function toJSON(bills, expenses = null) {
  return JSON.stringify(buildBackup(bills, expenses), null, 2)
}

export function backupFilename(extension, prefix = 'mes-achats') {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${prefix}-${stamp}.${extension}`
}

/**
 * Analyse un fichier de sauvegarde JSON. Les anciens formats sont refusés
 * proprement : un tableau nu (v1, produits seuls) n'a plus rien à importer.
 * @returns {{ok:boolean, bills:Array, expenses:object|null, message?:string}}
 */
export function parseBackup(text) {
  let parsed
  try {
    parsed = JSON.parse(String(text || ''))
  } catch {
    return { ok: false, bills: [], expenses: null, message: 'Fichier JSON illisible.' }
  }
  if (Array.isArray(parsed) || !parsed || typeof parsed !== 'object') {
    return { ok: false, bills: [], expenses: null, message: 'Ce fichier ne contient pas de données à importer.' }
  }
  const bills = normalizeBillList(Array.isArray(parsed.bills) ? parsed.bills : [])
  const expenses =
    parsed.expenses && typeof parsed.expenses === 'object' && !Array.isArray(parsed.expenses)
      ? normalizeExpenses(parsed.expenses)
      : null
  const hasExpenses = Boolean(
    expenses && (expenses.expenses.length || expenses.investments.length || expenses.revenues.length),
  )
  if (!bills.length && !hasExpenses) {
    return { ok: false, bills: [], expenses: null, message: 'Aucune facture ni dépense dans ce fichier.' }
  }
  return { ok: true, bills, expenses }
}

/** Même fusion pour les factures : le conflit se joue aussi par `id`. */
export function mergeBills(current, incoming, deleted = null) {
  return mergeById(current, incoming, DELETED.bills, deleted)
}

/** Les dépenses suivent la même règle « incoming wins ». */
export function mergeExpenses(current, incoming, deleted = null) {
  return mergeExpensesState(current, incoming, deleted)
}

/**
 * Fusion par `id`, commune aux factures et aux dépenses.
 *
 * C'est la règle qui évite qu'une publication concurrente n'efface une
 * modification : deux appareils convergent vers l'union de leurs changes,
 * et le perdant garde le sien.
 *
 * L'union ne suffit pas pour une SUPPRESSION : un `id` absent de l'un des
 * deux côtés revient par l'autre. Les pierres tombales (`deleted`) écartent
 * donc, après fusion, tout élément supprimé depuis sa dernière modification.
 * On ne réécrit plus `updatedAt` au passage : cette date est celle de la
 * dernière vraie modification, et la falsifier ferait revivre un élément
 * supprimé (sa date deviendrait plus récente que la pierre tombale).
 */
function mergeById(current, incoming, collection, deleted = null) {
  const map = new Map((current || []).map((item) => [item.id, item]))
  let added = 0
  let updated = 0
  for (const item of incoming || []) {
    if (!item || typeof item !== 'object') continue
    const existing = map.get(item.id)
    if (existing) {
      map.set(item.id, { ...existing, ...item })
      updated += 1
    } else {
      map.set(item.id, item)
      added += 1
    }
  }
  const list = deleted ? without(deleted, collection, [...map.values()]) : [...map.values()]
  return { list, added, updated, removed: map.size - list.length }
}

/**
 * Sauvegarde JSON : factures ET dépenses.
 *
 * Le second argument doit être transmis — un `toJSON` à un paramètre
 * produisait un fichier parfaitement valide, simplement sans les dépenses,
 * et personne ne s'en apercevait avant d'en avoir besoin.
 */
export function exportJSON(bills, expenses = null) {
  downloadText(backupFilename('json'), toJSON(bills, expenses), 'application/json')
}
