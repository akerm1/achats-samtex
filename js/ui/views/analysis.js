/* ------------------------------------------------------------------ */
/* Vue Analyse — le classeur CHABET.xlsx porté à l'écran                */
/*                                                                     */
/* Onglets : Recettes (la fiche d'un mois), Comparaison (feuille « stat »), */
/* Générale (synthèse, possession, paramètres).                        */
/* Exercice fiscal par défaut : l'en cours (1 avril → 31 mars).         */
/* Saisie : auto-enregistrement à la perte de focus (deferWhileEditing  */
/* empêche un redessin de voler le curseur en cours de frappe).         */
/* Aucune donnée de démonstration : tout démarre vide.                  */
/* ------------------------------------------------------------------ */

import { esc, escAttr, formatDA, toNumber } from '../../core/utils.js'
import { icon } from '../icons.js'
import { deferWhileEditing } from '../view.js'
import { PROVIDER_WORKER } from '../../data/sync.js'
import { getState } from '../../data/store.js'
import * as ana from '../../data/analysis.js'
import * as store from '../../data/analysis-store.js'

let host = null
let tab = 'recettes'
let fyStart = null
let monthKey = null /* fiche Recettes */
let cmpMonthKey = null /* filtre de Comparaison */
let settingsOpen = false

const TABS = [
  { value: 'recettes', label: 'Recettes' },
  { value: 'comparaison', label: 'Comparaison' },
  { value: 'generale', label: 'Générale' },
]

/* ------------------------------------------------------------------ */
/* Contexte (exercice + mois)                                           */
/* ------------------------------------------------------------------ */

function currentFy() {
  return ana.fiscalYearByStart(fyStart ?? ana.fiscalYear().startYear)
}

function fyMonths() {
  return ana.fiscalMonths(currentFy())
}

/** Mois par défaut : celui d'aujourd'hui s'il appartient à l'exercice. */
function defaultMonthKey() {
  const fy = currentFy()
  const today = ana.monthKeyOf(new Date())
  const months = fyMonths()
  if (months.some((month) => month.key === today)) return today
  return months[0].key
}

function clampToMonth(key, { fromCompare = false } = {}) {
  const months = fyMonths()
  const found = months.find((month) => month.key === key)
  if (found) return found.key
  const today = ana.monthKeyOf(new Date())
  if (months.some((month) => month.key === today)) return today
  return fromCompare ? months[months.length - 1].key : months[0].key
}

function monthTitle(key) {
  const month = fyMonths().find((entry) => entry.key === key)
  return month ? month.title : key
}

function monthIndex(key) {
  return fyMonths().findIndex((month) => month.key === key)
}

/** « 06/10/2026 » — la colonne date du classeur. */
function shortDate(key) {
  if (!ana.isDateKey(key)) return key || '—'
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`
}

/* ------------------------------------------------------------------ */
/* Chrome : en-tête, sélecteur d'exercice, onglets                      */
/* ------------------------------------------------------------------ */

/**
 * Même avertissement que les factures : sans lien privé, l'analyse reste
 * sur cet appareil — dit à l'écran plutôt que de se découvrir seul.
 */
function syncNote() {
  const { provider } = getState()
  if (provider === PROVIDER_WORKER) return ''
  return `<p class="list-head-note">${icon('cloud', 12)} Les factures et l'analyse ne sont synchronisées qu'avec le lien privé Cloudflare — ici, elles restent sur cet appareil.</p>`
}

function header() {
  const fy = currentFy()
  const recorded = store.getAnalysis().sales.length
  return `
    <header class="list-head">
      <div class="list-head-copy">
        <h1>Analyse</h1>
        <p class="list-head-sub">
          Exercice <strong>${esc(fy.label)}</strong>
          ${recorded ? ` · <span class="list-head-total">${recorded} journée(s) saisie(s)</span>` : ''}
        </p>
        ${syncNote()}
      </div>
    </header>`
}

function fyBar() {
  const fy = currentFy()
  return `
    <div class="ana-fybar" data-role="ana-fybar">
      <button type="button" class="icon-btn" data-action="analysis-fy-prev"
              aria-label="Exercice précédent" title="Exercice précédent">${icon('chevronLeft', 18)}</button>
      <span class="ana-fy-label">${esc(fy.label)}</span>
      <button type="button" class="icon-btn" data-action="analysis-fy-next"
              aria-label="Exercice suivant" title="Exercice suivant">${icon('chevronRight', 18)}</button>
    </div>`
}

function tabsHtml() {
  return `
    <div class="segmented segmented--block" role="tablist" aria-label="Sections de l'analyse" data-role="ana-tabs">
      ${TABS.map(
        (item) => `
          <button type="button" role="tab" class="${tab === item.value ? 'is-active' : ''}"
                  data-action="analysis-tab" data-value="${item.value}"
                  aria-selected="${tab === item.value ? 'true' : 'false'}">${esc(item.label)}</button>`,
      ).join('')}
    </div>`
}

/* ------------------------------------------------------------------ */
/* Onglet Recettes (la fiche mensuelle)                                 */
/* ------------------------------------------------------------------ */

function saleCell(sale) {
  if (!sale) return ''
  if (sale.kind === ana.SALE_KINDS.AID) return '<span class="ana-day-mark badge badge--teal">aid</span>'
  if (sale.kind === ana.SALE_KINDS.CLOSED) return '<span class="ana-day-mark badge badge--orange">/fermer</span>'
  return ''
}

function dayRow(day, sale, monthLabel) {
  const kind = sale?.kind || ana.SALE_KINDS.AMOUNT
  const marker = saleCell(sale)
  const amount = kind === ana.SALE_KINDS.AMOUNT ? (sale?.amount ?? '') : ''
  const isToday = day.key === ana.monthKeyOf(new Date())
  const weekend = day.weekday === 5 || day.weekday === 6 /* vendredi, samedi */
  const toggle = (kindValue, label) => `
    <button type="button" class="btn btn--soft btn--sm ana-toggle ${kind === kindValue ? 'is-on' : ''}"
            data-action="analysis-day-kind" data-date="${day.key}" data-kind="${kindValue}"
            aria-pressed="${kind === kindValue ? 'true' : 'false'}">${label}</button>`
  return `
    <div class="ana-day${isToday ? ' is-today' : ''}${weekend ? ' ana-day--we' : ''}" data-date="${day.key}">
      <span class="ana-day-when">
        <span class="ana-day-date">${shortDate(day.key)}</span>
        <span class="ana-day-week">${esc(ana.WEEKDAYS_LONG[day.weekday])}</span>
        ${isToday ? '<em class="ana-day-now">aujourd’hui</em>' : ''}
      </span>
      ${
        marker
          ? `<span class="ana-day-slot">${marker}</span>`
          : `<span class="ana-day-slot">
               <input class="input ana-day-input" type="text" inputmode="decimal" autocomplete="off"
                      data-date="${day.key}" value="${escAttr(amount)}" placeholder="—"
                      aria-label="Recette du ${day.day} ${esc(monthLabel)}">
             </span>`
      }
      <span class="ana-day-toggles">
        ${toggle(ana.SALE_KINDS.CLOSED, 'Fermé')}
        <button type="button" class="icon-btn" data-action="analysis-day-clear" data-date="${day.key}"
                aria-label="Effacer la journée du ${shortDate(day.key)}" title="Effacer">${icon('x', 14)}</button>
      </span>
    </div>`
}

function recettesFoot(stats) {
  return `
    <div class="ana-foot" data-role="ana-foot">
      <div class="ana-stat"><span>total</span><strong>${formatDA(stats.total)}</strong></div>
      <div class="ana-stat"><span>total/${stats.divisor}</span><strong>${formatDA(stats.perDivisor)}</strong></div>
      <div class="ana-stat"><span>total − total/${stats.divisor}</span><strong>${formatDA(stats.minusDivisor)}</strong></div>
      <div class="ana-stat"><span>moyenne</span><strong>${formatDA(stats.average)}</strong></div>
    </div>`
}

function recettesHtml() {
  const state = store.getAnalysis()
  const settings = state.settings
  const months = fyMonths()
  const index = monthIndex(monthKey)
  const byDate = ana.salesByDate(state.sales)
  const days = ana.daysOfMonth(monthKey)
  const label = monthTitle(monthKey).split(' ')[0]
  const stats = ana.monthStats(state.sales, monthKey, settings)
  return `
    <div class="ana-toolbar">
      <button type="button" class="icon-btn" data-action="analysis-month-prev"
              aria-label="Mois précédent" title="Mois précédent" ${index <= 0 ? 'disabled' : ''}>${icon('chevronLeft', 18)}</button>
      <label class="ana-monthpick">
        <span class="sr-only">Mois de la fiche</span>
        <select class="select" data-role="ana-month-select" aria-label="Mois de la fiche">
          ${months
            .map(
              (month) =>
                `<option value="${month.key}" ${month.key === monthKey ? 'selected' : ''}>${esc(month.title)}</option>`,
            )
            .join('')}
        </select>
      </label>
      <button type="button" class="icon-btn" data-action="analysis-month-next"
              aria-label="Mois suivant" title="Mois suivant" ${index >= months.length - 1 ? 'disabled' : ''}>${icon('chevronRight', 18)}</button>
      <button type="button" class="btn btn--soft ana-today" data-action="analysis-today">${icon('calendar', 14)} Aujourd’hui</button>
    </div>
    <div class="ana-days" data-role="ana-days">
      <div class="ana-days-head" aria-hidden="true"><span>jour</span><span>recette du jour</span><span>bascules</span></div>
      ${days.map((day) => dayRow(day, byDate.get(day.key), label)).join('')}
    </div>
    ${recettesFoot(stats)}`
}

/* ------------------------------------------------------------------ */
/* Onglet Comparaison (feuille « stat »)                                */
/* ------------------------------------------------------------------ */

/** Cellule de comparaison : nombre, marque « aid »/« fermé », ou vide. */
function compareCell(sale) {
  if (!sale) return '<span class="ana-cell-empty">—</span>'
  if (sale.kind === ana.SALE_KINDS.AID) return '<span class="ana-mark badge badge--teal">aid</span>'
  if (sale.kind === ana.SALE_KINDS.CLOSED) return '<span class="ana-mark badge badge--orange">fermé</span>'
  if (sale.amount === null || sale.amount === undefined) return '<span class="ana-cell-empty">—</span>'
  return `<strong class="ana-num">${formatDA(sale.amount)}</strong>`
}

function comparaisonHtml() {
  const state = store.getAnalysis()
  const months = fyMonths()
  const rows = ana.comparisonRows(state.sales, cmpMonthKey)
  const totals = ana.comparisonTotals(rows)
  const year = String(cmpMonthKey || '').slice(0, 4)
  const prevYear = year ? String(Number(year) - 1) : ''
  return `
    <div class="ana-toolbar">
      <label class="ana-monthpick ana-cmp-filter">
        <span class="sr-only">Mois à comparer</span>
        <select class="select" data-role="ana-cmp-select" aria-label="Mois à comparer">
          ${months
            .map(
              (month) =>
                `<option value="${month.key}" ${month.key === cmpMonthKey ? 'selected' : ''}>${esc(month.title)}</option>`,
            )
            .join('')}
        </select>
      </label>
    </div>
    <div class="ana-compare" data-role="ana-compare">
      <div class="ana-compare-head">
        <span>date</span>
        <span>année précédente <small>${prevYear}</small></span>
        <span>année en cours <small>${year}</small></span>
      </div>
      ${rows
        .map(
          (row) => `
        <div class="ana-compare-row">
          <span class="ana-day-date">${shortDate(row.key)}</span>
          <span>${compareCell(row.previous)}</span>
          <span>${compareCell(row.current)}</span>
        </div>`,
        )
        .join('')}
    </div>
    <div class="ana-foot" data-role="ana-cmp-foot">
      <div class="ana-stat"><span>année précédente</span><strong>${formatDA(totals.previousTotal)}</strong></div>
      <div class="ana-stat"><span>année en cours</span><strong>${formatDA(totals.currentTotal)}</strong></div>
      <div class="ana-stat"><span>écart</span><strong>${formatDA(totals.difference)}</strong></div>
    </div>`
}

/* ------------------------------------------------------------------ */
/* Onglet Générale — recettes | somme · investissements | somme ·       */
/* achats | total (les en-têtes du classeur)                            */
/* ------------------------------------------------------------------ */

function tableHead(first, second) {
  return `<div class="ana-table-head"><span>${esc(first)}</span><span>${esc(second)}</span></div>`
}

/** Ligne éditable : champs + suppression, auto-enregistrés à la saisie. */
function editRow(action, item, fields) {
  return `
    <div class="ana-edit" data-ana-col="${action}" data-id="${escAttr(item.id)}">
      ${fields
        .map(
          (field) => `
        <input class="input ${field.amount ? 'ana-amount' : ''}" data-field="${field.key}"
               type="${field.type || 'text'}" ${field.amount || field.type === 'date' ? 'autocomplete="off"' : ''}
               ${field.amount ? 'inputmode="decimal"' : ''}
               value="${escAttr(field.value ?? '')}" placeholder="${escAttr(field.placeholder || '')}"
               aria-label="${escAttr(field.label)}">`,
        )
        .join('')}
      <button type="button" class="icon-btn is-danger" data-action="analysis-${action}-del" data-id="${escAttr(item.id)}"
              aria-label="Supprimer cette ligne" title="Supprimer">${icon('trash', 14)}</button>
    </div>`
}

function generaleRecettes(s) {
  return `
    <section class="card ana-panel" aria-label="Recettes de l'exercice">
      ${tableHead('recettes', 'somme')}
      <div class="ana-line"><span>Report période antérieure</span><strong>${formatDA(s.openingRevenue)}</strong></div>
      ${s.monthly
        .map((month) => `<div class="ana-line"><span>${esc(month.title)}</span><strong>${formatDA(month.total)}</strong></div>`)
        .join('')}
    </section>`
}

function generaleInvestissements(s) {
  const items = store.getAnalysis().investments
  return `
    <section class="card ana-panel" aria-label="Investissements de l'exercice">
      ${tableHead('investissements', 'somme')}
      ${items
        .map((item) =>
          editRow('investment', item, [
            { key: 'name', value: item.name, placeholder: 'Nom', label: "Nom de l'investissement" },
            { key: 'amount', value: item.amount, placeholder: 'Somme', label: 'Somme investie', amount: true },
          ]),
        )
        .join('')}
      <div class="ana-line ana-line--total"><span>total</span><strong>${formatDA(s.totalInvestissements)}</strong></div>
      <button type="button" class="btn btn--secondary btn--block" data-action="analysis-investment-add">
        ${icon('plus', 14)} Ajouter un investissement
      </button>
    </section>`
}

function generaleAchats(s) {
  const items = s.achatsFy
  return `
    <section class="card ana-panel" aria-label="Achats de l'exercice">
      ${tableHead('achats', 'total')}
      <div class="ana-line"><span>Report période antérieure</span><strong>${formatDA(s.settings.openingPurchases)}</strong></div>
      ${items
        .map((item) =>
          editRow('purchase', item, [
            { key: 'date', value: item.date, type: 'date', label: "Date de l'achat" },
            { key: 'amount', value: item.amount, placeholder: 'Somme', label: "Somme de l'achat", amount: true },
          ]),
        )
        .join('')}
      <div class="ana-line ana-line--total"><span>total</span><strong>${formatDA(s.totalAchats)}</strong></div>
      <button type="button" class="btn btn--secondary btn--block" data-action="analysis-purchase-add">
        ${icon('plus', 14)} Ajouter un achat
      </button>
      <p class="field-hint">Seuls les achats datés de l'exercice en cours sont listés et comptés.</p>
    </section>`
}

/** Carte de synthèse : libellé exact du classeur, valeur en dirhams. */
function synthCard(key, label, value, hint = '') {
  return `
    <div class="ana-card" data-ana-card="${escAttr(key)}">
      <span class="ana-card-label">${esc(label)}</span>
      <strong class="ana-card-value">${formatDA(value)}</strong>
      ${hint ? `<span class="ana-card-hint">${esc(hint)}</span>` : ''}
    </div>`
}

function generaleSynthese(s) {
  return `
    <section class="card ana-panel" aria-label="Synthèse de l'exercice">
      <h2 class="ana-panel-title">Synthèse</h2>
      <div class="ana-cards">
        ${synthCard('total-recettes', 'total recettes', s.totalRecettes)}
        ${synthCard('total-investissements', 'total investissements', s.totalInvestissements)}
        ${synthCard('total-achats', 'total achats', s.totalAchats)}
        ${synthCard('recette-inv', 'recette + inv', s.recetteInv)}
        ${synthCard('recette-a', `recette/${s.divisorA}`, s.recetteDivA)}
        ${synthCard('benefice-a', 'bénéfice', s.beneficeA, `recette/${s.divisorA} − déduction`)}
        ${synthCard('recette-b', `recette/${s.divisorB}`, s.recetteDivB)}
        ${synthCard('benefice-b', 'bénéfice', s.beneficeB, `recette/${s.divisorB} − déduction`)}
        ${synthCard('difference', 'différence', s.difference)}
        ${synthCard('possession', 'possession', s.possession)}
        ${synthCard('manques', 'manques', s.manques)}
        ${synthCard('gt', 'GT', s.gt)}
      </div>
    </section>`
}

/** Une colonne de la possession : libellé modifiable, lignes, somme. */
function holderColumn(holder, labels, groups) {
  const items = groups[holder]
  const sum = ana.sumAmounts(items)
  return `
    <div class="ana-holder" data-holder="${holder}">
      <input class="input ana-holder-label" type="text" value="${escAttr(labels[holder] || holder)}"
             data-holder-input="${holder}" aria-label="Libellé de la colonne ${escAttr(labels[holder] || holder)}">
      ${items
        .map(
          (item) => `
        <div class="ana-edit ana-holder-row" data-ana-col="holding" data-id="${escAttr(item.id)}">
          <input class="input ana-amount" data-field="amount" type="text" inputmode="decimal" autocomplete="off"
                 value="${escAttr(item.amount ?? '')}" placeholder="Somme" aria-label="Montant détenu">
          <button type="button" class="icon-btn is-danger" data-action="analysis-holding-del" data-id="${escAttr(item.id)}"
                  aria-label="Supprimer ce montant" title="Supprimer">${icon('trash', 13)}</button>
          <input class="input ana-holder-note" data-field="note" type="text" autocomplete="off"
                 value="${escAttr(item.note ?? '')}" placeholder="Note (facultative)" aria-label="Note (facultative)">
        </div>`,
        )
        .join('')}
      <button type="button" class="btn btn--soft btn--sm btn--block" data-action="analysis-holding-add"
              data-holder="${holder}">${icon('plus', 13)} Ajouter</button>
      <div class="ana-holder-sum"><span>somme</span><strong>${formatDA(sum)}</strong></div>
    </div>`
}

function generalePossession() {
  const state = store.getAnalysis()
  const groups = ana.holdingsByHolder(state.holdings)
  const total = ana.sumAmounts(state.holdings)
  return `
    <section class="card ana-panel" aria-label="Possession par détenteur">
      ${tableHead('possession', 'somme')}
      <div class="ana-holders">
        ${ana.HOLDER_KEYS.map((holder) => holderColumn(holder, state.holderLabels, groups)).join('')}
      </div>
      <div class="ana-line ana-line--total"><span>possession</span><strong>${formatDA(total)}</strong></div>
    </section>`
}

function generalePossessionDetail() {
  const items = store.getAnalysis().places
  const total = ana.sumAmounts(items)
  return `
    <section class="card ana-panel" aria-label="Possession (détail)">
      <h2 class="ana-panel-title">Possession (détail)</h2>
      ${items
        .map((item) =>
          editRow('place', item, [
            { key: 'label', value: item.label, placeholder: 'moi, banque, maison…', label: 'Libellé' },
            { key: 'amount', value: item.amount, placeholder: 'Montant', label: 'Montant', amount: true },
          ]),
        )
        .join('')}
      <div class="ana-line ana-line--total"><span>total</span><strong>${formatDA(total)}</strong></div>
      <button type="button" class="btn btn--secondary btn--block" data-action="analysis-place-add">
        ${icon('plus', 14)} Ajouter une ligne
      </button>
    </section>`
}

/** Paramètres : les diviseurs gardent leur nom Excel (« recette/3 »). */
function generaleSettings() {
  const { settings } = store.getAnalysis()
  const field = (key, label, hint) => `
    <div class="field">
      <label for="ana-set-${key}">${esc(label)}</label>
      <input class="input ana-amount" id="ana-set-${key}" type="text" inputmode="decimal" autocomplete="off"
             data-setting="${key}" value="${escAttr(settings[key])}"${hint ? ` aria-describedby="ana-hint-${key}"` : ''}>
      ${hint ? `<span class="field-hint" id="ana-hint-${key}">${esc(hint)}</span>` : ''}
    </div>`
  return `
    <details class="card ana-panel ana-settings" data-role="ana-settings" ${settingsOpen ? 'open' : ''}>
      <summary>Paramètres de l'analyse</summary>
      <div class="u-stack ana-settings-body">
        ${field('divisorA', `recette/${settings.divisorA}`, 'Nom Excel du premier diviseur — modifiez-le, le libellé suit.')}
        ${field('divisorB', `recette/${settings.divisorB}`, 'Nom Excel du second diviseur — modifiez-le, le libellé suit.')}
        ${field('deduction', 'Déduction', 'Retranchée des deux bénéfices.')}
        ${field('openingRevenue', 'Report période antérieure (recettes)')}
        ${field('openingPurchases', 'Report période antérieure (achats)')}
      </div>
    </details>`
}

/* Sommaire : chaque section devient une carte, un appui y conduit —
   les deux autres onglets y figurent aussi, pour tout joindre d'un seul
   endroit. */
function generaleSections(s) {
  const state = store.getAnalysis()
  const cards = [
    { tab: 'recettes', icon: 'calendar', label: 'Fiche du mois', hint: monthTitle(monthKey) },
    { tab: 'comparaison', icon: 'sort', label: 'Comparaison', hint: 'les deux années côte à côte' },
    { target: 'ana-sec-synthese', icon: 'sparkles', label: 'Synthèse', hint: 'les 12 cartes du classeur' },
    { target: 'ana-sec-recettes', icon: 'euro', label: 'Recettes', hint: formatDA(s.totalRecettes) },
    { target: 'ana-sec-invest', icon: 'chart', label: 'Investissements', hint: formatDA(s.totalInvestissements) },
    { target: 'ana-sec-achats', icon: 'bag', label: 'Achats', hint: formatDA(s.totalAchats) },
    { target: 'ana-sec-possession', icon: 'shield', label: 'Possession', hint: formatDA(s.possession) },
    { target: 'ana-sec-detail', icon: 'list', label: 'Détail', hint: `${state.places.length} ligne(s)` },
    { target: 'ana-sec-params', icon: 'settings', label: 'Paramètres', hint: 'diviseurs, déduction, reports' },
  ]
  return `
    <nav class="ana-sections" aria-label="Aller à une section">
      ${cards
        .map(
          (card) => `
        <button type="button" class="ana-section-card" data-action="analysis-goto"
                ${card.target ? `data-target="${card.target}"` : ''}
                ${card.tab ? `data-tab="${card.tab}"` : ''}>
          <span class="ana-section-icon">${icon(card.icon, 18)}</span>
          <span class="ana-section-copy">
            <strong>${esc(card.label)}</strong>
            <small>${esc(card.hint)}</small>
          </span>
          <span class="ana-section-go" aria-hidden="true">${icon('chevronRight', 16)}</span>
        </button>`,
        )
        .join('')}
    </nav>`
}

function generaleHtml() {
  const s = ana.synthesis(store.getAnalysis(), currentFy())
  return `
    ${generaleSections(s)}
    <div class="ana-sec" id="ana-sec-synthese">${generaleSynthese(s)}</div>
    <div class="ana-sec" id="ana-sec-recettes">${generaleRecettes(s)}</div>
    <div class="ana-sec" id="ana-sec-invest">${generaleInvestissements(s)}</div>
    <div class="ana-sec" id="ana-sec-achats">${generaleAchats(s)}</div>
    <div class="ana-sec" id="ana-sec-possession">${generalePossession()}</div>
    <div class="ana-sec" id="ana-sec-detail">${generalePossessionDetail()}</div>
    <div class="ana-sec" id="ana-sec-params">${generaleSettings()}</div>`
}

/* ------------------------------------------------------------------ */
/* Rendu                                                                */
/* ------------------------------------------------------------------ */

function bodyHtml() {
  if (tab === 'comparaison') return comparaisonHtml()
  if (tab === 'generale') return generaleHtml()
  return recettesHtml()
}

function paint() {
  if (!host) return
  host.innerHTML = `
    <section class="view view--analysis">
      ${header()}
      ${fyBar()}
      <div class="ana-chrome" data-role="ana-chrome">${tabsHtml()}</div>
      <div class="ana-body" data-role="ana-body">${bodyHtml()}</div>
    </section>`
  bindBody()
}

/* ------------------------------------------------------------------ */
/* Liaisons : tout s'enregistre à la perte de focus, sans bouton        */
/* ------------------------------------------------------------------ */

/** Saisie illisible → on restaure la valeur enregistrée (aucune perte). */
function readAmount(input) {
  const raw = String(input.value ?? '').trim()
  if (!raw) return { ok: true, value: null }
  if (!/^-?\d+(?:[.,]\d+)?$/.test(raw.replace(/[\s\u202f\u00a0]/g, ''))) return { ok: false }
  return { ok: true, value: toNumber(raw) }
}

function remember(input) {
  input.dataset.previous = input.value
  input.addEventListener('focus', () => {
    input.dataset.previous = input.value
  })
}

function saveDay(event) {
  const input = event.currentTarget
  const read = readAmount(input)
  if (!read.ok) {
    input.value = input.dataset.previous ?? ''
    return
  }
  store.setSaleAmount(input.dataset.date, read.value === null ? '' : read.value)
}

function saveEdit(event) {
  const input = event.currentTarget
  const row = input.closest('[data-ana-col]')
  if (!row) return
  const field = input.dataset.field
  let value = input.value
  if (input.classList.contains('ana-amount')) {
    const read = readAmount(input)
    if (!read.ok) {
      input.value = input.dataset.previous ?? ''
      return
    }
    value = read.value
  }
  const patch = { [field]: value }
  const col = row.dataset.anaCol
  if (col === 'investment') store.updateInvestment(row.dataset.id, patch)
  else if (col === 'purchase') store.updatePurchase(row.dataset.id, patch)
  else if (col === 'holding') store.updateHolding(row.dataset.id, patch)
  else if (col === 'place') store.updatePlace(row.dataset.id, patch)
}

function saveSetting(event) {
  const input = event.currentTarget
  const read = readAmount(input)
  if (!read.ok) {
    input.value = input.dataset.previous ?? ''
    return
  }
  const key = input.dataset.setting
  /* Un diviseur nul casserait toutes les formules : plancher à 1. */
  const isDivisor = key === 'divisorA' || key === 'divisorB'
  const value = isDivisor ? Math.max(1, Math.round(read.value ?? 1)) : read.value ?? 0
  store.setAnalysisSettings({ [key]: value })
}

function bindBody() {
  host.querySelectorAll('.ana-day-input').forEach((input) => {
    remember(input)
    input.addEventListener('change', saveDay)
    input.addEventListener('blur', saveDay)
  })
  host.querySelectorAll('[data-ana-col] input[data-field]').forEach((input) => {
    remember(input)
    input.addEventListener('change', saveEdit)
    input.addEventListener('blur', saveEdit)
  })
  host.querySelectorAll('[data-setting]').forEach((input) => {
    remember(input)
    input.addEventListener('change', saveSetting)
    input.addEventListener('blur', saveSetting)
  })
  host.querySelectorAll('[data-holder-input]').forEach((input) => {
    remember(input)
    const save = () => store.setHolderLabel(input.dataset.holderInput, input.value)
    input.addEventListener('change', save)
    input.addEventListener('blur', save)
  })
  const filter = host.querySelector('[data-role="ana-cmp-select"]')
  filter?.addEventListener('change', (event) => {
    cmpMonthKey = clampToMonth(event.target.value)
    refresh()
  })
  const picker = host.querySelector('[data-role="ana-month-select"]')
  picker?.addEventListener('change', (event) => {
    monthKey = clampToMonth(event.target.value)
    refresh()
  })
  const panel = host.querySelector('[data-role="ana-settings"]')
  panel?.addEventListener('toggle', () => {
    settingsOpen = panel.open
  })
}

function refresh() {
  if (!host) return
  if (!host.querySelector('section.view')) {
    paint()
    return
  }
  /* Une saisie en cours n'est jamais cassée par un redessin. */
  if (deferWhileEditing(host, refresh)) return
  paint()
}

/** Défilement doux, avec retries : un redessin différé (saisie en cours)
 *  peut faire exister la section quelques frames plus tard. */
function scrollWhenReady(id, attempt = 0) {
  const section = host?.querySelector(`#${id}`)
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  if (attempt < 20) setTimeout(() => scrollWhenReady(id, attempt + 1), 60)
}

export const analysisView = {
  id: 'analysis',
  route: 'analyse',
  label: 'Analyse',
  icon: 'analysis',
  mount(element) {
    host = element
    tab = 'recettes'
    fyStart = ana.fiscalYear().startYear
    monthKey = defaultMonthKey()
    cmpMonthKey = monthKey
    settingsOpen = false
    paint()
  },
  update() {
    refresh()
  },
  resetFilters() {
    tab = 'recettes'
    fyStart = ana.fiscalYear().startYear
    monthKey = defaultMonthKey()
    cmpMonthKey = monthKey
  },
  setTab(value) {
    tab = TABS.some((item) => item.value === value) ? value : 'recettes'
    refresh()
  },
  shiftFy(delta) {
    fyStart = ana.shiftFiscalYear(currentFy(), delta).startYear
    monthKey = clampToMonth(monthKey)
    cmpMonthKey = clampToMonth(cmpMonthKey, { fromCompare: true })
    refresh()
  },
  shiftMonth(delta) {
    const months = fyMonths()
    const index = monthIndex(monthKey) + delta
    if (index < 0 || index >= months.length) return
    monthKey = months[index].key
    refresh()
  },
  /** Revenir à la fiche du jour, dans l'exercice en cours. */
  goToday() {
    fyStart = ana.fiscalYear().startYear
    monthKey = defaultMonthKey()
    tab = 'recettes'
    refresh()
  },
  /** Carte du sommaire : ouvre l'onglet cible puis conduit à la section. */
  gotoSection(id, targetTab) {
    if (!host) return
    if (targetTab && targetTab !== tab && TABS.some((item) => item.value === targetTab)) {
      tab = targetTab
      refresh()
    }
    if (!id) return
    if (id === 'ana-sec-params') {
      settingsOpen = true
      const panel = host.querySelector('[data-role="ana-settings"]')
      if (panel) panel.open = true
    }
    scrollWhenReady(id)
  },
}






