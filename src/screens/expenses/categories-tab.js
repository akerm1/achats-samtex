/* ------------------------------------------------------------------ */
/* Dépenses — onglet « Catégories » (liste, réorganisation par glisser) */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import * as expStore from '../../data/expenses-store.js'
import { state } from './state.js'

export function categoriesHtml() {
  const { categories, expenses, settings } = expStore.getExpenses()

  return `
    <div class="ana-toolbar">
      <button type="button" class="btn btn--primary btn--sm" data-action="open-category-form">${icon('plus', 14)} Nouvelle catégorie</button>
      <button type="button" class="btn btn--secondary btn--sm" data-action="toggle-reorder-categories">${icon(state.reorderMode ? 'grip' : 'list', 14)} ${state.reorderMode ? 'Terminer' : 'Réorganiser'}</button>
    </div>
    <div class="category-list" data-role="category-list" ${state.reorderMode ? 'data-reorder="true"' : ''}>
      ${categories
        .map((cat) => {
          const catExpenses = expenses.filter((e) => e.categoryId === cat.id)
          const count = catExpenses.length
          const total = catExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
          return `
            <article class="category-card ${cat.isDefault ? 'is-default' : ''}" data-id="${esc(cat.id)}" draggable="${state.reorderMode && !cat.isDefault}">
              <div class="category-color" style="background: ${cat.color}">${icon(cat.icon, 20)}</div>
              <div class="category-info">
                <div class="category-name-row">
                  <strong>${esc(cat.label)}</strong>
                  ${cat.isDefault ? '<span class="badge badge--blue">Par défaut</span>' : ''}
                </div>
                <div class="category-stats">${count} dépense${count > 1 ? 's' : ''} · ${formatMoney(total, settings.currency)}</div>
              </div>
              <div class="category-actions">
                ${!cat.isDefault ? `
                  <button type="button" class="icon-btn icon-btn--plain" data-action="edit-category" data-id="${esc(cat.id)}" aria-label="Modifier" title="Modifier">${icon('edit', 14)}</button>
                  <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="delete-category" data-id="${esc(cat.id)}" aria-label="Supprimer" title="Supprimer">${icon('trash', 14)}</button>
                ` : ''}
                ${state.reorderMode && !cat.isDefault ? `<span class="drag-handle" aria-label="Déplacer">${icon('grip', 16)}</span>` : ''}
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
