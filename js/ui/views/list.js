/* ------------------------------------------------------------------ */
/* Vue Liste — filtres, tri, groupes par catégorie                     */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import {
  CATEGORY_VALUES,
  STATUS,
  categoryLabel,
  filterProducts,
  groupByCategory,
  sortProducts,
  sumTotal,
} from '../../data/model.js'
import { getPrefs, getProducts, getState, isLoaded, setPrefs } from '../../data/store.js'
import { icon } from '../icons.js'
import { renderProductCard } from '../product-card.js'
import { deferWhileEditing, loadingBlock } from '../view.js'

let host = null
let query = ''

const STATUS_TABS = [
  { value: 'todo', label: 'À acheter' },
  { value: 'bought', label: 'Achetés' },
  { value: 'all', label: 'Tous' },
]

function counts() {
  const products = getProducts()
  const bought = products.filter((item) => item.status === STATUS.BOUGHT).length
  const categories = {}
  for (const type of CATEGORY_VALUES) {
    categories[type] = products.filter((item) => (item.type || 'autre') === type).length
  }
  return { todo: products.length - bought, bought, all: products.length, categories }
}

function header() {
  const prefs = getPrefs()
  const products = getProducts()
  const scoped = filterProducts(products, { status: prefs.filter, category: prefs.category, query })
  return `
    <div class="view-head">
      <div>
        <h1>Ma liste d'achat</h1>
        <p>${products.length} produit(s) · ≈ ${formatMoney(sumTotal(sortProducts(scoped, prefs.sort)).total)} dans la vue en cours.</p>
      </div>
    </div>`
}

function toolbar() {
  return `
    <div class="toolbar">
      <div class="toolbar-row">
        <label class="input-wrap" for="list-search">
          ${icon('search', 14)}
          <input id="list-search" type="search" autocomplete="off"
                 placeholder="Rechercher un produit, une couleur, un fournisseur…"
                 value="${esc(query)}" aria-label="Rechercher dans la liste">
        </label>
      </div>
      <div class="scroller" data-role="status-tabs" role="tablist" aria-label="Statut">${statusTabsHtml(counts())}</div>
      <div class="scroller" data-role="category-chips">${categoryChipsHtml(counts())}</div>
    </div>`
}

function statusTabsHtml(total) {
  const prefs = getPrefs()
  return STATUS_TABS.map(
    (tab) => `
      <button type="button" class="chip ${prefs.filter === tab.value ? 'is-active' : ''}" role="tab"
              data-action="set-filter" data-value="${tab.value}"
              aria-selected="${prefs.filter === tab.value ? 'true' : 'false'}">
        ${esc(tab.label)}<span class="chip-count">${total[tab.value]}</span>
      </button>`,
  ).join('')
}

function categoryChipsHtml(total) {
  const prefs = getPrefs()
  const all = `
    <button type="button" class="chip ${prefs.category === 'all' ? 'is-active' : ''}" data-action="set-category" data-value="all">
      ${icon('filter', 12)} Toutes
    </button>`
  const categories = CATEGORY_VALUES.filter((type) => total.categories[type] > 0).map(
    (type) => `
      <button type="button" class="chip ${prefs.category === type ? 'is-active' : ''}" data-action="set-category" data-value="${type}">
        ${esc(categoryLabel(type))}<span class="chip-count">${total.categories[type]}</span>
      </button>`,
  )
  return all + categories.join('')
}

function results() {
  const prefs = getPrefs()
  const filtered = sortProducts(
    filterProducts(getProducts(), { status: prefs.filter, category: prefs.category, query }),
    prefs.sort,
  )

  if (!filtered.length) {
    const needle = query.trim()
    let title = 'Liste vide'
    let message = 'Aucun produit dans cette vue.'
    if (needle) {
      title = 'Aucun résultat'
      message = `Aucun produit ne correspond à « ${esc(needle)} ».`
    } else if (prefs.filter === 'todo') {
      title = 'Liste vide'
      message = 'Ajoutez vos articles à acheter : la liste est partagée sur vos appareils via GitHub.'
    } else if (prefs.filter === 'bought') {
      title = 'Aucun produit coché'
      message = 'Les articles que vous cochez après achat apparaîtront ici.'
    }
    const intro = !getState().isConfigured
      ? `
      <div class="setup-card" data-role="setup">
        <span class="setup-mark">${icon('link', 18)}</span>
        <div class="setup-copy">
          <strong>Retrouvez la même liste partout</strong>
          <p>Connectez votre compte GitHub une fois : téléphone et ordinateur affichent alors la même liste,
             synchronisée automatiquement toutes les 6 secondes.</p>
        </div>
        <button type="button" class="btn btn--primary btn--sm" data-action="go-settings">${icon('sliders', 13)} Ouvrir les réglages</button>
      </div>`
      : ''
    return `
      ${intro}
      <div class="empty">
        ${icon(needle ? 'searchX' : 'bag', 28)}
        <div><strong>${title}</strong>${message}</div>
        ${
          needle
            ? '<button type="button" class="btn btn--ghost" data-action="reset-filters">Réinitialiser les filtres</button>'
            : `<button type="button" class="btn btn--primary" data-action="open-form">${icon('plus', 15)} Ajouter un produit</button>`
        }
      </div>`
  }

  const estimate = sumTotal(filtered)
  const summary = `
    <p class="u-muted" style="font-size:12px;margin-bottom:12px">
      ${filtered.length} produit(s) affiché(s)${
        estimate.priced ? ` · ≈ <strong>${formatMoney(estimate.total)}</strong> (${estimate.priced} chiffré(s))` : ''
      }
    </p>`

  /* Le tri par priorité garde une liste à plat : les urgences d'abord. */
  const body =
    prefs.sort === 'priority'
      ? sectionHtml('', filtered)
      : [...groupByCategory(filtered).entries()].map(([type, items]) => sectionHtml(categoryLabel(type), items)).join('')

  return summary + body
}

function sectionHtml(title, items) {
  const total = sumTotal(items)
  return `
    <section class="group">
      ${
        title
          ? `<header class="group-head">
              <span class="dot"></span>
              <h3>${esc(title)}</h3>
              <span class="group-count">${items.length}</span>
              ${total.total ? `<span class="group-total">${formatMoney(total.total)}</span>` : ''}
            </header>`
          : ''
      }
      <div class="grid">${items.map(renderProductCard).join('')}</div>
    </section>`
}

function paint() {
  host.innerHTML = `
    <section class="view">
      ${header()}
      ${toolbar()}
      <div data-role="results">${results()}</div>
    </section>`
  bindToolbar()
}

function bindToolbar() {
  host.querySelector('#list-search')?.addEventListener('input', (event) => {
    query = event.target.value
    refreshResults()
  })
}

/** Rafraîchit uniquement les zones de contenu (le champ de recherche survit). */
function refreshResults() {
  const resultsRegion = host?.querySelector('[data-role="results"]')
  if (resultsRegion) resultsRegion.innerHTML = results()
  const tabsRegion = host?.querySelector('[data-role="status-tabs"]')
  if (tabsRegion) tabsRegion.innerHTML = statusTabsHtml(counts())
  const chipsRegion = host?.querySelector('[data-role="category-chips"]')
  if (chipsRegion) chipsRegion.innerHTML = categoryChipsHtml(counts())
}

function refresh() {
  if (!host) return
  if (!host.querySelector('section.view')) {
    paint()
    return
  }
  /* On ne casse jamais une saisie en cours (recherche…). */
  if (deferWhileEditing(host, refresh)) return
  host.querySelector('.view-head')?.remove()
  host.querySelector('.toolbar')?.remove()
  const section = host.querySelector('section.view')
  section?.insertAdjacentHTML('afterbegin', `${header()}${toolbar()}`)
  bindToolbar()
  refreshResults()
}

export const listView = {
  id: 'list',
  route: 'liste',
  label: 'Liste',
  icon: 'cart',
  mount(element) {
    host = element
    if (!isLoaded()) {
      host.innerHTML = loadingBlock()
      return
    }
    paint()
  },
  update() {
    refresh()
  },
  /** Remet la recherche et les filtres à zéro. */
  resetFilters() {
    query = ''
    setPrefs({ filter: 'todo', category: 'all', sort: 'recent' })
  },
  focusSearch() {
    host?.querySelector('#list-search')?.focus()
  },
}