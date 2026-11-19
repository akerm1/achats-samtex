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

import { esc, formatDate, formatMoney, periodLabel, periodRange } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { toolbarHtml, bindToolbar } from '../../ui/toolbar.js'
import * as expModel from '../../data/expenses-model.js'
import * as expStore from '../../data/expenses-store.js'

const SORTS = [
  { value: 'recent', label: 'Plus récentes' },
  { value: 'oldest', label: 'Plus anciennes' },
  { value: 'amount', label: 'Montant élevé' },
]

const COMPARE_UNITS = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
]

const COMPARE_UNIT_LABEL = Object.fromEntries(COMPARE_UNITS.map((unit) => [unit.value, unit.label]))

const LAYOUTS = [
  { value: 'days', label: 'Par jour', icon: 'calendar' },
  { value: 'list', label: 'Toutes les entrées', icon: 'list' },
]

let host = null
/* Les choix de présentation survivent à la navigation : on retrouve son
   écran comme on l'a laissé. */
let sort = 'recent'
let layout = 'days'
let startDate = ''
let endDate = ''
let compareMode = false
let compareUnit = 'day' /* « day », « week » ou « month » */
let comparePeriods = [] /* périodes ajoutées : { unit, date } */

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

/** Une ligne par période comparée : bornes, total, part visuelle, écart. */
function compareRows(revenues) {
  const rows = comparePeriods.map((period) => {
    const range = periodRange(period.unit, period.date)
    let total = 0
    let count = 0
    for (const revenue of revenues) {
      if (revenue.date < range.start || revenue.date > range.end) continue
      total += revenue.amount || 0
      count += 1
    }
    const from = new Date(`${range.start}T12:00:00`)
    const to = new Date(`${range.end}T12:00:00`)
    return {
      unit: period.unit,
      label: periodLabel(period.unit, period.date),
      total,
      count,
      days: Math.round((to - from) / 86400000) + 1,
    }
  })
  const max = rows.reduce((peak, row) => Math.max(peak, row.total), 0)
  const reference = rows[0]?.total || 0
  return rows.map((row, index) => ({
    ...row,
    share: max > 0 ? Math.round((row.total / max) * 100) : 0,
    delta: index === 0 || reference <= 0 ? null : ((row.total - reference) / reference) * 100,
  }))
}

function header() {
  const { revenues, settings } = expStore.getExpenses()
  const today = todayKey()
  const total = expModel.totalRevenues(revenues)
  const todayTotal = expModel.totalRevenues(revenues, { startDate: today, endDate: today })
  const days = new Set(revenues.map((revenue) => revenue.date)).size
  const comparison = compareMode ? compareRows(revenues) : []
  const compareTotal = comparison.reduce((sum, row) => sum + row.total, 0)

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
        ${compareMode && comparison.length > 0
          ? `<div class="stat">
              <span class="stat-label">Comparaison</span>
              <span class="stat-value text-primary">${formatMoney(compareTotal, settings.currency)}</span>
            </div>`
          : ''
        }
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
    compareUnits: COMPARE_UNITS,
    compareMode,
    compareUnit,
    comparePeriods,
    dateFilter: true,
    startDate,
    endDate,
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
      </section>`
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
        </article>`
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
  if (compareMode) return compareHtml(compareRows(revenues), settings)
  /* « Du » et « Au » filtrent la liste ; vides, ils ne retirent rien. */
  const period = revenues.filter(
    (revenue) => (!startDate || revenue.date >= startDate) && (!endDate || revenue.date <= endDate),
  )
  if (!period.length) {
    return emptyState()
  }
  const sorted = sortedRevenues(period)
  return layout === 'list' ? listHtml(sorted, settings) : daysHtml(sorted, settings)
}

function compareHtml(rows, settings) {
  if (!rows.length) {
    return `
      <div class="compare-empty">
        <span class="compare-empty-mark">${icon('chart', 28)}</span>
        <strong>Aucune période à comparer</strong>
        <p>Choisissez un jour, une semaine ou un mois dans la barre au-dessus, puis <strong>Ajouter</strong>.</p>
      </div>`
  }
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  return `
    <div class="compare-view">
      <div class="compare-grid">
        ${rows.map((row) => `
          <article class="compare-card">
            <div class="compare-card-top">
              <span class="compare-card-kind">${esc(COMPARE_UNIT_LABEL[row.unit] || 'Période')}</span>
              ${row.delta === null
                ? `<span class="compare-delta compare-delta--ref">Référence</span>`
                : `<span class="compare-delta ${row.delta >= 0 ? 'is-up' : 'is-down'}">${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(1).replace('.', ',')} %</span>`}
            </div>
            <strong class="compare-card-label">${esc(row.label)}</strong>
            <span class="compare-card-total">${formatMoney(row.total, settings.currency)}</span>
            <span class="compare-card-meta">${row.count} entrée${row.count > 1 ? 's' : ''}${row.days > 1 ? ` · ${formatMoney(row.total / row.days, settings.currency)} / jour` : ''}</span>
            <div class="compare-track" role="img" aria-label="${esc(row.label)} : ${row.share} % du maximum"><span style="width:${row.share}%"></span></div>
          </article>`).join('')}
      </div>
      <div class="compare-summary">
        <span>Total des ${rows.length} période${rows.length > 1 ? 's' : ''}</span>
        <strong>${formatMoney(total, settings.currency)}</strong>
      </div>
    </div>`
}

function paint() {
  if (!host) return
  host.innerHTML = `
    <section class="view view--revenues">
      ${header()}
      ${toolbar()}
      ${actions()}
      <div class="list-results" data-role="results">
        ${results()}
      </div>
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
    onStartDateChange: (value) => {
      startDate = value || ''
      /* Une période inversée n'afficherait rien : on remet l'autre
         borne dans l'ordre plutôt que de laisser un écran vide. */
      if (startDate && endDate && endDate < startDate) endDate = startDate
      paint()
    },
    onEndDateChange: (value) => {
      endDate = value || ''
      if (startDate && endDate && endDate < startDate) startDate = endDate
      paint()
    },
    onCompareModeChange: (value) => {
      compareMode = value
      paint()
    },
    onCompareUnitChange: (value) => {
      compareUnit = value === 'week' || value === 'month' ? value : 'day'
      paint()
    },
    onComparePeriodAdd: (date) => {
      if (comparePeriods.some((period) => period.unit === compareUnit && period.date === date)) return
      comparePeriods = [...comparePeriods, { unit: compareUnit, date }]
      paint()
    },
    onComparePeriodRemove: (index) => {
      comparePeriods = comparePeriods.filter((_, i) => i !== index)
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