/* ------------------------------------------------------------------ */
/* Dépenses — onglet « Catégories » (liste, réorganisation par glisser) */
/*                                                                     */
/* Toutes les catégories se modifient et se suppriment, y compris les  */
/* six catégories livrées par défaut : le shop est libre de renommer   */
/* « Loyer » ou de retirer « Gaz » s'il ne s'en sert pas.              */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { CARD_LIST_LAYOUTS, toolbarHtml } from '../../ui/toolbar.js'
import * as expStore from '../../data/expenses-store.js'
import { state } from './state.js'

const SORT_OPTIONS = [
  { value: 'order', label: 'Ordre d’affichage' },
  { value: 'name', label: 'Nom (A → Z)' },
  { value: 'amount', label: 'Montant dépensé' },
]

function sortedCategories(categories, totals) {
  const sorted = [...categories]
  if (state.sort.categories === 'name') {
    return sorted.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }
  if (state.sort.categories === 'amount') {
    return sorted.sort((a, b) => (totals.get(b.id) || 0) - (totals.get(a.id) || 0) || a.label.localeCompare(b.label, 'fr'))
  }
  return sorted.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.label.localeCompare(b.label, 'fr'))
}

export function controls() {
  return `
    <div class="section-actions">
      <button type="button" class="btn btn--primary btn--sm" data-action="open-category-form">${icon('plus', 14)} Nouvelle catégorie</button>
      <button type="button" class="btn btn--secondary btn--sm" data-action="toggle-reorder-categories">${icon(state.reorderMode ? 'grip' : 'list', 14)} ${state.reorderMode ? 'Terminer' : 'Réorganiser'}</button>
    </div>
    ${toolbarHtml({
      id: 'categories-sort',
      prefix: 'set-categories',
      sort: state.sort.categories,
      sortOptions: SORT_OPTIONS,
      layout: state.layout.categories,
      layouts: CARD_LIST_LAYOUTS,
    })}`
}

export function categoriesHtml() {
  const { categories, expenses, settings } = expStore.getExpenses()

  const totals = new Map()
  for (const exp of expenses) {
    totals.set(exp.categoryId, (totals.get(exp.categoryId) || 0) + (exp.amount || 0))
  }
  const ordered = sortedCategories(categories, totals)

  return `
    <div class="category-list ${state.layout.categories === 'list' ? 'is-list' : ''}" data-role="category-list" ${state.reorderMode ? 'data-reorder="true"' : ''}>
      ${ordered
        .map((cat) => {
          const catExpenses = expenses.filter((e) => e.categoryId === cat.id)
          const count = catExpenses.length
          const total = totals.get(cat.id) || 0
          return `
            <article class="category-card ${cat.isDefault ? 'is-default' : ''}" data-id="${esc(cat.id)}" draggable="${state.reorderMode}">
              <div class="category-color" style="background: ${cat.color}">${icon(cat.icon, 20)}</div>
              <div class="category-info">
                <div class="category-name-row">
                  <strong>${esc(cat.label)}</strong>
                  ${cat.isDefault ? '<span class="badge badge--blue">Par défaut</span>' : ''}
                </div>
                <div class="category-stats">${count} dépense${count > 1 ? 's' : ''} · ${formatMoney(total, settings.currency)}</div>
              </div>
              <div class="category-actions">
                <button type="button" class="icon-btn icon-btn--plain" data-action="edit-category" data-id="${esc(cat.id)}" aria-label="Modifier" title="Modifier">${icon('edit', 14)}</button>
                <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="delete-category" data-id="${esc(cat.id)}" aria-label="Supprimer" title="Supprimer">${icon('trash', 14)}</button>
                ${state.reorderMode ? `<span class="drag-handle" aria-label="Déplacer">${icon('grip', 16)}</span>` : ''}
              </div>
            </article>`
        })
        .join('')}
    </div>`
}

/** Rend les cartes déplaçables quand le mode « Réorganiser » est actif. */
export function bindCategoryReorder(host) {
  const list = host.querySelector('[data-role="category-list"]')
  if (!list) return

  const getDragAfterElement = (container, y) => {
    const others = [...container.querySelectorAll('.category-card:not(.dragging)')]
    return others.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect()
        const offset = y - box.top - box.height / 2
        if (offset < 0 && offset > closest.offset) return { offset, element: child }
        return closest
      },
      { offset: Number.NEGATIVE_INFINITY, element: null },
    ).element
  }

  list.querySelectorAll('.category-card').forEach((card) => {
    card.addEventListener('dragstart', () => {
      card.classList.add('dragging')
    })
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging')
    })
    card.addEventListener('dragover', (event) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const after = getDragAfterElement(list, event.clientY)
      const dragging = list.querySelector('.dragging')
      if (!dragging) return
      if (after == null) list.appendChild(dragging)
      else list.insertBefore(dragging, after)
    })
  })
}

/** Enregistre l'ordre affiché des catégories. */
export function saveCategoryOrder(host) {
  const list = host.querySelector('[data-role="category-list"]')
  if (!list) return
  const orderedIds = [...list.querySelectorAll('.category-card')].map((card) => card.dataset.id)
  expStore.reorderCategories(orderedIds)
}
