/* ------------------------------------------------------------------ */
/* Écran Dépenses — état partagé entre les trois onglets               */
/*                                                                     */
/* Un seul objet mutable, remis à zéro au montage. Les onglets lisent  */
/* ce qu'ils veulent et ne se passent rien entre eux.                  */
/* ------------------------------------------------------------------ */

import { BILLS_CATEGORY_META, BILLS_CATEGORY_ID } from '../../data/expenses-model.js'

export const SORTS = {
  expenses: 'recent',
  categories: 'order',
  investments: 'recent',
}

export const LAYOUTS = {
  expenses: 'cards',
  categories: 'cards',
  investments: 'cards',
}

/* Catégorie virtuelle « Factures » : elle raspe les factures du shop dans
   les dépenses. Elle est affichée dans les onglets catégories, avec un
   compteur de factures. L'ID est exporté pour identifier cette catégorie. */
export const BILLS_CATEGORY = BILLS_CATEGORY_META
export { BILLS_CATEGORY_ID }

export const state = {
  host: null,
  tab: 'expenses', // expenses | categories | investments
  categoryFilter: 'all',
  typeFilter: 'all',
  query: '',
  startDate: '',
  endDate: '',
  reorderMode: false,
  /* La catégorie virtuelle « Factures » raspe les factures du shop dans les
     dépenses. Ce drapeau choisit si le total du haut les compte : une seule
     vue, deux totaux, pour ne pas double-comptabiliser. */
  includeBills: true,
  /* Filtre de statut appliqué à la catégorie « Factures » (toutes / payées /
     en attente). Inutile sur les autres catégories. */
  billsStatusFilter: 'all',
  sort: { ...SORTS },
  layout: { ...LAYOUTS },
}

export function resetState(host) {
  state.host = host
  /* L'écran ouvre sur sa première section, dans l'ordre des onglets :
     aucune section n'est privilégiée, chacune est à un appui. */
  state.tab = 'expenses'
  state.categoryFilter = 'all'
  state.typeFilter = 'all'
  state.query = ''
  state.startDate = ''
  state.endDate = ''
  state.reorderMode = false
  state.includeBills = true
  state.billsStatusFilter = 'all'
  state.sort = { ...SORTS }
  state.layout = { ...LAYOUTS }
}

export function resetFilters() {
  state.categoryFilter = 'all'
  state.typeFilter = 'all'
  state.query = ''
  state.startDate = ''
  state.endDate = ''
  state.billsStatusFilter = 'all'
}
