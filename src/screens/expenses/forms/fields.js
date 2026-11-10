/* ------------------------------------------------------------------ */
/* Formulaires Dépenses — champs réutilisables                          */
/* ------------------------------------------------------------------ */

import { esc, escAttr, formatMoney } from '../../../core/utils.js'

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

export function categoryOptions(categories) {
  return categories.map((c) => ({ value: c.id, label: `${c.label}` }))
}

export function investmentOptions(investments, settings = {}) {
  return investments.map((inv) => ({
    value: inv.id,
    label: `${inv.name} (${formatMoney(inv.remaining, settings.currency)} restant)`,
  }))
}
