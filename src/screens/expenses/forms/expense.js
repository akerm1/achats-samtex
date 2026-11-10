/* ------------------------------------------------------------------ */
/* Formulaire Dépense                                                  */
/* ------------------------------------------------------------------ */

import { esc, toNumber } from '../../../core/utils.js'
import { icon } from '../../../ui/icons.js'
import { confirmAction, toast } from '../../../core/feedback.js'
import { closeDialog } from '../../../ui/dialog.js'
import * as expStore from '../../../data/expenses-store.js'
import { categoryOptions, field, inputField, investmentOptions, selectField, textareaField } from './fields.js'

/**
 * @param {object|null} expense dépense à modifier, ou `null` pour créer
 * @param {object} prefill valeurs de départ (ex. transfert depuis un investissement)
 */
export function openExpenseForm(expense = null, prefill = {}) {
  const { categories, investments, settings } = expStore.getExpenses()
  const isEdit = Boolean(expense)
  const title = isEdit ? 'Modifier la dépense' : 'Nouvelle dépense'

  const catOpts = categoryOptions(categories)
  const invOpts = investmentOptions(investments, settings)

  const initialCategory = expense?.categoryId || prefill.categoryId || categories[0]?.id || ''
  const initialAmount = expense && expense.amount !== null ? expense.amount : ''
  const initialDate = expense?.date || new Date().toISOString().slice(0, 10)
  const initialNote = expense?.note || ''
  const initialIsTransfer = expense?.isTransfer || Boolean(prefill.isTransfer)
  const initialLinkedInv = expense?.linkedInvestmentId || prefill.linkedInvestmentId || ''

  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--form'
  dialog.innerHTML = `
    <form method="dialog" id="expense-form">
      <div class="dialog-body u-stack">
        <h2>${icon(isEdit ? 'edit' : 'plus', 18)} ${esc(title)}</h2>

        ${selectField('Catégorie', 'categoryId', catOpts, initialCategory, { required: true })}

        ${inputField('Montant', 'amount', 'text', initialAmount, {
          required: true,
          placeholder: '0,00',
          inputmode: 'decimal',
          hint: `En ${settings.currency}`,
        })}

        ${inputField('Date', 'date', 'date', initialDate, { required: true })}

        ${field(
          'Type',
          `
          <div class="segmented" role="group" aria-label="Type de dépense">
            <label class="${!initialIsTransfer ? 'is-active' : ''}">
              <input type="radio" name="isTransfer" value="false" ${!initialIsTransfer ? 'checked' : ''} ${invOpts.length === 0 ? 'disabled' : ''}>
              <span>Régulière</span>
            </label>
            <label class="${initialIsTransfer ? 'is-active' : ''}" ${invOpts.length === 0 ? 'style="opacity:0.5;pointer-events:none"' : ''}>
              <input type="radio" name="isTransfer" value="true" ${initialIsTransfer ? 'checked' : ''} ${invOpts.length === 0 ? 'disabled' : ''}>
              <span>${icon('send', 12)} Transfert vers investissement</span>
            </label>
          </div>
        `,
          { hint: "Un transfert déduit automatiquement le montant de l'investissement lié." },
        )}

        <div id="transfer-fields" class="u-stack" ${initialIsTransfer ? '' : 'hidden'}>
          ${selectField('Investissement lié', 'linkedInvestmentId', invOpts, initialLinkedInv, {
            required: true,
            hint: "Choisissez l'investissement qui recevra ce transfert.",
          })}
          ${invOpts.length === 0 ? `<p class="field-hint text-warning">${icon('alert', 12)} Aucun investissement existant. Créez-en un d'abord dans l'onglet Investissements.</p>` : ''}
        </div>

        ${textareaField('Note (facultatif)', 'note', initialNote, { placeholder: 'Détails, fournisseur, référence…' })}
      </div>

      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>${icon('x', 13)} Annuler</button>
        ${isEdit ? `<button type="button" class="btn btn--danger btn--sm" data-action="delete-expense-form" data-id="${esc(expense.id)}">${icon('trash', 13)} Supprimer</button>` : ''}
        <button type="submit" class="btn btn--primary">${icon('save', 13)} ${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>`
  dialog.addEventListener('close', () => dialog.remove())

  const form = dialog.querySelector('#expense-form')

  /* Le bloc « investissement lié » n'apparaît que pour un transfert. */
  const transferFields = form.querySelector('#transfer-fields')
  form.querySelectorAll('input[name="isTransfer"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      transferFields.hidden = radio.value === 'false'
    })
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const categoryId = data.get('categoryId')
    const amount = toNumber(data.get('amount'))
    const date = data.get('date')
    const note = data.get('note') || ''
    const isTransfer = data.get('isTransfer') === 'true'
    const linkedInvestmentId = isTransfer ? data.get('linkedInvestmentId') : null

    if (!categoryId) return toast('Choisissez une catégorie.', { type: 'error' })
    if (amount === null) return toast('Montant invalide.', { type: 'error' })
    if (!date) return toast('Choisissez une date.', { type: 'error' })
    if (isTransfer && !linkedInvestmentId) return toast('Choisissez un investissement pour le transfert.', { type: 'error' })

    const payload = { categoryId, amount, date, note, isTransfer, linkedInvestmentId }

    try {
      if (isEdit) {
        expStore.updateExpense(expense.id, payload)
        toast('Dépense modifiée.', { type: 'ok' })
      } else {
        expStore.addExpense(payload)
        toast('Dépense ajoutée.', { type: 'ok' })
      }
      closeDialog(dialog)
    } catch (error) {
      toast(error.message || "Erreur lors de l'enregistrement.", { type: 'error' })
    }
  })

  form.querySelector('[data-action="delete-expense-form"]')?.addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Supprimer cette dépense ?',
      message: 'Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!confirmed) return
    expStore.deleteExpense(expense.id)
    toast('Dépense supprimée.', { type: 'info' })
    closeDialog(dialog)
  })

  form.querySelector('[data-close]')?.addEventListener('click', () => closeDialog(dialog))
  document.body.appendChild(dialog)
  dialog.showModal()
  form.querySelector('input[name="amount"]')?.focus()
}
