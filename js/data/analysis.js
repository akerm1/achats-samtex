/* ------------------------------------------------------------------ */
/* Analyse — calculs purs (aucun DOM), d'après le classeur CHABET.xlsx  */
/*                                                                     */
/* Exercice fiscal : 1er avril → 31 mars. Une fiche par mois, une ligne */
/* par jour ; une cellule de recette est un nombre, vide (aucun),       */
/* « aid » (férié) ou « /fermer » (fermé). Le total d'un mois           */
/* additionne les nombres seuls. La feuille « stat » compare chaque jour */
/* de l'année précédente au même jour de l'année en cours ; « achats »   */
/* est date | somme | total ; « générale » résume l'exercice.           */
/*                                                                     */
/* Aucune donnée de démonstration : toutes les listes démarrent vides.  */
/* Fonctions pures — testées telles quelles (tools/analysis.html).      */
/* ------------------------------------------------------------------ */

import { round2, toNumber, uid } from '../core/utils.js'

export const SALE_KINDS = { AMOUNT: 'amount', AID: 'aid', CLOSED: 'closed' }
const KIND_VALUES = Object.values(SALE_KINDS)

/** Détenteurs de la « possession » (colonnes du classeur). */
export const HOLDER_KEYS = ['moi', 'moh', 'hakima', 'autre']

/** Valeurs par défaut de la feuille « Paramètres de l'analyse ». */
export const DEFAULT_ANALYSIS_SETTINGS = {
  divisorA: 3,
  divisorB: 4,
  deduction: 1500000,
  openingRevenue: 0,
  openingPurchases: 0,
}

const MONTHS_LONG = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

/** Index par `Date.getDay()` : 0 = dimanche. */
export const WEEKDAYS_LONG = [
  'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
]

/* ------------------------------------------------------------------ */
/* Dates (locales, sans piège de fuseau : tout est en minuit local)     */
/* ------------------------------------------------------------------ */

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isDateKey(value) {
  return typeof value === 'string' && KEY_RE.test(value)
}

/** `2026-10-06` → Date locale (minuit), `null` si la clé est illisible. */
export function parseDateKey(value) {
  const match = KEY_RE.exec(String(value || ''))
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Date → `YYYY-MM-DD` (minuit local). */
export function dateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function monthKeyOf(value) {
  const date = value instanceof Date ? value : parseDateKey(value)
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** `2026-10` → {year, month} (month 0-indexé), `null` sinon. */
export function parseMonthKey(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ''))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  if (month < 0 || month > 11) return null
  return { year, month }
}

/** Jours d'un mois calendaire, du 1er au dernier. */
export function daysOfMonth(monthKey) {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) return []
  const { year, month } = parsed
  const count = new Date(year, month + 1, 0).getDate()
  const days = []
  for (let day = 1; day <= count; day += 1) {
    const date = new Date(year, month, day)
    days.push({ key: dateKey(date), day, weekday: date.getDay() })
  }
  return days
}

/** Même jour de l'année civile précédente (29/02 clampé en 28/02). */
export function previousYearKey(value) {
  const date = parseDateKey(value)
  if (!date) return ''
  const year = date.getFullYear() - 1
  const last = new Date(year, date.getMonth() + 1, 0).getDate()
  return dateKey(new Date(year, date.getMonth(), Math.min(date.getDate(), last)))
}

/* ------------------------------------------------------------------ */
/* Exercice fiscal (1 avril → 31 mars)                                  */
/* ------------------------------------------------------------------ */

function fiscalYearFrom(startYear) {
  return {
    startYear,
    start: dateKey(new Date(startYear, 3, 1)),
    end: dateKey(new Date(startYear + 1, 2, 31)),
    label: `01/04/${startYear} > 31/03/${startYear + 1}`,
  }
}

/** Exercice contenant `value` (date ou clé ; défaut : aujourd'hui). */
export function fiscalYear(value = new Date()) {
  const date = value instanceof Date ? value : parseDateKey(value) || new Date()
  const year = date.getFullYear()
  return fiscalYearFrom(date.getMonth() >= 3 ? year : year - 1)
}

/** Exercice par son année de début (avril), pour le sélecteur. */
export function fiscalYearByStart(startYear) {
  return fiscalYearFrom(Number(startYear) || fiscalYear().startYear)
}

export function shiftFiscalYear(fy, delta = 1) {
  return fiscalYearFrom((Number(fy?.startYear) || fiscalYear().startYear) + delta)
}

export function fiscalYearContains(fy, value) {
  const key = value instanceof Date ? dateKey(value) : String(value || '')
  if (!isDateKey(key) || !fy) return false
  return key >= fy.start && key <= fy.end
}

/** Les 12 mois de l'exercice, d'avril à mars, avec leur libellé français. */
export function fiscalMonths(fy) {
  const startYear = Number(fy?.startYear) || fiscalYear().startYear
  const months = []
  for (let i = 0; i < 12; i += 1) {
    const absolute = 3 + i /* avril = index 3 */
    const year = startYear + Math.floor(absolute / 12)
    const month = absolute % 12
    months.push({
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      year,
      month,
      label: MONTHS_LONG[month],
      title: `${MONTHS_LONG[month]} ${year}`,
    })
  }
  return months
}

/* ------------------------------------------------------------------ */
/* Normalisateurs tolérants (champs inconnus conservés, comme model.js) */
/* ------------------------------------------------------------------ */

function source(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

function listOf(list, normalize) {
  if (!Array.isArray(list)) return []
  return list.filter((item) => item && typeof item === 'object').map(normalize)
}

/** Une journée : `id = YYYY-MM-DD`, kind amount|aid|closed. */
export function normalizeSale(raw = {}) {
  const s = source(raw)
  const date = String(s.date || (isDateKey(s.id) ? s.id : '')).trim()
  const kind = KIND_VALUES.includes(s.kind) ? s.kind : SALE_KINDS.AMOUNT
  const amount = toNumber(s.amount)
  return {
    ...s,
    id: String(s.id || date || uid('sale')),
    date,
    kind,
    amount: kind === SALE_KINDS.AMOUNT && amount !== null ? amount : null,
    updatedAt: s.updatedAt || new Date().toISOString(),
  }
}

export const normalizeSaleList = (list) => listOf(list, normalizeSale)

/** Achats (feuille « achats ») : date | somme. */
export function normalizePurchase(raw = {}) {
  const s = source(raw)
  const createdAt = s.createdAt || new Date().toISOString()
  const amount = toNumber(s.amount)
  return {
    ...s,
    id: String(s.id || uid('purchase')),
    date: String(s.date ?? '').trim(),
    amount: amount !== null ? amount : null,
    note: String(s.note ?? '').trim(),
    createdAt,
    updatedAt: s.updatedAt || createdAt,
  }
}

export const normalizePurchaseList = (list) => listOf(list, normalizePurchase)

export function normalizeInvestment(raw = {}) {
  const s = source(raw)
  const amount = toNumber(s.amount)
  return {
    ...s,
    id: String(s.id || uid('inv')),
    name: String(s.name ?? '').trim(),
    amount: amount !== null ? amount : null,
  }
}

export const normalizeInvestmentList = (list) => listOf(list, normalizeInvestment)

export function normalizeHolding(raw = {}) {
  const s = source(raw)
  const amount = toNumber(s.amount)
  return {
    ...s,
    id: String(s.id || uid('hold')),
    holder: HOLDER_KEYS.includes(s.holder) ? s.holder : 'autre',
    amount: amount !== null ? amount : null,
    note: String(s.note ?? '').trim(),
  }
}

export const normalizeHoldingList = (list) => listOf(list, normalizeHolding)

export function normalizePlace(raw = {}) {
  const s = source(raw)
  const amount = toNumber(s.amount)
  return {
    ...s,
    id: String(s.id || uid('place')),
    label: String(s.label ?? '').trim(),
    amount: amount !== null ? amount : null,
  }
}

export const normalizePlaceList = (list) => listOf(list, normalizePlace)

function normalizeCount(value, fallback, min = 0) {
  const n = toNumber(value)
  if (n === null || !Number.isFinite(n) || n < min) return fallback
  return Math.round(n)
}

export function normalizeAnalysisSettings(raw = {}) {
  const s = source(raw)
  return {
    ...s,
    divisorA: normalizeCount(s.divisorA, DEFAULT_ANALYSIS_SETTINGS.divisorA, 1) || DEFAULT_ANALYSIS_SETTINGS.divisorA,
    divisorB: normalizeCount(s.divisorB, DEFAULT_ANALYSIS_SETTINGS.divisorB, 1) || DEFAULT_ANALYSIS_SETTINGS.divisorB,
    deduction: normalizeCount(s.deduction, DEFAULT_ANALYSIS_SETTINGS.deduction, 0),
    openingRevenue: normalizeCount(s.openingRevenue, DEFAULT_ANALYSIS_SETTINGS.openingRevenue, 0),
    openingPurchases: normalizeCount(s.openingPurchases, DEFAULT_ANALYSIS_SETTINGS.openingPurchases, 0),
  }
}

/** Libellés des colonnes de la possession, modifiables par l'utilisateur. */
export function normalizeHolderLabels(raw = {}) {
  const s = source(raw)
  const labels = {}
  for (const holder of HOLDER_KEYS) {
    labels[holder] = String(s[holder] ?? holder).trim() || holder
  }
  return { ...s, ...labels }
}

/** État complet de l'Analyse (champs inconnus du document conservés). */
export function normalizeAnalysis(raw) {
  const s = source(raw)
  return {
    ...s,
    sales: normalizeSaleList(s.sales),
    purchases: normalizePurchaseList(s.purchases),
    investments: normalizeInvestmentList(s.investments),
    holdings: normalizeHoldingList(s.holdings),
    places: normalizePlaceList(s.places),
    settings: normalizeAnalysisSettings(s.settings),
    holderLabels: normalizeHolderLabels(s.holderLabels),
  }
}

/** État vide — toutes les listes démarrent vides, aucune démo. */
export function emptyAnalysis() {
  return normalizeAnalysis({})
}

/* ------------------------------------------------------------------ */
/* Recettes mensuelles (fiche par mois)                                 */
/* ------------------------------------------------------------------ */

export function salesByDate(sales) {
  const map = new Map()
  for (const sale of sales || []) {
    if (sale && isDateKey(sale.date)) map.set(sale.date, sale)
  }
  return map
}

function numericAmount(value) {
  return toNumber(value)
}

/**
 * Bilan d'un mois : seuls les nombres sont additionnés — vide, « aid »
 * et « /fermer » sont ignorés, comme dans le classeur.
 */
export function monthStats(sales, monthKey, { divisorB = DEFAULT_ANALYSIS_SETTINGS.divisorB } = {}) {
  let total = 0
  let count = 0
  for (const sale of sales || []) {
    if (!sale || sale.kind !== SALE_KINDS.AMOUNT) continue
    if (monthKeyOf(sale.date) !== monthKey) continue
    const amount = numericAmount(sale.amount)
    if (amount === null) continue
    total += amount
    count += 1
  }
  const divisor = Number(divisorB) > 0 ? Number(divisorB) : DEFAULT_ANALYSIS_SETTINGS.divisorB
  return {
    total: round2(total),
    count,
    /* Moyenne des jours numériques seuls (les vides non comptés). */
    average: count ? round2(total / count) : null,
    divisor,
    perDivisor: round2(total / divisor),
    minusDivisor: round2(total - total / divisor),
  }
}

/** Les 12 totaux mensuels de l'exercice, dans l'ordre avril → mars. */
export function fyMonthlyTotals(sales, fy, settings = {}) {
  return fiscalMonths(fy).map((month) => ({
    ...month,
    total: monthStats(sales, month.key, settings).total,
  }))
}

/* ------------------------------------------------------------------ */
/* Comparaison (feuille « stat »)                                       */
/* ------------------------------------------------------------------ */

/**
 * Une ligne par jour du mois : la valeur de l'année précédente est lue
 * dans `sales` au même jour calendaire un an plus tôt (aucun stockage
 * supplémentaire) — un jour de l'exercice précédent y est déjà inscrit.
 */
export function comparisonRows(sales, monthKey) {
  const byDate = salesByDate(sales)
  return daysOfMonth(monthKey).map((day) => ({
    ...day,
    previous: byDate.get(previousYearKey(day.key)) || null,
    current: byDate.get(day.key) || null,
  }))
}

/** Sous-totaux du mois : année précédente, année en cours, écart. */
export function comparisonTotals(rows) {
  let previousTotal = 0
  let currentTotal = 0
  for (const row of rows || []) {
    const previous = row?.previous?.kind === SALE_KINDS.AMOUNT ? numericAmount(row.previous.amount) : null
    const current = row?.current?.kind === SALE_KINDS.AMOUNT ? numericAmount(row.current.amount) : null
    if (previous !== null) previousTotal += previous
    if (current !== null) currentTotal += current
  }
  return {
    previousTotal: round2(previousTotal),
    currentTotal: round2(currentTotal),
    difference: round2(currentTotal - previousTotal),
  }
}

/* ------------------------------------------------------------------ */
/* Achats & sommes                                                      */
/* ------------------------------------------------------------------ */

export function sumAmounts(list, key = 'amount') {
  let total = 0
  for (const item of list || []) {
    const amount = numericAmount(key === 'amount' ? item?.amount : item?.[key])
    if (amount !== null) total += amount
  }
  return round2(total)
}

/** Achats dont la date tombe dans l'exercice. */
export function purchasesInFy(purchases, fy) {
  return (purchases || []).filter((item) => fiscalYearContains(fy, item?.date))
}

/** Toutes les lignes de la possession, groupées par détenteur. */
export function holdingsByHolder(holdings) {
  const groups = {}
  for (const holder of HOLDER_KEYS) groups[holder] = []
  for (const item of holdings || []) {
    const holder = HOLDER_KEYS.includes(item?.holder) ? item.holder : 'autre'
    groups[holder].push(item)
  }
  return groups
}

/* ------------------------------------------------------------------ */
/* Synthèse (feuille « générale »)                                      */
/* ------------------------------------------------------------------ */

/**
 * Toutes les cartes de synthèse, aux formules du classeur :
 *   total recettes = report antérieur + somme des 12 mois
 *   recette + inv  = total investissements + total recettes
 *   recette/3      = total recettes / divisorA ; bénéfice = recette/3 − déduction
 *   recette/4      = total recettes / divisorB ; bénéfice = recette/4 − déduction
 *   différence     = (recette + inv) − total achats
 *   manques        = différence − possession ;  GT = possession + manques
 */
export function synthesis(analysis, fy) {
  const state = normalizeAnalysis(analysis)
  const settings = state.settings
  const monthly = fyMonthlyTotals(state.sales, fy, settings)
  const openingRevenue = settings.openingRevenue
  const totalRecettes = round2(openingRevenue + sumAmounts(monthly, 'total'))
  const totalInvestissements = sumAmounts(state.investments)
  const achatsFy = purchasesInFy(state.purchases, fy)
  const totalAchats = round2(settings.openingPurchases + sumAmounts(achatsFy))
  const recetteInv = round2(totalInvestissements + totalRecettes)
  const recetteDivA = round2(totalRecettes / settings.divisorA)
  const recetteDivB = round2(totalRecettes / settings.divisorB)
  const difference = round2(recetteInv - totalAchats)
  const possession = sumAmounts(state.holdings)
  const manques = round2(difference - possession)
  return {
    settings,
    monthly,
    openingRevenue,
    totalRecettes,
    totalInvestissements,
    totalAchats,
    achatsFy,
    recetteInv,
    divisorA: settings.divisorA,
    recetteDivA,
    beneficeA: round2(recetteDivA - settings.deduction),
    divisorB: settings.divisorB,
    recetteDivB,
    beneficeB: round2(recetteDivB - settings.deduction),
    difference,
    possession,
    manques,
    gt: round2(possession + manques),
  }
}

/* ------------------------------------------------------------------ */
/* Fusion (sauvegarde v3 + conflit 409 du Worker)                       */
/* ------------------------------------------------------------------ */

const COLLECTIONS = ['sales', 'purchases', 'investments', 'holdings', 'places']

/** Fusion par `id` : l'entrant gagne, comme produits et factures. */
function mergeById(current, incoming) {
  const map = new Map((current || []).map((item) => [item.id, item]))
  let added = 0
  let updated = 0
  for (const item of incoming || []) {
    if (!item || typeof item !== 'object') continue
    const existing = map.get(item.id)
    if (existing) {
      map.set(item.id, { ...existing, ...item, updatedAt: new Date().toISOString() })
      updated += 1
    } else {
      map.set(item.id, item)
      added += 1
    }
  }
  return { list: [...map.values()], added, updated }
}

/**
 * Fusionne deux états d'analyse par `id` (l'entrant gagne). Réglages et
 * libellés sont remplacés par ceux de l'entrant quand ils sont présents :
 * c'est la règle « incoming wins » de la sauvegarde et du 409.
 * @returns {{analysis: object, added: number, updated: number}}
 */
export function mergeAnalysis(current, incoming) {
  const base = normalizeAnalysis(current)
  const other = source(incoming)
  const result = { ...base }
  let added = 0
  let updated = 0
  for (const key of COLLECTIONS) {
    if (!Array.isArray(other[key])) continue
    const merged = mergeById(base[key], other[key])
    result[key] = merged.list
    added += merged.added
    updated += merged.updated
  }
  if (other.settings && typeof other.settings === 'object') {
    result.settings = normalizeAnalysisSettings({ ...base.settings, ...other.settings })
  }
  if (other.holderLabels && typeof other.holderLabels === 'object') {
    result.holderLabels = normalizeHolderLabels({ ...base.holderLabels, ...other.holderLabels })
  }
  return { analysis: result, added, updated }
}






