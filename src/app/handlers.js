/* ------------------------------------------------------------------ */
/* Actions métier — suppressions et vidages, avec annulation            */
/*                                                                     */
/* Chaque action destructive demande confirmation, puis propose        */
/* « Annuler » dans le toast : rien ne part sans filet.                */
/* ------------------------------------------------------------------ */

import { copyText } from '../core/utils.js'
import { confirmAction, toast } from '../core/feedback.js'
import { displayName, listSummaryText } from '../data/products-model.js'
import {
  clearAll,
  clearBought,
  clearConfig,
  deleteBill,
  deleteProduct,
  getBills,
  getProducts,
  importBills,
  replaceAll,
  restoreBill,
  restoreMany,
  restoreProduct,
} from '../data/store.js'
import {
  deleteCategory,
  deleteExpense,
  deleteInvestment,
  deleteRevenue,
  getExpenses,
} from '../data/expenses-store.js'

/* Produits --------------------------------------------------------- */

const productById = (id) => getProducts().find((item) => item.id === id) || null

export async function shareList() {
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

export async function handleDeleteProduct(id) {
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

export async function handleClearBought() {
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

export async function handleClearAll() {
  const previous = [...getProducts()]
  const previousBills = [...getBills()]
  if (!previous.length && !previousBills.length) return
  const counts = [`${previous.length} produit(s)`, `${previousBills.length} facture(s)`].join(' et ')
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

/* Factures --------------------------------------------------------- */

export async function handleDeleteBill(id) {
  const bill = getBills().find((item) => item.id === id)
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
}

/* Dépenses -------------------------------------------------------- */

export async function handleDeleteExpense(id) {
  const { expenses } = getExpenses()
  const expense = expenses.find((item) => item.id === id)
  if (!expense) return
  const confirmed = await confirmAction({
    title: 'Supprimer cette dépense ?',
    message: `Montant : ${expense.amount !== null ? expense.amount.toFixed(2) : '—'}.`,
    confirmLabel: 'Supprimer',
    danger: true,
  })
  if (!confirmed) return
  deleteExpense(id)
  toast('Dépense supprimée.', { type: 'info' })
}

export async function handleDeleteCategory(id) {
  const { categories, expenses } = getExpenses()
  const category = categories.find((item) => item.id === id)
  if (!category) return
  const count = expenses.filter((item) => item.categoryId === id).length
  const confirmed = await confirmAction({
    title: 'Supprimer cette catégorie ?',
    message: `${count} dépense(s) utilisent cette catégorie. Elles la garderont mais elle ne sera plus proposée.`,
    confirmLabel: 'Supprimer',
    danger: true,
  })
  if (!confirmed) return
  deleteCategory(id)
  toast('Catégorie supprimée.', { type: 'info' })
}

export async function handleDeleteInvestment(id) {
  const { investments, expenses } = getExpenses()
  const investment = investments.find((item) => item.id === id)
  if (!investment) return
  const transferCount = expenses.filter((item) => item.linkedInvestmentId === id).length
  const confirmed = await confirmAction({
    title: 'Supprimer cet investissement ?',
    message: `${transferCount} transfert(s) lié(s) seront détachés mais conservés.`,
    confirmLabel: 'Supprimer',
    danger: true,
  })
  if (!confirmed) return
  deleteInvestment(id)
  toast('Investissement supprimé.', { type: 'info' })
}

export async function handleDeleteRevenue(id) {
  const { revenues } = getExpenses()
  const revenue = revenues.find((item) => item.id === id)
  if (!revenue) return
  const confirmed = await confirmAction({
    title: 'Supprimer cette recette ?',
    message: `La recette du ${revenue.date} (${revenue.amount !== null ? revenue.amount.toFixed(2) : '—'}) sera retirée.`,
    confirmLabel: 'Supprimer',
    danger: true,
  })
  if (!confirmed) return
  deleteRevenue(id)
  toast('Recette supprimée.', { type: 'info' })
}

/* Réglages -------------------------------------------------------- */

export async function handleDisconnect() {
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
