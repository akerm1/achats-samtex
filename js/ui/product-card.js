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

/* Le visuel compact des deux présentations denses (mosaïque, ligne).
   Il ne réutilise PAS `photoBlock` ni `colorBlock` : ces deux blocs sont
   faits pour une fiche de 280 px de large — une bande de couleur haute de
   84 px, voilée sur ses deux tiers, avec une étiquette de nom posée
   dessus. Resservis dans une tuile de 190 px, le voile mangeait la teinte
   et l'étiquette était rognée ; dans une vignette de 52 px, elle disparaît
   carrément. Ici la teinte est un aplat nu qui remplit la case, et le nom
   de la couleur est écrit en toutes lettres dans le texte voisin. */
function compactVisual(item) {
  const label = esc(item.color || displayName(item))
  if (item.photo) {
    return `<div class="cv cv--photo" data-action="preview-photo" data-id="${esc(item.id)}" role="button" tabindex="0"
         title="Agrandir la photo de ${label}" aria-label="Agrandir la photo de ${label}">
        <img src="${esc(item.photo)}" alt="${esc(displayName(item))}" loading="lazy" decoding="async">
      </div>`
  }
  /* `colorCss` est calculé ici, comme dans `colorBlock`, et non lu dans le
     produit de vue : un objet qui n'a pas encore passé par `productView`
     donnerait sinon un damier au lieu de sa teinte. */
  const css = colorCss(item)
  if (css) {
    return `<div class="cv cv--color" style="background:${esc(css)}"
         data-action="preview-color" data-id="${esc(item.id)}" role="button" tabindex="0"
         title="Agrandir la couleur ${label}" aria-label="Agrandir la couleur ${label}"></div>`
  }
  if (item.color || item.colorRgb) {
    /* Couleur nommée sans teinte connue : le damier de la fiche, qui dit
       « on ne sait pas » au lieu d'inventer un noir. */
    return `<div class="cv cv--color is-empty" data-action="preview-color" data-id="${esc(item.id)}" role="button" tabindex="0"
         title="Agrandir la couleur ${label}" aria-label="Agrandir la couleur ${label}"></div>`
  }
  return `<div class="cv cv--blank">${icon('imageOff', 18)}</div>`
}

/* Le prix tient sur une ligne : dans la barre d'une tuile ou d'une ligne,
   le total de la ligne ne passerait pas et le prix unitaire compte plus. */
function shortPrice(item) {
  if (!item.hasPrice) return 'Prix à préciser'
  const unit = item.unit === 'metre' ? '/m' : item.unit === 'rouleau' ? '/rlt' : '/pc'
  return `${formatMoney(item.price)}${unit}`
}

/* L'étiquette posée sur la tuile : la couleur quand elle existe — c'est le
   critère de tri à l'achat — la catégorie sinon. Elle est opaque, donc elle
   ne ternit pas la teinte qu'elle surplombe. */
function tileTag(item) {
  const text = item.color || item.typeLabel
  return `<span class="tile-tag">${esc(text)}</span>`
}

function articleClass(item, modifier) {
  return ['product', modifier, PRIORITY_CLASS[item.priority], item.isBought ? 'is-bought' : '']
    .filter(Boolean)
    .join(' ')
}

/* --- Mosaïque --------------------------------------------------------- */

/* Un carré par produit. La case est ce qu'on regarde : la photo occupe
   presque toute la hauteur, la couleur un aplat pur, et le nom vit dans une
   barre fine sous la case — une seule ligne, tronquée, parce que le nom
   complet est dans la fiche. Trois gestes restent : agrandir, cocher,
   ouvrir la fiche. */
function renderMosaic(item) {
  const name = displayName(item)
  return `
    <article class="${articleClass(item, 'product--mosaic')}" data-id="${esc(item.id)}">
      <div class="tile" data-role="card-body" tabindex="0" role="button"
           aria-label="Voir les détails de ${esc(name)}"
           title="Cliquez pour voir les détails de ${esc(name)}">
        <div class="tile-visual">${compactVisual(item)}</div>
        <div class="tile-bar">
          <strong class="tile-name">${esc(name)}</strong>
          <span class="tile-price">${esc(shortPrice(item))}</span>
        </div>
      </div>
      ${tileTag(item)}
      <button type="button" class="tile-check" data-action="toggle" data-id="${esc(item.id)}"
              aria-label="${item.isBought ? 'Remettre' : 'Marquer comme acheté'} ${esc(name)}"
              title="${item.isBought ? 'Remettre' : 'Marquer comme acheté'}">
        ${item.isBought ? icon('undo', 14) : icon('check', 14)}
      </button>
    </article>`
}

/* --- Liste ------------------------------------------------------------ */

/* Une ligne par produit : vignette carrée à gauche, nom et détails au
   centre, prix et coche à droite. Le nom de la couleur est écrit dans la
   ligne elle-même, pas dans la vignette : à 56 px, une étiquette posée
   dessus serait rognée au milieu d'un mot. Tout le reste (note,
   boutons d'édition) se lit dans la fiche, ouverte au clic. */
function renderRow(item) {
  const name = displayName(item)
  const meta = [item.qtyLabel, item.color, item.supplier].filter(Boolean).join(' · ')
  return `
    <article class="${articleClass(item, 'product--row')}" data-id="${esc(item.id)}">
      <div class="row-visual">${compactVisual(item)}</div>
      <div class="row-body" data-role="card-body" tabindex="0" role="button"
           aria-label="Voir les détails de ${esc(name)}"
           title="Cliquez pour voir les détails de ${esc(name)}">
        <strong class="row-name">${esc(name)}</strong>
        ${meta ? `<span class="row-meta">${esc(meta)}</span>` : ''}
      </div>
      <span class="row-price${item.hasPrice ? '' : ' u-muted'}">${esc(shortPrice(item))}</span>
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
