/* ------------------------------------------------------------------ */
/* Formulaire Investissement                                           */
/* ------------------------------------------------------------------ */

import { esc, toNumber } from '../../../core/utils.js'
import { icon } from '../../../ui/icons.js'
import { confirmAction, toast } from '../../../core/feedback.js'
import { closeDialog } from '../../../ui/dialog.js'
import * as expStore from '../../../data/expenses-store.js'
import { inputField, textareaField } from './fields.js'

export function openInvestmentForm(investment = null) {
  const isEdit = Boolean(investment)
  const title = isEdit ? "Modifier l'investissement" : 'Nouvel investissement'

  const initialName = investment?.name || ''
  const initialAmount = investment?.amount !== undefined ? investment.amount : ''
  const initialRemaining = investment?.remaining !== undefined ? investment.remaining : ''
  const initialNote = investment?.note || ''

  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--form'
  dialog.innerHTML = `
    <form method="dialog" id="investment-form">
      <div class="dialog-body u-stack">
        <h2>${icon(isEdit ? 'edit' : 'plus', 18)} ${esc(title)}</h2>

        ${inputField('Nom', 'name', 'text', initialName, { required: true, placeholder: 'Ex: Stock initial, Rénovation local…' })}

        ${inputField('Montant total', 'amount', 'text', initialAmount, {
          required: true,
          placeholder: '0,00',
          inputmode: 'decimal',
          hint: 'Somme initialement investie.',
        })}

        ${inputField('Montant restant', 'remaining', 'text', initialRemaining || initialAmount, {
          required: true,
          placeholder: '0,00',
          inputmode: 'decimal',
          hint: 'Ce qui reste à récupérer (déduit automatiquement par les transferts).',
        })}

        ${textareaField('Note (facultatif)', 'note', initialNote, { placeholder: 'Détails, date de début, objectif…' })}
      </div>

      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>${icon('x', 13)} Annuler</button>
        ${isEdit ? `<button type="button" class="btn btn--danger btn--sm" data-action="delete-investment-form" data-id="${esc(investment.id)}">${icon('trash', 13)} Supprimer</button>` : ''}
        <button type="submit" class="btn btn--primary">${icon('save', 13)} ${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>`
  dialog.addEventListener('close', () => dialog.remove())

  const form = dialog.querySelector('#investment-form')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const name = (data.get('name') || '').trim()
    const amount = toNumber(data.get('amount'))
    const remaining = toNumber(data.get('remaining'))
    const note = data.get('note') || ''

    if (!name) return toast('Nom requis.', { type: 'error' })
    if (amount === null) return toast('Montant total invalide.', { type: 'error' })
    if (remaining === null) return toast('Montant restant invalide.', { type: 'error' })

    const payload = { name, amount, remaining, note }

    try {
      if (isEdit) {
        expStore.updateInvestment(investment.id, payload)
        toast('Investissement modifié.', { type: 'ok' })
      } else {
        expStore.addInvestment(payload)
        toast('Investissement ajouté.', { type: 'ok' })
      }
      closeDialog(dialog)
    } catch (error) {
      toast(error.message || 'Erreur.', { type: 'error' })
    }
  })

  form.querySelector('[data-action="delete-investment-form"]')?.addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Supprimer cet investissement ?',
      message: 'Les transferts liés seront détachés mais conservés.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!confirmed) return
    expStore.deleteInvestment(investment.id)
    toast('Investissement supprimé.', { type: 'info' })
    closeDialog(dialog)
  })

  form.querySelector('[data-close]')?.addEventListener('click', () => closeDialog(dialog))
  document.body.appendChild(dialog)
  dialog.showModal()
  form.querySelector('input[name="name"]')?.focus()
}
