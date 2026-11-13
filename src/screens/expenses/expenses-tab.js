/* ------------------------------------------------------------------ */
/* Dépenses — onglet « Dépenses » (ajout direct + liste filtrable)     */
/*                                                                     */
/* Les catégories existantes sont posées sur l'écran, avant toute      */
/* boîte : toucher une case ouvre la dépense déjà catégorisée, il ne    */
/* reste que le montant et la date.                                    */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { getState } from '../../data/store.js'
import { CARD_LIST_LAYOUTS, toolbarHtml } from '../../ui/toolbar.js'
import * as expModel from '../../data/expenses-model.js'
import * as expStore from '../../data/expenses-store.js'
import { renderExpenseCard } from './cards.js'
import { state } from './state.js'

const SORT_OPTIONS = [
  { value: 'recent', label: 'Plus récentes' },
  { value: 'oldest', label: 'Plus anciennes' },
  { value: 'amount', label: 'Montant élevé' },
]

/** Somme par catégorie, pour donner du sens à chaque case. */
function totalsByCategory(expenses) {
  const totals = new Map()
  for (const exp of expenses || []) {
    if (exp.amount === null) continue
    totals.set(exp.categoryId, (totals.get(exp.categoryId) || 0) + exp.amount)
  }
  return totals
}

/**
 * Le choix de catégorie, sur l'écran. Chaque case ouvre le formulaire avec
 * sa catégorie déjà retenue : aucune liste à dérouler, aucune boîte à
 * ouvrir pour commencer.
 */
export function quickAdd(categories, expenses, settings) {
  if (!categories.length) return ''
  const totals = totalsByCategory(expenses)
  return `
    <section class="quick-add" data-role="quick-add" aria-labelledby="quick-add-title">
      <div class="quick-add-head">
        <h2 class="quick-add-title" id="quick-add-title">Ajouter une dépense</h2>
        <p class="quick-add-note">Touchez une catégorie, puis complétez le montant et la date.</p>
      </div>
      <div class="quick-add-grid">
        ${categories
          .map((cat) => {
            const total = totals.get(cat.id) || 0
            return `
          <button type="button" class="quick-cat" data-action="quick-expense" data-category="${esc(cat.id)}"
                  style="--cat-color: ${esc(cat.color || '#757575')}">
            <span class="cat-box-icon">${icon(cat.icon || 'tag', 15)}</span>
            <span class="quick-cat-copy">
              <span class="quick-cat-label">${esc(cat.label)}</span>
              <span class="quick-cat-total">${total ? formatMoney(total, settings.currency) : 'Aucune'}</span>
            </span>
            <span class="quick-cat-plus" aria-hidden="true">${icon('plus', 14)}</span>
          </button>`
          })
          .join('')}
      </div>
    </section>`
}

function toolbar() {
  return toolbarHtml({
    id: 'expenses-sort',
    prefix: 'set-expenses',
    sort: state.sort.expenses,
    sortOptions: SORTS,
    layout: state.layout.expenses,
    layouts: LAYOUTS,
    dateFilter: true,
    startDate: state.startDate,
    endDate: state.endDate,
  })
}

/** Barre d'actions de l'onglet : ajout, tri et présentation. */
export function controls() {
  return `
    <div class="section-actions">
      <button type="button" class="btn btn--primary btn--sm" data-action="open-expense-form">${icon('plus', 14)} Ajouter une dépense</button>
    </div>
    ${toolbar()}`
}

function sortedExpenses(list) {
  const sorted = [...list]
  if (state.sort.expenses === 'oldest') {
    return sorted.sort((a, b) => String(a.date).localeCompare(String(b.date)) || new Date(a.createdAt) - new Date(b.createdAt))
  }
  if (state.sort.expenses === 'amount') {
    return sorted.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1) || String(b.date).localeCompare(String(a.date)))
  }
  return sorted.sort((a, b) => String(b.date).localeCompare(String(a.date)) || new Date(b.createdAt) - new Date(a.createdAt))
}

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

  /* Pendant une recherche, les cases d'ajout passeraient devant les
     résultats : elles s'effacent. */
  const quick = state.query.trim() ? '' : quickAdd(categories, expenses, settings)

  if (!filtered.length) return `${quick}${emptyState()}`

  const sorted = sortedExpenses(filtered)
  const gridClass = state.layout.expenses === 'list' ? 'grid grid--list' : 'grid grid--card'

  return `
    ${quick}
    <section class="group">
      <div class="${gridClass}">${sorted.map((exp) => renderExpenseCard(exp, categories, investments, settings)).join('')}</div>
    </section>`
}

function emptyState() {
  const needle = state.query.trim()
  let title = 'Aucune dépense'
  let message = 'Touchez une catégorie ci-dessus : il ne restera que le montant et la date.'
  if (needle) {
    title = 'Aucun résultat'
    message = `Aucune dépense ne correspond à « ${esc(needle)} ».`
  } else if (state.categoryFilter !== 'all') {
    const { categories } = expStore.getExpenses()
    const cat = categories.find((c) => c.id === state.categoryFilter)
    title = `Aucune dépense — ${cat?.label || state.categoryFilter}`
    message = 'Touchez la case de cette catégorie ci-dessus pour en ajouter une.'
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
          : ''
      }
    </div>`
}
