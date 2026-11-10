/* ------------------------------------------------------------------ */
/* Formulaire Recette (une entrée datée)                               */
/* ------------------------------------------------------------------ */

import { esc, toNumber } from '../../../core/utils.js'
import { icon } from '../../../ui/icons.js'
import { confirmAction, toast } from '../../../core/feedback.js'
import { closeDialog } from '../../../ui/dialog.js'
import * as expStore from '../../../data/expenses-store.js'
import { inputField, textareaField } from './fields.js'

export function openRevenueForm(revenue = null) {
  const { settings } = expStore.getExpenses()
  const isEdit = Boolean(revenue)
  const title = isEdit ? 'Modifier la recette' : 'Nouvelle recette'

  const initialDate = revenue?.date || new Date().toISOString().slice(0, 10)
  const initialAmount = revenue?.amount !== undefined ? revenue.amount : ''
  const initialNote = revenue?.note || ''

  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--form'
  dialog.innerHTML = `
    <form method="dialog" id="revenue-form">
      <div class="dialog-body u-stack">
        <h2>${icon(isEdit ? 'edit' : 'plus', 18)} ${esc(title)}</h2>

        ${inputField('Date', 'date', 'date', initialDate, { required: true })}

        ${inputField('Montant', 'amount', 'text', initialAmount, {
          required: true,
          placeholder: '0,00',
          inputmode: 'decimal',
          hint: `En ${settings.currency}`,
        })}

        ${textareaField('Note (facultatif)', 'note', initialNote, { placeholder: 'Client, type de vente, référence…' })}
      </div>

      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>${icon('x', 13)} Annuler</button>
        ${isEdit ? `<button type="button" class="btn btn--danger btn--sm" data-action="delete-revenue-form" data-id="${esc(revenue.id)}">${icon('trash', 13)} Supprimer</button>` : ''}
        <button type="submit" class="btn btn--primary">${icon('save', 13)} ${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>`
  dialog.addEventListener('close', () => dialog.remove())

  const form = dialog.querySelector('#revenue-form')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const date = data.get('date')
    const amount = toNumber(data.get('amount'))
    const note = data.get('note') || ''

    if (!date) return toast('Choisissez une date.', { type: 'error' })
    if (amount === null) return toast('Montant invalide.', { type: 'error' })

    const payload = { date, amount, note }

    try {
      if (isEdit) {
        expStore.updateRevenue(revenue.id, payload)
        toast('Recette modifiée.', { type: 'ok' })
      } else {
        expStore.addRevenue(payload)
        toast('Recette ajoutée.', { type: 'ok' })
      }
      closeDialog(dialog)
    } catch (error) {
      toast(error.message || 'Erreur.', { type: 'error' })
    }
  })

  form.querySelector('[data-action="delete-revenue-form"]')?.addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Supprimer cette recette ?',
      message: 'Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!confirmed) return
    expStore.deleteRevenue(revenue.id)
    toast('Recette supprimée.', { type: 'info' })
    closeDialog(dialog)
  })

  form.querySelector('[data-close]')?.addEventListener('click', () => closeDialog(dialog))
  document.body.appendChild(dialog)
  dialog.showModal()
  form.querySelector('input[name="date"]')?.focus()
}
