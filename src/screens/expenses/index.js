/* ------------------------------------------------------------------ */
/* Écran Dépenses                                                      */
/*                                                                     */
/* Trois onglets : Dépenses, Catégories, Investissements. Les recettes */
/* ont leur propre écran. L'écran ouvre sur le premier onglet, sans    */
/* section privilégiée : chaque section est à un appui.                */
/* Ce fichier ne fait que l'assemblage : chaque onglet a son module,    */
/* l'état partagé vit dans state.js.                                   */
/* ------------------------------------------------------------------ */

import { esc } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { deferWhileEditing } from '../../ui/dialog.js'
import { bindToolbar } from '../../ui/toolbar.js'
import { categoriesHtml, bindCategoryReorder, saveCategoryOrder, controls as categoriesControls } from './categories-tab.js'
import { results, controls as expensesControls } from './expenses-tab.js'
import { categoryTabsHtml, typeTabsHtml, filterbar } from './filters.js'
import { header } from './header.js'
import { investmentsHtml, controls as investmentsControls } from './investments-tab.js'
import { resetFilters, resetState, state } from './state.js'

const TABS = [
  { value: 'expenses', label: 'Dépenses', icon: 'creditCard' },
  { value: 'categories', label: 'Catégories', icon: 'tag' },
  { value: 'investments', label: 'Investissements', icon: 'chart' },
]

const TOOLBAR_TABS = TABS.map((tab) => tab.value)

/* L'écran ouvre sur la première section (voir state.js) ; les autres
   restent à un appui, avec leur case de catégorie. */
function bodyHtml() {
  if (state.tab === 'categories') return categoriesHtml()
  if (state.tab === 'investments') return investmentsHtml()
  return results()
}

function controlsHtml() {
  if (state.tab === 'categories') return categoriesControls()
  if (state.tab === 'investments') return investmentsControls()
  return expensesControls()
}

function tabsHtml() {
  return TABS.map(
    (tab) => `
      <button type="button" class="expense-tab ${state.tab === tab.value ? 'is-active' : ''}" role="tab"
              data-action="set-expense-tab" data-value="${tab.value}"
              aria-selected="${state.tab === tab.value ? 'true' : 'false'}">
        ${icon(tab.icon, 16)} ${esc(tab.label)}
      </button>`,
  ).join('')
}

/** La barre d'onglets, conteneur compris : c'est lui qui porte le style. */
function tabsBar() {
  return `<div class="expenses-tabs" role="tablist" aria-label="Sections dépenses">${tabsHtml()}</div>`
}

function paint() {
  if (!state.host) return
  state.host.innerHTML = `
    <section class="view view--expenses">
      ${header()}
      ${tabsBar()}
      ${state.tab === 'expenses' ? filterbar() : ''}
      <div class="section-controls" data-role="controls">${controlsHtml()}</div>
      <div class="list-results" data-role="results">${bodyHtml()}</div>
    </section>`
  bindBody()
}

/** Branche les contrôles de l'écran (les actions globales ne les couvrent pas). */
function bindBody() {
  const host = state.host
  if (!host) return

  /* Recherche */
  host.querySelector('#expenses-search')?.addEventListener('input', (event) => {
    state.query = event.target.value
    const clear = host.querySelector('[data-action="clear-expenses-search"]')
    if (clear) clear.hidden = !state.query
    refreshResults()
  })

  /* Filtre catégorie */
  host.querySelectorAll('[data-action="set-expense-category"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.categoryFilter = btn.dataset.value
      refresh()
    })
  })

  /* Filtre type */
  host.querySelectorAll('[data-action="set-expense-type"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.typeFilter = btn.dataset.value
      refresh()
    })
  })

  /* Changement d'onglet */
  host.querySelectorAll('[data-action="set-expense-tab"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.value
      refresh()
    })
  })

  host.querySelector('[data-action="clear-expenses-search"]')?.addEventListener('click', () => {
    state.query = ''
    const input = host.querySelector('#expenses-search')
    if (input) input.value = ''
    const clear = host.querySelector('[data-action="clear-expenses-search"]')
    if (clear) clear.hidden = true
    refreshResults()
  })

  host.querySelector('[data-action="reset-expense-filters"]')?.addEventListener('click', () => {
    resetFilters()
    const input = host.querySelector('#expenses-search')
    if (input) input.value = ''
    refresh()
  })

  host.querySelector('[data-action="toggle-reorder-categories"]')?.addEventListener('click', () => {
    state.reorderMode = !state.reorderMode
    if (!state.reorderMode) saveCategoryOrder(host)
    refresh()
  })

  /* Tri & présentation : un seul onglet est monté à la fois. */
  for (const tab of TOOLBAR_TABS) {
    bindToolbar(host, `set-${tab}`, {
      onSort: (value) => {
        state.sort[tab] = value
        refresh()
      },
      onLayout: (value) => {
        state.layout[tab] = value === 'list' ? 'list' : 'cards'
        refresh()
      },
      onStartDateChange: (value) => {
        state.startDate = value || ''
        /* Une période inversée n'afficherait rien : on remet l'autre
           borne dans l'ordre plutôt que de laisser un écran vide. */
        if (state.startDate && state.endDate && state.endDate < state.startDate) state.endDate = state.startDate
        paint()
      },
      onEndDateChange: (value) => {
        state.endDate = value || ''
        if (state.startDate && state.endDate && state.endDate < state.startDate) state.startDate = state.endDate
        paint()
      },
    })
  }

  if (state.reorderMode) bindCategoryReorder(host)
}

function refreshResults() {
  const host = state.host
  const region = host?.querySelector('[data-role="results"]')
  if (region) region.innerHTML = bodyHtml()
  const catTabs = host?.querySelector('[data-role="expense-category-tabs"]')
  if (catTabs) catTabs.innerHTML = categoryTabsHtml()
  const typeTabs = host?.querySelector('[data-role="expense-type-tabs"]')
  if (typeTabs) typeTabs.innerHTML = typeTabsHtml()
  refreshHeader()
}

function refreshHeader() {
  const head = state.host?.querySelector('.screen-head')
  if (head) head.outerHTML = header()
}

function refresh() {
  const host = state.host
  if (!host) return
  if (!host.querySelector('section.view')) {
    paint()
    return
  }
  /* Une saisie en cours n'est jamais cassée par un redessin. */
  if (deferWhileEditing(host, refresh)) return
  /* Un seul chemin de rendu : tout reconstruire évite de laisser des
     morceaux en double quand la structure change. */
  paint()
}

export const expensesView = {
  id: 'expenses',
  route: 'depenses',
  label: 'Dépenses',
  icon: 'creditCard',
  mount(element) {
    resetState(element)
    paint()
  },
  update() {
    refresh()
  },
  resetFilters,
}
