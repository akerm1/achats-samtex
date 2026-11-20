/* ------------------------------------------------------------------ */
/* Sauvegarde — export / import JSON et CSV                            */
/* ------------------------------------------------------------------ */

import { normalizeList } from './products-model.js'
import { normalizeBillList } from './bills-model.js'
import { mergeExpenses as mergeExpensesState, normalizeExpenses } from './expenses-model.js'
import { DELETED, without } from './deletions.js'
import { downloadText } from '../core/utils.js'

/* v1 : produits seuls · v2 : + factures · v4 : + dépenses
   (v3 portait l'analyse, retirée de l'application en 10.3.0). */
export const BACKUP_VERSION = 5

/**
 * La sauvegarde emporte factures ET dépenses avec les produits : c'est le
 * seul endroit où tout sort du navigateur en un fichier. Le partage (GitHub ou
 * lien privé) les porte aussi, mais une sauvegarde reste le filet en cas de perte
 * d'appareil ou de compte. Le CSV reste produits seul.
 */
export function buildBackup(products, bills, expenses = null) {
  return {
    app: 'mes-achats',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    products: products || [],
    bills: bills || [],
    expenses: expenses && typeof expenses === 'object' && !Array.isArray(expenses)
      ? normalizeExpenses(expenses)
      : null,
  }
}

export function toJSON(products, bills, expenses = null) {
  return JSON.stringify(buildBackup(products, bills, expenses), null, 2)
}

export function backupFilename(extension, prefix = 'mes-achats') {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${prefix}-${stamp}.${extension}`
}

/* Colonnes CSV "tout-en-un" : produits + factures + dépenses.
   Chaque ligne affiche toutes les dates (createdAt, updatedAt, date de la ligne)
   et toutes les autres champs, triés par collection pour une lecture claire. */
const CSV_COLUMNS = {
  /* Produits */
  products: [
    ['id', 'id'],
    ['name', 'nom'],
    ['type', 'type'],
    ['color', 'couleur'],
    ['supplier', 'fournisseur'],
    ['qty', 'qtée'],
    ['unit', 'unite'],
    ['price', 'prix_unitaire'],
    ['priority', 'priorité'],
    ['status', 'statut'],
    ['boughtAt', 'acheté_le'],
    ['note', 'details'],
    ['createdAt', 'ajouté_le'],
    ['updatedAt', 'modifié_le'],
  ],
  /* Factures */
  bills: [
    ['id', 'id'],
    ['supplier', 'fournisseur'],
    ['total', 'montant_total'],
    ['payedAt', 'payé_le'],
    ['createdAt', 'créé_le'],
    ['updatedAt', 'modifié_le'],
    ['note', 'details'],
  ],
  /* Dépenses */
  expenses: {
    header: [
      ['id', 'id'],
      ['expenseId', 'id_dépense'],
      ['categoryId', 'categorie_id'],
      ['amount', 'montant'],
      ['date', 'date'],
      ['note', 'details'],
      ['createdAt', 'ajouté_le'],
      ['updatedAt', 'modifié_le'],
    ],
    investmentHeader: [
      ['id', 'id'],
      ['name', 'nom_inv'],
      ['amount', 'montant'],
      ['remaining', 'restant'],
      ['date', 'date'],
      ['note', 'details'],
      ['createdAt', 'ajouté_le'],
      ['updatedAt', 'modifié_le'],
    ],
    revenueHeader: [
      ['id', 'id'],
      ['amount', 'montant_recette'],
      ['date', 'date'],
      ['note', 'details'],
      ['createdAt', 'ajouté_le'],
      ['updatedAt', 'modifié_le'],
    ],
  },
}

/* Rend la bonne ligne d'en-tête selon le type de donnée. */
function csvHeaderFor(type, subtype) {
  const base = CSV_COLUMNS[type]
  if (!base) return null
  if (subtype && CSV_COLUMNS[type][subtype]) return CSV_COLUMNS[type][subtype]
  if (Array.isArray(base)) return base
  /* C'est un objet avec des clés nommées : on renvoie le premier jeu trouvé. */
  for (const key of Object.keys(base)) {
    if (Array.isArray(base[key])) return base[key]
  }
  return null
}

/* Extrait les valeurs d'un produit/objet selon les colonnes CSV. */
function csvRowFor(item, columns) {
  return columns.map(([field, label]) => {
    const value = item?.[field]
    if (value === null || value === undefined) return ''
    if (field === 'price' || field === 'amount' || field === 'total' || field === 'remaining') {
      const num = Number(value)
      return num !== null && num !== undefined ? num.toFixed(2) : ''
    }
    if (field.match(/At|date|Date$/i)) {
      const date = new Date(value)
      return isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('fr-FR')
    }
    return String(value)
  })
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

/* Génère une ligne CSV à partir d'un objet produit/facture/dépense.
   Utilise les colonnes définies dans CSV_COLUMNS selon le type d'élément. */
function csvItemRow(item, type, subtype) {
  const columns = csvHeaderFor(type, subtype)
  if (!columns) return null
  return csvRowFor(item, columns).join(';')
}

/* Génère le bloc d'en-tête CSV selon le type de données. */
function csvBlockHeader(type, subtype) {
  const columns = csvHeaderFor(type, subtype)
  if (!columns) return null
  return columns.map(([, header]) => header).join(';')
}

/* Exporte toutes les collections (produits, factures, dépenses) en CSV. */
export function toCSV(products, bills, expenses = null) {
  const lines = []
  /* En-têtes globaux */
  let headerWritten = false

  /* --- Produits --- */
  if (products && Array.isArray(products)) {
    const h = csvBlockHeader('products')
    if (h) {
      lines.push(h)
      headerWritten = true
    }
    for (const p of products) {
      const row = csvItemRow(p, 'products')
      if (row) lines.push(row)
    }
  }

  /* --- Factures --- */
  if (bills && Array.isArray(bills)) {
    const h = csvBlockHeader('bills')
    if (h) {
      if (!headerWritten) lines.push(h)
      headerWritten = true
    }
    for (const b of bills) {
      const row = csvItemRow(b, 'bills')
      if (row) lines.push(row)
    }
  }

  /* --- Dépenses --- */
  if (expenses && typeof expenses === 'object' && !Array.isArray(expenses)) {
    const exp = expenses
    /* Catégories */
    if (exp.categories && Array.isArray(exp.categories)) {
      const h = csvBlockHeader('expenses', 'header')
      if (h) {
        if (!headerWritten) lines.push(h)
        headerWritten = true
      }
      for (const cat of exp.categories) {
        const row = csvItemRow(cat, 'expenses', 'header')
        if (row) lines.push(row)
      }
    }
    /* Investissements */
    if (exp.investments && Array.isArray(exp.investments)) {
      const h = csvBlockHeader('expenses', 'investmentHeader')
      if (h) {
        if (!headerWritten) lines.push(h)
        headerWritten = true
      }
      for (const inv of exp.investments) {
        const row = csvItemRow(inv, 'expenses', 'investmentHeader')
        if (row) lines.push(row)
      }
    }
    /* Recettes */
    if (exp.revenues && Array.isArray(exp.revenues)) {
      const h = csvBlockHeader('expenses', 'revenueHeader')
      if (h) {
        if (!headerWritten) lines.push(h)
        headerWritten = true
      }
      for (const rev of exp.revenues) {
        const row = csvItemRow(rev, 'expenses', 'revenueHeader')
        if (row) lines.push(row)
      }
    }
    /* Si aucune sous-collection n'a été rencontrée, on traite le cas général */
    if (!headerWritten && exp.expenses && Array.isArray(exp.expenses)) {
      const h = csvBlockHeader('expenses', 'header')
      if (h) {
        lines.push(h)
        headerWritten = true
      }
      for (const e of exp.expenses) {
        const row = csvItemRow(e, 'expenses', 'header')
        if (row) lines.push(row)
      }
    }
  }

  /* BOM pour qu'Excel reconnaisse l'UTF-8. */
  return `\uFEFF${lines.join('\r\n')}`
}

/**
 * Analyse un fichier de sauvegarde JSON (accepte les anciens formats :
 * tableau nu v1, objet sans factures v2 ; un éventuel bloc `analysis` des
 * sauvegardes v3 est simplement ignoré).
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
  const expenses =
    parsed?.expenses && typeof parsed.expenses === 'object' && !Array.isArray(parsed.expenses)
      ? normalizeExpenses(parsed.expenses)
      : null
  if (!products.length) return { ok: false, products: [], bills: [], expenses: null, message: 'Aucun produit valide dans ce fichier.' }
  return { ok: true, products, bills, expenses }
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
 * Sauvegarde JSON : produits, factures ET dépenses.
 *
 * Le troisième argument doit être transmis — un `toJSON` à deux paramètres
 * produisait un fichier parfaitement valide, simplement sans les dépenses,
 * et personne ne s'en apercevait avant d'en avoir besoin.
 */
export function exportJSON(products, bills, expenses = null) {
  downloadText(backupFilename('json'), toJSON(products, bills, expenses), 'application/json')
}

export function exportCSV(products) {
  downloadText(backupFilename('csv'), toCSV(products), 'text/csv')
}