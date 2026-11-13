/* ------------------------------------------------------------------ */
/* Écran Dépenses — état partagé entre les trois onglets               */
/*                                                                     */
/* Un seul objet mutable, remis à zéro au montage. Les onglets lisent  */
/* ce qu'ils veulent et ne se passent rien entre eux.                  */
/* ------------------------------------------------------------------ */

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

export const state = {
  host: null,
  tab: 'expenses', // expenses | categories | investments
  categoryFilter: 'all',
  typeFilter: 'all',
  query: '',
  reorderMode: false,
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
  state.reorderMode = false
  state.sort = { ...SORTS }
  state.layout = { ...LAYOUTS }
}

export function resetFilters() {
  state.categoryFilter = 'all'
  state.typeFilter = 'all'
  state.query = ''
}
