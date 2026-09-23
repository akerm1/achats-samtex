/* ------------------------------------------------------------------ */
/* Retour utilisateur — notifications (toasts) et confirmation         */
/* ------------------------------------------------------------------ */

import { $, esc } from './utils.js'
import { icon } from '../ui/icons.js'

const TOAST_TYPES = { ok: 'ok', error: 'error', info: 'info' }

function toaster() {
  let root = $('#toasts')
  if (!root) {
    root = document.createElement('div')
    root.id = 'toasts'
    root.className = 'toasts'
    root.setAttribute('aria-live', 'polite')
    root.setAttribute('aria-atomic', 'false')
    document.body.appendChild(root)
  }
  return root
}

const MARK = { ok: 'checkCircle', error: 'alert', info: 'sparkles' }

/**
 * Affiche une notification éphémère.
 * @returns {() => void} fonction de fermeture immédiate.
 */
export function toast(message, { type = 'info', actionLabel = '', onAction = null, duration = 4500 } = {}) {
  const kind = TOAST_TYPES[type] || 'info'
  const root = toaster()
  const node = document.createElement('div')
  node.className = `toast toast--${kind}`
  node.innerHTML = `
    <span class="toast-mark">${icon(MARK[kind], 14)}</span>
    <span class="toast-text">${esc(message)}</span>
    ${actionLabel ? `<button type="button" class="toast-action">${esc(actionLabel)}</button>` : ''}
    <button type="button" class="icon-btn icon-btn--plain" data-toast-close aria-label="Fermer">${icon('x', 13)}</button>`

  let timer = null
  const dismiss = () => {
    if (timer) clearTimeout(timer)
    node.remove()
  }

  node.querySelector('[data-toast-close]')?.addEventListener('click', dismiss)
  if (actionLabel) {
    node.querySelector('.toast-action')?.addEventListener('click', () => {
      dismiss()
      onAction?.()
    })
  }

  root.appendChild(node)
  if (duration > 0) timer = setTimeout(dismiss, duration)
  while (root.children.length > 3) root.firstElementChild?.remove()
  return dismiss
}

/**
 * Demande une confirmation via un `<dialog>` natif.
 * @returns {Promise<boolean>}
 */
export function confirmAction({
  title = 'Confirmer',
  message = '',
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
} = {}) {
  if (typeof document.createElement('dialog').showModal !== 'function') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`))
  }
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'dialog dialog--sm'
    dialog.innerHTML = `
      <form method="dialog">
        <div class="dialog-body u-stack">
          <h2>${esc(title)}</h2>
          <p class="u-muted" style="font-size:13px;line-height:1.55">${esc(message)}</p>
        </div>
        <div class="dialog-foot">
          <button type="button" class="btn btn--ghost" data-cancel>${esc(cancelLabel)}</button>
          <button type="submit" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm value="confirm">
            ${esc(confirmLabel)}
          </button>
        </div>
      </form>`

    let settled = false
    const close = (result) => {
      if (settled) return
      settled = true
      dialog.remove()
      resolve(result)
    }

    /* Toute fermeture non décidée (programmation, soumission implicite…) vaut « non ». */
    dialog.addEventListener('close', () => close(false))
    dialog.querySelector('[data-cancel]')?.addEventListener('click', () => close(false))
    dialog.querySelector('[data-confirm]')?.addEventListener('click', () => close(true))
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      close(false)
    })
    document.body.appendChild(dialog)
    dialog.showModal()
    dialog.querySelector('[data-confirm]')?.focus()
  })
}
