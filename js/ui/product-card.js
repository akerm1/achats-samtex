/* ------------------------------------------------------------------ */
/* Composant partagé — carte produit                                    */
/*                                                                      */
/* Trois présentations, trois anatomies. La refonte 8.4 les a séparées   */
/* franchement : la fiche mène désormais par la couleur, la mosaïque    */
/* reste une planche contact, et la ligne reste une ligne.              */
/* ------------------------------------------------------------------ */

import { esc, formatDate, formatMoney } from '../core/utils.js'
import { colorCss, displayName } from '../data/model.js'
import { icon } from './icons.js'

const PRIORITY_CLASS = { haute: 'product--p1', normale: 'product--p2', basse: 'product--p3' }
const PRIORITY_LABEL = { haute: 'Urgent', normale: 'Normal', basse: 'Plus tard' }

const UNIT_SHORT = { metre: '/m', rouleau: '/rlt', piece: '/pc' }

/** Prix ramené à une seule ligne : c'est la seule forme qui tienne dans
    une barre de tuile ou dans une ligne de liste. */
function shortPrice(item) {
  if (!item.hasPrice) return 'Prix à préciser'
  return `${formatMoney(item.price)}${UNIT_SHORT[item.unit] || '/pc'}`
}

function priorityTag(item) {
  if (item.priority !== 'haute') return ''
  return `<span class="tag tag--urgent">${icon('star', 11)} Urgent</span>`
}

function boughtTag(item) {
  return item.isBought ? `<span class="tag tag--bought">${icon('check', 12)} Acheté</span>` : ''
}

/**
 * Le visuel en pleine largeur, en haut de la fiche.
 *
 * Avant 8.4, la fiche empilait photo puis bande de couleur, ce qui
 * produisait deux bandeaux successifs et une carte très haute. Ici c'est
 * **une seule zone** : la photo si elle existe, sinon la teinte — et le
 * nom de la couleur vient se poser dessus dans les deux cas, pour qu'on
 * sache ce qu'on regarde sans lire la carte.
 */
function heroBlock(item) {
  const name = displayName(item)
  const color = colorCss(item)
  const hasColor = Boolean(item.color || item.colorRgb)
  const zoomPhoto = item.photo
    ? `data-action="preview-photo" data-id="${esc(item.id)}" role="button" tabindex="0"
       title="Agrandir la photo de ${esc(name)}" aria-label="Agrandir la photo de ${esc(name)}"`
    : ''

  let media
  if (item.photo) {
    media = `<img src="${esc(item.photo)}" alt="${esc(name)}" loading="lazy" decoding="async">`
  } else if (color) {
    media = `<span class="hero-fill" style="background:${esc(color)}"></span>`
  } else if (hasColor) {
    media = `<span class="hero-fill hero-fill--empty"></span>`
  } else {
    media = `<span class="hero-fill hero-fill--blank">${icon('imageOff', 26)}</span>`
  }

  const zoomColor =
    hasColor && !item.photo
      ? `data-action="preview-color" data-id="${esc(item.id)}" role="button" tabindex="0"
         title="Agrandir la couleur ${esc(item.color || name)}"
         aria-label="Agrandir la couleur ${esc(item.color || name)}"`
      : ''

  return `
    <div class="hero" ${item.photo ? zoomPhoto : zoomColor}>
      ${media}
      <div class="hero-top">
        <span class="tag tag--cat">${esc(item.typeLabel)}</span>
        ${boughtTag(item)}
      </div>
      ${item.priority === 'haute' && !item.isBought ? priorityTag(item) : ''}
      ${
        hasColor
          ? `<span class="hero-color">${item.color ? esc(item.color) : 'Couleur'}</span>`
          : ''
      }
      ${
        item.photo
          ? `<span class="zoom-mark" aria-hidden="true">${icon('search', 14)}</span>`
          : hasColor
            ? `<span class="zoom-mark" aria-hidden="true">${icon('search', 14)}</span>`
            : ''
      }
    </div>`
}

/** Le prix est la donnée qu'on relit le plus : il sort de la ligne de
    métadonnées et tient sa propre ligne, en grand. */
function priceBlock(item) {
  if (!item.hasPrice) return '<span class="price price--none">Prix à préciser</span>'
  const unit = item.unit === 'metre' ? 'm' : item.unit === 'rouleau' ? 'rlt' : 'pc'
  const total = item.qty > 1 ? `<span class="price-total">soit ${formatMoney(item.lineTotal)}</span>` : ''
  return `<span class="price">${formatMoney(item.price)}<span class="price-unit"> / ${unit}</span>${total}</span>`
}

function metaBlock(item) {
  const bits = []
  if (item.qtyLabel) bits.push(`<span class="meta-item">${esc(item.qtyLabel)}</span>`)
  if (item.supplier) bits.push(`<span class="meta-item">${icon('store', 12)} ${esc(item.supplier)}</span>`)
  if (!bits.length) return ''
  return `<p class="meta">${bits.join('<span class="meta-sep">·</span>')}</p>`
}

function toggleButton(item) {
  return `<button type="button" class="btn ${item.isBought ? 'btn--secondary' : 'btn--primary'} btn--sm"
                   data-action="toggle" data-id="${esc(item.id)}">
            ${item.isBought ? `${icon('undo', 13)} Remettre` : `${icon('check', 13)} Acheté`}
          </button>`
}

function editButton(item, name) {
  let receiptBtn = ''
  if (item.receipt) {
    receiptBtn = `
      <button type="button" class="icon-btn" data-action="preview-receipt" data-id="${esc(item.id)}"
              aria-label="Voir le ticket/facture de ${esc(name)}" title="Voir le ticket/facture">${icon('imagePlus', 15)}</button>`
  } else if (item.isBought) {
    receiptBtn = `
      <button type="button" class="icon-btn" data-action="add-receipt" data-id="${esc(item.id)}"
              aria-label="Ajouter un ticket/facture pour ${esc(name)}" title="Ajouter un ticket/facture">${icon('camera', 15)}</button>`
  }
  return `
      ${receiptBtn}
      <button type="button" class="icon-btn" data-action="edit" data-id="${esc(item.id)}"
              aria-label="Modifier ${esc(name)}" title="Modifier">${icon('edit', 15)}</button>
      <button type="button" class="icon-btn is-danger" data-action="delete" data-id="${esc(item.id)}"
              aria-label="Supprimer ${esc(name)}" title="Supprimer">${icon('trash', 15)}</button>`
}

function articleClass(item, modifier) {
  return ['product', modifier, PRIORITY_CLASS[item.priority], item.isBought ? 'is-bought' : '']
    .filter(Boolean)
    .join(' ')
}

/* --- Fiche : la présentation par défaut ----------------------------- */

/**
 * Fiche complète. Anatomie : un visuel unique en haut, un titre, le prix
 * en grand, les métadonnées, puis une barre d'actions collée en bas.
 * L'ancien `product-foot` disparaît au profit d'un `product-actions`
 * qu'une seule ligne décrit.
 */
function renderCard(item) {
  const name = displayName(item)
  return `
    <article class="${articleClass(item, 'product--card')}" data-id="${esc(item.id)}">
      ${heroBlock(item)}
      <div class="product-body" data-role="card-body" tabindex="0" role="button"
           aria-label="Voir les détails de ${esc(name)}"
           title="Cliquez pour voir les détails de ${esc(name)}">
        <strong class="product-name">${esc(name)}</strong>
        ${priceBlock(item)}
        ${metaBlock(item)}
        ${
          item.note
            ? `<p class="product-note">${esc(item.note)}</p>`
            : item.isBought && item.boughtAt
              ? `<p class="product-note">Coché le ${formatDate(item.boughtAt)}</p>`
              : ''
        }
      </div>
      <div class="product-actions">
        ${toggleButton(item)}
        ${editButton(item, name)}
      </div>
    </article>`
}

/* --- Mosaïque : planche contact -------------------------------------- */

/**
 * Un carré par produit. Le visuel remplit la case ; le nom et le prix
 * vivent dans une barre d'une seule ligne sous la case. Le nom de la
 * couleur est écrit dans le texte, jamais posé sur la teinte.
 */
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
      <span class="tile-tag">${esc(item.color || item.typeLabel)}</span>
      <button type="button" class="tile-check" data-action="toggle" data-id="${esc(item.id)}"
              aria-label="${item.isBought ? 'Remettre' : 'Marquer comme acheté'} ${esc(name)}"
              title="${item.isBought ? 'Remettre' : 'Marquer comme acheté'}">
        ${item.isBought ? icon('undo', 14) : icon('check', 15)}
      </button>
    </article>`
}

/* --- Ligne : la vue dense ------------------------------------------- */

/**
 * Une ligne par produit : vignette carrée, nom et détails, prix, coche.
 * Le nom de la couleur est écrit dans la ligne : posé sur une vignette
 * de 56 px, il serait rogné au milieu d'un mot.
 */
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
        ${item.isBought ? icon('undo', 14) : icon('check', 15)}
      </button>
    </article>`
}

/**
 * Le visuel compact des deux présentations denses (mosaïque, ligne).
 * Il ne réutilise pas `heroBlock` : cette bande est faite pour une fiche
 * de 300 px de large. Resservie dans une tuile de 140 px, l'étiquette
 * posée sur la teinte la rognerait ; dans une vignette de 56 px, elle
 * disparaîtrait. Ici la teinte est un aplat nu qui remplit la case, et le
 * nom de la couleur est écrit dans le texte voisin.
 */
function compactVisual(item) {
  const label = esc(item.color || displayName(item))
  if (item.photo) {
    return `<div class="cv cv--photo" data-action="preview-photo" data-id="${esc(item.id)}" role="button" tabindex="0"
         title="Agrandir la photo de ${label}" aria-label="Agrandir la photo de ${label}">
        <img src="${esc(item.photo)}" alt="${esc(displayName(item))}" loading="lazy" decoding="async">
      </div>`
  }
  /* `colorCss` est calculé ici, et non lu dans le produit de vue : un
     objet qui n'a pas encore passé par `productView` donnerait sinon un
     damier au lieu de sa teinte. */
  const css = colorCss(item)
  if (css) {
    return `<div class="cv cv--color" style="background:${esc(css)}"
         data-action="preview-color" data-id="${esc(item.id)}" role="button" tabindex="0"
         title="Agrandir la couleur ${label}" aria-label="Agrandir la couleur ${label}"></div>`
  }
  if (item.color || item.colorRgb) {
    /* Couleur nommée sans teinte connue : le damier, qui dit « on ne sait
       pas » au lieu d'inventer un noir. */
    return `<div class="cv cv--color is-empty" data-action="preview-color" data-id="${esc(item.id)}" role="button" tabindex="0"
         title="Agrandir la couleur ${label}" aria-label="Agrandir la couleur ${label}"></div>`
  }
  return `<div class="cv cv--blank">${icon('imageOff', 18)}</div>`
}

/** Carte de la liste. `layout` : `card` (fiche), `mosaic`, `row`. */
export function renderProductCard(item, layout = 'card') {
  if (layout === 'mosaic') return renderMosaic(item)
  if (layout === 'row') return renderRow(item)
  return renderCard(item)
}
