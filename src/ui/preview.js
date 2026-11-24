/* ------------------------------------------------------------------ */
/* Aperçu agrandi — ticket / facture                                   */
/*                                                                     */
/* Un clic sur le ticket d'une facture ouvre une boîte par-dessus la    */
/* page : on voit l'image en entier. Fermeture par Échap, la croix, ou  */
/* en cliquant à côté.                                                 */
/* ------------------------------------------------------------------ */

import { esc } from '../core/utils.js'
import { icon } from './icons.js'

/** Ouvre un `<dialog>` d'aperçu rempli, puis le nettoie à la fermeture. */
function openPreview({ title, body, tone = 'photo' }) {
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

/** Aperçu grand format d'un ticket/facture. */
export function openReceiptPreview(bill) {
  const label = esc(bill?.name || bill?.supplier || 'Facture')
  const body = `
    <img class="preview-photo" src="${esc(bill.receipt || bill.photo)}" alt="Ticket d'achat - ${label}" decoding="async">
    <div class="preview-caption">
      <strong class="preview-name">Ticket d'achat - ${label}</strong>
    </div>`
  return openPreview({
    title: `${icon('imagePlus', 15)} Facture / ticket`,
    body,
  })
}
