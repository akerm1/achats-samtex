/* ------------------------------------------------------------------ */
/* Dépenses — onglet « Recettes » (totaux par jour)                    */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import * as expModel from '../../data/expenses-model.js'
import * as expStore from '../../data/expenses-store.js'

export function revenuesHtml() {
  const { revenues, settings } = expStore.getExpenses()

  const totalRevenue = expModel.totalRevenues(revenues)
  const byDate = expModel.revenueByDate(revenues)

  return `
    <div class="revenues-summary">
      <div class="kpi-card">
        <span class="kpi-label">Total recettes</span>
        <strong class="kpi-value text-success">${formatMoney(totalRevenue, settings.currency)}</strong>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Jours avec recettes</span>
        <strong class="kpi-value">${byDate.length}</strong>
      </div>
    </div>
    <div class="ana-toolbar">
      <button type="button" class="btn btn--primary btn--sm" data-action="open-revenue-form">${icon('plus', 14)} Ajouter une recette</button>
      <button type="button" class="btn btn--secondary btn--sm" data-action="open-revenue-quick">${icon('zap', 14)} Saisie rapide</button>
    </div>
    <div class="revenue-list" data-role="revenue-list">
      ${byDate
        .map(
          (day) => `
        <article class="card revenue-day-card" data-date="${esc(day.date)}">
          <div class="card-body">
            <div class="card-top">
              <h4 class="card-name">${esc(day.date)}</h4>
              <span class="card-amount text-success">${formatMoney(day.total, settings.currency)}</span>
            </div>
            <div class="card-meta">${day.count} entrée${day.count > 1 ? 's' : ''}</div>
            <div class="card-actions">
              <button type="button" class="icon-btn icon-btn--plain" data-action="open-revenue-day" data-date="${esc(day.date)}" aria-label="Voir détails" title="Voir détails">${icon('list', 14)}</button>
            </div>
          </div>
        </article>`,
        )
        .join('')}
      ${
        !revenues.length
          ? `
        <div class="empty" style="grid-column: 1 / -1;">
          <span class="empty-mark">${icon('trendingUp', 30)}</span>
          <div class="empty-copy">
            <strong>Aucune recette</strong>
            <p>Enregistrez vos revenus quotidiens pour suivre la performance du shop.</p>
          </div>
          <button type="button" class="btn btn--primary btn--lg" data-action="open-revenue-form">${icon('plus', 16)} Ajouter une recette</button>
        </div>
      `
          : ''
      }
    </div>`
}
