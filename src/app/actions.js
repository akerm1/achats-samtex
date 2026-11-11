/* ------------------------------------------------------------------ */
/* Actions globales — un seul `click` délégué pour toute l'application */
/*                                                                     */
/* Chaque bouton porte `data-action="…"` ; ce fichier est la table de   */
/* correspondance. Une action inconnue ne casse rien : elle est         */
/* simplement ignorée.                                                 */
/* ------------------------------------------------------------------ */

import { isTyping } from '../core/dom.js'
import { navigate } from '../core/router.js'
import { toast } from '../core/feedback.js'
import { installUpdate } from '../core/update.js'
import {
  getBills,
  getProducts,
  refresh,
  setPrefs,
  toggleBillPaid,
  toggleBought,
} from '../data/store.js'
import { exportCSV, exportJSON } from '../data/backup.js'
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
} from '../data/analysis-store.js'
import {
  getExpenses,
} from '../data/expenses-store.js'
import { openProductForm } from '../screens/list/form.js'
import { openBillForm } from '../screens/bills/form.js'
import { openColorPreview, openPhotoPreview, openReceiptPreview } from '../ui/preview.js'
import {
  canPromptInstall,
  dismissInstall,
  dismissSyncError,
  hideOfflineNotice,
  promptInstall,
  showInstallHelp,
} from '../ui/shell.js'
import { listView } from '../screens/list/index.js'
import { billsView } from '../screens/bills/index.js'
import { analysisView } from '../screens/analysis/index.js'
import {
  openCategoryForm,
  openExpenseForm,
  openInvestmentForm,
  openRevenueDayForm,
  openRevenueForm,
  openRevenueQuickForm,
} from '../screens/expenses/forms/index.js'
import {
  handleClearAll,
  handleClearBought,
  handleDeleteBill,
  handleDeleteCategory,
  handleDeleteExpense,
  handleDeleteInvestment,
  handleDeleteProduct,
  handleDeleteRevenue,
  handleDisconnect,
  shareList,
} from './handlers.js'
import { getActiveRoute } from './routes.js'

const productById = (id) => getProducts().find((item) => item.id === id) || null
const expenseById = (id) => getExpenses().expenses.find((item) => item.id === id) || null

export const ACTIONS = {
  /* Produits */
  'open-form': () => openProductForm(),
  /* Le bouton flottant suit l'écran : il ajoute ce que l'on regarde. */
  'fab-add': () => {
    const route = getActiveRoute()
    if (route === 'factures') return openBillForm()
    if (route === 'depenses') return openExpenseForm()
    if (route === 'analyse') return openRevenueQuickForm()
    return openProductForm()
  },
  'set-sort': (node) => setPrefs({ sort: node.value }),
  'set-layout': (node) => setPrefs({ layout: node.dataset.value }),
  edit: (node) => {
    const product = productById(node.dataset.id)
    if (product) openProductForm(product)
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
  toggle: (node) => toggleBought(node.dataset.id),
  delete: (node) => handleDeleteProduct(node.dataset.id),
  'clear-bought': () => handleClearBought(),
  'clear-all': () => handleClearAll(),
  'share-list': () => shareList(),
  'set-filter': (node) => setPrefs({ filter: node.dataset.value }),
  'set-category': (node) => setPrefs({ category: node.dataset.value }),
  'clear-search': () => {
    if (getActiveRoute() === 'factures') billsView.clearSearch()
    else listView.clearSearch()
  },
  'reset-filters': () => {
    if (getActiveRoute() === 'factures') billsView.resetFilters()
    else listView.resetFilters()
    toast('Filtres réinitialisés.', { type: 'info' })
  },

  /* Factures */
  'open-bill-form': () => openBillForm(),
  'edit-bill': (node) => {
    const bill = getBills().find((item) => item.id === node.dataset.id)
    if (bill) openBillForm(bill)
  },
  'preview-bill-photo': (node) => {
    const bill = getBills().find((item) => item.id === node.dataset.id)
    if (bill?.photo) openReceiptPreview({ name: bill.supplier, receipt: bill.photo })
  },
  'delete-bill': (node) => handleDeleteBill(node.dataset.id),
  'toggle-paid': (node) => toggleBillPaid(node.dataset.id),
  'set-bill-status': (node) => billsView.setStatus(node.dataset.value),
  'clear-bills-search': () => billsView.clearSearch(),
  'reset-bill-filters': () => {
    billsView.resetFilters()
    toast('Filtres réinitialisés.', { type: 'info' })
  },

  /* Analyse */
  'analysis-home': () => analysisView.setTab('generale'),
  'analysis-fy-prev': () => analysisView.shiftFy(-1),
  'analysis-fy-next': () => analysisView.shiftFy(1),
  'analysis-month-prev': () => analysisView.shiftMonth(-1),
  'analysis-month-next': () => analysisView.shiftMonth(1),
  'analysis-today': () => analysisView.goToday(),
  'analysis-goto': (node) => analysisView.gotoSection(node.dataset.target, node.dataset.tab),
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

  /* Dépenses */
  'open-expense-form': (node) => {
    /* Le bouton « Transférer » d'un investissement pré-remplit la dépense. */
    let prefill = {}
    if (node?.dataset?.prefill) {
      try {
        prefill = JSON.parse(node.dataset.prefill)
      } catch {
        prefill = {}
      }
    }
    openExpenseForm(null, prefill)
  },
  /* Une case de catégorie de l'écran : la dépense s'ouvre déjà catégorisée. */
  'quick-expense': (node) => {
    const categoryId = node?.dataset?.category || ''
    openExpenseForm(null, categoryId ? { categoryId } : {})
  },
  'edit-expense': (node) => {
    const expense = expenseById(node.dataset.id)
    if (expense) openExpenseForm(expense)
  },
  'delete-expense': (node) => handleDeleteExpense(node.dataset.id),
  'open-category-form': () => openCategoryForm(),
  'edit-category': (node) => {
    const category = getExpenses().categories.find((item) => item.id === node.dataset.id)
    if (category) openCategoryForm(category)
  },
  'delete-category': (node) => handleDeleteCategory(node.dataset.id),
  'open-investment-form': () => openInvestmentForm(),
  'edit-investment': (node) => {
    const investment = getExpenses().investments.find((item) => item.id === node.dataset.id)
    if (investment) openInvestmentForm(investment)
  },
  'delete-investment': (node) => handleDeleteInvestment(node.dataset.id),
  'open-revenue-form': () => openRevenueForm(),
  'open-revenue-quick': () => openRevenueQuickForm(),
  'open-revenue-day': (node) => openRevenueDayForm(node.dataset.date),
  'edit-revenue': (node) => {
    const revenue = getExpenses().revenues.find((item) => item.id === node.dataset.id)
    if (revenue) openRevenueForm(revenue)
  },
  'delete-revenue': (node) => handleDeleteRevenue(node.dataset.id),

  /* Partage et sauvegarde */
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
    /* Factures, analyse ET dépenses voyagent avec la sauvegarde : c'est le
       seul endroit où ces collections sortent du navigateur. */
    exportJSON(getProducts(), getBills(), getAnalysis(), getExpenses())
    toast('Sauvegarde JSON générée.', { type: 'ok' })
  },
  'export-csv': () => {
    exportCSV(getProducts())
    toast('Export CSV généré (Excel).', { type: 'ok' })
  },

  /* PWA et bandeaux */
  'install-update': () => installUpdate(),
  'install-app': () => (canPromptInstall() ? promptInstall() : showInstallHelp()),
  'hide-install': () => dismissInstall(),
  'hide-offline': () => hideOfflineNotice(),
  'hide-sync-error': () => dismissSyncError(),
}

/**
 * Un seul écouteur pour toute l'application. Les vues peuvent aussi
 * brancher leurs propres boutons (`bindBody`) quand elles ont besoin de
 * l'état local de l'écran ; ce fichier reste le filet commun.
 */
export function initActions() {
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
    /* Cliquer sur le corps d'une carte ouvre la fiche produit. */
    const card = event.target.closest('[data-role="card-body"]')
    if (card) {
      const article = card.closest('[data-id]')
      const product = article?.dataset.id ? productById(article.dataset.id) : null
      if (product) openProductForm(product)
    }
  })

  /* Les listes déroulantes d'action (tri de la liste) passent par `change`,
     pas par `click` : un clic sur une option ne déclencherait rien. */
  document.addEventListener('change', (event) => {
    const node = event.target.closest('select[data-action]')
    if (!node) return
    const handler = ACTIONS[node.dataset.action]
    if (!handler) return
    try {
      handler(node)
    } catch (error) {
      console.error(error)
      toast(error.message || 'Action impossible.', { type: 'error' })
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
    const product = productById(card.closest('[data-id]')?.dataset.id)
    if (product) openProductForm(product)
  })
}
