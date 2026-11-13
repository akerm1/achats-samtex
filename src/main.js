/* ------------------------------------------------------------------ */
/* Point d'entrée — démarre l'application                              */
/*                                                                     */
/* Rien de métier ici : le routage vit dans app/routes.js, les actions */
/* dans app/actions.js, les raccourcis dans app/shortcuts.js et la PWA */
/* dans app/pwa.js.                                                    */
/* ------------------------------------------------------------------ */

import { currentRoute } from './core/router.js'
import { initTheme } from './core/theme.js'
import { subscribe } from './data/store.js'
import { subscribe as subscribeUpdate } from './core/update.js'
import { renderChrome } from './ui/shell.js'
import { initActions } from './app/actions.js'
import { initShortcuts } from './app/shortcuts.js'
import { checkUpdateInBackground, initInstallFlow, initServiceWorker } from './app/pwa.js'
import { VIEWS, getActiveRoute, initRouting, showRoute } from './app/routes.js'

function init() {
  const viewHost = document.getElementById('view')

  initTheme()
  initRouting(viewHost)
  initActions()
  initShortcuts()
  initServiceWorker()
  initInstallFlow()
  renderChrome()

  /* Chaque changement d'état redessine la coquille puis la vue active. */
  subscribe(() => {
    renderChrome()
    VIEWS[getActiveRoute()]?.update?.()
  })

  /* Idem pour l'état de la mise à jour : le bouton des Réglages bascule seul. */
  subscribeUpdate(() => {
    renderChrome()
    VIEWS[getActiveRoute()]?.update?.()
  })

  /* La route vient du hash, pas d'un choix ici : sans cela, ouvrir ou
     recharger l'application sur `#/factures` retombe sur la liste. */
  showRoute(currentRoute())

  /* Une seule vérification au démarrage : elle installe la version publiée
     si elle est plus récente (une fois par session), sinon elle ne fait rien. */
  checkUpdateInBackground()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
