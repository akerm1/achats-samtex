/* ------------------------------------------------------------------ */
/* Dépenses — en-tête (compteurs et totaux)                            */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { PROVIDER_GITHUB, PROVIDER_WORKER } from '../../data/sync.js'
import { getState, getBills } from '../../data/store.js'
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

/** Bouton toggle « Factures incluses / exclues » dans l'en-tête. */
function billsToggleHtml() {
  return `
    <button type="button" class="btn btn--ghost btn--sm" data-action="toggle-include-bills"
            aria-pressed="${state.includeBills ? 'true' : 'false'}"
            title="${state.includeBills ? 'Retirer les factures du total' : 'Ajouter les factures au total'}">
      ${icon('receipt', 14)} ${state.includeBills ? 'Factures incluses' : 'Factures exclues'}
    </button>`
}

function remoteLabel(count) {
  return count === 0 ? 'aucune dépense' : `${count} dépense${count > 1 ? 's' : ''}`
}

export function header() {
  const { expenses, categories, investments, settings } = expStore.getExpenses()

  const isBillsCategory = state.categoryFilter === expModel.BILLS_CATEGORY_ID
  const billsWithAmount = getBills().filter((b) => b.amount !== null && b.amount > 0)
  /* Les factures ne comptent que dans la vue d'ensemble ou leur propre
     catégorie : les additionner à « Loyer » fausserait le total affiché. */
  const billsInView = state.categoryFilter === 'all' || isBillsCategory
  const filteredBills = expModel.filterBillsView(billsWithAmount, {
    status: isBillsCategory ? state.billsStatusFilter : 'all',
    query: state.query,
  })
  const billsSum = billsInView ? expModel.sumBillsView(filteredBills).total : 0

  let filtered = expenses
  if (state.categoryFilter !== 'all' && !isBillsCategory) {
    filtered = filtered.filter((e) => e.categoryId === state.categoryFilter)
  }
  if (state.query && !isBillsCategory) {
    const needle = state.query.toLowerCase()
    filtered = filtered.filter(
      (e) =>
        expModel.categoryLabel(categories, e.categoryId).toLowerCase().includes(needle) ||
        (e.note || '').toLowerCase().includes(needle),
    )
  }

  const totalAmount = expModel.totalExpenses(filtered)

  /* Deux totaux : avec les factures, et sans (le second s'affiche entre
     parenthèses dès que les factures pèsent quelque chose). */
  const totalWithBills = totalAmount + billsSum
  const showBills = billsInView && billsSum > 0
  const totalHtml = showBills && state.includeBills
    ? `${formatMoney(totalWithBills, settings.currency)} (sans factures : ${formatMoney(totalAmount, settings.currency)})`
    : formatMoney(totalAmount, settings.currency)

  const itemCount = isBillsCategory ? filteredBills.length : filtered.length
  const itemNoun = isBillsCategory ? 'facture' : 'élément'

  const totalInvested = expModel.totalInvestments(investments)
  const remainingInvested = expModel.remainingInvestments(investments)

  return `
    <header class="screen-head">
      <div class="screen-head-main">
        <span class="screen-eyebrow">Budget &amp; suivi</span>
        <h1 class="screen-title">${isBillsCategory ? 'Factures' : 'Dépenses'}</h1>
        <p class="screen-sub">
          <strong>${itemCount}</strong> ${itemNoun}${itemCount > 1 ? 's' : ''}
          ${showBills ? billsToggleHtml() : ''}
          <span class="screen-total">${totalHtml}</span>
        </p>
        ${syncNote({ ...getState(), localCount: expenses.length })}
      </div>
      <div class="screen-stats">
        <div class="stat">
          <span class="stat-label">Investi</span>
          <span class="stat-value">${formatMoney(totalInvested, settings.currency)}</span>
        </div>
        <div class="stat stat--accent">
          <span class="stat-label">Restant</span>
          <span class="stat-value">${formatMoney(remainingInvested, settings.currency)}</span>
        </div>
        ${billsWithAmount.length ? `
        <div class="stat">
          <span class="stat-label">Factures</span>
          <span class="stat-value">${formatMoney(expModel.sumBillsView(billsWithAmount).total, settings.currency)}</span>
        </div>` : ''}
      </div>
    </header>`
}
