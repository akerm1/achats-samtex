/* ------------------------------------------------------------------ */
/* Formulaire « Saisie rapide » — toutes les recettes du jour          */
/* ------------------------------------------------------------------ */

import { escAttr, formatMoney, toNumber } from '../../../core/utils.js'
import { icon } from '../../../ui/icons.js'
import { toast } from '../../../core/feedback.js'
import { closeDialog } from '../../../ui/dialog.js'
import * as expModel from '../../../data/expenses-model.js'
import * as expStore from '../../../data/expenses-store.js'

export function openRevenueQuickForm() {
  const { revenues, settings } = expStore.getExpenses()
  const today = new Date().toISOString().slice(0, 10)
  const existing = revenues.filter((r) => r.date === today)

  const row = (amount, note, index, isExisting) => `
    <div class="quick-entry" data-index="${index}" data-existing="${isExisting}">
      <input class="input" type="text" inputmode="decimal" name="amount_${index}" value="${escAttr(amount)}" placeholder="Montant" aria-label="Montant">
      <input class="input" type="text" name="note_${index}" value="${escAttr(note)}" placeholder="Note (client, type…)" aria-label="Note">
      <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="remove-quick-entry" data-index="${index}" aria-label="Supprimer cette ligne">${icon('trash', 14)}</button>
    </div>`

  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--form dialog--lg'
  dialog.innerHTML = `
    <form method="dialog" id="revenue-quick-form">
      <div class="dialog-body u-stack">
        <h2>${icon('zap', 18)} Saisie rapide — ${today}</h2>
        <p class="u-muted">Ajoutez plusieurs recettes pour la journée. Une ligne par entrée.</p>

        <div id="quick-entries" class="u-stack">
          ${existing.length ? existing.map((r, i) => row(r.amount, r.note, i, true)).join('') : row('', '', 0, false)}
        </div>

        <button type="button" class="btn btn--secondary btn--sm" data-action="add-quick-entry">${icon('plus', 13)} Ajouter une ligne</button>

        <div class="quick-total">
          <span>Total du jour :</span>
          <strong id="quick-total" class="text-success">${formatMoney(expModel.totalRevenues(revenues, { startDate: today, endDate: today }), settings.currency)}</strong>
        </div>
      </div>

      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>${icon('x', 13)} Annuler</button>
        <button type="submit" class="btn btn--primary">${icon('save', 13)} Enregistrer tout</button>
      </div>
    </form>`
  dialog.addEventListener('close', () => dialog.remove())

  const form = dialog.querySelector('#revenue-quick-form')
  const entries = form.querySelector('#quick-entries')
  const totalEl = form.querySelector('#quick-total')

  const recalcTotal = () => {
    let total = 0
    form.querySelectorAll('[name^="amount_"]').forEach((input) => {
      const value = toNumber(input.value)
      if (value !== null) total += value
    })
    totalEl.textContent = formatMoney(total, settings.currency)
  }

  entries.addEventListener('input', (event) => {
    if (event.target.name.startsWith('amount_')) recalcTotal()
  })

  form.querySelector('[data-action="add-quick-entry"]')?.addEventListener('click', () => {
    entries.insertAdjacentHTML('beforeend', row('', '', Date.now(), false))
    recalcTotal()
  })

  entries.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="remove-quick-entry"]')
    if (!btn) return
    const entry = btn.closest('.quick-entry')
    /* La dernière ligne n'est pas supprimée : elle est vidée, pour garder
       au moins un champ à remplir. */
    if (entries.querySelectorAll('.quick-entry').length > 1) entry.remove()
    else entry.querySelectorAll('input').forEach((input) => (input.value = ''))
    recalcTotal()
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const collected = []
    form.querySelectorAll('.quick-entry').forEach((entry) => {
      const amount = toNumber(entry.querySelector('[name^="amount_"]')?.value)
      const note = entry.querySelector('[name^="note_"]')?.value || ''
      if (amount !== null && amount > 0) collected.push({ amount, note })
    })

    if (!collected.length) return toast('Ajoutez au moins une recette.', { type: 'error' })

    try {
      /* La saisie rapide remplace les recettes du jour : on efface, puis on
         réécrit ce que le formulaire contient. */
      revenues
        .filter((r) => r.date === today)
        .forEach((r) => expStore.deleteRevenue(r.id))
      collected.forEach((entry) => expStore.addRevenue({ date: today, amount: entry.amount, note: entry.note }))
      toast(`${collected.length} recette(s) enregistrée(s) pour ${today}.`, { type: 'ok' })
      closeDialog(dialog)
    } catch (error) {
      toast(error.message || 'Erreur.', { type: 'error' })
    }
  })

  form.querySelector('[data-close]')?.addEventListener('click', () => closeDialog(dialog))
  document.body.appendChild(dialog)
  dialog.showModal()
  form.querySelector('input[name^="amount_"]')?.focus()
}
