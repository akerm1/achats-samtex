/* ------------------------------------------------------------------ */
/* Dépenses — en-tête (compteurs et totaux)                            */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { PROVIDER_WORKER } from '../../data/sync.js'
import { getState } from '../../data/store.js'
import * as expModel from '../../data/expenses-model.js'
import * as expStore from '../../data/expenses-store.js'
import { state } from './state.js'

/**
 * Les dépenses ne voyagent que par le lien privé : sans cette phrase,
 * quelqu'un peut changer d'appareil et croire à une perte de données.
 */
function syncNote() {
  const { provider } = getState()
  if (provider === PROVIDER_WORKER) return ''
  return `<p class="list-head-note">${icon('cloud', 12)} Les dépenses ne sont synchronisées qu'avec le lien privé Cloudflare — ici, elles restent sur cet appareil.</p>`
}

export function header() {
  const { expenses, categories, investments, revenues, settings } = expStore.getExpenses()

  let filtered = expenses
  if (state.categoryFilter !== 'all') filtered = filtered.filter((e) => e.categoryId === state.categoryFilter)
  if (state.query) {
    const needle = state.query.toLowerCase()
    filtered = filtered.filter(
      (e) =>
        expModel.categoryLabel(categories, e.categoryId).toLowerCase().includes(needle) ||
        (e.note || '').toLowerCase().includes(needle),
    )
  }

  const totalAmount = expModel.totalExpenses(filtered)
  const totalInvested = expModel.totalInvestments(investments)
  const remainingInvested = expModel.remainingInvestments(investments)
  const totalRevenue = expModel.totalRevenues(revenues)

  return `
    <header class="list-head">
      <div class="list-head-copy">
        <h1>Dépenses</h1>
        <p class="list-head-sub">
          <strong>${filtered.length}</strong> dépense${filtered.length > 1 ? 's' : ''}
          ${totalAmount ? ` · <span class="list-head-total">${formatMoney(totalAmount, settings.currency)}</span>` : ''}
        </p>
        ${syncNote()}
      </div>
      <div class="list-head-kpis">
        <div class="kpi">
          <span class="kpi-label">Investi</span>
          <strong class="kpi-value">${formatMoney(totalInvested, settings.currency)}</strong>
        </div>
        <div class="kpi">
          <span class="kpi-label">Restant</span>
          <strong class="kpi-value ${remainingInvested < 0 ? 'text-danger' : ''}">${formatMoney(remainingInvested, settings.currency)}</strong>
        </div>
        <div class="kpi">
          <span class="kpi-label">Recettes</span>
          <strong class="kpi-value text-success">${formatMoney(totalRevenue, settings.currency)}</strong>
        </div>
      </div>
    </header>`
}
