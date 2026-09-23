/* ------------------------------------------------------------------ */
/* Composants partagés — carte produit (grille) et ligne (marché)      */
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
      <button type="button" class="icon-btn" data-action="duplicate" data-id="${esc(item.id)}" aria-label="Dupliquer ${esc(name)}" title="Dupliquer">
        ${icon('copy', 14)}
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

/** Ligne tactile du mode marché. */
export function renderMarketRow(item) {
  const name = displayName(item)
  const color = colorBlock(item)
  return `
    <div class="market-item ${item.isBought ? 'is-bought' : ''}">
      <button type="button" class="market-row ${item.isBought ? 'is-bought' : ''}" data-action="toggle" data-id="${esc(item.id)}"
              aria-pressed="${item.isBought ? 'true' : 'false'}">
        <span class="market-box">${icon('check', 16)}</span>
        ${
          item.photo
            ? `<img class="market-thumb" src="${esc(item.photo)}" alt="" loading="lazy">`
            : `<span class="market-thumb market-thumb--empty">${icon('imageOff', 16)}</span>`
        }
        <span class="market-text">
          <strong>${esc(name)}</strong>
          <small>${esc(item.qtyLabel)}${color ? ` · ${color}` : ''}${item.supplier ? ` · ${esc(item.supplier)}` : ''}</small>
        </span>
        <span class="market-price">${item.hasPrice ? formatMoney(item.lineTotal) : ''}</span>
      </button>
      <button type="button" class="icon-btn market-edit" data-action="edit" data-id="${esc(item.id)}"
              aria-label="Modifier ${esc(name)}" title="Modifier">${icon('edit', 16)}</button>
    </div>`
}

/** Vignette compacte (aperçus du tableau de bord). */
export function renderMiniRow(item) {
  return `
    <div class="u-between" style="gap:12px">
      <div class="u-row u-grow">
        ${
          item.photo
            ? `<img class="market-thumb" style="width:34px;height:34px" src="${esc(item.photo)}" alt="" loading="lazy">`
            : `<span class="market-thumb market-thumb--empty" style="width:34px;height:34px">${icon('imageOff', 13)}</span>`
        }
        <div class="u-grow">
          <div class="u-truncate" style="font-size:13px;font-weight:600">${esc(displayName(item))}</div>
          <small class="u-muted">${esc(item.typeLabel)} · ${esc(item.qtyLabel)}</small>
        </div>
      </div>
      <span class="bar-row-value">${item.hasPrice ? formatMoney(item.lineTotal) : '—'}</span>
    </div>`
}

/** Ligne de répartition (catégorie ou fournisseur). */
export function renderBarRow(label, value, share) {
  return `
    <div class="bar-row">
      <span class="bar-row-label">
        <span class="dot" style="opacity:.65"></span>
        <span>${esc(label)}</span>
      </span>
      <span class="bar-row-track"><span style="width:${Math.max(2, Math.round(share * 100))}%"></span></span>
      <span class="bar-row-value">${value}</span>
    </div>`
}
