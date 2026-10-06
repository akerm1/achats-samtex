/* ------------------------------------------------------------------ */
/* Point d'entrée — routeur, raccourcis, actions globales, PWA         */
/* ------------------------------------------------------------------ */

import { copyText } from './core/utils.js'
import { initTheme } from './core/theme.js'
import { confirmAction, toast } from './core/feedback.js'
import { currentRoute, navigate, startRouter } from './core/router.js'
import { displayName, listSummaryText } from './data/model.js'
import {
  clearAll,
  clearBought,
  clearConfig,
  deleteProduct,
  deleteBill,
  getProducts,
  getBills,
  getState,
  importBills,
  refresh,
  replaceAll,
  restoreBill,
  restoreMany,
  restoreProduct,
  setPrefs,
  subscribe,
  toggleBillPaid,
  toggleBought,
} from './data/store.js'
import { checkForUpdate, installUpdate, subscribe as subscribeUpdate } from './core/update.js'
import { exportCSV, exportJSON } from './data/backup.js'
import {
  addHolding,
  addInvestment,
  addPlace,
  addPurchase,
  clearSale,
  deleteHolding,
  deleteInvestment,
  deletePlace,
  deletePurchase,
  getAnalysis,
  toggleSaleKind,
} from './data/analysis-store.js'
import { openProductForm } from './ui/product-form.js'
import { openBillForm } from './ui/bill-form.js'
import { openColorPreview, openPhotoPreview, openReceiptPreview } from './ui/preview.js'
import {
  canPromptInstall,
  dismissInstall,
  dismissSyncError,
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
import { billsView } from './ui/views/bills.js'
import { analysisView } from './ui/views/analysis.js'
import { settingsView } from './ui/views/settings.js'

const VIEWS = {
  liste: listView,
  factures: billsView,
  reglages: settingsView,
  /* En dernière position : le raccourci « 4 » ouvre l'Analyse. */
  analyse: analysisView,
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
  const previousBills = [...getBills()]
  if (!previous.length && !previousBills.length) return
  const counts = [
    `${previous.length} produit(s)`,
    `${previousBills.length} facture(s)`,
  ].join(' et ')
  const confirmed = await confirmAction({
    title: 'Vider toute la liste ?',
    message: `${counts} seront supprimés. Exportez une sauvegarde si vous voulez les conserver.`,
    confirmLabel: 'Tout supprimer',
    danger: true,
  })
  if (!confirmed) return
  clearAll()
  toast('Liste vidée.', {
    type: 'info',
    actionLabel: 'Annuler',
    onAction: () => {
      replaceAll(previous)
      if (previousBills.length) importBills(previousBills, { mode: 'merge' })
    },
  })
}


const ACTIONS = {
  'open-form': () => {
    openProductForm()
  },
  'open-bill-form': () => {
    openBillForm()
  },
  edit: (node) => {
    const product = productById(node.dataset.id)
    if (product) openProductForm(product)
  },
  'edit-bill': (node) => {
    const bill = getBills().find((b) => b.id === node.dataset.id)
    if (bill) openBillForm(bill)
  },
  'preview-bill-photo': (node) => {
    const bill = getBills().find((b) => b.id === node.dataset.id)
    if (bill?.photo) openReceiptPreview({ name: bill.supplier, receipt: bill.photo })
  },
  'preview-color': (node) => {
    const product = productById(node.dataset.id)
    if (product) openColorPreview(product)
  },
  'preview-photo': (node) => {
    const product = productById(node.dataset.id)
    if (product) openPhotoPreview(product)
  },
  'preview-receipt': (node) => {
    const product = productById(node.dataset.id)
    if (product?.receipt) openReceiptPreview(product)
  },
  'add-receipt': (node) => {
    const product = productById(node.dataset.id)
    if (product) openProductForm(product)
  },
  toggle: (node) => {
    toggleBought(node.dataset.id)
  },
  'toggle-paid': (node) => {
    toggleBillPaid(node.dataset.id)
  },
  delete: (node) => {
    handleDelete(node.dataset.id)
  },
  'delete-bill': async (node) => {
    const bill = getBills().find((b) => b.id === node.dataset.id)
    if (!bill) return
    const confirmed = await confirmAction({
      title: 'Supprimer cette facture ?',
      message: `« ${bill.supplier} » sera retirée.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!confirmed) return
    const removed = deleteBill(bill.id)
    if (!removed) return
    toast(`Facture « ${bill.supplier} » supprimée.`, {
      type: 'info',
      actionLabel: 'Annuler',
      onAction: () => restoreBill(removed.bill, removed.index),
    })
  },
  'clear-bought': () => {
    handleClearBought()
  },
  'clear-all': () => {
    handleClearAll()
  },
  'reset-filters': () => {
    if (activeRoute === 'factures') billsView.resetFilters()
    else listView.resetFilters()
    toast('Filtres réinitialisés.', { type: 'info' })
  },
  'reset-bill-filters': () => {
    billsView.resetFilters()
    toast('Filtres réinitialisés.', { type: 'info' })
  },
  'set-bill-status': (node) => billsView.setStatus(node.dataset.value),
  'clear-bills-search': () => billsView.clearSearch(),
  'set-filter': (node) => setPrefs({ filter: node.dataset.value }),
  'set-category': (node) => setPrefs({ category: node.dataset.value }),
  'clear-search': () => {
    if (activeRoute === 'factures') billsView.clearSearch()
    else listView.clearSearch()
  },
  'share-list': () => shareList(),
  'go-settings': () => navigate('reglages'),
  'sync-now': async () => {
    const result = await refresh()
    if (!result.ok) return
    toast(
      result.status === 'local' ? 'Liste enregistrée localement.' : 'Liste actualisée depuis GitHub.',
      { type: 'ok' },
    )
  },
  'disconnect-github': () => handleDisconnect(),
  'export-json': () => {
    /* Factures ET analyse voyagent avec la sauvegarde : c'est le seul
       endroit où ces collections sortent du navigateur (GitHub ni le
       CSV ne les portent). */
    exportJSON(getProducts(), getBills(), getAnalysis())
    toast('Sauvegarde JSON générée.', { type: 'ok' })
  },
  'export-csv': () => {
    exportCSV(getProducts())
    toast('Export CSV généré (Excel).', { type: 'ok' })
  },
  /* Analyse — les mutations vont au store d'analyse ; l'écran se
     redessine par l'abonnement (même enveloppe try/catch que les autres). */
  'analysis-tab': (node) => analysisView.setTab(node.dataset.value),
  'analysis-fy-prev': () => analysisView.shiftFy(-1),
  'analysis-fy-next': () => analysisView.shiftFy(1),
  'analysis-month-prev': () => analysisView.shiftMonth(-1),
  'analysis-month-next': () => analysisView.shiftMonth(1),
  'analysis-day-kind': (node) => toggleSaleKind(node.dataset.date, node.dataset.kind),
  'analysis-day-clear': (node) => clearSale(node.dataset.date),
  'analysis-investment-add': () => addInvestment({}),
  'analysis-investment-del': (node) => deleteInvestment(node.dataset.id),
  'analysis-purchase-add': () => addPurchase({}),
  'analysis-purchase-del': (node) => deletePurchase(node.dataset.id),
  'analysis-holding-add': (node) => addHolding({ holder: node.dataset.holder }),
  'analysis-holding-del': (node) => deleteHolding(node.dataset.id),
  'analysis-place-add': () => addPlace({}),
  'analysis-place-del': (node) => deletePlace(node.dataset.id),
  'install-update': () => installUpdate(),
  'install-app': () => (canPromptInstall() ? promptInstall() : showInstallHelp()),
  'hide-install': () => dismissInstall(),
  'hide-offline': () => hideOfflineNotice(),
  'hide-sync-error': () => dismissSyncError(),
}

function initActions() {
  document.addEventListener('click', (event) => {
    const node = event.target.closest('[data-action]')
    if (node) {
      const handler = ACTIONS[node.dataset.action]
      if (handler) {
        event.preventDefault()
        try {
          handler(node)
        } catch (error) {
          console.error(error)
          toast(error.message || 'Action impossible.', { type: 'error' })
        }
        return
      }
    }
    /* Cliquer sur le corps d'une carte ouvre la fiche produit (tous les détails). */
    const card = event.target.closest('[data-role="card-body"]')
    if (card) {
      const article = card.closest('[data-id]')
      const id = article?.dataset.id
      const product = id ? productById(id) : null
      if (product) openProductForm(product)
    }
  })
  /* Clavier : Entrée / Espace sur une carte ouvre la fiche. */
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (isTyping(event.target)) return
    /* La couleur et la photo s'agrandissent d'abord : elles vivent dans la
       carte, il ne faut pas que la fiche s'ouvre à leur place. */
    const zoomer = event.target.closest('[data-action="preview-color"], [data-action="preview-photo"]')
    if (zoomer && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      ACTIONS[zoomer.dataset.action]?.(zoomer)
      return
    }
    const card = event.target.closest('[data-role="card-body"]')
    if (!card) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    const article = card.closest('[data-id]')
    const product = productById(article?.dataset.id)
    if (product) openProductForm(product)
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
/* PWA : installation, mode hors-ligne, mises à jour                    */
/*                                                                     */
/* Le service worker ne sert plus qu'au repli hors-ligne : les fichiers */
/* ne sont jamais mis en cache, donc le code affiché est toujours celui */
/* de GitHub. La mise à jour, elle, se décide dans les Réglages à partir*/
/* de `version.json` — jamais automatiquement.                         */
/* ------------------------------------------------------------------ */

function initServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker non enregistré :', error)
    })
    navigator.serviceWorker.ready.then(() => {
      if (!navigator.serviceWorker.controller) setOfflineReady(true)
    })
  })
}

/** Vérifie la version publiée sans rien installer : le bouton change d'état. */
async function checkUpdateInBackground() {
  const result = await checkForUpdate()
  if (result.available) setUpdateAvailable(true)
}

function initInstallFlow() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    setInstallEvent(event)
  })
  window.addEventListener('appinstalled', () => {
    dismissInstall()
    /* Après installation, la liste est relue une fois depuis GitHub. */
    refresh().then((result) => {
      if (!result.ok) return
      const { status } = getState()
      toast(
        status === 'local'
          ? 'Application installée — connectez GitHub dans Réglages pour tout partager.'
          : 'Application installée — liste actualisée.',
        { type: status === 'local' ? 'info' : 'ok' },
      )
    })
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
  renderChrome()

  /* Chaque changement d'état redessine la coquille puis la vue active. */
  subscribe(() => {
    renderChrome()
    VIEWS[activeRoute]?.update?.()
  })

  /* Idem pour l'état de la mise à jour : le bouton des Réglages bascule seul. */
  subscribeUpdate(() => {
    renderChrome()
    VIEWS[activeRoute]?.update?.()
  })

  /* Le premier rendu de la vue dépend du chargement (local ou GitHub).
     La route vient du hash, pas d'un choix ici : sans cela, ouvrir ou
     recharger l'application sur `#/factures` retombe sur la liste. */
  showRoute(currentRoute())

  /* Une seule vérification silencieuse au démarrage : elle n'installe rien. */
  checkUpdateInBackground()
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
