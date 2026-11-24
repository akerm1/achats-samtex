/* ------------------------------------------------------------------ */
/* Raccourcis clavier                                                  */
/*                                                                     */
/*   /        chercher dans les factures                               */
/*   S        synchroniser                                             */
/*   1…5      aller à l'écran correspondant                            */
/*                                                                     */
/* Aucun raccourci ne se déclenche pendant une saisie ni sous une       */
/* boîte de dialogue ouverte.                                          */
/* ------------------------------------------------------------------ */

import { isTyping } from '../core/dom.js'
import { navigate } from '../core/router.js'
import { billsView } from '../screens/bills/index.js'
import { ACTIONS } from './actions.js'
import { ROUTE_ORDER, getActiveRoute } from './routes.js'

export function initShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (isTyping(event.target)) return
    if (document.querySelector('dialog[open]')) return
    const key = event.key.toLowerCase()

    if (key === '/') {
      event.preventDefault()
      if (getActiveRoute() !== 'factures') navigate('factures')
      requestAnimationFrame(() => billsView.focusSearch())
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
