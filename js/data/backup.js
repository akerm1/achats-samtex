/* ------------------------------------------------------------------ */
/* Sauvegarde — export / import JSON et CSV                            */
/* ------------------------------------------------------------------ */

import { normalizeBillList, normalizeList } from './model.js'
import { mergeAnalysis as mergeAnalysisState, normalizeAnalysis } from './analysis.js'
import { downloadText } from '../core/utils.js'

/* v1 : produits seuls · v2 : + factures · v3 : + analyse (l'ancien format
   reste lisible : `analysis` absent → null, jamais une perte d'import). */
export const BACKUP_VERSION = 3

/**
 * La sauvegarde emporte factures ET analyse avec les produits : c'est le
 * seul endroit où les collections sortent du navigateur (GitHub ne porte
 * ni l'une ni l'autre). Le CSV reste produits seul.
 */
export function buildBackup(products, bills, analysis = null) {
  return {
    app: 'mes-achats',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    products: products || [],
    bills: bills || [],
    analysis: analysis && typeof analysis === 'object' && !Array.isArray(analysis)
      ? normalizeAnalysis(analysis)
      : null,
  }
}

export function toJSON(products, bills, analysis = null) {
  return JSON.stringify(buildBackup(products, bills, analysis), null, 2)
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
  if (!products.length) return { ok: false, products: [], bills: [], analysis: null, message: 'Aucun produit valide dans ce fichier.' }
  return { ok: true, products, bills, analysis }
}

/**
 * Fusionne une liste importée avec la liste courante (les identifiants
 * existants sont mis à jour, les nouveaux sont ajoutés).
 */
export function mergeProducts(current, incoming) {
  return mergeById(current, incoming)
}

/** Même fusion pour les factures : le conflit se joue aussi par `id`. */
export function mergeBills(current, incoming) {
  return mergeById(current, incoming)
}

/** L'analyse suit la même règle « incoming wins » (v3 + conflit 409). */
export function mergeAnalysis(current, incoming) {
  return mergeAnalysisState(current, incoming)
}

/**
 * Fusion par `id`, commune aux produits et aux factures.
 *
 * C'est la règle qui évite qu'une publication concurrente n'efface une
 * modification : deux appareils convergent vers l'union de leurs changes,
 * et le perdant garde le sien.
 */
function mergeById(current, incoming) {
  const map = new Map((current || []).map((item) => [item.id, item]))
  let added = 0
  let updated = 0
  for (const item of incoming || []) {
    if (!item || typeof item !== 'object') continue
    const existing = map.get(item.id)
    if (existing) {
      map.set(item.id, { ...existing, ...item, updatedAt: new Date().toISOString() })
      updated += 1
    } else {
      map.set(item.id, item)
      added += 1
    }
  }
  return { list: [...map.values()], added, updated }
}

export function exportJSON(products, bills, analysis = null) {
  downloadText(backupFilename('json'), toJSON(products, bills, analysis), 'application/json')
}

export function exportCSV(products) {
  downloadText(backupFilename('csv'), toCSV(products), 'text/csv')
}