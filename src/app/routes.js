/* ------------------------------------------------------------------ */
/* Routes — quels écrans existent, et lequel s'affiche                 */
/*                                                                     */
/* L'ordre de `VIEWS` est aussi l'ordre des raccourcis clavier 1…5.    */
/* ------------------------------------------------------------------ */

import { navigate, startRouter } from '../core/router.js'
import { setActiveRoute } from '../ui/shell.js'
import { listView } from '../screens/list/index.js'
import { billsView } from '../screens/bills/index.js'
import { analysisView } from '../screens/analysis/index.js'
import { expensesView } from '../screens/expenses/index.js'
import { settingsView } from '../screens/settings/index.js'
import { openProductForm } from '../screens/list/form.js'

export const VIEWS = {
  liste: listView,
  factures: billsView,
  depenses: expensesView,
  analyse: analysisView,
  reglages: settingsView,
}

export const ROUTE_ORDER = Object.keys(VIEWS)

/** Route affichée quand le hash est vide ou inconnu. L'application ouvre
    le suivi des dépenses : c'est l'écran de travail quotidien. */
export const DEFAULT_ROUTE = 'depenses'

/** Anciennes adresses (Accueil, Marché) : on bascule sur la liste. */
const REDIRECT = { accueil: 'liste', marche: 'liste' }

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
  startRouter((route) => {
    /* Raccourci PWA : #/ajouter ouvre directement le formulaire produit. */
    if (route === 'ajouter') {
      navigate(DEFAULT_ROUTE, { replace: true })
      openProductForm()
      return
    }
    showRoute(route)
  })
}
