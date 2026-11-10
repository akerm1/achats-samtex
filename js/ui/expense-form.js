/* ------------------------------------------------------------------ */
/* Formulaires Dépenses — dépenses, catégories, investissements, recettes */
/* ------------------------------------------------------------------ */

import { $, esc, escAttr, formatMoney, toNumber } from '../core/utils.js'
import { icon } from './icons.js'
import { confirmAction, toast } from '../core/feedback.js'
import { openDialog, closeDialog } from '../view.js'
import * as expModel from '../../data/expenses.js'
import * as expStore from '../../data/expenses-store.js'

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

function field(label, input, { hint = '', error = '' } = {}) {
  return `
    <div class="field">
      <label>${esc(label)}</label>
      ${input}
      ${hint ? `<span class="field-hint">${hint}</span>` : ''}
      ${error ? `<span class="field-error">${esc(error)}</span>` : ''}
    </div>`
}

function selectField(label, name, options, value, { required = false, hint = '' } = {}) {
  return field(label, `
    <select class="select" name="${name}" ${required ? 'required' : ''}>
      ${options.map((opt) => `<option value="${escAttr(opt.value)}" ${opt.value === value ? 'selected' : ''}>${esc(opt.label)}</option>`).join('')}
    </select>
  `, { hint })
}

function inputField(label, name, type, value, { placeholder = '', required = false, hint = '', inputmode = '', autocomplete = 'off' } = {}) {
  return field(label, `
    <input class="input" type="${type}" name="${name}" value="${escAttr(value)}" placeholder="${escAttr(placeholder)}" ${required ? 'required' : ''} inputmode="${inputmode}" autocomplete="${autocomplete}">
  `, { hint })
}

function textareaField(label, name, value, { placeholder = '', hint = '' } = {}) {
  return field(label, `
    <textarea class="input" name="${name}" rows="3" placeholder="${escAttr(placeholder)}">${esc(value)}</textarea>
  `, { hint })
}

function categoryOptions(categories) {
  return categories.map((c) => ({ value: c.id, label: `${c.label}` }))
}

function investmentOptions(investments) {
  return investments.map((inv) => ({ value: inv.id, label: `${inv.name} (${formatMoney(inv.remaining)} restant)` }))
}

/* ------------------------------------------------------------------ */
/* Formulaire Dépense                                                   */
/* ------------------------------------------------------------------ */

export function openExpenseForm(expense = null) {
  const state = expStore.getExpenses()
  const { categories, investments, settings } = state
  const isEdit = Boolean(expense)
  const title = isEdit ? 'Modifier la dépense' : 'Nouvelle dépense'

  const catOpts = categoryOptions(categories)
  const invOpts = investmentOptions(investments)

  const initialCategory = expense?.categoryId || categories[0]?.id || ''
  const initialAmount = expense?.amount !== null ? expense.amount : ''
  const initialDate = expense?.date || new Date().toISOString().slice(0, 10)
  const initialNote = expense?.note || ''
  const initialIsTransfer = expense?.isTransfer || false
  const initialLinkedInv = expense?.linkedInvestmentId || ''

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

        ${field('Type', `
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
        `, { hint: 'Un transfert déduit automatiquement le montant de l\'investissement lié.' })}

        <div id="transfer-fields" class="u-stack" ${initialIsTransfer ? '' : 'hidden'}>
          ${selectField('Investissement lié', 'linkedInvestmentId', invOpts, initialLinkedInv, {
            required: true,
            hint: 'Choisissez l\'investissement qui recevra ce transfert.',
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

  // Toggle transfer fields
  const form = dialog.querySelector('#expense-form')
  const transferRadios = form.querySelectorAll('input[name="isTransfer"]')
  const transferFields = form.querySelector('#transfer-fields')
  transferRadios.forEach((radio) => {
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
      toast(error.message || 'Erreur lors de l\'enregistrement.', { type: 'error' })
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

/* ------------------------------------------------------------------ */
/* Formulaire Catégorie                                                 */
/* ------------------------------------------------------------------ */

export function openCategoryForm(category = null) {
  const state = expStore.getExpenses()
  const { categories } = state
  const isEdit = Boolean(category)
  const title = isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie'

  const icons = ['home', 'users', 'tool', 'flame', 'car', 'send', 'tag', 'shoppingBag', 'truck', 'wifi', 'phone', 'creditCard', 'zap', 'shield', 'heart', 'star']
  const colors = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#6d4c41', '#7b1fa2', '#00acc1', '#fdd835', '#8e24aa', '#c0ca33', '#ec407a', '#26a69a', '#ff7043', '#9575cd', '#7986cb', '#4db6ac']

  const initialLabel = category?.label || ''
  const initialIcon = category?.icon || 'tag'
  const initialColor = category?.color || '#757575'
  const initialOrder = category?.order !== undefined ? category.order : categories.length

  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--form'
  dialog.innerHTML = `
    <form method="dialog" id="category-form">
      <div class="dialog-body u-stack">
        <h2>${icon(isEdit ? 'edit' : 'plus', 18)} ${esc(title)}</h2>

        ${inputField('Nom', 'label', 'text', initialLabel, { required: true, placeholder: 'Ex: Loyer, Électricité…' })}

        ${field('Icône', `
          <div class="icon-picker" role="group" aria-label="Choisir une icône">
            ${icons.map((ic) => `
              <button type="button" class="icon-choice ${ic === initialIcon ? 'is-active' : ''}" data-icon="${esc(ic)}" aria-label="${esc(ic)}" aria-pressed="${ic === initialIcon ? 'true' : 'false'}">
                ${icon(ic, 18)}
              </button>
            `).join('')}
            <input type="hidden" name="icon" value="${esc(initialIcon)}">
          </div>
        `)}

        ${field('Couleur', `
          <div class="color-picker" role="group" aria-label="Choisir une couleur">
            ${colors.map((clr) => `
              <button type="button" class="color-choice ${clr === initialColor ? 'is-active' : ''}" data-color="${esc(clr)}" style="background: ${clr}" aria-label="${esc(clr)}" aria-pressed="${clr === initialColor ? 'true' : 'false'}"></button>
            `).join('')}
            <input type="color" name="color" value="${esc(initialColor)}" class="color-input" hidden>
          </div>
        `)}

        ${inputField('Ordre d\'affichage', 'order', 'number', initialOrder, { required: true, hint: 'Les catégories sont triées par ordre croissant.' })}
      </div>

      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>${icon('x', 13)} Annuler</button>
        ${isEdit && !category.isDefault ? `<button type="button" class="btn btn--danger btn--sm" data-action="delete-category-form" data-id="${esc(category.id)}">${icon('trash', 13)} Supprimer</button>` : ''}
        <button type="submit" class="btn btn--primary">${icon('save', 13)} ${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>`
  dialog.addEventListener('close', () => dialog.remove())

  const form = dialog.querySelector('#category-form')

  // Icon picker
  form.querySelectorAll('.icon-choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.icon-choice').forEach((b) => b.classList.remove('is-active'))
      btn.classList.add('is-active')
      form.querySelector('input[name="icon"]').value = btn.dataset.icon
    })
  })

  // Color picker
  form.querySelectorAll('.color-choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.color-choice').forEach((b) => b.classList.remove('is-active'))
      btn.classList.add('is-active')
      form.querySelector('input[name="color"]').value = btn.dataset.color
    })
  })
  // Sync color input
  const colorInput = form.querySelector('input[name="color"]')
  colorInput?.addEventListener('input', () => {
    form.querySelectorAll('.color-choice').forEach((b) => b.classList.remove('is-active'))
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const label = (data.get('label') || '').trim()
    const iconVal = data.get('icon')
    const color = data.get('color')
    const order = Number(data.get('order') || 999)

    if (!label) return toast('Nom requis.', { type: 'error' })

    const payload = { label, icon: iconVal, color, order }

    try {
      if (isEdit) {
        expStore.updateCategory(category.id, payload)
        toast('Catégorie modifiée.', { type: 'ok' })
      } else {
        expStore.addCategory(payload)
        toast('Catégorie ajoutée.', { type: 'ok' })
      }
      closeDialog(dialog)
    } catch (error) {
      toast(error.message || 'Erreur.', { type: 'error' })
    }
  })

  form.querySelector('[data-action="delete-category-form"]')?.addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Supprimer cette catégorie ?',
      message: 'Les dépenses existantes garderont cette catégorie mais elle ne sera plus proposée pour les nouvelles.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!confirmed) return
    expStore.deleteCategory(category.id)
    toast('Catégorie supprimée.', { type: 'info' })
    closeDialog(dialog)
  })

  form.querySelector('[data-close]')?.addEventListener('click', () => closeDialog(dialog))
  document.body.appendChild(dialog)
  dialog.showModal()
  form.querySelector('input[name="label"]')?.focus()
}

/* ------------------------------------------------------------------ */
/* Formulaire Investissement                                            */
/* ------------------------------------------------------------------ */

export function openInvestmentForm(investment = null) {
  const isEdit = Boolean(investment)
  const title = isEdit ? 'Modifier l\'investissement' : 'Nouvel investissement'

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

/* ------------------------------------------------------------------ */
/* Formulaire Recette (Revenu)                                          */
/* ------------------------------------------------------------------ */

export function openRevenueForm(revenue = null) {
  const state = expStore.getExpenses()
  const { settings } = state
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

/* ------------------------------------------------------------------ */
/* Saisie rapide Recettes (jour complet)                                */
/* ------------------------------------------------------------------ */

export function openRevenueQuickForm() {
  const state = expStore.getExpenses()
  const { revenues, settings } = state
  const today = new Date().toISOString().slice(0, 10)
  const existing = revenues.filter((r) => r.date === today)

  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--form dialog--lg'
  dialog.innerHTML = `
    <form method="dialog" id="revenue-quick-form">
      <div class="dialog-body u-stack">
        <h2>${icon('zap', 18)} Saisie rapide — ${esc(today)}</h2>
        <p class="u-muted">Ajoutez plusieurs recettes pour la journée. Une ligne par entrée.</p>

        <div id="quick-entries" class="u-stack">
          ${existing.length
            ? existing.map((r, i) => quickEntryRow(r.amount, r.note, i, true)).join('')
            : quickEntryRow('', '', 0, false)}
        </div>

        <button type="button" class="btn btn--secondary btn--sm" data-action="add-quick-entry">${icon('plus', 13)} Ajouter une ligne</button>

        <div class="quick-total">
          <span>Total du jour :</span>
          <strong id="quick-total" class="text-success">${formatMoney(expModel.totalRevenues(revenues, { startDate: today, endDate: today }))} ${settings.currency}</strong>
        </div>
      </div>

      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>${icon('x', 13)} Annuler</button>
        <button type="submit" class="btn btn--primary">${icon('save', 13)} Enregistrer tout</button>
      </div>
    </form>`
  dialog.addEventListener('close', () => dialog.remove())

  function quickEntryRow(amount, note, index, isExisting) {
    return `
      <div class="quick-entry" data-index="${index}" data-existing="${isExisting}">
        <input class="input" type="text" inputmode="decimal" name="amount_${index}" value="${escAttr(amount)}" placeholder="Montant" aria-label="Montant">
        <input class="input" type="text" name="note_${index}" value="${escAttr(note)}" placeholder="Note (client, type…)" aria-label="Note">
        <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="remove-quick-entry" data-index="${index}" aria-label="Supprimer cette ligne">${icon('trash', 14)}</button>
      </div>`
  }

  const form = dialog.querySelector('#revenue-quick-form')
  const entriesContainer = form.querySelector('#quick-entries')
  const totalEl = form.querySelector('#quick-total')

  function recalcTotal() {
    let total = 0
    form.querySelectorAll('[name^="amount_"]').forEach((input) => {
      const val = toNumber(input.value)
      if (val !== null) total += val
    })
    totalEl.textContent = `${formatMoney(total)} ${settings.currency}`
  }

  entriesContainer.addEventListener('input', (e) => {
    if (e.target.name.startsWith('amount_')) recalcTotal()
  })

  form.querySelector('[data-action="add-quick-entry"]')?.addEventListener('click', () => {
    const index = Date.now()
    entriesContainer.insertAdjacentHTML('beforeend', quickEntryRow('', '', index, false))
    recalcTotal()
  })

  entriesContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="remove-quick-entry"]')
    if (btn) {
      const entry = btn.closest('.quick-entry')
      if (entriesContainer.querySelectorAll('.quick-entry').length > 1) {
        entry.remove()
        recalcTotal()
      } else {
        // Clear instead of remove if it's the last one
        entry.querySelectorAll('input').forEach((input) => (input.value = ''))
        recalcTotal()
      }
    }
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const entries = []
    form.querySelectorAll('.quick-entry').forEach((entry) => {
      const amountInput = entry.querySelector('[name^="amount_"]')
      const noteInput = entry.querySelector('[name^="note_"]')
      const amount = toNumber(amountInput?.value)
      const note = noteInput?.value || ''
      if (amount !== null && amount > 0) {
        entries.push({ amount, note })
      }
    })

    if (!entries.length) return toast('Ajoutez au moins une recette.', { type: 'error' })

    try {
      // Delete existing for today first
      const todayRevenues = revenues.filter((r) => r.date === today)
      for (const r of todayRevenues) {
        expStore.deleteRevenue(r.id)
      }
      // Add new ones
      for (const e of entries) {
        expStore.addRevenue({ date: today, amount: e.amount, note: e.note })
      }
      toast(`${entries.length} recette(s) enregistrée(s) pour ${today}.`, { type: 'ok' })
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

/* ------------------------------------------------------------------ */
/* Formulaire Recette par jour (détail)                                 */
/* ------------------------------------------------------------------ */

export function openRevenueDayForm(date) {
  const state = expStore.getExpenses()
  const { revenues, settings } = state
  const dayRevenues = revenues.filter((r) => r.date === date).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--form dialog--lg'
  dialog.innerHTML = `
    <form method="dialog" id="revenue-day-form">
      <div class="dialog-body u-stack">
        <h2>${icon('list', 18)} Recettes du ${esc(date)}</h2>

        <div id="day-entries" class="u-stack">
          ${dayRevenues.length
            ? dayRevenues.map((r) => dayEntryRow(r)).join('')
            : '<p class="u-muted">Aucune recette pour ce jour.</p>'}
        </div>

        <button type="button" class="btn btn--secondary btn--sm" data-action="add-day-entry">${icon('plus', 13)} Ajouter une recette</button>

        <div class="quick-total">
          <span>Total du jour :</span>
          <strong class="text-success">${formatMoney(dayRevenues.reduce((s, r) => s + (r.amount || 0), 0))} ${settings.currency}</strong>
        </div>
      </div>

      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>${icon('x', 13)} Fermer</button>
      </div>
    </form>`
  dialog.addEventListener('close', () => dialog.remove())

  function dayEntryRow(revenue) {
    return `
      <div class="day-entry" data-id="${esc(revenue.id)}">
        <div class="day-entry-main">
          <span class="day-entry-amount">${formatMoney(revenue.amount)} ${settings.currency}</span>
          <span class="day-entry-note">${esc(revenue.note) || '—'}</span>
        </div>
        <div class="day-entry-actions">
          <button type="button" class="icon-btn icon-btn--plain" data-action="edit-revenue" data-id="${esc(revenue.id)}" aria-label="Modifier">${icon('edit', 14)}</button>
          <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="delete-revenue" data-id="${esc(revenue.id)}" aria-label="Supprimer">${icon('trash', 14)}</button>
        </div>
      </div>`
  }

  const form = dialog.querySelector('#revenue-day-form')
  const entriesContainer = form.querySelector('#day-entries')

  form.querySelector('[data-action="add-day-entry"]')?.addEventListener('click', () => {
    closeDialog(dialog)
    openRevenueForm({ date })
  })

  entriesContainer.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-action="edit-revenue"]')
    if (editBtn) {
      const id = editBtn.dataset.id
      const rev = revenues.find((r) => r.id === id)
      if (rev) {
        closeDialog(dialog)
        openRevenueForm(rev)
      }
    }
    const delBtn = e.target.closest('[data-action="delete-revenue"]')
    if (delBtn) {
      const id = delBtn.dataset.id
      const rev = revenues.find((r) => r.id === id)
      if (rev) {
        confirmAction({
          title: 'Supprimer cette recette ?',
          message: 'Cette action est irréversible.',
          confirmLabel: 'Supprimer',
          danger: true,
        }).then((confirmed) => {
          if (confirmed) {
            expStore.deleteRevenue(id)
            toast('Recette supprimée.', { type: 'info' })
            // Refresh dialog
            closeDialog(dialog)
            openRevenueDayForm(date)
          }
        })
      }
    }
  })

  form.querySelector('[data-close]')?.addEventListener('click', () => closeDialog(dialog))
  document.body.appendChild(dialog)
  dialog.showModal()
}