/* ------------------------------------------------------------------ */
/* DOM — sélecteurs, échappement HTML, presse-papiers, téléchargement  */
/* ------------------------------------------------------------------ */

export const $ = (selector, root = document) => root.querySelector(selector)

export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector))

/** Échappe une valeur destinée à être insérée dans du HTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Échappe une valeur destinée à un attribut HTML. */
export const escAttr = esc

/** `true` quand le focus est dans un champ de saisie. */
export function isTyping(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'))
}

export function debounce(fn, delay = 200) {
  let timer = null
  return (...args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, delay)
  }
}

/** Télécharge un contenu texte depuis le navigateur. */
export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* on tente le repli ci-dessous */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/** Identifiant court et lisible pour les ancres HTML. */
export function slug(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
