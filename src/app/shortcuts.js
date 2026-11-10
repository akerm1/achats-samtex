/* ------------------------------------------------------------------ */
/* Raccourcis clavier                                                  */
/*                                                                     */
/*   N        nouveau produit                                          */
/*   /        chercher dans l'écran courant (liste ou factures)         */
/*   S        synchroniser                                             */
/*   1…5      aller à l'écran correspondant                            */
/*                                                                     */
/* Aucun raccourci ne se déclenche pendant une saisie ni sous une       */
/* boîte de dialogue ouverte.                                          */
/* ------------------------------------------------------------------ */

import { isTyping } from '../core/dom.js'
import { navigate } from '../core/router.js'
import { openProductForm } from '../screens/list/form.js'
import { listView } from '../screens/list/index.js'
import { billsView } from '../screens/bills/index.js'
import { ACTIONS } from './actions.js'
import { ROUTE_ORDER, getActiveRoute } from './routes.js'

export function initShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (isTyping(event.target)) return
    if (document.querySelector('dialog[open]')) return
    const key = event.key.toLowerCase()

    if (key === 'n') {
      event.preventDefault()
      openProductForm()
      return
    }

    if (key === '/') {
      event.preventDefault()
      const route = getActiveRoute()
      if (route === 'factures') billsView.focusSearch()
      else {
        if (route !== 'liste') navigate('liste')
        requestAnimationFrame(() => listView.focusSearch())
      }
      return
    }

    if (key === 's') {
      event.preventDefault()
      ACTIONS['sync-now']()
      return
    }

    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= ROUTE_ORDER.length) {
      event.preventDefault()
      navigate(ROUTE_ORDER[digit - 1])
    }
  })
}
