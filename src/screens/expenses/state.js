/* ------------------------------------------------------------------ */
/* Écran Dépenses — état partagé entre les quatre onglets              */
/*                                                                     */
/* Un seul objet mutable, remis à zéro au montage. Les onglets lisent  */
/* ce qu'ils veulent et ne se passent rien entre eux.                  */
/* ------------------------------------------------------------------ */

export const state = {
  host: null,
  tab: 'expenses', // expenses | categories | investments | revenues
  categoryFilter: 'all',
  typeFilter: 'all',
  query: '',
  reorderMode: false,
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
}

export function resetFilters() {
  state.categoryFilter = 'all'
  state.typeFilter = 'all'
  state.query = ''
}
