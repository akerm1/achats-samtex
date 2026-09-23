/* ------------------------------------------------------------------ */
/* Vue Accueil — tableau de bord                                       */
/* ------------------------------------------------------------------ */

import { esc, formatMoney, formatRelative } from '../../core/utils.js'
import { computeStats, sortProducts } from '../../data/model.js'
import { getProducts, getState, isLoaded } from '../../data/store.js'
import { icon } from '../icons.js'
import { renderBarRow, renderMiniRow } from '../product-card.js'
import { loadingBlock } from '../view.js'

let host = null

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bonjour'
  if (hour < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

function ring(progress) {
  const radius = 46
  const circumference = Math.round(2 * Math.PI * radius)
  const offset = Math.round(circumference * (1 - progress / 100))
  return `
    <div class="ring">
      <svg viewBox="0 0 108 108" width="108" height="108" role="img" aria-label="${progress}% des produits achetés">
        <circle class="ring-track" cx="54" cy="54" r="${radius}" fill="none" stroke-width="10"></circle>
        <circle class="ring-value" cx="54" cy="54" r="${radius}" fill="none" stroke-width="10"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
      </svg>
      <div class="ring-label"><div><strong>${progress}%</strong><small>Acheté</small></div></div>
    </div>`
}

function statCard({ iconName, tone = '', value, label }) {
  return `
    <div class="stat">
      <span class="stat-mark ${tone}">${icon(iconName, 15)}</span>
      <strong>${value}</strong>
      <span>${esc(label)}</span>
    </div>`
}

function emptyState() {
  return `
    <section class="view">
      <div class="view-head">
        <div>
          <h1>${greeting()} — prêt à préparer une commande ?</h1>
          <p>Votre liste est vide. Ajoutez un premier produit, même sans nom : une photo peut suffire.</p>
        </div>
      </div>
      <div class="empty">
        ${icon('bag', 28)}
        <div><strong>Aucun produit pour l'instant</strong>
          Ajoutez ceintures, tissus, tulle ou rubans, puis cochez ce qui est pris au marché.
        </div>
        <button type="button" class="btn btn--primary" data-action="open-form">${icon('plus', 15)} Ajouter un produit</button>
      </div>
    </section>`
}

function template() {
  const products = getProducts()
  const stats = computeStats(products)
  const { config, lastSyncAt } = getState()

  if (!stats.total) return emptyState()

  const topCategories = stats.byCategory.slice(0, 5)
  const maxCategory = topCategories.reduce((max, item) => Math.max(max, item.total, item.spent), 0) || 1
  const recent = sortProducts(products, 'recent').slice(0, 4)

  return `
    <section class="view">
      <div class="hero">
        ${ring(stats.progress)}
        <div class="hero-copy">
          <h1>${greeting()} 👋</h1>
          <p>
            ${stats.todoCount} produit(s) à acheter${
              stats.planned.priced
                ? ` pour environ <strong>${formatMoney(stats.planned.total)}</strong>`
                : ' — ajoutez les prix quand vous voulez'
            }.${stats.boughtCount ? ` ${stats.boughtCount} déjà coché(s).` : ''}
          </p>
          <div class="hero-actions">
            <button type="button" class="btn btn--primary" data-action="open-form">${icon('plus', 15)} Ajouter un produit</button>
            <a class="btn btn--secondary" href="#/marche">${icon('bag', 15)} Mode marché</a>
            <a class="btn btn--ghost" href="#/liste">${icon('list', 15)} Vue liste</a>
          </div>
          <div class="hero-note">
            ${icon(config ? 'cloud' : 'shield', 13)}
            <span>
              ${config ? `Synchronisé avec ${esc(config.owner)}/${esc(config.repo)}` : 'Liste locale — configurez GitHub dans Réglages'}${
                lastSyncAt ? ` · ${esc(formatRelative(lastSyncAt))}` : ''
              }
            </span>
          </div>
        </div>
      </div>

      <div class="stat-grid">
        ${statCard({ iconName: 'cart', value: stats.todoCount, label: `${stats.planned.units} unité(s) à récupérer` })}
        ${statCard({ iconName: 'bag', value: `${stats.boughtCount} / ${stats.total}`, label: 'produit(s) cochés' })}
        ${statCard({
          iconName: 'checkCircle',
          value: formatMoney(stats.spent.total),
          label: `Dépensé · ${stats.boughtCount} produit(s)`,
        })}
        ${statCard({
          iconName: 'alert',
          tone: 'stat-mark--orange',
          value: stats.planned.unpriced,
          label: 'Produit(s) sans prix',
        })}
      </div>

      <div class="two-col">
        <div class="panel">
          <div class="panel-head">
            <div><h2>Répartition par catégorie</h2><p>Montants des produits encore à acheter.</p></div>
          </div>
          ${topCategories
            .map((item) =>
              renderBarRow(
                item.label,
                `${formatMoney(item.total)} · ${item.todoCount}`,
                Math.max(item.total, item.spent) / maxCategory,
              ),
            )
            .join('')}
        </div>

        <div class="panel">
          <div class="panel-head">
            <div><h2>Derniers produits</h2><p>Les 4 plus récents.</p></div>
            <a class="btn btn--ghost btn--sm" href="#/liste">${icon('list', 13)} Voir la liste</a>
          </div>
          <div class="u-stack" style="gap:12px">${recent.map(renderMiniRow).join('')}</div>
        </div>
      </div>
    </section>`
}

export const homeView = {
  id: 'home',
  route: 'accueil',
  label: 'Accueil',
  icon: 'home',
  mount(element) {
    host = element
    paint()
  },
  update() {
    if (host) paint()
  },
}

function paint() {
  host.innerHTML = isLoaded() ? template() : loadingBlock()
}