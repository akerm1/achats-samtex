/* ------------------------------------------------------------------ */
/* Dépenses — carte d'une dépense                                      */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'

export function renderExpenseCard(exp, categories, investments, settings = {}) {
  const cat = categories.find((c) => c.id === exp.categoryId)
  const catLabel = cat?.label || exp.categoryId
  const catIcon = cat?.icon || 'tag'
  const catColor = cat?.color || '#757575'
  const amount = exp.amount !== null ? formatMoney(exp.amount, settings.currency) : '—'
  const linkedInv = exp.linkedInvestmentId ? investments.find((i) => i.id === exp.linkedInvestmentId) : null

  return `
    <article class="card ${exp.isTransfer ? 'card--transfer' : ''}" data-id="${esc(exp.id)}" style="--cat-color: ${catColor}">
      <div class="card-media card-media--category" style="background: ${catColor}">
        ${icon(catIcon, 24)}
      </div>
      <div class="card-body">
        <div class="card-top">
          <div class="card-name-row">
            <h4 class="card-name">${esc(catLabel)}</h4>
            ${exp.isTransfer ? `<span class="badge badge--purple">${icon('send', 10)} Transfert</span>` : ''}
          </div>
          <span class="card-amount">${esc(amount)}</span>
        </div>
        <div class="card-meta">
          <span class="card-date">${icon('calendar', 12)} ${exp.date}</span>
          ${linkedInv ? `<span class="card-link">${icon('link', 12)} Vers: ${esc(linkedInv.name)}</span>` : ''}
        </div>
        ${exp.note ? `<p class="card-note">${icon('messageSquare', 12)} ${esc(exp.note)}</p>` : ''}
        <div class="card-actions">
          <button type="button" class="icon-btn icon-btn--plain" data-action="edit-expense" data-id="${esc(exp.id)}" aria-label="Modifier" title="Modifier">${icon('edit', 14)}</button>
          <button type="button" class="icon-btn icon-btn--plain" data-action="delete-expense" data-id="${esc(exp.id)}" aria-label="Supprimer" title="Supprimer">${icon('trash', 14)}</button>
        </div>
      </div>
    </article>`
}
