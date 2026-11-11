/* ------------------------------------------------------------------ */
/* Formulaires Dépenses — champs réutilisables                          */
/* ------------------------------------------------------------------ */

import { esc, escAttr, formatMoney } from '../../../core/utils.js'
import { icon } from '../../../ui/icons.js'

export function field(label, input, { hint = '', error = '' } = {}) {
  return `
    <div class="field">
      <label>${esc(label)}</label>
      ${input}
      ${hint ? `<span class="field-hint">${hint}</span>` : ''}
      ${error ? `<span class="field-error">${esc(error)}</span>` : ''}
    </div>`
}

export function selectField(label, name, options, value, { required = false, hint = '' } = {}) {
  const body = `
    <select class="select" name="${name}" ${required ? 'required' : ''}>
      ${options
        .map((opt) => `<option value="${escAttr(opt.value)}" ${opt.value === value ? 'selected' : ''}>${esc(opt.label)}</option>`)
        .join('')}
    </select>`
  return field(label, body, { hint })
}

export function inputField(
  label,
  name,
  type,
  value,
  { placeholder = '', required = false, hint = '', inputmode = '', autocomplete = 'off' } = {},
) {
  const body = `
    <input class="input" type="${type}" name="${name}" value="${escAttr(value)}" placeholder="${escAttr(placeholder)}" ${required ? 'required' : ''} inputmode="${inputmode}" autocomplete="${autocomplete}">`
  return field(label, body, { hint })
}

export function textareaField(label, name, value, { placeholder = '', hint = '' } = {}) {
  const body = `
    <textarea class="input" name="${name}" rows="3" placeholder="${escAttr(placeholder)}">${esc(value)}</textarea>`
  return field(label, body, { hint })
}

/** Le groupe de cases, sans étiquette ni aide : il sert aussi sur l'écran. */
export function categoryPickerBody(categories, value, { hidden = false } = {}) {
  return `
    <div class="cat-picker" role="radiogroup" aria-label="Catégorie" ${hidden ? 'hidden' : ''}>
      ${categories
        .map(
          (cat) => `
        <label class="cat-box" style="--cat-color: ${escAttr(cat.color || '#757575')}">
          <input type="radio" name="categoryId" value="${escAttr(cat.id)}" ${cat.id === value ? 'checked' : ''}>
          <span class="cat-box-face">
            <span class="cat-box-icon">${icon(cat.icon || 'tag', 15)}</span>
            <span class="cat-box-label">${esc(cat.label)}</span>
          </span>
        </label>`,
        )
        .join('')}
    </div>`
}

/**
 * Sélecteur de catégorie en tuiles : chaque catégorie existante devient une
 * case cliquable. Le champ reste un vrai groupe de radios, donc `FormData`
 * le relit comme avant et le clavier continue de fonctionner.
 */
export function categoryPickerField(categories, value, { hint = '' } = {}) {
  return field('Catégorie', categoryPickerBody(categories, value), { hint })
}

/**
 * Catégorie déjà choisie avant d'ouvrir la boîte : on n'affiche que le
 * choix retenu, et « Changer » révèle la grille. Le groupe de radios reste
 * dans le document — c'est lui qui porte la valeur du formulaire.
 */
export function categoryChoiceField(categories, value, { hint = '' } = {}) {
  const chosen = categories.find((cat) => cat.id === value) || categories[0]
  const body = `
    <div class="cat-chosen" data-role="cat-chosen" style="--cat-color: ${escAttr(chosen.color || '#757575')}">
      <span class="cat-box-icon">${icon(chosen.icon || 'tag', 15)}</span>
      <span class="cat-chosen-label" data-role="cat-chosen-label">${esc(chosen.label)}</span>
      <button type="button" class="cat-chosen-change" data-role="cat-change">Changer</button>
    </div>
    ${categoryPickerBody(categories, chosen.id, { hidden: true })}`
  return field('Catégorie', body, { hint })
}

export function investmentOptions(investments, settings = {}) {
  return investments.map((inv) => ({
    value: inv.id,
    label: `${inv.name} (${formatMoney(inv.remaining, settings.currency)} restant)`,
  }))
}
