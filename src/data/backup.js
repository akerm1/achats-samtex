/* ------------------------------------------------------------------ */
/* Sauvegarde — export / import JSON et CSV                            */
/* ------------------------------------------------------------------ */

import { normalizeList } from './products-model.js'
import { normalizeBillList } from './bills-model.js'
import { mergeAnalysis as mergeAnalysisState, normalizeAnalysis } from './analysis-model.js'
import { mergeExpenses as mergeExpensesState, normalizeExpenses } from './expenses-model.js'
import { DELETED, without } from './deletions.js'
import { downloadText } from '../core/utils.js'

/* v1 : produits seuls · v2 : + factures · v3 : + analyse · v4 : + dépenses */
export const BACKUP_VERSION = 4

/**
 * La sauvegarde emporte factures, analyse ET dépenses avec les produits : c'est le
 * seul endroit où tout sort du navigateur en un fichier. Le partage (GitHub ou
 * lien privé) les porte aussi, mais une sauvegarde reste le filet en cas de perte
 * d'appareil ou de compte. Le CSV reste produits seul.
 */
export function buildBackup(products, bills, analysis = null, expenses = null) {
  return {
    app: 'mes-achats',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    products: products || [],
    bills: bills || [],
    analysis: analysis && typeof analysis === 'object' && !Array.isArray(analysis)
      ? normalizeAnalysis(analysis)
      : null,
    expenses: expenses && typeof expenses === 'object' && !Array.isArray(expenses)
      ? normalizeExpenses(expenses)
      : null,
  }
}

export function toJSON(products, bills, analysis = null, expenses = null) {
  return JSON.stringify(buildBackup(products, bills, analysis, expenses), null, 2)
}

export function backupFilename(extension, prefix = 'mes-achats') {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${prefix}-${stamp}.${extension}`
}

const CSV_COLUMNS = [
  ['id', 'id'],
  ['name', 'nom'],
  ['type', 'categorie'],
  ['color', 'couleur'],
  ['supplier', 'fournisseur'],
  ['qty', 'quantite'],
  ['unit', 'unite'],
  ['price', 'prix_unitaire'],
  ['priority', 'priorite'],
  ['status', 'statut'],
  ['boughtAt', 'achete_le'],
  ['note', 'details'],
  ['createdAt', 'ajoute_le'],
]

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export function toCSV(products) {
  const lines = [CSV_COLUMNS.map(([, header]) => header).join(';')]
  for (const product of products || []) {
    lines.push(
      CSV_COLUMNS.map(([field]) => {
        const value = product[field]
        return csvCell(field === 'price' ? (value === null || value === undefined ? '' : value) : value)
      }).join(';'),
    )
  }
  /* BOM pour qu'Excel reconnaisse l'UTF-8. */
  return `\uFEFF${lines.join('\r\n')}`
}

/**
 * Analyse un fichier de sauvegarde JSON (accepte les anciens formats :
 * tableau nu v1, objet sans factures v2, objet sans analyse v3).
 * @returns {{ok:boolean, products:Array, bills:Array, analysis:object|null, message?:string}}
 */
export function parseBackup(text) {
  let parsed
  try {
    parsed = JSON.parse(String(text || ''))
  } catch {
    return { ok: false, products: [], bills: [], analysis: null, message: 'Fichier JSON illisible.' }
  }
  const raw = Array.isArray(parsed) ? parsed : parsed?.products
  if (!Array.isArray(raw)) {
    return { ok: false, products: [], bills: [], analysis: null, message: 'Ce fichier ne contient pas de liste de produits.' }
  }
  const products = normalizeList(raw).filter(
    (product) => product.name || product.photo || product.colorRgb || product.note,
  )
  const bills = normalizeBillList(Array.isArray(parsed?.bills) ? parsed.bills : [])
  const analysis =
    parsed?.analysis && typeof parsed.analysis === 'object' && !Array.isArray(parsed.analysis)
      ? normalizeAnalysis(parsed.analysis)
      : null
  const expenses =
    parsed?.expenses && typeof parsed.expenses === 'object' && !Array.isArray(parsed.expenses)
      ? normalizeExpenses(parsed.expenses)
      : null
  if (!products.length) return { ok: false, products: [], bills: [], analysis: null, expenses: null, message: 'Aucun produit valide dans ce fichier.' }
  return { ok: true, products, bills, analysis, expenses }
}

/**
 * Fusionne une liste importée avec la liste courante (les identifiants
 * existants sont mis à jour, les nouveaux sont ajoutés).
 * @param {object|null} deleted registre des pierres tombales (`deletions.snapshot()`)
 */
export function mergeProducts(current, incoming, deleted = null) {
  return mergeById(current, incoming, DELETED.products, deleted)
}

/** Même fusion pour les factures : le conflit se joue aussi par `id`. */
export function mergeBills(current, incoming, deleted = null) {
  return mergeById(current, incoming, DELETED.bills, deleted)
}

/** L'analyse suit la même règle « incoming wins » (v3 + conflit 409). */
export function mergeAnalysis(current, incoming, deleted = null) {
  return mergeAnalysisState(current, incoming, deleted)
}

/** Les dépenses suivent la même règle « incoming wins ». */
export function mergeExpenses(current, incoming, deleted = null) {
  return mergeExpensesState(current, incoming, deleted)
}

/**
 * Fusion par `id`, commune aux produits et aux factures.
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
 * Sauvegarde JSON : produits, factures, analyse ET dépenses.
 *
 * Le quatrième argument doit être transmis — un `toJSON` à trois paramètres
 * produisait un fichier parfaitement valide, simplement sans les dépenses,
 * et personne ne s'en apercevait avant d'en avoir besoin.
 */
export function exportJSON(products, bills, analysis = null, expenses = null) {
  downloadText(backupFilename('json'), toJSON(products, bills, analysis, expenses), 'application/json')
}

export function exportCSV(products) {
  downloadText(backupFilename('csv'), toCSV(products), 'text/csv')
}