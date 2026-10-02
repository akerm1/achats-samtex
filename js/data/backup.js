/* ------------------------------------------------------------------ */
/* Sauvegarde — export / import JSON et CSV                            */
/* ------------------------------------------------------------------ */

import { normalizeBillList, normalizeList } from './model.js'
import { downloadText } from '../core/utils.js'

export const BACKUP_VERSION = 2

/**
 * La sauvegarde emporte les factures avec les produits : c'est le seul
 * endroit où les deux collections sortent du navigateur. Le CSV reste
 * produits seul — une image n'a pas sa place dans une feuille de calcul.
 */
export function buildBackup(products, bills) {
  return {
    app: 'mes-achats',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    products: products || [],
    bills: bills || [],
  }
}

export function toJSON(products, bills) {
  return JSON.stringify(buildBackup(products, bills), null, 2)
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
 * Analyse un fichier de sauvegarde JSON (accepte l'ancien format : tableau nu).
 * Les fichiers sans `bills` restent valides : les produits, eux, suffisent.
 * @returns {{ok:boolean, products:Array, bills:Array, message?:string}}
 */
export function parseBackup(text) {
  let parsed
  try {
    parsed = JSON.parse(String(text || ''))
  } catch {
    return { ok: false, products: [], bills: [], message: 'Fichier JSON illisible.' }
  }
  const raw = Array.isArray(parsed) ? parsed : parsed?.products
  if (!Array.isArray(raw)) {
    return { ok: false, products: [], bills: [], message: 'Ce fichier ne contient pas de liste de produits.' }
  }
  const products = normalizeList(raw).filter(
    (product) => product.name || product.photo || product.colorRgb || product.note,
  )
  const bills = normalizeBillList(Array.isArray(parsed?.bills) ? parsed.bills : [])
  if (!products.length) return { ok: false, products: [], bills: [], message: 'Aucun produit valide dans ce fichier.' }
  return { ok: true, products, bills }
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

export function exportJSON(products, bills) {
  downloadText(backupFilename('json'), toJSON(products, bills), 'application/json')
}

export function exportCSV(products) {
  downloadText(backupFilename('csv'), toCSV(products), 'text/csv')
}