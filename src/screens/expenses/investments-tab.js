/* ------------------------------------------------------------------ */
/* Dépenses — onglet « Investissements » (transferts et reste à récupérer) */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { CARD_LIST_LAYOUTS, toolbarHtml } from '../../ui/toolbar.js'
import * as expModel from '../../data/expenses-model.js'
import * as expStore from '../../data/expenses-store.js'
import { state } from './state.js'

const SORT_OPTIONS = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'name', label: 'Nom (A → Z)' },
  { value: 'amount', label: 'Montant élevé' },
]

function sortedInvestments(investments) {
  const sorted = [...investments]
  if (state.sort.investments === 'name') {
    return sorted.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }
  if (state.sort.investments === 'amount') {
    return sorted.sort((a, b) => (b.amount || 0) - (a.amount || 0))
  }
  return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function controls() {
  return `
    <div class="section-actions">
      <button type="button" class="btn btn--primary btn--sm" data-action="open-investment-form">${icon('plus', 14)} Nouvel investissement</button>
    </div>
    ${toolbarHtml({
      id: 'investments-sort',
      prefix: 'set-investments',
      sort: state.sort.investments,
      sortOptions: SORT_OPTIONS,
      layout: state.layout.investments,
      layouts: CARD_LIST_LAYOUTS,
    })}`
}

export function investmentsHtml() {
  const { investments, expenses, settings } = expStore.getExpenses()

  const totalInvested = expModel.totalInvestments(investments)
  const totalRemaining = expModel.remainingInvestments(investments)

  return `
    <div class="investments-summary">
      <div class="kpi-card">
        <span class="kpi-label">Total investi</span>
        <strong class="kpi-value">${formatMoney(totalInvested, settings.currency)}</strong>
      </div>
      <div class="kpi-card ${totalRemaining < 0 ? 'danger' : ''}">
        <span class="kpi-label">Reste à récupérer</span>
        <strong class="kpi-value">${formatMoney(totalRemaining, settings.currency)}</strong>
      </div>
    </div>
    <div class="investment-list ${state.layout.investments === 'list' ? 'is-list' : ''}" data-role="investment-list">
      ${sortedInvestments(investments)
        .map((inv) => {
          const linkedExpenses = expenses.filter((e) => e.linkedInvestmentId === inv.id)
          const transferred = linkedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
          const progress = inv.amount > 0 ? Math.round((transferred / inv.amount) * 100) : 0
          return `
            <article class="card investment-card" data-id="${esc(inv.id)}">
              <div class="card-body">
                <div class="card-top">
                  <h4 class="card-name">${esc(inv.name)}</h4>
                  <span class="card-amount">${formatMoney(inv.amount, settings.currency)}</span>
                </div>
                <div class="investment-progress">
                  <div class="progress-bar" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
                    <div class="progress-fill" style="width: ${Math.min(100, progress)}%"></div>
                  </div>
                  <div class="progress-labels">
                    <span>Transféré: ${formatMoney(transferred, settings.currency)}</span>
                    <span>Restant: ${formatMoney(inv.remaining, settings.currency)}</span>
                  </div>
                </div>
                ${inv.note ? `<p class="card-note">${icon('messageSquare', 12)} ${esc(inv.note)}</p>` : ''}
                <div class="card-actions">
                  <button type="button" class="btn btn--secondary btn--sm" data-action="open-expense-form" data-prefill='{"isTransfer":true,"linkedInvestmentId":"${inv.id}"}'>${icon('send', 13)} Transférer</button>
                  <button type="button" class="icon-btn icon-btn--plain" data-action="edit-investment" data-id="${esc(inv.id)}" aria-label="Modifier" title="Modifier">${icon('edit', 14)}</button>
                  <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="delete-investment" data-id="${esc(inv.id)}" aria-label="Supprimer" title="Supprimer">${icon('trash', 14)}</button>
                </div>
                ${
                  linkedExpenses.length
                    ? `
                  <details class="investment-transfers">
                    <summary>${icon('chevronDown', 12)} Transferts (${linkedExpenses.length})</summary>
                    <div class="transfer-list">
                      ${linkedExpenses
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .map(
                          (e) => `
                          <div class="transfer-item">
                            <span>${e.date}</span>
                            <strong>${formatMoney(e.amount, settings.currency)}</strong>
                            ${e.note ? `<span class="u-muted">${esc(e.note)}</span>` : ''}
                          </div>`,
                        )
                        .join('')}
                    </div>
                  </details>
                `
                    : ''
                }
              </div>
            </article>`
        })
        .join('')}
      ${
        !investments.length
          ? `
        <div class="empty" style="grid-column: 1 / -1;">
          <span class="empty-mark">${icon('chart', 30)}</span>
          <div class="empty-copy">
            <strong>Aucun investissement</strong>
            <p>Ajoutez un investissement pour suivre les transferts d'argent et le montant restant.</p>
          </div>
          <button type="button" class="btn btn--primary btn--lg" data-action="open-investment-form">${icon('plus', 16)} Créer un investissement</button>
        </div>
      `
          : ''
      }
    </div>`
}
