/* ------------------------------------------------------------------ */
/* Formulaire Catégorie (icône + couleur + ordre)                      */
/* ------------------------------------------------------------------ */

import { esc } from '../../../core/utils.js'
import { icon } from '../../../ui/icons.js'
import { confirmAction, toast } from '../../../core/feedback.js'
import { closeDialog } from '../../../ui/dialog.js'
import * as expStore from '../../../data/expenses-store.js'
import { field, inputField } from './fields.js'

const ICONS = [
  'home', 'users', 'tool', 'flame', 'car', 'send', 'tag', 'shoppingBag',
  'truck', 'wifi', 'phone', 'creditCard', 'zap', 'shield', 'heart', 'star',
]

const COLORS = [
  '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#6d4c41', '#7b1fa2', '#00acc1', '#fdd835',
  '#8e24aa', '#c0ca33', '#ec407a', '#26a69a', '#ff7043', '#9575cd', '#7986cb', '#4db6ac',
]

export function openCategoryForm(category = null) {
  const { categories } = expStore.getExpenses()
  const isEdit = Boolean(category)
  const title = isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie'

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

        ${field(
          'Icône',
          `
          <div class="icon-picker" role="group" aria-label="Choisir une icône">
            ${ICONS.map(
              (name) => `
              <button type="button" class="icon-choice ${name === initialIcon ? 'is-active' : ''}" data-icon="${esc(name)}" aria-label="${esc(name)}" aria-pressed="${name === initialIcon ? 'true' : 'false'}">
                ${icon(name, 18)}
              </button>`,
            ).join('')}
            <input type="hidden" name="icon" value="${esc(initialIcon)}">
          </div>
        `,
        )}

        ${field(
          'Couleur',
          `
          <div class="color-picker" role="group" aria-label="Choisir une couleur">
            ${COLORS.map(
              (color) => `
              <button type="button" class="color-choice ${color === initialColor ? 'is-active' : ''}" data-color="${esc(color)}" style="background: ${color}" aria-label="${esc(color)}" aria-pressed="${color === initialColor ? 'true' : 'false'}"></button>`,
            ).join('')}
            <input type="color" name="color" value="${esc(initialColor)}" class="color-input" hidden>
          </div>
        `,
        )}

        ${inputField("Ordre d'affichage", 'order', 'number', initialOrder, {
          required: true,
          hint: 'Les catégories sont triées par ordre croissant.',
        })}
      </div>

      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>${icon('x', 13)} Annuler</button>
        ${isEdit ? `<button type="button" class="btn btn--danger btn--sm" data-action="delete-category-form" data-id="${esc(category.id)}">${icon('trash', 13)} Supprimer</button>` : ''}
        <button type="submit" class="btn btn--primary">${icon('save', 13)} ${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>`
  dialog.addEventListener('close', () => dialog.remove())

  const form = dialog.querySelector('#category-form')

  /* Sélecteur d'icône */
  form.querySelectorAll('.icon-choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.icon-choice').forEach((other) => other.classList.remove('is-active'))
      btn.classList.add('is-active')
      form.querySelector('input[name="icon"]').value = btn.dataset.icon
    })
  })

  /* Sélecteur de couleur */
  form.querySelectorAll('.color-choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.color-choice').forEach((other) => other.classList.remove('is-active'))
      btn.classList.add('is-active')
      form.querySelector('input[name="color"]').value = btn.dataset.color
    })
  })
  form.querySelector('input[name="color"]')?.addEventListener('input', () => {
    form.querySelectorAll('.color-choice').forEach((other) => other.classList.remove('is-active'))
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
