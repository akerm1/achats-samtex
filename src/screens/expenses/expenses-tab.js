/* ------------------------------------------------------------------ */
/* Dépenses — onglet « Dépenses » (liste filtrable)                    */
/* ------------------------------------------------------------------ */

import { esc } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { getState } from '../../data/store.js'
import * as expModel from '../../data/expenses-model.js'
import * as expStore from '../../data/expenses-store.js'
import { renderExpenseCard } from './cards.js'
import { state } from './state.js'

export function results() {
  const { expenses, categories, investments, settings } = expStore.getExpenses()

  let filtered = expenses
  if (state.categoryFilter !== 'all') filtered = filtered.filter((e) => e.categoryId === state.categoryFilter)
  if (state.typeFilter === 'transfer') filtered = filtered.filter((e) => e.isTransfer)
  if (state.typeFilter === 'regular') filtered = filtered.filter((e) => !e.isTransfer)
  if (state.query) {
    const needle = state.query.toLowerCase()
    filtered = filtered.filter(
      (e) =>
        expModel.categoryLabel(categories, e.categoryId).toLowerCase().includes(needle) ||
        (e.note || '').toLowerCase().includes(needle),
    )
  }

  if (!filtered.length) return emptyState()

  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date))

  return `
    <section class="group">
      <div class="grid grid--card">${sorted.map((exp) => renderExpenseCard(exp, categories, investments, settings)).join('')}</div>
    </section>`
}

function emptyState() {
  const needle = state.query.trim()
  let title = 'Aucune dépense'
  let message = 'Ajoutez votre première dépense : choisissez une catégorie, le montant et la date.'
  if (needle) {
    title = 'Aucun résultat'
    message = `Aucune dépense ne correspond à « ${esc(needle)} ».`
  } else if (state.categoryFilter !== 'all') {
    const { categories } = expStore.getExpenses()
    const cat = categories.find((c) => c.id === state.categoryFilter)
    title = `Aucune dépense — ${cat?.label || state.categoryFilter}`
    message = 'Ajoutez une dépense dans cette catégorie.'
  } else if (state.typeFilter === 'transfer') {
    title = 'Aucun transfert'
    message = "Les transferts d'argent vers les investissements apparaîtront ici."
  }

  const { isConfigured, message: syncMessage, messageKind } = getState()
  const syncFailed = isConfigured && messageKind === 'error'
  if (syncFailed && !needle) message = syncMessage

  const intro = syncFailed
    ? `
      <div class="setup-card setup-card--error" data-role="setup">
        <span class="setup-mark">${icon('alert', 18)}</span>
        <div class="setup-copy">
          <strong>La liste n'est pas à jour</strong>
          <p>${esc(syncMessage)}</p>
        </div>
        <button type="button" class="btn btn--primary btn--sm" data-action="go-settings">${icon('sliders', 13)} Corriger la connexion</button>
      </div>`
    : ''

  return `
    ${intro}
    <div class="empty">
      <span class="empty-mark">${icon(needle ? 'searchX' : 'creditCard', 30)}</span>
      <div class="empty-copy">
        <strong>${title}</strong>
        <p>${message}</p>
      </div>
      ${
        needle
          ? '<button type="button" class="btn btn--secondary" data-action="reset-expense-filters">Réinitialiser les filtres</button>'
          : `<button type="button" class="btn btn--primary btn--lg" data-action="open-expense-form">${icon('plus', 16)} Ajouter une dépense</button>`
      }
    </div>`
}
