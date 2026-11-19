/* ------------------------------------------------------------------ */
/* Dépenses — barre de filtres (recherche, catégories, type)           */
/* ------------------------------------------------------------------ */

import { esc } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { getBills } from '../../data/store.js'
import * as expStore from '../../data/expenses-store.js'
import { BILLS_CATEGORY, BILLS_CATEGORY_ID, state } from './state.js'

const BILL_STATUS = { PENDING: 'pending', PAID: 'paid' }

/** Factures qui comptent : un montant saisi (les tickets vides ne pèsent pas). */
function billsWithAmount() {
  return getBills().filter((bill) => bill.amount !== null && bill.amount > 0)
}

export function categoryTabsHtml() {
  const { categories, expenses } = expStore.getExpenses()
  const bills = billsWithAmount()

  const tabs = [
    { value: 'all', label: 'Toutes', count: expenses.length },
    ...categories.map((c) => ({
      value: c.id,
      label: c.label,
      count: expenses.filter((e) => e.categoryId === c.id).length,
    })),
    /* Catégorie virtuelle « Factures » : les factures du shop comptées dans
       les dépenses. Le compteur donne les factures avec montant, puis les
       payées. La sélectionner affiche leurs cartes ici même. */
    bills.length
      ? {
          value: BILLS_CATEGORY_ID,
          label: BILLS_CATEGORY.label,
          count: `${bills.length} · ${bills.filter((b) => b.status === BILL_STATUS.PAID).length}`,
        }
      : null,
  ].filter(Boolean)

  return tabs
    .map((tab) => {
      const isBills = tab.value === BILLS_CATEGORY_ID
      return `
      <button type="button" class="tabchip${state.categoryFilter === tab.value ? ' is-active' : ''}" role="tab"
              data-action="set-expense-category" data-value="${esc(tab.value)}"
              aria-selected="${state.categoryFilter === tab.value ? 'true' : 'false'}">
        ${isBills ? `<span class="chip-icon">${icon(BILLS_CATEGORY.icon, 14)}</span>` : ''}${esc(tab.label)}<span class="tabchip-count">${tab.count}</span>
      </button>`
    })
    .join('')
}

export function typeTabsHtml() {
  const { expenses } = expStore.getExpenses()
  const tabs = [
    { value: 'all', label: 'Toutes', count: expenses.length },
    { value: 'regular', label: 'Régulières', count: expenses.filter((e) => !e.isTransfer).length },
    { value: 'transfer', label: 'Transferts', count: expenses.filter((e) => e.isTransfer).length },
  ]
  return tabs
    .map(
      (tab) => `
      <button type="button" class="tabchip ${state.typeFilter === tab.value ? 'is-active' : ''}" role="tab"
              data-action="set-expense-type" data-value="${tab.value}"
              aria-selected="${state.typeFilter === tab.value ? 'true' : 'false'}">
        ${esc(tab.label)}<span class="tabchip-count">${tab.count}</span>
      </button>`,
    )
    .join('')
}

export function billsStatusTabsHtml() {
  const bills = billsWithAmount()
  const counts = {
    all: bills.length,
    [BILL_STATUS.PENDING]: bills.filter((b) => b.status === BILL_STATUS.PENDING).length,
    [BILL_STATUS.PAID]: bills.filter((b) => b.status === BILL_STATUS.PAID).length,
  }
  const STATUS_TABS = [
    { value: 'all', label: 'Toutes' },
    { value: BILL_STATUS.PENDING, label: 'En attente' },
    { value: BILL_STATUS.PAID, label: 'Payées' },
  ]
  return STATUS_TABS
    .map(
      (tab) => `
      <button type="button" class="tabchip ${state.billsStatusFilter === tab.value ? 'is-active' : ''}" role="tab"
              data-action="set-bills-status-filter" data-value="${esc(tab.value)}"
              aria-selected="${state.billsStatusFilter === tab.value ? 'true' : 'false'}">
        ${esc(tab.label)}<span class="tabchip-count">${counts[tab.value] || 0}</span>
      </button>`,
    )
    .join('')
}

export function filterbar() {
  return `
    <div class="filterbar" data-role="filterbar">
      <div class="filterbar-search">
        <label class="input-wrap" for="expenses-search">
          ${icon('search', 16)}
          <input id="expenses-search" type="search" autocomplete="off" enterkeyhint="search"
                 placeholder="Rechercher catégorie, note…"
                 value="${esc(state.query)}" aria-label="Rechercher dans les dépenses">
        </label>
        <button type="button" class="filterbar-clear" data-action="clear-expenses-search"
                aria-label="Effacer la recherche" title="Effacer" ${state.query ? '' : 'hidden'}>
          ${icon('x', 16)}
        </button>
      </div>
      <div class="filterbar-tabs" data-role="expense-category-tabs" role="tablist" aria-label="Catégorie">
        ${categoryTabsHtml()}
      </div>
      ${state.categoryFilter === BILLS_CATEGORY_ID ? `
      <div class="filterbar-tabs" data-role="expense-bills-status-tabs" role="tablist" aria-label="Statut">
        ${billsStatusTabsHtml()}
      </div>` : ''}
      <div class="filterbar-tabs" data-role="expense-type-tabs" role="tablist" aria-label="Type">
        ${typeTabsHtml()}
      </div>
    </div>`
}
