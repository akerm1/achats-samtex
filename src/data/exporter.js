/* ------------------------------------------------------------------ */
/* Export — le fichier que l'on donne à Excel                          */
/*                                                                     */
/* Deux formats, une seule source de vérité (`export-tables.js`) :      */
/*   • .xlsx  classeur à plusieurs feuilles, nombres typés, dates ISO ; */
/*   • .csv   une section par table, séparateur « ; » et virgule        */
/*            décimale, comme l'attend un Excel en français.            */
/*                                                                     */
/* Le même code sert au téléchargement à la demande et à l'écriture     */
/* automatique dans un fichier choisi par l'utilisateur.               */
/* ------------------------------------------------------------------ */

import { buildXlsx } from './xlsx.js'
import { buildSheets, scopeShort } from './export-tables.js'
import { getProducts, getBills } from './store.js'
import { getExpenses } from './expenses-store.js'
import { downloadBlob } from '../core/utils.js'

export const EXPORT_FORMATS = [
  { value: 'xlsx', label: 'Excel (.xlsx)', extension: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { value: 'csv', label: 'CSV (Excel, Numbers)', extension: 'csv', mime: 'text/csv' },
]

export const formatOf = (value) => EXPORT_FORMATS.find((item) => item.value === value) || EXPORT_FORMATS[0]

/** Photo des quatre collections au moment de l'export. */
export function exportSnapshot() {
  return {
    products: getProducts(),
    bills: getBills(),
    expenses: getExpenses(),
  }
}

/* --- CSV ---------------------------------------------------------- */

const csvText = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
/* Excel en français attend la virgule décimale et accepte le point-virgule
   comme séparateur de colonnes. Le classeur .xlsx, lui, ne dépend d'aucune
   convention locale : c'est le format à préférer. */
const csvNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value).replace('.', ',') : '')

function csvCell(column, row) {
  const value = row[column.key]
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') return csvNumber(value)
  return csvText(value)
}

/**
 * Une section par table : un titre, la ligne d'en-têtes, les lignes, puis
 * une ligne vide. Un tableur y voit plusieurs blocs, ce qui reste lisible
 * même sans feuilles multiples.
 */
export function toCsvText(sheets) {
  const blocks = sheets.map((sheet) => {
    const header = sheet.columns.map((column) => csvText(column.label)).join(';')
    const rows = sheet.rows.map((row) => sheet.columns.map((column) => csvCell(column, row)).join(';'))
    return [csvText(sheet.name), header, ...rows].join('\r\n')
  })
  /* BOM : sans lui, Excel ouvre le fichier en Windows-1252 et casse les
     accents des noms de produits. */
  return `\uFEFF${blocks.join('\r\n\r\n')}`
}

/* --- Fichier ------------------------------------------------------ */

export function exportFilename(scope, format, at = new Date()) {
  const stamp = at.toISOString().slice(0, 10)
  return `mes-achats-${scopeShort(scope)}-${stamp}.${formatOf(format).extension}`
}

/**
 * Construit le fichier en mémoire.
 * @returns {{filename: string, blob: Blob}}
 */
export function buildExportFile(scope, format, at = new Date(), snapshot = exportSnapshot()) {
  const sheets = buildSheets(snapshot, scope)
  const filename = exportFilename(scope, format, at)

  if (format === 'csv') {
    const text = toCsvText(sheets)
    return { filename, blob: new Blob([text], { type: 'text/csv;charset=utf-8' }) }
  }

  const bytes = buildXlsx(sheets)
  return {
    filename,
    blob: new Blob([bytes], { type: formatOf('xlsx').mime }),
  }
}

/** Téléchargement classique (demande un geste de l'utilisateur). */
export function downloadExport(scope, format, at = new Date()) {
  const { filename, blob } = buildExportFile(scope, format, at)
  downloadBlob(filename, blob)
  return filename
}

/** Écriture silencieuse dans un fichier déjà autorisé par l'utilisateur. */
export async function writeExportToHandle(handle, scope, format, at = new Date()) {
  const { filename, blob } = buildExportFile(scope, format, at)
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
  } finally {
    await writable.close()
  }
  return { filename, name: handle.name }
}
