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
  return `<p class="screen-note">${icon('cloud', 12)} Les dépenses ne sont synchronisées qu'avec le lien privé Cloudflare — ici, elles restent sur cet appareil.</p>`
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
    <header class="screen-head">
      <div class="screen-head-main">
        <span class="screen-eyebrow">Budget &amp; suivi</span>
        <h1 class="screen-title">Dépenses</h1>
        <p class="screen-sub">
          <strong>${filtered.length}</strong> dépense${filtered.length > 1 ? 's' : ''}
          ${totalAmount ? ` · <span class="screen-total">${formatMoney(totalAmount, settings.currency)}</span>` : ''}
        </p>
        ${syncNote()}
      </div>
      <div class="screen-stats">
        <div class="stat">
          <span class="stat-label">Investi</span>
          <span class="stat-value">${formatMoney(totalInvested, settings.currency)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Restant</span>
          <span class="stat-value">${formatMoney(remainingInvested, settings.currency)}</span>
        </div>
        <div class="stat stat--accent">
          <span class="stat-label">Recettes</span>
          <span class="stat-value">${formatMoney(totalRevenue, settings.currency)}</span>
        </div>
      </div>
    </header>`
}
