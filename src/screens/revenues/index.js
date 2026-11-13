/* ------------------------------------------------------------------ */
/* Écran Recettes — les entrées d'argent du shop                       */
/*                                                                     */
/* Recettes a son propre écran : elle ne se cache plus derrière un      */
/* onglet des Dépenses. L'application ouvre ici, parce que c'est le     */
/* premier chiffre que l'on regarde.                                   */
/*                                                                     */
/* Chaque entrée s'ouvre, se modifie et se supprime depuis la liste.    */
/* La barre « Tri & présentation » range les entrées par jour ou les    */
/* pose à plat, et les trie par date ou par montant.                    */
/* ------------------------------------------------------------------ */

import { esc, formatDate, formatMoney } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { toolbarHtml, bindToolbar } from '../../ui/toolbar.js'
import * as expModel from '../../data/expenses-model.js'
import * as expStore from '../../data/expenses-store.js'

const SORTS = [
  { value: 'recent', label: 'Plus récentes' },
  { value: 'oldest', label: 'Plus anciennes' },
  { value: 'amount', label: 'Montant élevé' },
]

const LAYOUTS = [
  { value: 'days', label: 'Par jour', icon: 'calendar' },
  { value: 'list', label: 'Toutes les entrées', icon: 'list' },
]

let host = null
/* Les choix de présentation survivent à la navigation : on retrouve son
   écran comme on l'a laissé. */
let sort = 'recent'
let layout = 'days'

/** Une date « AAAA-MM-JJ » reste locale : midi évite le décalage de fuseau. */
function dayLabel(date) {
  return formatDate(`${String(date || '')}T12:00:00`)
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function sortedRevenues(revenues) {
  const list = [...revenues]
  if (sort === 'amount') {
    return list.sort((a, b) => (b.amount || 0) - (a.amount || 0) || String(b.date).localeCompare(String(a.date)))
  }
  if (sort === 'oldest') {
    return list.sort((a, b) => String(a.date).localeCompare(String(b.date)) || new Date(a.createdAt) - new Date(b.createdAt))
  }
  return list.sort((a, b) => String(b.date).localeCompare(String(a.date)) || new Date(b.createdAt) - new Date(a.createdAt))
}

/** Regroupe des entrées déjà triées, sans perdre l'ordre choisi. */
function groupByDate(revenues) {
  const groups = new Map()
  for (const revenue of revenues) {
    const group = groups.get(revenue.date) || { date: revenue.date, total: 0, items: [] }
    group.items.push(revenue)
    group.total += revenue.amount || 0
    groups.set(revenue.date, group)
  }
  return [...groups.values()]
}

function header() {
  const { revenues, settings } = expStore.getExpenses()
  const today = todayKey()
  const total = expModel.totalRevenues(revenues)
  const todayTotal = expModel.totalRevenues(revenues, { startDate: today, endDate: today })
  const days = new Set(revenues.map((revenue) => revenue.date)).size

  return `
    <header class="screen-head">
      <div class="screen-head-main">
        <span class="screen-eyebrow">Entrées du shop</span>
        <h1 class="screen-title">Recettes</h1>
        <p class="screen-sub">
          <strong>${revenues.length}</strong> entrée${revenues.length > 1 ? 's' : ''}
          ${total ? ` · <span class="screen-total text-success">${formatMoney(total, settings.currency)}</span>` : ''}
        </p>
      </div>
      <div class="screen-stats">
        <div class="stat">
          <span class="stat-label">Aujourd'hui</span>
          <span class="stat-value">${formatMoney(todayTotal, settings.currency)}</span>
        </div>
        <div class="stat stat--accent">
          <span class="stat-label">Total · ${days} jour${days > 1 ? 's' : ''}</span>
          <span class="stat-value">${formatMoney(total, settings.currency)}</span>
        </div>
      </div>
    </header>`
}

function actions() {
  return `
    <div class="section-actions">
      <button type="button" class="btn btn--primary btn--sm" data-action="open-revenue-form">${icon('plus', 14)} Ajouter une recette</button>
      <button type="button" class="btn btn--secondary btn--sm" data-action="open-revenue-quick">${icon('zap', 14)} Saisie rapide</button>
    </div>`
}

function toolbar() {
  return toolbarHtml({
    id: 'revenues-sort',
    prefix: 'set-revenues',
    sort,
    sortOptions: SORTS,
    layout,
    layouts: LAYOUTS,
  })
}

function revenueCard(revenue, settings, { showDate = false } = {}) {
  return `
    <article class="card revenue-card" data-id="${esc(revenue.id)}">
      <div class="card-body">
        <div class="card-top">
          <div class="card-name-row">
            <h4 class="card-name">${esc(revenue.note) || 'Recette'}</h4>
          </div>
          <span class="card-amount text-success">${formatMoney(revenue.amount, settings.currency)}</span>
        </div>
        ${
          showDate
            ? `<div class="card-meta"><span class="card-date">${icon('calendar', 12)} ${esc(dayLabel(revenue.date))}</span></div>`
            : ''
        }
        <div class="card-actions">
          <button type="button" class="icon-btn icon-btn--plain" data-action="edit-revenue" data-id="${esc(revenue.id)}" aria-label="Modifier la recette" title="Modifier">${icon('edit', 14)}</button>
          <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="delete-revenue" data-id="${esc(revenue.id)}" aria-label="Supprimer la recette" title="Supprimer">${icon('trash', 14)}</button>
        </div>
      </div>
    </article>`
}

function daysHtml(revenues, settings) {
  return groupByDate(revenues)
    .map(
      (group) => `
      <section class="group">
        <header class="group-head">
          <h3>${esc(dayLabel(group.date))}</h3>
          <span class="group-count">${group.items.length}</span>
          <span class="group-total text-success">${formatMoney(group.total, settings.currency)}</span>
        </header>
        <div class="grid grid--card">${group.items.map((revenue) => revenueCard(revenue, settings)).join('')}</div>
      </section>`,
    )
    .join('')
}

function listHtml(revenues, settings) {
  return `
    <div class="revenue-list revenue-rows">
      ${revenues
        .map(
          (revenue) => `
        <article class="revenue-row" data-id="${esc(revenue.id)}">
          <div class="revenue-row-when">
            <strong>${esc(dayLabel(revenue.date))}</strong>
            ${revenue.note ? `<span>${esc(revenue.note)}</span>` : ''}
          </div>
          <strong class="revenue-row-amount text-success">${formatMoney(revenue.amount, settings.currency)}</strong>
          <div class="card-actions">
            <button type="button" class="icon-btn icon-btn--plain" data-action="edit-revenue" data-id="${esc(revenue.id)}" aria-label="Modifier la recette" title="Modifier">${icon('edit', 14)}</button>
            <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="delete-revenue" data-id="${esc(revenue.id)}" aria-label="Supprimer la recette" title="Supprimer">${icon('trash', 14)}</button>
          </div>
        </article>`,
        )
        .join('')}
    </div>`
}

function emptyState() {
  return `
    <div class="empty">
      <span class="empty-mark">${icon('trendingUp', 30)}</span>
      <div class="empty-copy">
        <strong>Aucune recette</strong>
        <p>Enregistrez vos revenus quotidiens pour suivre la performance du shop.</p>
      </div>
      <button type="button" class="btn btn--primary btn--lg" data-action="open-revenue-form">${icon('plus', 16)} Ajouter une recette</button>
    </div>`
}

function results() {
  const { revenues, settings } = expStore.getExpenses()
  if (!revenues.length) return emptyState()
  const sorted = sortedRevenues(revenues)
  return layout === 'list' ? listHtml(sorted, settings) : daysHtml(sorted, settings)
}

function paint() {
  if (!host) return
  host.innerHTML = `
    <section class="view view--revenues">
      ${header()}
      ${toolbar()}
      ${actions()}
      <div class="list-results" data-role="results">${results()}</div>
    </section>`
  bindToolbar(host, 'set-revenues', {
    onSort: (value) => {
      sort = value
      paint()
    },
    onLayout: (value) => {
      layout = value === 'list' ? 'list' : 'days'
      paint()
    },
  })
}

export const revenuesView = {
  id: 'revenues',
  route: 'recettes',
  label: 'Recettes',
  icon: 'trendingUp',
  mount(element) {
    host = element
    paint()
  },
  update() {
    paint()
  },
}
