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

import { esc, formatDate, formatMoney, periodLabel } from '../../core/utils.js'
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
let compareUnit = 'day' /* « day » ou « month » */
let comparePeriods = [] /* périodes ajoutées : { unit, key } — sans année */

/* Sélection multiple : un appui long ouvre le mode, les appuis suivants
   ajoutent ou retirent des lignes. Le total s'affiche en direct. */
let selectedIds = new Set()
let longPressTimer = null

/** Une date « AAAA-MM-JJ » reste locale : midi évite le décalage de fuseau. */
function dayLabel(date) {
  return formatDate(`${String(date || '')}T12:00:00`)
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

/** Une carte par année couverte par les données, pour chaque période choisie. */
function compareRows(revenues) {
  const rows = expModel
    .revenuePeriods(revenues, comparePeriods)
    .map((entry) => ({ ...entry, label: `${periodLabel(entry.unit, entry.key)} ${entry.year}` }))
  const max = rows.reduce((peak, row) => Math.max(peak, row.total), 0)
  const firstTotals = new Map()
  for (const row of rows) {
    const group = `${row.unit}:${row.key}`
    if (!firstTotals.has(group)) firstTotals.set(group, row.total)
  }
  const seen = new Set()
  return rows.map((row) => {
    const group = `${row.unit}:${row.key}`
    const reference = firstTotals.get(group) || 0
    const isReference = !seen.has(group)
    seen.add(group)
    return {
      ...row,
      share: max > 0 ? Math.round((row.total / max) * 100) : 0,
      delta: isReference || reference <= 0 ? null : ((row.total - reference) / reference) * 100,
    }
  })
}

function header() {
  const { revenues, settings } = expStore.getExpenses()
  const total = expModel.totalRevenues(revenues)
  /* Le mois courant se remplit jour après jour, puis repart à zéro. */
  const monthTotal = expModel.totalRevenues(revenues, expModel.monthRange())
  const days = new Set(revenues.map((revenue) => revenue.date)).size
  const comparison = compareMode ? compareRows(revenues) : []
  const compareTotal = comparison.reduce((sum, row) => sum + row.total, 0)
  /* Total des lignes sélectionnées par appui long, affiché en direct. */
  const selectedTotal = revenues
    .filter((revenue) => selectedIds.has(revenue.id))
    .reduce((sum, revenue) => sum + (revenue.amount || 0), 0)

  return `
    <header class="screen-head">
      <div class="screen-head-main">
        <span class="screen-eyebrow">Entrées du shop</span>
        <h1 class="screen-title text-success">Recettes</h1>
        <p class="screen-sub">
          <strong>${revenues.length}</strong> entrée${revenues.length > 1 ? 's' : ''}
          ${total ? ` · <span class="screen-total text-success">${formatMoney(total, settings.currency)}</span>` : ''}
        </p>
      </div>
      <div class="screen-stats">
        ${selectedIds.size > 0
          ? `<div class="stat stat--selection" data-role="selection-total">
              <span class="stat-label">
                Sélection · ${selectedIds.size}
                <button type="button" class="stat-clear" data-action="clear-selection" aria-label="Effacer la sélection">${icon('x', 12)}</button>
              </span>
              <span class="stat-value text-success">${formatMoney(selectedTotal, settings.currency)}</span>
            </div>`
          : ''
        }
        <div class="stat stat--success" data-role="month-total">
          <span class="stat-label">Ce mois</span>
          <span class="stat-value">${formatMoney(monthTotal, settings.currency)}</span>
        </div>
        <div class="stat stat--success" data-role="total-stats">
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
    <article class="card revenue-card${selectedIds.has(revenue.id) ? ' is-selected' : ''}" data-id="${esc(revenue.id)}" data-selectable="${esc(revenue.id)}">
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
        <article class="revenue-row${selectedIds.has(revenue.id) ? ' is-selected' : ''}" data-id="${esc(revenue.id)}" data-selectable="${esc(revenue.id)}">
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
  /* Changer de vue ou de filtre efface la sélection : les ids ne
     correspondent plus forcément à ce qui est affiché. */
  selectedIds.clear()
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
        <strong>Aucune recette sur ces périodes</strong>
        <p>Choisissez un jour ou un mois dans la barre au-dessus, puis <strong>Ajouter</strong>.</p>
      </div>`
  }
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  /* Écart dernière − première année de chaque période comparée. */
  const gap = expModel.revenueComparisonGap(rows)
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
      ${gap ? `
      <div class="compare-gap ${gap.gap >= 0 ? 'is-up' : 'is-down'}" data-role="compare-gap">
        ${icon(gap.gap >= 0 ? 'trendingUp' : 'trendingDown', 16)}
        <span class="compare-gap-label">
          Dernière − première période${gap.pairs > 1 ? ` (${gap.pairs})` : ''}
          <span class="compare-gap-sub">${formatMoney(gap.first, settings.currency)} → ${formatMoney(gap.last, settings.currency)}</span>
        </span>
        <strong>${gap.gap >= 0 ? '+' : '−'}${formatMoney(Math.abs(gap.gap), settings.currency)}</strong>
      </div>` : ''}
      <div class="compare-summary">
        <span>Total des ${rows.length} période${rows.length > 1 ? 's' : ''}</span>
        <strong>${formatMoney(total, settings.currency)}</strong>
      </div>
    </div>`
}

/** Met à jour uniquement l'en-tête (total sélection) sans repeindre la liste. */
function refreshSelectionTotal() {
  if (!host) return
  const head = host.querySelector('.screen-stats')
  if (!head) return
  const section = host.querySelector('.view--revenues')
  if (!section) return
  /* On re-render le header entier : il est petit, pas besoin d'optimiser. */
  const newHead = document.createElement('template')
  newHead.innerHTML = header().trim()
  const oldHead = host.querySelector('.screen-head')
  if (oldHead) oldHead.replaceWith(newHead.content.firstChild)
}

/** Bascule la sélection d'une recette : ajoute si absente, retire sinon. */
function toggleSelection(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id)
  } else {
    selectedIds.add(id)
  }
  if (!host) return
  const el = host.querySelector(`[data-selectable="${CSS.escape(id)}"]`)
  if (el) el.classList.toggle('is-selected', selectedIds.has(id))
  refreshSelectionTotal()
}

/** Efface toute la sélection et rafraîchit l'en-tête. */
function clearSelection() {
  if (!selectedIds.size) return
  selectedIds.clear()
  if (!host) return
  host.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'))
  refreshSelectionTotal()
}

/** Attache les gestes de sélection : appui long pour initier, appui court
   pour ajouter/retirer une ligne, effacer depuis le badge. */
function bindSelection() {
  if (!host) return
  const LONG_PRESS_MS = 400
  let pending = null

  const cancelPending = () => {
    if (pending) {
      clearTimeout(pending.timer)
      pending = null
    }
  }

  const findSelectable = (target) => {
    if (!target || !(target instanceof Element)) return null
    return target.closest('[data-selectable]')
  }

  const isInteractiveTarget = (target) => {
    /* On laisse les boutons d'action (modifier, supprimer) fonctionner
       normalement : l'appui long ne doit pas interférer avec eux. */
    return Boolean(target?.closest('button, a, input, textarea, [contenteditable="true"]'))
  }

  host.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const row = findSelectable(event.target)
    if (!row || isInteractiveTarget(event.target)) return
    const id = row.getAttribute('data-selectable')
    if (!id) return
    pending = {
      id,
      row,
      fired: false,
      timer: setTimeout(() => {
        if (!pending) return
        pending.fired = true
        row.classList.add('is-pressing')
        /* Si rien n'était sélectionné, l'appui long démarre la sélection
           avec cette ligne, comme dans la galerie du téléphone. */
        if (selectedIds.size === 0) {
          toggleSelection(id)
        } else {
          toggleSelection(id)
        }
        if (navigator.vibrate) navigator.vibrate(20)
      }, LONG_PRESS_MS),
    }
  })

  host.addEventListener('pointerup', (event) => {
    if (!pending) return
    const { id, fired } = pending
    cancelPending()
    /* Si l'appui long n'a pas déclenché mais qu'on est en mode sélection,
       un appui court sur une ligne l'ajoute/retire de la sélection. */
    if (!fired && selectedIds.size > 0) {
      const row = findSelectable(event.target)
      if (row && row.getAttribute('data-selectable') === id && !isInteractiveTarget(event.target)) {
        event.preventDefault()
        toggleSelection(id)
      }
    }
  })

  host.addEventListener('pointercancel', cancelPending)
  host.addEventListener('pointerleave', cancelPending)
  host.addEventListener('contextmenu', (event) => {
    /* Sur desktop, le clic droit ne doit pas ouvrir le menu pendant
       un appui long en cours. */
    if (pending && pending.fired) event.preventDefault()
  })

  host.addEventListener('click', (event) => {
    const clearBtn = event.target.closest('[data-action="clear-selection"]')
    if (clearBtn) {
      event.preventDefault()
      clearSelection()
    }
  })
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
      compareUnit = value === 'month' ? 'month' : 'day'
      paint()
    },
    onComparePeriodAdd: (value) => {
      const text = String(value || '')
      const key = compareUnit === 'month' ? text.slice(5, 7) : text.slice(5)
      const valid = compareUnit === 'month' ? /^\d{2}$/.test(key) : /^\d{2}-\d{2}$/.test(key)
      if (!valid) return
      if (comparePeriods.some((period) => period.unit === compareUnit && period.key === key)) return
      comparePeriods = [...comparePeriods, { unit: compareUnit, key }]
      paint()
    },
    onComparePeriodRemove: (index) => {
      comparePeriods = comparePeriods.filter((_, i) => i !== index)
      paint()
    },
  })
  bindSelection()
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