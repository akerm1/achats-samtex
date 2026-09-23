/* ------------------------------------------------------------------ */
/* Sauvegarde — export / import JSON et CSV                            */
/* ------------------------------------------------------------------ */

import { normalizeList } from './model.js'
import { downloadText } from '../core/utils.js'

export const BACKUP_VERSION = 2

export function buildBackup(products) {
  return {
    app: 'mes-achats',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    products: products || [],
  }
}

export function toJSON(products) {
  return JSON.stringify(buildBackup(products), null, 2)
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
 * @returns {{ok:boolean, products:Array, message?:string}}
 */
export function parseBackup(text) {
  let parsed
  try {
    parsed = JSON.parse(String(text || ''))
  } catch {
    return { ok: false, products: [], message: 'Fichier JSON illisible.' }
  }
  const raw = Array.isArray(parsed) ? parsed : parsed?.products
  if (!Array.isArray(raw)) {
    return { ok: false, products: [], message: 'Ce fichier ne contient pas de liste de produits.' }
  }
  const products = normalizeList(raw).filter(
    (product) => product.name || product.photo || product.colorRgb || product.note,
  )
  if (!products.length) return { ok: false, products: [], message: 'Aucun produit valide dans ce fichier.' }
  return { ok: true, products }
}

/**
 * Fusionne une liste importée avec la liste courante (les identifiants
 * existants sont mis à jour, les nouveaux sont ajoutés).
 */
export function mergeProducts(current, incoming) {
  const map = new Map((current || []).map((product) => [product.id, product]))
  let added = 0
  let updated = 0
  for (const product of incoming || []) {
    const existing = map.get(product.id)
    if (existing) {
      map.set(product.id, { ...existing, ...product, updatedAt: new Date().toISOString() })
      updated += 1
    } else {
      map.set(product.id, product)
      added += 1
    }
  }
  return { list: [...map.values()], added, updated }
}

export function exportJSON(products) {
  downloadText(backupFilename('json'), toJSON(products), 'application/json')
}

export function exportCSV(products) {
  downloadText(backupFilename('csv'), toCSV(products), 'text/csv')
}