/* ------------------------------------------------------------------ */
/* Écran Dépenses — état partagé entre les quatre onglets              */
/*                                                                     */
/* Un seul objet mutable, remis à zéro au montage. Les onglets lisent  */
/* ce qu'ils veulent et ne se passent rien entre eux.                  */
/* ------------------------------------------------------------------ */

export const state = {
  host: null,
  tab: 'revenues', // revenues | expenses | categories | investments
  categoryFilter: 'all',
  typeFilter: 'all',
  query: '',
  reorderMode: false,
}

export function resetState(host) {
  state.host = host
  /* L'écran ouvre sur les recettes : c'est la section du jour. */
  state.tab = 'revenues'
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
