/* ------------------------------------------------------------------ */
/* Utilitaires — DOM, formatage, helpers purs (sans effet de bord)      */
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

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

/** Convertit « 1,50 » ou « 1.5 » en nombre, `null` si vide/invalide. */
export function toNumber(raw) {
  if (raw === undefined || raw === null) return null
  const cleaned = String(raw).trim().replace(/\s/g, '').replace(',', '.')
  if (!cleaned) return null
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const money = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const number = new Intl.NumberFormat('fr-FR')

export const NO_VALUE = '—'

/** Montant en euros ; `null`/vide devient « — ». */
export function formatMoney(value) {
  const n = toNumber(value)
  if (n === null) return NO_VALUE
  return money.format(n)
}

export function formatNumber(value) {
  const n = toNumber(value)
  return n === null ? NO_VALUE : number.format(n)
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MONTHS_LONG = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

export function formatDate(input) {
  const date = toDate(input)
  if (!date) return NO_VALUE
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

export function formatDateLong(input) {
  const date = toDate(input)
  if (!date) return NO_VALUE
  return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`
}

export function formatTime(input) {
  const date = toDate(input)
  if (!date) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function formatRelative(input) {
  const date = toDate(input)
  if (!date) return ''
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "à l'instant"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 31) return `il y a ${days} j`
  return formatDate(date)
}

export function toDate(input) {
  if (!input) return null
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

/** « 3 produits » / « 1 produit ». */
export function plural(count, singular, pluralForm) {
  const value = Number(count) || 0
  const word = value > 1 ? pluralForm || `${singular}s` : singular
  return `${formatNumber(value)} ${word}`
}

export function percent(part, total) {
  const numerator = Number(part) || 0
  const denominator = Number(total) || 0
  if (denominator <= 0) return 0
  return clamp(Math.round((numerator / denominator) * 100), 0, 100)
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
