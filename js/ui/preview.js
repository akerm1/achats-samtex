/* ------------------------------------------------------------------ */
/* Aperçu agrandi — couleur et photo                                   */
/*                                                                     */
/* Un clic sur la teinte ou sur la photo d'une carte ouvre une boîte   */
/* par-dessus la liste, sans quitter la page : on voit la couleur en    */
/* grand et la photo en entier. Fermeture par Échap, la croix, ou en    */
/* cliquant à côté.                                                     */
/* ------------------------------------------------------------------ */

import { esc } from '../core/utils.js'
import { colorCss, colorHex, displayName } from '../data/model.js'
import { icon } from './icons.js'

/** Ouvre un `<dialog>` d'aperçu rempli, puis le nettoie à la fermeture. */
function openPreview({ title, body, tone = 'color' }) {
  /* Navigateurs sans `<dialog>` : on ne bloque rien, on n'ouvre pas. */
  if (typeof document.createElement('dialog').showModal !== 'function') return null
  /* Un seul aperçu à la fois : deux boîtes modales empilées ne se ferment
     plus l'une l'autre au clavier. */
  document.querySelectorAll('dialog.dialog--preview[open]').forEach((previous) => previous.close())
  const dialog = document.createElement('dialog')
  dialog.className = `dialog dialog--preview preview--${tone}`
  dialog.innerHTML = `
    <div class="preview-head">
      <span class="preview-title">${title}</span>
      <button type="button" class="icon-btn icon-btn--plain" data-close aria-label="Fermer l’aperçu" title="Fermer">
        ${icon('x', 16)}
      </button>
    </div>
    <div class="preview-body">${body}</div>`

  const close = () => dialog.close()
  dialog.querySelector('[data-close]')?.addEventListener('click', close)
  dialog.addEventListener('close', () => dialog.remove())
  /* Un clic sur le fond (en dehors de la boîte) ferme, comme une visionneuse. */
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close()
  })
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })

  document.body.appendChild(dialog)
  dialog.showModal()
  dialog.querySelector('[data-close]')?.focus()
  return dialog
}

/** Aperçu grand format de la couleur d'un produit. */
export function openColorPreview(product) {
  const label = product?.color ? esc(product.color) : 'Couleur'
  const css = colorCss(product)
  const hex = colorHex(product)
  const rgb = product?.colorRgb
  const rgbText = rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : ''
  const facets = [
    hex ? `<span class="preview-facet"><small>Hex</small><code>${esc(hex)}</code></span>` : '',
    rgbText ? `<span class="preview-facet"><small>RVB</small><code>${esc(rgbText)}</code></span>` : '',
  ]
    .filter(Boolean)
    .join('')
  const body = `
    <div class="preview-color${css ? '' : ' is-empty'}"${css ? ` style="background:${css}"` : ''} role="img"
         aria-label="Aperçu de la couleur ${label}"></div>
    <div class="preview-caption">
      <strong class="preview-name">${label}</strong>
      ${facets ? `<div class="preview-facets">${facets}</div>` : ''}
    </div>`
  return openPreview({
    title: `${icon('palette', 15)} Couleur`,
    body,
    tone: 'color',
  })
}

/** Aperçu grand format de la photo d'un produit. */
export function openPhotoPreview(product) {
  const label = esc(displayName(product))
  const body = `
    <img class="preview-photo" src="${esc(product.photo)}" alt="${label}" decoding="async">
    <div class="preview-caption">
      <strong class="preview-name">${label}</strong>
    </div>`
  return openPreview({
    title: `${icon('camera', 15)} Photo`,
    body,
    tone: 'photo',
  })
}
