/* ------------------------------------------------------------------ */
/* Vue Marché — liste tactile, coche rapide                            */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import { STATUS, productView, sortProducts, sumTotal } from '../../data/model.js'
import { getProducts, isLoaded } from '../../data/store.js'
import { icon } from '../icons.js'
import { renderMarketRow } from '../product-card.js'
import { loadingBlock } from '../view.js'

let host = null

function template() {
  const products = getProducts().map((product) => ({
    ...productView(product),
    isBought: product.status === STATUS.BOUGHT,
  }))
  const todo = sortProducts(products.filter((item) => !item.isBought), 'priority')
  const done = sortProducts(products.filter((item) => item.isBought), 'recent')
  const inCart = sumTotal(done)
  const remaining = sumTotal(todo)

  if (!products.length) {
    return `
      <section class="view">
        <div class="view-head">
          <div>
            <h1>Mode marché</h1>
            <p>La liste est vide : ajoutez des produits pour préparer vos achats.</p>
          </div>
          <div class="view-head-actions">
            <button type="button" class="btn btn--primary" data-action="open-form">${icon('plus', 14)} Ajouter un produit</button>
          </div>
        </div>
        <div class="empty">${icon('bag', 28)}<div><strong>Rien à acheter</strong>Ajoutez ceintures, tissus ou rubans, puis vérifiez-les au marché.</div></div>
      </section>`
  }

  return `
    <section class="view">
      <div class="view-head">
        <div>
          <h1>Mode marché</h1>
          <p>Touchez une ligne dès que le produit est dans le panier. Les urgences (priorité haute) sont en haut de liste.</p>
        </div>
        <div class="view-head-actions">
          <a class="btn btn--ghost btn--sm" href="#/liste">${icon('list', 14)} Vue liste</a>
          <button type="button" class="btn btn--primary btn--sm" data-action="open-form">${icon('plus', 14)} Ajouter</button>
        </div>
      </div>

      ${
        todo.length
          ? `<div class="market-list">${todo.map(renderMarketRow).join('')}</div>`
          : `<div class="empty">${icon('checkCircle', 28)}<div><strong>Tout est dans le panier 🎉</strong>${
              inCart.priced ? `Total : ${formatMoney(inCart.total)}` : 'Bon retour à l’atelier !'
            }</div></div>`
      }

      ${
        done.length
          ? `
        <div class="panel">
          <div class="panel-head">
            <div><h2>Dans le panier (${done.length})</h2><p>Produits cochés pendant ce marché.</p></div>
            <button type="button" class="btn btn--ghost btn--sm" data-action="clear-bought">${icon('trash', 13)} Vider</button>
          </div>
          <div class="market-list">${done.map(renderMarketRow).join('')}</div>
        </div>`
          : ''
      }

      <div class="sticky-bar">
        <div>
          <div class="u-row" style="gap:8px">
            <span class="badge badge--teal">${icon('cart', 12)} ${done.length} / ${products.length}</span>
            <strong style="font-size:15px">${formatMoney(inCart.total)}</strong>
          </div>
          <small class="u-muted">dans le panier${remaining.priced ? ` · reste ${formatMoney(remaining.total)}` : ''}</small>
        </div>
        <div class="u-row" style="margin-left:auto">
          <button type="button" class="btn btn--ghost btn--sm" data-action="market-share">${icon('share', 13)} Partager</button>
          <button type="button" class="btn btn--primary btn--sm" data-action="market-finish">${icon('check', 14)} Terminer</button>
        </div>
      </div>
    </section>`
}

export const marketView = {
  id: 'market',
  route: 'marche',
  label: 'Marché',
  icon: 'bag',
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