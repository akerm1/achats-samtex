/* ------------------------------------------------------------------ */
/* Actions globales — un seul `click` délégué pour toute l'application */
/*                                                                     */
/* Chaque bouton porte `data-action="…"` ; ce fichier est la table de   */
/* correspondance. Une action inconnue ne casse rien : elle est         */
/* simplement ignorée.                                                 */
/* ------------------------------------------------------------------ */

import { navigate } from '../core/router.js'
import { toast } from '../core/feedback.js'
import { installUpdate } from '../core/update.js'
import {
  getBills,
  refresh,
  toggleBillPaid,
} from '../data/store.js'
import { exportJSON } from '../data/backup.js'
import {
  chooseDestination,
  downloadNow,
  forgetDestination,
  getAutoExport,
  runDueNow,
  setAutoExport,
} from './autoexport.js'
import { scopeLabel } from '../data/export-tables.js'
import { formatOf } from '../data/exporter.js'
import {
  getExpenses,
} from '../data/expenses-store.js'
import { getCashFlow, addPerson, updatePerson, deletePerson, addTransfer, updateTransfer, deleteTransfer } from '../data/cashflow-store.js'
import { openBillForm } from '../screens/bills/form.js'
import { openReceiptPreview } from '../ui/preview.js'
import { openPersonForm, openTransferForm } from '../screens/cashflow/index.js'
import {
  canPromptInstall,
  dismissExportNotice,
  dismissInstall,
  dismissSyncError,
  hideOfflineNotice,
  promptInstall,
  showInstallHelp,
} from '../ui/shell.js'
import { billsView } from '../screens/bills/index.js'
import { expensesView } from '../screens/expenses/index.js'
import { state } from '../screens/expenses/state.js'
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
  handleDeleteBill,
  handleDeleteCategory,
  handleDeleteExpense,
  handleDeleteInvestment,
  handleDeleteRevenue,
  handleDisconnect,
} from './handlers.js'
import { getActiveRoute } from './routes.js'

const expenseById = (id) => getExpenses().expenses.find((item) => item.id === id) || null

export const ACTIONS = {
  /* Le bouton flottant suit l'écran : il ajoute ce que l'on regarde. */
  'fab-add': () => {
    const route = getActiveRoute()
    if (route === 'factures') return openBillForm()
    if (route === 'depenses') return openExpenseForm()
    if (route === 'recettes') return openRevenueForm()
    if (route === 'caisse') return openTransferForm()
    return null
  },
  'clear-all': () => handleClearAll(),
  'clear-search': () => {
    if (getActiveRoute() === 'factures') billsView.clearSearch()
  },
  'reset-filters': () => {
    if (getActiveRoute() === 'factures') billsView.resetFilters()
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
  /* Navigation depuis la catégorie « Factures » des dépenses.
     Deux cas : data-bill-id (carte spécifique) → ouvre le formulaire.
               data-bill-route (onglet catégorie) → ouvre l'écran avec filtre. */
  'open-bill-route': (node) => {
    if (node.dataset.billId) {
      /* Clic sur une carte facture : ouvrir la facture dans le formulaire. */
      const bill = getBills().find((b) => b.id === node.dataset.billId)
      navigate('factures')
      setTimeout(() => {
        if (bill) openBillForm(bill)
        else billsView.setStatus(state.billsStatusFilter)
      }, 50)
    } else {
      /* Clic sur l'onglet catégorie « Factures » : ouvrir l'écran avec filtre. */
      const statusFilter = node.dataset.billRoute || state.billsStatusFilter || 'all'
      navigate('factures')
      setTimeout(() => billsView.setStatus(statusFilter), 50)
    }
  },
  /* Filtre de statut depuis les onglets de la catégorie « Factures »
     (affichés seulement quand cette catégorie est sélectionnée). */
  'set-bills-status-filter': (node) => {
    state.billsStatusFilter = node.dataset.value
    if (getActiveRoute() === 'depenses') expensesView.update()
    else if (getActiveRoute() === 'factures') billsView.setStatus(node.dataset.value)
  },
  /* Toggle : inclure ou exclure les factures du total des dépenses. */
  'toggle-include-bills': () => {
    state.includeBills = !state.includeBills
    if (getActiveRoute() === 'depenses') expensesView.update()
  },

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
  /* CashFlow */
  'open-person-form': () => openPersonForm(),
  'open-transfer-form': () => openTransferForm(),

  /* Une case de catégorie de l'écran : la dépense s'ouvre déjà catégorisée. */
  'quick-expense': (node) => {
    const categoryId = node?.dataset?.category || ''
    openExpenseForm(null, categoryId ? { categoryId } : {})
  },
  /* Filtres de l'écran Dépenses. Ils vivent ici, et pas dans les écouteurs
     locaux de l'écran : les onglets sont redessinés après une recherche,
     ce qui emporterait leurs écouteurs. La délégation, elle, survit. */
  'set-expense-category': (node) => {
    state.categoryFilter = node.dataset.value
    if (getActiveRoute() === 'depenses') expensesView.update()
  },
  'set-expense-type': (node) => {
    state.typeFilter = node.dataset.value
    if (getActiveRoute() === 'depenses') expensesView.update()
  },
  'reset-expense-filters': () => {
    expensesView.resetFilters()
    const input = state.host?.querySelector('#expenses-search')
    if (input) input.value = ''
    if (getActiveRoute() === 'depenses') expensesView.update()
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
    /* Factures ET dépenses voyagent avec la sauvegarde : c'est le
       seul endroit où ces collections sortent du navigateur. */
    exportJSON(getBills(), getExpenses())
    toast('Sauvegarde JSON générée.', { type: 'ok' })
  },

  /* Export tableur : le contenu et le format viennent des Réglages. */
  'export-now': () => {
    const config = getAutoExport()
    const filename = downloadNow(config.scope, config.format)
    toast(`Export enregistré : ${filename}`, { type: 'ok' })
  },
  'export-due-now': () => {
    runDueNow()
  },
  'pick-export-file': async () => {
    const result = await chooseDestination()
    if (result.cancelled) return
    if (!result.ok) {
      toast(result.message || 'Fichier non retenu.', { type: 'error' })
      return
    }
    toast(
      result.written
        ? `Fichier « ${result.name} » prêt : il sera mis à jour à chaque échéance.`
        : `Fichier « ${result.name} » retenu, mais l'écriture a échoué. Utilisez « Télécharger maintenant ».`,
      { type: result.written ? 'ok' : 'error' },
    )
  },
  'forget-export-file': () => {
    forgetDestination()
    toast('Fichier oublié : les exports repasseront par un téléchargement.', { type: 'ok' })
  },
  'set-export-scope': (node) => {
    setAutoExport({ scope: node.value })
    toast(`Export : ${scopeLabel(node.value)}.`, { type: 'ok' })
  },
  'set-export-format': (node) => {
    setAutoExport({ format: node.value })
    toast(`Format : ${formatOf(node.value).label}.`, { type: 'ok' })
  },
  'set-export-period': (node) => {
    const period = node.value
    /* Activer l'automatisme ne doit pas déclencher un export dans la
       seconde : on part de maintenant, la première échéance est complète. */
    const patch = { period }
    if (period !== 'off' && !getAutoExport().lastAt) patch.lastAt = new Date().toISOString()
    setAutoExport(patch)
    toast(
      period === 'off'
        ? 'Export automatique arrêté.'
        : `Export automatique : ${{ day: 'chaque jour', week: 'chaque semaine', month: 'chaque mois' }[period] || period}.`,
      { type: 'ok' },
    )
  },

  /* PWA et bandeaux */
  'install-update': () => installUpdate(),
  'install-app': () => (canPromptInstall() ? promptInstall() : showInstallHelp()),
  'hide-install': () => dismissInstall(),
  'hide-offline': () => hideOfflineNotice(),
  'hide-export-notice': () => dismissExportNotice(),
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
    /* Une action inconnue ne casse rien : elle est simplement ignorée. */
  })

  /* Les listes déroulantes d'action passent par `change`, pas par `click` :
     un clic sur une option ne déclencherait rien. */
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
}
