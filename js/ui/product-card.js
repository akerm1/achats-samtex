/* ------------------------------------------------------------------ */
/* Composant partagé — carte produit (grille de la liste)              */
/* ------------------------------------------------------------------ */

import { esc, formatDate, formatMoney } from '../core/utils.js'
import { colorCss, displayName } from '../data/model.js'
import { icon } from './icons.js'

const PRIORITY_CLASS = { haute: 'product--p1', normale: 'product--p2', basse: 'product--p3' }

/* La couleur est le premier critère de tri à l'achat : elle occupe donc
   toute la largeur de la carte, avec son nom posé dessus, et s'agrandit
   d'un clic. */
function colorBlock(item) {
  if (!item.color && !item.colorRgb) return ''
  const label = item.color ? esc(item.color) : 'Couleur'
  const css = colorCss(item)
  const swatch = `<span class="color-swatch${css ? '' : ' is-empty'}" style="background:${css || ''}" aria-hidden="true"></span>`
  return `
    <div class="product-color" data-action="preview-color" data-id="${esc(item.id)}"
         role="button" tabindex="0" title="Agrandir la couleur ${label}"
         aria-label="Agrandir la couleur ${label}">
      ${swatch}
      <span class="color-chip">${label}</span>
      <span class="zoom-mark" aria-hidden="true">${icon('search', 14)}</span>
    </div>`
}

function photoBlock(item, { size = 'card' } = {}) {
  const label = esc(displayName(item))
  const image = item.photo
    ? `<img src="${esc(item.photo)}" alt="${label}" loading="lazy" decoding="async">`
    : `<span class="placeholder">${icon('imageOff', 22)}Aucune photo</span>`
  if (size === 'thumb') return image
  /* Sans photo, il n'y a rien à agrandir : on n'offre pas le clic. */
  const zoom = item.photo
    ? `data-action="preview-photo" data-id="${esc(item.id)}" role="button" tabindex="0"
       title="Agrandir la photo de ${label}" aria-label="Agrandir la photo de ${label}"`
    : ''
  return `
    <div class="product-photo" ${zoom}>
      ${image}
      <span class="badge">${esc(item.typeLabel)}</span>
      ${item.isBought ? `<span class="product-ribbon">${icon('check', 11)} Acheté</span>` : ''}
      ${item.photo ? `<span class="zoom-mark" aria-hidden="true">${icon('search', 14)}</span>` : ''}
    </div>`
}

function priceLine(item) {
  if (!item.hasPrice) return ''
  const unit = item.unit === 'metre' ? 'm' : item.unit === 'rouleau' ? 'rlt' : 'pc'
  const detail = item.qty > 1 ? ` — ${formatMoney(item.lineTotal)}` : ''
  return `${formatMoney(item.price)} / ${unit}${detail}`
}

function toggleButton(item) {
  return `<button type="button" class="btn ${item.isBought ? 'btn--secondary' : 'btn--primary'} btn--sm" data-action="toggle" data-id="${esc(item.id)}">
          ${item.isBought ? `${icon('undo', 13)} Remettre` : `${icon('check', 13)} Acheté`}
        </button>`
}

function footActions(item, name) {
  return `
      <button type="button" class="icon-btn" data-action="edit" data-id="${esc(item.id)}" aria-label="Modifier ${esc(name)}" title="Modifier">
        ${icon('edit', 14)}
      </button>
      <button type="button" class="icon-btn is-danger" data-action="delete" data-id="${esc(item.id)}" aria-label="Supprimer ${esc(name)}" title="Supprimer">
        ${icon('trash', 14)}
      </button>`
}

/* Une seule image pour la mosaïque et la ligne : la photo si elle existe,
   sinon la couleur, sinon rien. Ces deux modes n'ont la place que d'un
   visuel, alors que la fiche, elle, les empile. */
function visualBlock(item) {
  if (item.photo) return photoBlock(item)
  if (item.color || item.colorRgb) return colorBlock(item)
  return `<div class="product-photo"><span class="placeholder">${icon('imageOff', 20)}</span></div>`
}

function articleClass(item, modifier) {
  return ['product', modifier, PRIORITY_CLASS[item.priority], item.isBought ? 'is-bought' : '']
    .filter(Boolean)
    .join(' ')
}

/* --- Mosaïque --------------------------------------------------------- */

/* Un carré par produit : le visuel le remplit, et le nom passe dans un
   bandeau posé dessous, sur fond plein. Un voile par-dessus la photo aurait
   laissé le contraste du nom dépendre de l'image ; ici, le nom se lit
   toujours. On ne garde que trois gestes — agrandir la photo, cocher,
   ouvrir la fiche — parce qu'un carré n'accueille pas davantage de
   boutons sans devenir illisible. */
function renderMosaic(item) {
  const name = displayName(item)
  const price = item.hasPrice ? priceLine(item) : ''
  const meta = [item.qtyLabel, item.color].filter(Boolean).join(' · ')
  return `
    <article class="${articleClass(item, 'product--mosaic')}" data-id="${esc(item.id)}">
      <div class="tile" data-role="card-body" tabindex="0" role="button"
           aria-label="Voir les détails de ${esc(name)}"
           title="Cliquez pour voir les détails de ${esc(name)}">
        <div class="tile-visual">${visualBlock(item)}</div>
        <span class="tile-caption">
          <strong class="tile-name">${esc(name)}</strong>
          ${price ? `<span class="tile-price">${price}</span>` : ''}
          ${!price && meta ? `<span class="tile-price">${esc(meta)}</span>` : ''}
        </span>
      </div>
      <button type="button" class="tile-check" data-action="toggle" data-id="${esc(item.id)}"
              aria-label="${item.isBought ? 'Remettre' : 'Marquer comme acheté'} ${esc(name)}"
              title="${item.isBought ? 'Remettre' : 'Marquer comme acheté'}">
        ${item.isBought ? icon('undo', 14) : icon('check', 14)}
      </button>
    </article>`
}

/* --- Liste ------------------------------------------------------------ */

/* Une ligne par produit : vignette carrée à gauche, nom et quantité au
   centre, prix et coche à droite. Tout le reste (note, fournisseur,
   boutons d'édition) se lit dans la fiche, ouverte au clic. */
function renderRow(item) {
  const name = displayName(item)
  const meta = [item.qtyLabel, item.color, item.supplier].filter(Boolean).join(' · ')
  const price = item.hasPrice
    ? `<span class="row-price">${formatMoney(item.price)} <small>${item.unit === 'metre' ? '/m' : item.unit === 'rouleau' ? '/rlt' : '/pc'}</small></span>`
    : '<span class="row-price u-muted">—</span>'
  return `
    <article class="${articleClass(item, 'product--row')}" data-id="${esc(item.id)}">
      <div class="row-visual">${visualBlock(item)}</div>
      <div class="row-body" data-role="card-body" tabindex="0" role="button"
           aria-label="Voir les détails de ${esc(name)}"
           title="Cliquez pour voir les détails de ${esc(name)}">
        <strong class="row-name">${esc(name)}</strong>
        ${meta ? `<span class="row-meta">${esc(meta)}</span>` : ''}
      </div>
      ${price}
      <button type="button" class="row-check" data-action="toggle" data-id="${esc(item.id)}"
              aria-label="${item.isBought ? 'Remettre' : 'Marquer comme acheté'} ${esc(name)}"
              title="${item.isBought ? 'Remettre' : 'Marquer comme acheté'}"
              aria-pressed="${item.isBought ? 'true' : 'false'}">
        ${item.isBought ? icon('undo', 14) : icon('check', 14)}
      </button>
    </article>`
}

/** Carte de la liste. `layout` : `card` (fiche), `mosaic`, `row`. */
export function renderProductCard(item, layout = 'card') {
  if (layout === 'mosaic') return renderMosaic(item)
  if (layout === 'row') return renderRow(item)

  const name = displayName(item)
  const priorityBadge =
    item.priority === 'haute'
      ? `<span class="badge badge--red">${icon('star', 11)} Prioritaire</span>`
      : ''
  const metaBits = [item.qtyLabel]
  const color = colorBlock(item)
  const price = priceLine(item)
  return `
    <article class="${articleClass(item, '')}" data-id="${esc(item.id)}">
      ${photoBlock(item)}
      <div class="product-body" data-role="card-body" tabindex="0" role="button"
           aria-label="Voir les détails de ${esc(name)}"
           title="Cliquez pour voir les détails de ${esc(name)}">
        <strong class="product-name">${esc(name)}</strong>
        ${color}
        <p class="product-line">${metaBits.join('<span class="separator">·</span>')}</p>
        ${item.supplier ? `<p class="product-line">${icon('store', 12)} ${esc(item.supplier)}</p>` : ''}
        ${price ? `<p class="product-price">${price}</p>` : '<p class="product-line u-muted">Prix à préciser</p>'}
        ${item.note ? `<p class="product-note">${esc(item.note)}</p>` : ''}
        <p class="product-flags">${item.isBought && item.boughtAt ? `<span class="u-muted">Coché le ${formatDate(item.boughtAt)}</span>` : priorityBadge}</p>
      </div>
      <div class="product-foot">
        ${toggleButton(item)}
        ${footActions(item, name)}
      </div>
    </article>`
}
