/* ------------------------------------------------------------------ */
/* Dépenses — barre de filtres (recherche, catégories, type)           */
/* ------------------------------------------------------------------ */

import { esc } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import * as expStore from '../../data/expenses-store.js'
import { state } from './state.js'

export function categoryTabsHtml() {
  const { categories, expenses } = expStore.getExpenses()
  const tabs = [
    { value: 'all', label: 'Toutes', count: expenses.length },
    ...categories.map((c) => ({
      value: c.id,
      label: c.label,
      count: expenses.filter((e) => e.categoryId === c.id).length,
    })),
  ]
  return tabs
    .map(
      (tab) => `
      <button type="button" class="tabchip ${state.categoryFilter === tab.value ? 'is-active' : ''}" role="tab"
              data-action="set-expense-category" data-value="${tab.value}"
              aria-selected="${state.categoryFilter === tab.value ? 'true' : 'false'}">
        ${esc(tab.label)}<span class="tabchip-count">${tab.count}</span>
      </button>`,
    )
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
      <div class="filterbar-tabs" data-role="expense-type-tabs" role="tablist" aria-label="Type">
        ${typeTabsHtml()}
      </div>
    </div>`
}
