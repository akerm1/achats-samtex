/* ------------------------------------------------------------------ */
/* Vue Liste — filtres, tri, groupes par catégorie                     */
/*                                                                      */
/* Refonte 8.4 : la barre d'outils devient une **barre de filtres**    */
/* réellement collante, qui reste en place pendant toute la liste.      */
/* Avant, elle flottait dans le flux et disparaissait au défilement —   */
/* or c'est justement quand on scrolle qu'on veut changer de filtre.    */
/*                                                                      */
/* La structure est en trois couches superposées et non imbriquées :    */
/*   .filterbar  — le conteneur collant                              */
/*     .filterbar-search  — la recherche, qui se replie sur téléphone  */
/*     .filterbar-tabs    — le statut, toujours visible              */
/*     .filterbar-chips   — les catégories, défilement horizontal     */
/* Trois couches plutôt qu'un seul bloc, parce qu'elles se pilotent     */
/* séparément : la recherche a son propre cycle de vie (on ne veut pas */
/* la repeindre à chaque frappe), les filtres non.                     */
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

/** Le total de la vue courante, affiché comme un en-tête de chapitre. */
function header() {
  const prefs = getPrefs()
  const products = getProducts()
  const scoped = filterProducts(products, { status: prefs.filter, category: prefs.category, query })
  const estimate = sumTotal(sortProducts(scoped, prefs.sort))
  const count = scoped.length
  return `
    <header class="list-head">
      <div class="list-head-copy">
        <h1>Ma liste</h1>
        <p class="list-head-sub">
          <strong>${count}</strong> produit${count > 1 ? 's' : ''}
          ${estimate.priced ? ` · <span class="list-head-total">${formatMoney(estimate.total)}</span>` : ''}
        </p>
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
  const head = host?.querySelector('.list-head')
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
  host.querySelector('.list-head')?.remove()
  host.querySelector('.filterbar')?.remove()
  const section = host.querySelector('section.view')
  section?.insertAdjacentHTML('afterbegin', `${header()}${filterbar()}`)
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
