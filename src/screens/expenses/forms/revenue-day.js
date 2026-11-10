/* ------------------------------------------------------------------ */
/* Formulaire « Recettes du jour » — détail d'une journée               */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../../core/utils.js'
import { icon } from '../../../ui/icons.js'
import { confirmAction, toast } from '../../../core/feedback.js'
import { closeDialog } from '../../../ui/dialog.js'
import * as expStore from '../../../data/expenses-store.js'
import { openRevenueForm } from './revenue.js'

export function openRevenueDayForm(date) {
  const { revenues, settings } = expStore.getExpenses()
  const dayRevenues = revenues
    .filter((r) => r.date === date)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--form dialog--lg'
  dialog.innerHTML = `
    <form method="dialog" id="revenue-day-form">
      <div class="dialog-body u-stack">
        <h2>${icon('list', 18)} Recettes du ${esc(date)}</h2>

        <div id="day-entries" class="u-stack">
          ${
            dayRevenues.length
              ? dayRevenues.map((r) => dayEntryRow(r, settings)).join('')
              : '<p class="u-muted">Aucune recette pour ce jour.</p>'
          }
        </div>

        <button type="button" class="btn btn--secondary btn--sm" data-action="add-day-entry">${icon('plus', 13)} Ajouter une recette</button>

        <div class="quick-total">
          <span>Total du jour :</span>
          <strong class="text-success">${formatMoney(dayRevenues.reduce((sum, r) => sum + (r.amount || 0), 0), settings.currency)}</strong>
        </div>
      </div>

      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>${icon('x', 13)} Fermer</button>
      </div>
    </form>`
  dialog.addEventListener('close', () => dialog.remove())

  const form = dialog.querySelector('#revenue-day-form')
  const entries = form.querySelector('#day-entries')

  form.querySelector('[data-action="add-day-entry"]')?.addEventListener('click', () => {
    closeDialog(dialog)
    openRevenueForm({ date })
  })

  entries.addEventListener('click', (event) => {
    const editBtn = event.target.closest('[data-action="edit-revenue"]')
    if (editBtn) {
      const revenue = revenues.find((r) => r.id === editBtn.dataset.id)
      if (revenue) {
        closeDialog(dialog)
        openRevenueForm(revenue)
      }
    }

    const deleteBtn = event.target.closest('[data-action="delete-revenue"]')
    if (!deleteBtn) return
    const revenue = revenues.find((r) => r.id === deleteBtn.dataset.id)
    if (!revenue) return
    confirmAction({
      title: 'Supprimer cette recette ?',
      message: 'Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return
      expStore.deleteRevenue(revenue.id)
      toast('Recette supprimée.', { type: 'info' })
      /* La boîte est reconstruite : elle doit montrer la liste à jour. */
      closeDialog(dialog)
      openRevenueDayForm(date)
    })
  })

  form.querySelector('[data-close]')?.addEventListener('click', () => closeDialog(dialog))
  document.body.appendChild(dialog)
  dialog.showModal()
}

function dayEntryRow(revenue, settings) {
  return `
    <div class="day-entry" data-id="${esc(revenue.id)}">
      <div class="day-entry-main">
        <span class="day-entry-amount">${formatMoney(revenue.amount, settings.currency)}</span>
        <span class="day-entry-note">${esc(revenue.note) || '—'}</span>
      </div>
      <div class="day-entry-actions">
        <button type="button" class="icon-btn icon-btn--plain" data-action="edit-revenue" data-id="${esc(revenue.id)}" aria-label="Modifier">${icon('edit', 14)}</button>
        <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="delete-revenue" data-id="${esc(revenue.id)}" aria-label="Supprimer">${icon('trash', 14)}</button>
      </div>
    </div>`
}
