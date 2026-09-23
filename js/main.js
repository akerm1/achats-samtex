/* ------------------------------------------------------------------ */
/* Point d'entrée — routeur, raccourcis, actions globales, PWA         */
/* ------------------------------------------------------------------ */

import { copyText } from './core/utils.js'
import { initTheme } from './core/theme.js'
import { confirmAction, toast } from './core/feedback.js'
import { navigate, startRouter } from './core/router.js'
import { displayName, listSummaryText } from './data/model.js'
import {
  clearAll,
  clearBought,
  clearConfig,
  deleteProduct,
  getProducts,
  getStatus,
  getSyncMessage,
  replaceAll,
  restoreMany,
  restoreProduct,
  setPrefs,
  subscribe,
  syncNow,
  toggleBought,
} from './data/store.js'
import { exportCSV, exportJSON } from './data/backup.js'
import { openProductForm } from './ui/product-form.js'
import {
  applyUpdate,
  canPromptInstall,
  dismissInstall,
  hideOfflineNotice,
  promptInstall,
  renderChrome,
  setActiveRoute,
  setInstallEvent,
  setOfflineReady,
  setUpdateAvailable,
  showInstallHelp,
} from './ui/shell.js'
import { listView } from './ui/views/list.js'
import { settingsView } from './ui/views/settings.js'

const VIEWS = {
  liste: listView,
  reglages: settingsView,
}
const ROUTE_ORDER = Object.keys(VIEWS)
/** Anciennes adresses (Accueil, Marché) : on bascule sur la liste. */
const REDIRECT = { accueil: 'liste', marche: 'liste' }

let activeRoute = 'liste'
let viewHost = null

/* ------------------------------------------------------------------ */
/* Routage                                                             */
/* ------------------------------------------------------------------ */

function showRoute(route) {
  const next = REDIRECT[route] || (ROUTE_ORDER.includes(route) ? route : 'liste')
  if (activeRoute !== next && viewHost) window.scrollTo({ top: 0, behavior: 'auto' })
  activeRoute = next
  setActiveRoute(next)
  VIEWS[next].mount(viewHost)
}

function initRouting() {
  startRouter((route) => {
    /* Raccourci PWA : #/ajouter ouvre directement le formulaire. */
    if (route === 'ajouter') {
      navigate('liste', { replace: true })
      openProductForm()
      return
    }
    showRoute(route)
  })
}

/* ------------------------------------------------------------------ */
/* Actions globales (délégation d'événements)                          */
/* ------------------------------------------------------------------ */

const productById = (id) => getProducts().find((item) => item.id === id) || null

async function shareList() {
  const text = listSummaryText(getProducts(), { title: 'Mes achats — sashes & tissus' })
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Mes achats', text })
      return
    } catch {
      /* partage annulé : on retombe sur la copie presse-papiers */
    }
  }
  const ok = await copyText(text)
  toast(ok ? 'Liste copiée — collez-la dans WhatsApp ou un SMS.' : 'Impossible de copier la liste.', {
    type: ok ? 'ok' : 'error',
  })
}

async function handleDelete(id) {
  const product = productById(id)
  if (!product) return
  const name = displayName(product)
  const confirmed = await confirmAction({
    title: 'Supprimer ce produit ?',
    message: `« ${name} » sera retiré de la liste.`,
    confirmLabel: 'Supprimer',
    danger: true,
  })
  if (!confirmed) return
  const removed = deleteProduct(product.id)
  if (!removed) return
  toast(`« ${name} » supprimé.`, {
    type: 'info',
    actionLabel: 'Annuler',
    onAction: () => restoreProduct(removed.product, removed.index),
  })
}

async function handleClearBought() {
  const bought = getProducts().filter((item) => item.status === 'bought')
  if (!bought.length) return
  const confirmed = await confirmAction({
    title: 'Vider les produits achetés ?',
    message: `${bought.length} produit(s) coché(s) seront retirés de la liste.`,
    confirmLabel: 'Vider',
    danger: true,
  })
  if (!confirmed) return
  const removed = clearBought()
  toast(`${removed.length} produit(s) acheté(s) retiré(s).`, {
    type: 'info',
    actionLabel: 'Annuler',
    onAction: () => restoreMany(removed),
  })
}

async function handleClearAll() {
  const previous = [...getProducts()]
  if (!previous.length) return
  const confirmed = await confirmAction({
    title: 'Vider toute la liste ?',
    message: `${previous.length} produit(s) seront supprimés. Exportez une sauvegarde si vous voulez les conserver.`,
    confirmLabel: 'Tout supprimer',
    danger: true,
  })
  if (!confirmed) return
  clearAll()
  toast('Liste vidée.', {
    type: 'info',
    actionLabel: 'Annuler',
    onAction: () => replaceAll(previous),
  })
}


const ACTIONS = {
  'open-form': () => {
    openProductForm()
  },
  edit: (node) => {
    const product = productById(node.dataset.id)
    if (product) openProductForm(product)
  },
  toggle: (node) => {
    toggleBought(node.dataset.id)
  },
  delete: (node) => {
    handleDelete(node.dataset.id)
  },
  'clear-bought': () => {
    handleClearBought()
  },
  'clear-all': () => {
    handleClearAll()
  },
  'reset-filters': () => {
    listView.resetFilters()
    toast('Filtres réinitialisés.', { type: 'info' })
  },
  'set-filter': (node) => setPrefs({ filter: node.dataset.value }),
  'set-category': (node) => setPrefs({ category: node.dataset.value }),
  'share-list': () => shareList(),
  'sync-now': async () => {
    await syncNow()
    const status = getStatus()
    toast(status === 'config' ? 'Liste enregistrée localement.' : getSyncMessage() || 'Synchronisation terminée.', {
      type: status === 'offline' ? 'error' : 'ok',
    })
  },
  'disconnect-github': () => handleDisconnect(),
  'export-json': () => {
    exportJSON(getProducts())
    toast('Sauvegarde JSON générée.', { type: 'ok' })
  },
  'export-csv': () => {
    exportCSV(getProducts())
    toast('Export CSV généré (Excel).', { type: 'ok' })
  },
  'apply-update': () => applyUpdate(),
  'install-app': () => (canPromptInstall() ? promptInstall() : showInstallHelp()),
  'hide-install': () => dismissInstall(),
  'hide-offline': () => hideOfflineNotice(),
}

function initActions() {
  document.addEventListener('click', (event) => {
    const node = event.target.closest('[data-action]')
    if (!node) return
    const handler = ACTIONS[node.dataset.action]
    if (!handler) return
    event.preventDefault()
    try {
      handler(node)
    } catch (error) {
      console.error(error)
      toast(error.message || 'Action impossible.', { type: 'error' })
    }
  })
}

/* ------------------------------------------------------------------ */
/* Raccourcis clavier                                                  */
/* ------------------------------------------------------------------ */

function isTyping(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'))
}

function initShortcuts() {
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
      if (activeRoute !== 'liste') navigate('liste')
      requestAnimationFrame(() => listView.focusSearch())
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

/* ------------------------------------------------------------------ */
/* PWA : installation, mises à jour, hors-ligne                        */
/* ------------------------------------------------------------------ */

function initServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateAvailable(true)
        })
      })
    })
    navigator.serviceWorker.ready.then(() => {
      if (!navigator.serviceWorker.controller) setOfflineReady(true)
    })
  })
}

function initInstallFlow() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    setInstallEvent(event)
  })
  window.addEventListener('appinstalled', () => {
    dismissInstall()
  })
}

function initVisibility() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadFromRemote()
  })
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

function init() {
  viewHost = document.getElementById('view')
  initTheme()
  initRouting()
  initActions()
  initShortcuts()
  initServiceWorker()
  initInstallFlow()
  initVisibility()
  renderChrome()

  /* Chaque changement d'état redessine la coquille puis la vue active. */
  subscribe(() => {
    renderChrome()
    VIEWS[activeRoute]?.update?.()
  })

  /* Le premier rendu de la vue dépend du chargement (local ou GitHub). */
  showRoute('liste')
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
async function handleDisconnect() {
  const confirmed = await confirmAction({
    title: 'Déconnecter GitHub ?',
    message: 'La liste restera sur cet appareil, mais ne sera plus partagée.',
    confirmLabel: 'Déconnecter',
    danger: true,
  })
  if (!confirmed) return
  clearConfig()
  toast('GitHub déconnecté — la liste reste locale.', { type: 'info' })
}