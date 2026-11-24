/* ------------------------------------------------------------------ */
/* Routes — quels écrans existent, et lequel s'affiche                 */
/*                                                                     */
/* L'ordre de `VIEWS` est aussi l'ordre des raccourcis clavier 1…5.    */
/* ------------------------------------------------------------------ */

import { startRouter } from '../core/router.js'
import { setActiveRoute } from '../ui/shell.js'
import { billsView } from '../screens/bills/index.js'
import { revenuesView } from '../screens/revenues/index.js'
import { expensesView } from '../screens/expenses/index.js'
import { settingsView } from '../screens/settings/index.js'
import { cashflowView } from '../screens/cashflow/index.js'

export const VIEWS = {
  recettes: revenuesView,
  caisse: cashflowView,
  depenses: expensesView,
  factures: billsView,
  reglages: settingsView,
}

export const ROUTE_ORDER = Object.keys(VIEWS)

/** Route affichée quand le hash est vide ou inconnu. L'application ouvre
    sur les recettes : c'est le premier chiffre du shop. */
export const DEFAULT_ROUTE = 'recettes'

/** Anciennes adresses (Accueil, Marché) : on bascule sur les recettes. */
const REDIRECT = { accueil: DEFAULT_ROUTE, marche: DEFAULT_ROUTE }

let activeRoute = DEFAULT_ROUTE
let viewHost = null

export const getActiveRoute = () => activeRoute

export function showRoute(route) {
  const next = REDIRECT[route] || (ROUTE_ORDER.includes(route) ? route : DEFAULT_ROUTE)
  if (activeRoute !== next && viewHost) window.scrollTo({ top: 0, behavior: 'auto' })
  activeRoute = next
  setActiveRoute(next)
  VIEWS[next].mount(viewHost)
}

export function initRouting(host) {
  viewHost = host
  startRouter((route) => showRoute(route))
}
