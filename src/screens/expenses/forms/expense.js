/* ------------------------------------------------------------------ */
/* Formulaire Dépense                                                  */
/*                                                                     */
/* Une dépense ne touche jamais un investissement : on choisit une      */
/* catégorie, on complète le montant et la date, c'est tout. Le mode    */
/* « transfert » n'apparaît que lorsqu'on part d'un investissement      */
/* (bouton « Transférer ») ou qu'on modifie un transfert existant.      */
/* ------------------------------------------------------------------ */

import { esc, toNumber } from '../../../core/utils.js'
import { icon } from '../../../ui/icons.js'
import { confirmAction, toast } from '../../../core/feedback.js'
import { closeDialog } from '../../../ui/dialog.js'
import * as expStore from '../../../data/expenses-store.js'
import {
  categoryChoiceField,
  categoryPickerField,
  inputField,
  investmentOptions,
  selectField,
  textareaField,
} from './fields.js'

/**
 * @param {object|null} expense dépense à modifier, ou `null` pour créer
 * @param {object} prefill valeurs de départ (ex. transfert depuis un investissement)
 */
export function openExpenseForm(expense = null, prefill = {}) {
  const { categories, investments, settings } = expStore.getExpenses()
  const isEdit = Boolean(expense)
  const title = isEdit ? 'Modifier la dépense' : 'Nouvelle dépense'

  const invOpts = investmentOptions(investments, settings)

  const initialCategory = expense?.categoryId || prefill.categoryId || categories[0]?.id || ''

  /* La catégorie peut avoir été choisie sur l'écran, avant la boîte : dans
     ce cas on ne redemande pas, on rappelle le choix. Si la catégorie a
     disparu entre-temps, on retombe sur la grille complète. */
  const presetCategory =
    !isEdit && prefill.categoryId && categories.some((cat) => cat.id === prefill.categoryId)
      ? prefill.categoryId
      : ''
  const initialAmount = expense && expense.amount !== null ? expense.amount : ''
  const initialDate = expense?.date || new Date().toISOString().slice(0, 10)
  const initialNote = expense?.note || ''
  const initialLinkedInv = expense?.linkedInvestmentId || prefill.linkedInvestmentId || ''

  /* Le bloc investissement est réservé aux transferts explicites. */
  const isTransferForm = Boolean(expense?.isTransfer || prefill.isTransfer) && invOpts.length > 0

  const categoryField = presetCategory
    ? categoryChoiceField(categories, presetCategory, {
        hint: 'Montant et date suffisent. « Changer » ouvre les autres catégories.',
      })
    : categoryPickerField(categories, initialCategory, {
        hint: 'Touchez une catégorie, puis indiquez le montant et la date.',
      })

  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--form'
  dialog.innerHTML = `
    <form method="dialog" id="expense-form">
      <div class="dialog-body u-stack">
        <h2>${icon(isEdit ? 'edit' : 'plus', 18)} ${esc(title)}</h2>

        ${categoryField}

        ${inputField('Montant', 'amount', 'text', initialAmount, {
          required: true,
          placeholder: '0,00',
          inputmode: 'decimal',
          hint: `En ${settings.currency}`,
        })}

        ${inputField('Date', 'date', 'date', initialDate, { required: true })}

        ${
          isTransferForm
            ? `
        <input type="hidden" name="isTransfer" value="true">
        ${selectField('Investissement lié', 'linkedInvestmentId', invOpts, initialLinkedInv, {
          required: true,
          hint: "Le montant sera déduit du reste à récupérer de cet investissement.",
        })}
        `
            : `<input type="hidden" name="isTransfer" value="false">`
        }

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

  /* Le choix rappelé peut être rouvert : « Changer » révèle la grille. */
  const picker = form.querySelector('.cat-picker')
  const chosen = form.querySelector('[data-role="cat-chosen"]')
  form.querySelector('[data-role="cat-change"]')?.addEventListener('click', () => {
    if (!picker) return
    picker.hidden = false
    if (chosen) chosen.hidden = true
    picker.querySelector('input:checked')?.focus()
  })
  picker?.addEventListener('change', (event) => {
    const cat = categories.find((item) => item.id === event.target.value)
    if (!cat || !chosen) return
    chosen.style.setProperty('--cat-color', cat.color || '#757575')
    const label = chosen.querySelector('[data-role="cat-chosen-label"]')
    if (label) label.textContent = cat.label
    const badge = chosen.querySelector('.cat-box-icon')
    if (badge) badge.innerHTML = icon(cat.icon || 'tag', 15)
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const categoryId = data.get('categoryId')
    const amount = toNumber(data.get('amount'))
    const date = data.get('date')
    const note = data.get('note') || ''
    const isTransfer = isTransferForm && data.get('isTransfer') === 'true'
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
