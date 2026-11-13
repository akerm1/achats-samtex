/* ------------------------------------------------------------------ */
/* Dépenses — en-tête (compteurs et totaux)                            */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { PROVIDER_GITHUB, PROVIDER_WORKER } from '../../data/sync.js'
import { getState } from '../../data/store.js'
import * as expModel from '../../data/expenses-model.js'
import * as expStore from '../../data/expenses-store.js'
import { state } from './state.js'

/**
 * Les dépenses voyagent par le partage — GitHub ou lien privé. Sans cette
 * phrase, quelqu'un peut changer d'appareil et croire à une perte de
 * données. Et si le Worker déployé est resté en v5, il reçoit les dépenses
 * sans les garder — c'est exactement le symptôme « seule la Liste est en
 * ligne ». Le dire vaut mieux que laisser chercher.
 *
 * `info` est l'état de synchronisation (par défaut celui du store), ce qui
 * rend la phrase vérifiable sans monter d'écran : c'est la seule preuve
 * visible que la saisie d'un appareil est arrivée au serveur.
 */
export function syncNote(info = getState()) {
  const { provider, expensesSync, expensesSyncKnown, expensesRemote, localCount = 0, readOnly } = info
  if (provider === PROVIDER_WORKER) {
    if (!expensesSyncKnown) return ''
    if (!expensesSync) {
      return `<p class="screen-note screen-note--alert">${icon('cloud', 12)} Le lien privé fonctionne pour la Liste mais son Worker n'est pas à jour : il ne garde pas encore les dépenses. Recollez <strong>worker/share-list-worker.mjs</strong> dans Cloudflare, puis rechargez.</p>`
    }
    if (typeof expensesRemote !== 'number') return ''
    if (expensesRemote === localCount) {
      return `<p class="screen-note">${icon('cloud', 12)} Lien privé à jour : <strong>${remoteLabel(expensesRemote)}</strong> sur le serveur, comme ici.</p>`
    }
    return `<p class="screen-note screen-note--alert">${icon('cloud', 12)} <strong>${localCount}</strong> dépense(s) ici, <strong>${remoteLabel(expensesRemote)}</strong> sur le serveur : la saisie n'est pas encore partie. Appuyez sur la pastille de synchronisation en haut de l'écran.</p>`
  }
  if (provider === PROVIDER_GITHUB) {
    if (!expensesSyncKnown) return ''
    /* Dépôt public sans jeton : la lecture marche, l'écriture non. Le dire
       ici évite de croire que la saisie est partie alors qu'elle attend un
       jeton. */
    if (readOnly) {
      return `<p class="screen-note screen-note--alert">${icon('cloud', 12)} Dépôt GitHub en lecture seule : les dépenses restent sur cet appareil tant qu'aucun jeton n'est enregistré. Ajoutez-en un dans les Réglages pour les partager.</p>`
    }
    if (typeof expensesRemote !== 'number') return ''
    if (expensesRemote === localCount) {
      return `<p class="screen-note">${icon('cloud', 12)} Dépôt GitHub à jour : <strong>${remoteLabel(expensesRemote)}</strong> sur le serveur, comme ici.</p>`
    }
    return `<p class="screen-note screen-note--alert">${icon('cloud', 12)} <strong>${localCount}</strong> dépense(s) ici, <strong>${remoteLabel(expensesRemote)}</strong> sur le serveur : la saisie n'est pas encore partie. Appuyez sur la pastille de synchronisation en haut de l'écran.</p>`
  }
  return `<p class="screen-note">${icon('cloud', 12)} Les dépenses restent sur cet appareil : aucun partage n'est configuré.</p>`
}

function remoteLabel(count) {
  return count === 0 ? 'aucune dépense' : `${count} dépense${count > 1 ? 's' : ''}`
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
        ${syncNote({ ...getState(), localCount: expenses.length })}
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
