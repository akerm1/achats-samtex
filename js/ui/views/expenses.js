/* ------------------------------------------------------------------ */
/* Vue Dépenses — suivi des charges, catégories, investissements, recettes */
/* ------------------------------------------------------------------ */

import { esc, escAttr, formatMoney, toNumber } from '../../core/utils.js'
import { icon } from '../icons.js'
import { deferWhileEditing } from '../view.js'
import { PROVIDER_WORKER } from '../../data/sync.js'
import { getState } from '../../data/store.js'
import * as expModel from '../../data/expenses.js'
import * as expStore from '../../data/expenses-store.js'

let host = null
let tab = 'expenses'
let categoryFilter = 'all'
let query = ''
let settingsOpen = false
let reorderMode = false

const TABS = [
  { value: 'expenses', label: 'Dépenses', icon: 'creditCard' },
  { value: 'categories', label: 'Catégories', icon: 'tag' },
  { value: 'investments', label: 'Investissements', icon: 'chart' },
  { value: 'revenues', label: 'Recettes', icon: 'trendingUp' },
]

const STATUS_TABS = [
  { value: 'all', label: 'Toutes' },
  { value: 'transfer', label: 'Transferts' },
  { value: 'regular', label: 'Régulières' },
]

function syncNote() {
  const { provider } = getState()
  if (provider === PROVIDER_WORKER) return ''
  return `<p class="list-head-note">${icon('cloud', 12)} Les dépenses ne sont synchronisées qu'avec le lien privé Cloudflare — ici, elles restent sur cet appareil.</p>`
}

function header() {
  const state = expStore.getExpenses()
  const { expenses, categories, investments, revenues, settings } = state

  let filtered = expenses
  if (categoryFilter !== 'all') filtered = filtered.filter((e) => e.categoryId === categoryFilter)
  if (query) {
    const needle = query.toLowerCase()
    filtered = filtered.filter(
      (e) =>
        expModel.categoryLabel(categories, e.categoryId).toLowerCase().includes(needle) ||
        (e.note || '').toLowerCase().includes(needle)
    )
  }

  const totals = expModel.sumByCategory(filtered, categories)
  const totalAmount = expModel.totalExpenses(filtered)
  const totalInvested = expModel.totalInvestments(investments)
  const remainingInvested = expModel.remainingInvestments(investments)
  const totalRevenue = expModel.totalRevenues(revenues)

  const cats = categories.map((c) => ({
    ...c,
    count: filtered.filter((e) => e.categoryId === c.id).length,
    total: totals.find((t) => t.category.id === c.id)?.total || 0,
  }))

  return `
    <header class="list-head">
      <div class="list-head-copy">
        <h1>Dépenses</h1>
        <p class="list-head-sub">
          <strong>${filtered.length}</strong> dépense${filtered.length > 1 ? 's' : ''}
          ${totalAmount ? ` · <span class="list-head-total">${formatMoney(totalAmount)} ${settings.currency}</span>` : ''}
        </p>
        ${syncNote()}
      </div>
      <div class="list-head-kpis">
        <div class="kpi">
          <span class="kpi-label">Investi</span>
          <strong class="kpi-value">${formatMoney(totalInvested)} ${settings.currency}</strong>
        </div>
        <div class="kpi">
          <span class="kpi-label">Restant</span>
          <strong class="kpi-value ${remainingInvested < 0 ? 'text-danger' : ''}">${formatMoney(remainingInvested)} ${settings.currency}</strong>
        </div>
        <div class="kpi">
          <span class="kpi-label">Recettes</span>
          <strong class="kpi-value text-success">${formatMoney(totalRevenue)} ${settings.currency}</strong>
        </div>
      </div>
    </header>`
}

function categoryTabsHtml() {
  const state = expStore.getExpenses()
  const { categories, expenses } = state
  const allCount = expenses.length

  return [
    { value: 'all', label: 'Toutes', count: allCount },
    ...categories.map((c) => ({ value: c.id, label: c.label, count: expenses.filter((e) => e.categoryId === c.id).length })),
  ]
    .map(
      (tab) => `
      <button type="button" class="tabchip ${categoryFilter === tab.value ? 'is-active' : ''}" role="tab"
              data-action="set-expense-category" data-value="${tab.value}"
              aria-selected="${categoryFilter === tab.value ? 'true' : 'false'}">
        ${esc(tab.label)}<span class="tabchip-count">${tab.count}</span>
      </button>`
    )
    .join('')
}

function typeTabsHtml() {
  const state = expStore.getExpenses()
  const { expenses } = state
  const transferCount = expenses.filter((e) => e.isTransfer).length
  const regularCount = expenses.filter((e) => !e.isTransfer).length

  return [
    { value: 'all', label: 'Toutes', count: expenses.length },
    { value: 'regular', label: 'Régulières', count: regularCount },
    { value: 'transfer', label: 'Transferts', count: transferCount },
  ]
    .map(
      (tab) => `
      <button type="button" class="tabchip ${typeFilter === tab.value ? 'is-active' : ''}" role="tab"
              data-action="set-expense-type" data-value="${tab.value}"
              aria-selected="${typeFilter === tab.value ? 'true' : 'false'}">
        ${esc(tab.label)}<span class="tabchip-count">${tab.count}</span>
      </button>`
    )
    .join('')
}

let typeFilter = 'all'

function filterbar() {
  return `
    <div class="filterbar" data-role="filterbar">
      <div class="filterbar-search">
        <label class="input-wrap" for="expenses-search">
          ${icon('search', 16)}
          <input id="expenses-search" type="search" autocomplete="off" enterkeyhint="search"
                 placeholder="Rechercher catégorie, note…"
                 value="${esc(query)}" aria-label="Rechercher dans les dépenses">
        </label>
        <button type="button" class="filterbar-clear" data-action="clear-expenses-search"
                aria-label="Effacer la recherche" title="Effacer" ${query ? '' : 'hidden'}>
          ${icon('x', 16)}
        </button>
      </div>
      <div class="filterbar-tabs" data-role="expense-category-tabs" role="tablist" aria-label="Catégorie">
        ${categoryTabsHtml()}
      </div>
      <div class="filterbar-tabs" data-role="expense-type-tabs" role="tablist" aria-label="Type">
        ${typeTabsHtml()}
      </div>
    </div>`
}

function results() {
  const state = expStore.getExpenses()
  const { expenses, categories, investments } = state

  let filtered = expenses
  if (categoryFilter !== 'all') filtered = filtered.filter((e) => e.categoryId === categoryFilter)
  if (typeFilter === 'transfer') filtered = filtered.filter((e) => e.isTransfer)
  if (typeFilter === 'regular') filtered = filtered.filter((e) => !e.isTransfer)
  if (query) {
    const needle = query.toLowerCase()
    filtered = filtered.filter(
      (e) =>
        expModel.categoryLabel(categories, e.categoryId).toLowerCase().includes(needle) ||
        (e.note || '').toLowerCase().includes(needle)
    )
  }

  if (!filtered.length) return emptyState()

  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date))

  return `
    <section class="group">
      <div class="grid grid--card">${sorted.map((exp) => renderExpenseCard(exp, categories, investments)).join('')}</div>
    </section>`
}

function emptyState() {
  const needle = query.trim()
  let title = 'Aucune dépense'
  let message = 'Ajoutez votre première dépense : choisissez une catégorie, le montant et la date.'
  if (needle) {
    title = 'Aucun résultat'
    message = `Aucune dépense ne correspond à « ${esc(needle)} ».`
  } else if (categoryFilter !== 'all') {
    const state = expStore.getExpenses()
    const cat = state.categories.find((c) => c.id === categoryFilter)
    title = `Aucune dépense — ${cat?.label || categoryFilter}`
    message = `Ajoutez une dépense dans cette catégorie.`
  } else if (typeFilter === 'transfer') {
    title = 'Aucun transfert'
    message = 'Les transferts d\'argent vers les investissements apparaîtront ici.'
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

function renderExpenseCard(exp, categories, investments) {
  const cat = categories.find((c) => c.id === exp.categoryId)
  const catLabel = cat?.label || exp.categoryId
  const catIcon = cat?.icon || 'tag'
  const catColor = cat?.color || '#757575'
  const amount = exp.amount !== null ? formatMoney(exp.amount) : '—'
  const linkedInv = exp.linkedInvestmentId ? investments.find((i) => i.id === exp.linkedInvestmentId) : null

  return `
    <article class="card ${exp.isTransfer ? 'card--transfer' : ''}" data-id="${esc(exp.id)}" style="--cat-color: ${catColor}">
      <div class="card-media card-media--category" style="background: ${catColor}">
        ${icon(catIcon, 24)}
      </div>
      <div class="card-body">
        <div class="card-top">
          <div class="card-name-row">
            <h4 class="card-name">${esc(catLabel)}</h4>
            ${exp.isTransfer ? `<span class="badge badge--purple">${icon('send', 10)} Transfert</span>` : ''}
          </div>
          <span class="card-amount">${esc(amount)}</span>
        </div>
        <div class="card-meta">
          <span class="card-date">${icon('calendar', 12)} ${exp.date}</span>
          ${linkedInv ? `<span class="card-link">${icon('link', 12)} Vers: ${esc(linkedInv.name)}</span>` : ''}
        </div>
        ${exp.note ? `<p class="card-note">${icon('messageSquare', 12)} ${esc(exp.note)}</p>` : ''}
        <div class="card-actions">
          <button type="button" class="icon-btn icon-btn--plain" data-action="edit-expense" data-id="${esc(exp.id)}" aria-label="Modifier" title="Modifier">${icon('edit', 14)}</button>
          <button type="button" class="icon-btn icon-btn--plain" data-action="delete-expense" data-id="${esc(exp.id)}" aria-label="Supprimer" title="Supprimer">${icon('trash', 14)}</button>
        </div>
      </div>
    </article>`
}

/* ================================================================ */
/* Onglet Catégories                                                  */
/* ================================================================ */

function categoriesHtml() {
  const state = expStore.getExpenses()
  const { categories, expenses } = state

  return `
    <div class="ana-toolbar">
      <button type="button" class="btn btn--primary btn--sm" data-action="open-category-form">${icon('plus', 14)} Nouvelle catégorie</button>
      <button type="button" class="btn btn--secondary btn--sm" data-action="toggle-reorder-categories">${icon(reorderMode ? 'grip' : 'list', 14)} ${reorderMode ? 'Terminer' : 'Réorganiser'}</button>
    </div>
    <div class="category-list" data-role="category-list" ${reorderMode ? 'data-reorder="true"' : ''}>
      ${categories
        .map((cat) => {
          const count = expenses.filter((e) => e.categoryId === cat.id).length
          const total = expenses.filter((e) => e.categoryId === cat.id).reduce((sum, e) => sum + (e.amount || 0), 0)
          return `
            <article class="category-card ${cat.isDefault ? 'is-default' : ''}" data-id="${esc(cat.id)}" draggable="${reorderMode && !cat.isDefault}">
              <div class="category-color" style="background: ${cat.color}">${icon(cat.icon, 20)}</div>
              <div class="category-info">
                <div class="category-name-row">
                  <strong>${esc(cat.label)}</strong>
                  ${cat.isDefault ? '<span class="badge badge--blue">Par défaut</span>' : ''}
                </div>
                <div class="category-stats">${count} dépense${count > 1 ? 's' : ''} · ${formatMoney(total)} ${state.settings.currency}</div>
              </div>
              <div class="category-actions">
                ${!cat.isDefault ? `
                  <button type="button" class="icon-btn icon-btn--plain" data-action="edit-category" data-id="${esc(cat.id)}" aria-label="Modifier" title="Modifier">${icon('edit', 14)}</button>
                  <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="delete-category" data-id="${esc(cat.id)}" aria-label="Supprimer" title="Supprimer">${icon('trash', 14)}</button>
                ` : ''}
                ${reorderMode && !cat.isDefault ? `<span class="drag-handle" aria-label="Déplacer">${icon('grip', 16)}</span>` : ''}
              </div>
            </article>`
        })
        .join('')}
    </div>`
}

/* ================================================================ */
/* Onglet Investissements                                             */
/* ================================================================ */

function investmentsHtml() {
  const state = expStore.getExpenses()
  const { investments, expenses, settings } = state

  const totalInvested = expModel.totalInvestments(investments)
  const totalRemaining = expModel.remainingInvestments(investments)

  return `
    <div class="investments-summary">
      <div class="kpi-card">
        <span class="kpi-label">Total investi</span>
        <strong class="kpi-value">${formatMoney(totalInvested)} ${settings.currency}</strong>
      </div>
      <div class="kpi-card ${totalRemaining < 0 ? 'danger' : ''}">
        <span class="kpi-label">Reste à récupérer</span>
        <strong class="kpi-value">${formatMoney(totalRemaining)} ${settings.currency}</strong>
      </div>
    </div>
    <div class="ana-toolbar">
      <button type="button" class="btn btn--primary btn--sm" data-action="open-investment-form">${icon('plus', 14)} Nouvel investissement</button>
    </div>
    <div class="investment-list" data-role="investment-list">
      ${investments
        .map((inv) => {
          const linkedExpenses = expenses.filter((e) => e.linkedInvestmentId === inv.id)
          const transferred = linkedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
          const progress = inv.amount > 0 ? Math.round((transferred / inv.amount) * 100) : 0
          return `
            <article class="card investment-card" data-id="${esc(inv.id)}">
              <div class="card-body">
                <div class="card-top">
                  <h4 class="card-name">${esc(inv.name)}</h4>
                  <span class="card-amount">${formatMoney(inv.amount)} ${settings.currency}</span>
                </div>
                <div class="investment-progress">
                  <div class="progress-bar" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
                    <div class="progress-fill" style="width: ${Math.min(100, progress)}%"></div>
                  </div>
                  <div class="progress-labels">
                    <span>Transféré: ${formatMoney(transferred)} ${settings.currency}</span>
                    <span>Restant: ${formatMoney(inv.remaining)} ${settings.currency}</span>
                  </div>
                </div>
                ${inv.note ? `<p class="card-note">${icon('messageSquare', 12)} ${esc(inv.note)}</p>` : ''}
                <div class="card-actions">
                  <button type="button" class="btn btn--secondary btn--sm" data-action="open-expense-form" data-prefill='{"isTransfer":true,"linkedInvestmentId":"${inv.id}"}'>${icon('send', 13)} Transférer</button>
                  <button type="button" class="icon-btn icon-btn--plain" data-action="edit-investment" data-id="${esc(inv.id)}" aria-label="Modifier" title="Modifier">${icon('edit', 14)}</button>
                  <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="delete-investment" data-id="${esc(inv.id)}" aria-label="Supprimer" title="Supprimer">${icon('trash', 14)}</button>
                </div>
                ${linkedExpenses.length ? `
                  <details class="investment-transfers">
                    <summary>${icon('chevronDown', 12)} Transferts (${linkedExpenses.length})</summary>
                    <div class="transfer-list">
                      ${linkedExpenses
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .map(
                          (e) => `
                          <div class="transfer-item">
                            <span>${e.date}</span>
                            <strong>${formatMoney(e.amount)} ${settings.currency}</strong>
                            ${e.note ? `<span class="u-muted">${esc(e.note)}</span>` : ''}
                          </div>`
                        )
                        .join('')}
                    </div>
                  </details>
                ` : ''}
              </div>
            </article>`
        })
        .join('')}
      ${!investments.length ? `
        <div class="empty" style="grid-column: 1 / -1;">
          <span class="empty-mark">${icon('chart', 30)}</span>
          <div class="empty-copy">
            <strong>Aucun investissement</strong>
            <p>Ajoutez un investissement pour suivre les transferts d'argent et le montant restant.</p>
          </div>
          <button type="button" class="btn btn--primary btn--lg" data-action="open-investment-form">${icon('plus', 16)} Créer un investissement</button>
        </div>
      ` : ''}
    </div>`
}

/* ================================================================ */
/* Onglet Recettes                                                    */
/* ================================================================ */

function revenuesHtml() {
  const state = expStore.getExpenses()
  const { revenues, settings } = state

  const totalRevenue = expModel.totalRevenues(revenues)
  const byDate = expModel.revenueByDate(revenues)

  return `
    <div class="revenues-summary">
      <div class="kpi-card">
        <span class="kpi-label">Total recettes</span>
        <strong class="kpi-value text-success">${formatMoney(totalRevenue)} ${settings.currency}</strong>
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
        .map((day) => `
        <article class="card revenue-day-card" data-date="${esc(day.date)}">
          <div class="card-body">
            <div class="card-top">
              <h4 class="card-name">${esc(day.date)}</h4>
              <span class="card-amount text-success">${formatMoney(day.total)} ${settings.currency}</span>
            </div>
            <div class="card-meta">${day.count} entrée${day.count > 1 ? 's' : ''}</div>
            <div class="card-actions">
              <button type="button" class="icon-btn icon-btn--plain" data-action="open-revenue-day" data-date="${esc(day.date)}" aria-label="Voir détails" title="Voir détails">${icon('list', 14)}</button>
            </div>
          </div>
        </article>`
        )
        .join('')}
      ${!revenues.length ? `
        <div class="empty" style="grid-column: 1 / -1;">
          <span class="empty-mark">${icon('trendingUp', 30)}</span>
          <div class="empty-copy">
            <strong>Aucune recette</strong>
            <p>Enregistrez vos revenus quotidiens pour suivre la performance du shop.</p>
          </div>
          <button type="button" class="btn btn--primary btn--lg" data-action="open-revenue-form">${icon('plus', 16)} Ajouter une recette</button>
        </div>
      ` : ''}
    </div>`
}

/* ================================================================ */
/* Rendu principal                                                   */
/* ================================================================ */

function bodyHtml() {
  if (tab === 'categories') return categoriesHtml()
  if (tab === 'investments') return investmentsHtml()
  if (tab === 'revenues') return revenuesHtml()
  return results()
}

function paint() {
  if (!host) return
  host.innerHTML = `
    <section class="view view--expenses">
      ${header()}
      <div class="expenses-tabs" role="tablist" aria-label="Sections dépenses">
        ${TABS.map(
          (t) => `
          <button type="button" class="expense-tab ${tab === t.value ? 'is-active' : ''}" role="tab"
                  data-action="set-expense-tab" data-value="${t.value}"
                  aria-selected="${tab === t.value ? 'true' : 'false'}">
            ${icon(t.icon, 16)} ${esc(t.label)}
          </button>`
        ).join('')}
      </div>
      ${filterbar()}
      <div class="list-results" data-role="results">${bodyHtml()}</div>
    </section>`
  bindBody()
}

function bindBody() {
  // Search
  const searchInput = host.querySelector('#expenses-search')
  searchInput?.addEventListener('input', (event) => {
    query = event.target.value
    const clear = host.querySelector('[data-action="clear-expenses-search"]')
    if (clear) clear.hidden = !query
    refreshResults()
  })

  // Category filter
  host.querySelectorAll('[data-action="set-expense-category"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      categoryFilter = btn.dataset.value
      refresh()
    })
  })

  // Type filter
  host.querySelectorAll('[data-action="set-expense-type"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      typeFilter = btn.dataset.value
      refresh()
    })
  })

  // Tab switching
  host.querySelectorAll('[data-action="set-expense-tab"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.value
      refresh()
    })
  })

  // Actions
  host.querySelector('[data-action="clear-expenses-search"]')?.addEventListener('click', () => {
    query = ''
    const input = host.querySelector('#expenses-search')
    if (input) input.value = ''
    const clear = host.querySelector('[data-action="clear-expenses-search"]')
    if (clear) clear.hidden = true
    refreshResults()
  })

  host.querySelector('[data-action="reset-expense-filters"]')?.addEventListener('click', () => {
    query = ''
    categoryFilter = 'all'
    typeFilter = 'all'
    const input = host.querySelector('#expenses-search')
    if (input) input.value = ''
    refresh()
  })

  host.querySelector('[data-action="toggle-reorder-categories"]')?.addEventListener('click', () => {
    reorderMode = !reorderMode
    refresh()
    if (!reorderMode) saveCategoryOrder()
  })

  // Drag & drop for categories
  if (reorderMode) {
    const list = host.querySelector('[data-role="category-list"]')
    let draggedId = null
    list?.querySelectorAll('.category-card').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        draggedId = card.dataset.id
        card.classList.add('dragging')
        e.dataTransfer.effectAllowed = 'move'
      })
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging')
        draggedId = null
      })
      card.addEventListener('dragover', (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const after = getDragAfterElement(list, e.clientY)
        const dragging = list.querySelector('.dragging')
        if (after == null) list.appendChild(dragging)
        else list.insertBefore(dragging, after)
      })
      card.addEventListener('drop', () => {
        // Order saved on toggle off
      })
    })
  }

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.category-card:not(.dragging)')]
    return draggableElements.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect()
        const offset = y - box.top - box.height / 2
        if (offset < 0 && offset > closest.offset) return { offset, element: child }
        return closest
      },
      { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element
  }

  function saveCategoryOrder() {
    const list = host.querySelector('[data-role="category-list"]')
    const orderedIds = [...list?.querySelectorAll('.category-card') || []].map((c) => c.dataset.id)
    expStore.reorderCategories(orderedIds)
  }
}

function refreshResults() {
  const region = host?.querySelector('[data-role="results"]')
  if (region) region.innerHTML = bodyHtml()
  const catTabs = host?.querySelector('[data-role="expense-category-tabs"]')
  if (catTabs) catTabs.innerHTML = categoryTabsHtml()
  const typeTabs = host?.querySelector('[data-role="expense-type-tabs"]')
  if (typeTabs) typeTabs.innerHTML = typeTabsHtml()
  refreshHeader()
}

function refreshHeader() {
  const head = host?.querySelector('.list-head')
  if (head) head.outerHTML = header()
}

function refresh() {
  if (!host) return
  if (!host.querySelector('section.view')) {
    paint()
    return
  }
  if (deferWhileEditing(host, refresh)) return
  host.querySelector('.list-head')?.remove()
  host.querySelector('.filterbar')?.remove()
  host.querySelector('.expenses-tabs')?.remove()
  host.querySelector('section.view')?.insertAdjacentHTML('afterbegin', `${header()}${filterbar()}`)
  bindBody()
  refreshResults()
}

export const expensesView = {
  id: 'expenses',
  route: 'depenses',
  label: 'Dépenses',
  icon: 'creditCard',
  mount(element) {
    host = element
    tab = 'expenses'
    categoryFilter = 'all'
    typeFilter = 'all'
    query = ''
    settingsOpen = false
    reorderMode = false
    paint()
  },
  update() {
    refresh()
  },
  resetFilters() {
    query = ''
    categoryFilter = 'all'
    typeFilter = 'all'
  },
}