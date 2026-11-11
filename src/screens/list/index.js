/* ------------------------------------------------------------------ */
/* Vue Liste — filtres, tri, groupes par catégorie                     */
/*                                                                      */
/* Refonte 9.0 : l'écran s'ouvre sur un en-tête qui compte et chiffre la */
/* vue, puis une barre de filtres en trois couches, puis une barre      */
/* d'outils discrète pour le tri et la présentation.                    */
/*                                                                      */
/* Trois couches plutôt qu'un seul bloc, parce qu'elles se pilotent     */
/* séparément : la recherche a son propre cycle de vie (on ne veut pas */
/* la repeindre à chaque frappe), les filtres non.                     */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import {
  CARD_LAYOUTS,
  CATEGORY_VALUES,
  SORTS,
  STATUS,
  categoryLabel,
  filterProducts,
  groupByCategory,
  sortProducts,
  sumTotal,
} from '../../data/products-model.js'
import { getPrefs, getProducts, getState, isLoaded, setPrefs } from '../../data/store.js'
import { icon } from '../../ui/icons.js'
import { renderProductCard } from './card.js'
import { deferWhileEditing, loadingBlock } from '../../ui/dialog.js'

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

/** Le total de la vue courante, affiché comme un en-tête de chapitre. */
function header() {
  const prefs = getPrefs()
  const products = getProducts()
  const scoped = filterProducts(products, { status: prefs.filter, category: prefs.category, query })
  const estimate = sumTotal(sortProducts(scoped, prefs.sort))
  const count = scoped.length
  const total = counts()
  return `
    <header class="screen-head">
      <div class="screen-head-main">
        <span class="screen-eyebrow">Carnet d'achats</span>
        <h1 class="screen-title">Ma liste</h1>
        <p class="screen-sub">
          <strong>${count}</strong> produit${count > 1 ? 's' : ''}
          ${estimate.priced ? ` · <span class="screen-total">${formatMoney(estimate.total)}</span>` : ''}
        </p>
      </div>
      <div class="screen-stats">
        <div class="stat">
          <span class="stat-label">À acheter</span>
          <span class="stat-value">${total.todo}</span>
        </div>
        <div class="stat stat--accent">
          <span class="stat-label">Total estimé</span>
          <span class="stat-value">${estimate.priced ? formatMoney(estimate.total) : '—'}</span>
        </div>
      </div>
    </header>`
}

function filterbar() {
  return `
    <div class="filterbar" data-role="filterbar">
      <div class="filterbar-search">
        <label class="input-wrap" for="list-search">
          ${icon('search', 16)}
          <input id="list-search" type="search" autocomplete="off" enterkeyhint="search"
                 placeholder="Rechercher un produit, une couleur, un fournisseur…"
                 value="${esc(query)}" aria-label="Rechercher dans la liste">
        </label>
        <!-- Le bouton d'effacement est VOLONTAIREMENT hors du <label> :
             un bouton dans un label se déclenche quand on rend le focus à
             l'input, et le clic sur « effacer » effacerait puis refocuserait
             en boucle. -->
        <button type="button" class="filterbar-clear" data-action="clear-search"
                aria-label="Effacer la recherche" title="Effacer" ${query ? '' : 'hidden'}>
          ${icon('x', 16)}
        </button>
      </div>
      <div class="filterbar-tabs" data-role="status-tabs" role="tablist" aria-label="Statut">
        ${statusTabsHtml(counts())}
      </div>
      <div class="filterbar-chips scroller" data-role="category-chips">
        ${categoryChipsHtml(counts())}
      </div>
    </div>`
}

function toolbar() {
  const prefs = getPrefs()
  return `
    <div class="list-toolbar">
      <span class="list-toolbar-label">Tri &amp; présentation</span>
      <label class="sr-only" for="list-sort">Trier la liste</label>
      <select id="list-sort" class="select list-sort" data-action="set-sort">
        ${SORTS.map(
          (sort) => `<option value="${sort.value}" ${prefs.sort === sort.value ? 'selected' : ''}>${esc(sort.label)}</option>`,
        ).join('')}
      </select>
      <div class="layout-switch" role="group" aria-label="Présentation de la liste">
        ${CARD_LAYOUTS.map(
          (layout) => `
          <button type="button" class="${prefs.layout === layout.value ? 'is-active' : ''}"
                  data-action="set-layout" data-value="${layout.value}"
                  aria-pressed="${prefs.layout === layout.value ? 'true' : 'false'}"
                  aria-label="${esc(layout.label)}" title="${esc(layout.label)}">
            ${icon(layout.icon, 15)}
          </button>`,
        ).join('')}
      </div>
    </div>`
}

function statusTabsHtml(total) {
  const prefs = getPrefs()
  return STATUS_TABS.map(
    (tab) => `
      <button type="button" class="tabchip ${prefs.filter === tab.value ? 'is-active' : ''}" role="tab"
              data-action="set-filter" data-value="${tab.value}"
              aria-selected="${prefs.filter === tab.value ? 'true' : 'false'}">
        ${esc(tab.label)}<span class="tabchip-count">${total[tab.value]}</span>
      </button>`,
  ).join('')
}

function categoryChipsHtml(total) {
  const prefs = getPrefs()
  const all = `
    <button type="button" class="chip ${prefs.category === 'all' ? 'is-active' : ''}"
            data-action="set-category" data-value="all">${icon('filter', 13)} Toutes</button>`
  const categories = CATEGORY_VALUES.filter((type) => total.categories[type] > 0).map(
    (type) => `
      <button type="button" class="chip ${prefs.category === type ? 'is-active' : ''}"
              data-action="set-category" data-value="${type}">
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
    return `${emptyState(prefs)}`
  }

  /* Le tri par priorité garde une liste à plat : les urgences d'abord. */
  const body =
    prefs.sort === 'priority'
      ? sectionHtml('', filtered, prefs.layout)
      : [...groupByCategory(filtered).entries()]
          .map(([type, items]) => sectionHtml(categoryLabel(type), items, prefs.layout))
          .join('')

  return body
}

function emptyState(prefs) {
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
  const { isConfigured, message: syncMessage, messageKind } = getState()
  const syncFailed = isConfigured && messageKind === 'error'
  /* Si la connexion échoue, la phrase « partagée via GitHub » serait
     fausse : on montre la cause et le chemin de réparation. */
  if (syncFailed && !needle) message = syncMessage
  const intro = syncFailed
    ? `
      <div class="setup-card setup-card--error" data-role="setup">
        <span class="setup-mark">${icon('alert', 18)}</span>
        <div class="setup-copy">
          <strong>La liste GitHub n'est pas à jour</strong>
          <p>${esc(syncMessage)}</p>
        </div>
        <button type="button" class="btn btn--primary btn--sm" data-action="go-settings">${icon('sliders', 13)} Corriger la connexion</button>
      </div>`
    : !isConfigured
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
      <span class="empty-mark">${icon(needle ? 'searchX' : 'bag', 30)}</span>
      <div class="empty-copy">
        <strong>${title}</strong>
        <p>${message}</p>
      </div>
      ${
        needle
          ? '<button type="button" class="btn btn--secondary" data-action="reset-filters">Réinitialiser les filtres</button>'
          : `<button type="button" class="btn btn--primary btn--lg" data-action="open-form">${icon('plus', 16)} Ajouter un produit</button>`
      }
    </div>`
}

function sectionHtml(title, items, layout) {
  const total = sumTotal(items)
  return `
    <section class="group">
      ${
        title
          ? `<header class="group-head">
              <h3>${esc(title)}</h3>
              <span class="group-count">${items.length}</span>
              ${total.total ? `<span class="group-total">${formatMoney(total.total)}</span>` : ''}
            </header>`
          : ''
      }
      <div class="grid grid--${esc(layout)}">${items.map((item) => renderProductCard(item, layout)).join('')}</div>
    </section>`
}

function paint() {
  host.innerHTML = `
    <section class="view view--list">
      ${header()}
      ${filterbar()}
      ${toolbar()}
      <div class="list-results" data-role="results">${results()}</div>
    </section>`
  bindFilterbar()
}

/**
 * La recherche a son propre cycle de vie : elle n'est repeinte qu'elle-même
 * quand on tape, et elle affiche un bouton d'effacement. Les filtres, eux,
 * sont repeints par `refreshFilterbar`, qui n'y touche pas.
 */
function bindFilterbar() {
  const input = host.querySelector('#list-search')
  input?.addEventListener('input', (event) => {
    query = event.target.value
    const clear = host.querySelector('[data-action="clear-search"]')
    if (clear) clear.hidden = !query
    refreshResults()
  })
}

/** Rafraîchit uniquement les zones de contenu ; la recherche survit. */
function refreshResults() {
  const resultsRegion = host?.querySelector('[data-role="results"]')
  if (resultsRegion) resultsRegion.innerHTML = results()
  refreshFilterbar()
  refreshHeader()
}

function refreshFilterbar() {
  const tabsRegion = host?.querySelector('[data-role="status-tabs"]')
  if (tabsRegion) tabsRegion.innerHTML = statusTabsHtml(counts())
  const chipsRegion = host?.querySelector('[data-role="category-chips"]')
  if (chipsRegion) chipsRegion.innerHTML = categoryChipsHtml(counts())
}

/**
 * L'en-tête compte les produits de la vue courante. Il n'était repeint
 * qu'au redessin complet avant ; il suit maintenant les filtres.
 */
function refreshHeader() {
  const head = host?.querySelector('.screen-head')
  if (head) head.outerHTML = header()
}

function refresh() {
  if (!host) return
  if (!host.querySelector('section.view')) {
    paint()
    return
  }
  /* On ne casse jamais une saisie en cours (recherche…). */
  if (deferWhileEditing(host, refresh)) return
  host.querySelector('.screen-head')?.remove()
  host.querySelector('.filterbar')?.remove()
  host.querySelector('.list-toolbar')?.remove()
  const section = host.querySelector('section.view')
  section?.insertAdjacentHTML('afterbegin', `${header()}${filterbar()}${toolbar()}`)
  bindFilterbar()
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
  /** Vide le champ de recherche sans toucher aux filtres. */
  clearSearch() {
    query = ''
    const field = host?.querySelector('#list-search')
    if (field) field.value = ''
    const clear = host?.querySelector('[data-action="clear-search"]')
    if (clear) clear.hidden = true
    refreshResults()
  },
  focusSearch() {
    host?.querySelector('#list-search')?.focus()
  },
}
