/* ------------------------------------------------------------------ */
/* Actions métier — suppressions et vidages, avec annulation            */
/*                                                                     */
/* Chaque action destructive demande confirmation, puis propose        */
/* « Annuler » dans le toast : rien ne part sans filet.                */
/* ------------------------------------------------------------------ */

import { confirmAction, toast } from '../core/feedback.js'
import {
  clearAll,
  clearConfig,
  deleteBill,
  getBills,
  importBills,
  restoreBill,
} from '../data/store.js'
import {
  deleteCategory,
  deleteExpense,
  deleteInvestment,
  deleteRevenue,
  getExpenses,
} from '../data/expenses-store.js'

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

export async function handleClearAll() {
  const previousBills = [...getBills()]
  if (!previousBills.length) return
  const confirmed = await confirmAction({
    title: 'Vider les factures ?',
    message: `${previousBills.length} facture(s) seront supprimées. Exportez une sauvegarde si vous voulez les conserver.`,
    confirmLabel: 'Tout supprimer',
    danger: true,
  })
  if (!confirmed) return
  clearAll()
  toast('Factures vidées.', {
    type: 'info',
    actionLabel: 'Annuler',
    onAction: () => importBills(previousBills, { mode: 'merge' }),
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
    title: 'Déconnecter le partage ?',
    message: 'Les données resteront sur cet appareil, mais ne seront plus partagées.',
    confirmLabel: 'Déconnecter',
    danger: true,
  })
  if (!confirmed) return
  clearConfig()
  toast('Partage déconnecté — les données restent locales.', { type: 'info' })
}
