/* ------------------------------------------------------------------ */
/* Composant partagé — carte produit (grille de la liste)              */
/* ------------------------------------------------------------------ */

import { esc, formatDate, formatMoney } from '../core/utils.js'
import { colorCss, displayName } from '../data/model.js'
import { icon } from './icons.js'

const PRIORITY_CLASS = { haute: 'product--p1', normale: 'product--p2', basse: 'product--p3' }

function colorBlock(item) {
  if (!item.color && !item.colorRgb) return ''
  const label = item.color ? esc(item.color) : 'Couleur'
  const css = colorCss(item)
  const swatch = css ? `<span class="color-swatch" style="background:${css}" aria-hidden="true"></span>` : ''
  return `<span class="color-chip">${swatch}${label}</span>`
}

function photoBlock(item, { size = 'card' } = {}) {
  const label = esc(displayName(item))
  const image = item.photo
    ? `<img src="${esc(item.photo)}" alt="${label}" loading="lazy" decoding="async">`
    : `<span class="placeholder">${icon('imageOff', 22)}Aucune photo</span>`
  if (size === 'thumb') return image
  return `
    <div class="product-photo">
      ${image}
      <span class="badge">${esc(item.typeLabel)}</span>
      ${item.isBought ? `<span class="product-ribbon">${icon('check', 11)} Acheté</span>` : ''}
    </div>`
}

function priceLine(item) {
  if (!item.hasPrice) return ''
  const unit = item.unit === 'metre' ? 'm' : item.unit === 'rouleau' ? 'rlt' : 'pc'
  const detail = item.qty > 1 ? ` — ${formatMoney(item.lineTotal)}` : ''
  return `${formatMoney(item.price)} / ${unit}${detail}`
}

/** Carte de la liste (grille). */
export function renderProductCard(item) {
  const name = displayName(item)
  const priorityBadge =
    item.priority === 'haute'
      ? `<span class="badge badge--red">${icon('star', 11)} Prioritaire</span>`
      : ''
  const metaBits = [item.qtyLabel]
  const color = colorBlock(item)
  if (color) metaBits.push(color)
  const price = priceLine(item)
  const actions = `
      <button type="button" class="icon-btn" data-action="edit" data-id="${esc(item.id)}" aria-label="Modifier ${esc(name)}" title="Modifier">
        ${icon('edit', 14)}
      </button>
      <button type="button" class="icon-btn is-danger" data-action="delete" data-id="${esc(item.id)}" aria-label="Supprimer ${esc(name)}" title="Supprimer">
        ${icon('trash', 14)}
      </button>`
  return `
    <article class="product ${PRIORITY_CLASS[item.priority] || ''} ${item.isBought ? 'is-bought' : ''}">
      ${photoBlock(item)}
      <div class="product-body">
        <strong class="product-name">${esc(name)}</strong>
        <p class="product-line">${metaBits.join('<span class="separator">·</span>')}</p>
        ${item.supplier ? `<p class="product-line">${icon('store', 12)} ${esc(item.supplier)}</p>` : ''}
        ${price ? `<p class="product-price">${price}</p>` : '<p class="product-line u-muted">Prix à préciser</p>'}
        ${item.note ? `<p class="product-note">${esc(item.note)}</p>` : ''}
        <p class="product-flags">${item.isBought && item.boughtAt ? `<span class="u-muted">Coché le ${formatDate(item.boughtAt)}</span>` : priorityBadge}</p>
      </div>
      <div class="product-foot">
        <button type="button" class="btn ${item.isBought ? 'btn--secondary' : 'btn--primary'} btn--sm" data-action="toggle" data-id="${esc(item.id)}">
          ${item.isBought ? `${icon('undo', 13)} Remettre` : `${icon('check', 13)} Acheté`}
        </button>
        ${actions}
      </div>
    </article>`
}
