/* ------------------------------------------------------------------ */
/* Formatage — nombres, montants, dates, tailles                       */
/* ------------------------------------------------------------------ */

import { clamp } from './math.js'

export const NO_VALUE = '—'

/** Convertit « 1,50 » ou « 1.5 » en nombre, `null` si vide/invalide. */
export function toNumber(raw) {
  if (raw === undefined || raw === null) return null
  const cleaned = String(raw).trim().replace(/\s/g, '').replace(',', '.')
  if (!cleaned) return null
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}

const money = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/* Le dinar algérien s'écrit « DA » dans l'application — `Intl` ne connaît
   que le code « DZD », moins lisible pour un montant courant. On garde donc
   le nombre au format français et on ajoute le sigle à la main, comme
   `formatDA` le fait pour l'écran Analyse. */
const dzdNumber = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const dzd = {
  format: (value) => `${dzdNumber.format(value)} DA`,
}

const moneyByCurrency = new Map([
  ['EUR', money],
  ['DZD', dzd],
])

/** Formateur monétaire partagé, mémorisé par code devise. */
function moneyFormatter(currency) {
  const code = String(currency || 'DZD').toUpperCase()
  if (!moneyByCurrency.has(code)) {
    try {
      moneyByCurrency.set(
        code,
        new Intl.NumberFormat('fr-FR', {
          style: 'currency',
          currency: code,
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }),
      )
    } catch {
      /* Code devise inconnu : on garde l'euro. */
      moneyByCurrency.set(code, money)
    }
  }
  return moneyByCurrency.get(code)
}

const number = new Intl.NumberFormat('fr-FR')

/**
 * Montant dans la devise demandée (dinar algérien par défaut, écrit « DA ») ;
 * `null`/vide devient « — ».
 */
export function formatMoney(value, currency = 'DZD') {
  const n = toNumber(value)
  if (n === null) return NO_VALUE
  return moneyFormatter(currency).format(n)
}

export function formatNumber(value) {
  const n = toNumber(value)
  return n === null ? NO_VALUE : number.format(n)
}

const da = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/**
 * Montant en dinars : « 1 234 567 DA », sans décimale.
 *
 * Les milliers sont séparés par une espace fine insécable (U+202F) quel
 * que soit le système — `fr-FR` peut renvoyer une espace classique selon
 * les glottes.
 */
export function formatDA(value) {
  const n = toNumber(value)
  if (n === null) return NO_VALUE
  return `${da.format(Math.round(n)).replace(/[\s\u202f\u00a0]/g, '\u202f')} DA`
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

export function toDate(input) {
  if (!input) return null
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

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

/** Poids lisible, pour un nombre d'octets (ou de caractères) déjà mesuré. */
export function readableBytes(value) {
  const bytes = Number(value) || 0
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${Math.max(0, Math.round(bytes))} o`
}
