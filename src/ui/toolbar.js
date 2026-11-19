/* ------------------------------------------------------------------ */
/* Barre « Tri & présentation » — un seul dessin pour toutes les vues   */
/*                                                                     */
/* Chaque écran choisit ses tris et ses présentations ; la barre, elle, */
/* reste la même : un libellé, un select et des boutons d'icône.       */
/* Maintenant prise en charge : mode comparaison de dates.             */
/* ------------------------------------------------------------------ */

import { esc, dayKey, periodLabel } from '../core/utils.js'
import { icon } from './icons.js'

export const LAYOUT_GRID = { value: 'cards', label: 'Grille', icon: 'grid' }
export const LAYOUT_LIST = { value: 'list', label: 'Liste', icon: 'list' }

export const CARD_LIST_LAYOUTS = [LAYOUT_LIST, LAYOUT_GRID]

/**
 * @param {object} options
 * @param {string} options.id identifiant du select (unique par écran)
 * @param {string} options.prefix préfixe d'action : `${prefix}-sort`, `${prefix}-layout`, `${prefix}-compare-*`
 * @param {string} options.sort valeur de tri courante
 * @param {Array<{value:string,label:string}>} options.sortOptions
 * @param {string} options.layout présentation courante
 * @param {Array<{value:string,label:string,icon:string}>} options.layouts
 * @param {boolean} options.dateFilter afficher le filtre de date
 * @param {string} options.startDate date de début
 * @param {string} options.endDate date de fin
 * @param {boolean} options.compareMode mode comparaison actif
 * @param {string} options.compareUnit période comparée : « day », « week » ou « month »
 * @param {Array<{unit:string,date:string}>} options.comparePeriods périodes ajoutées
 * @param {Array<{value:string,label:string}>} options.compareUnits périodes proposées
 */
export function toolbarHtml({
  id,
  prefix,
  sort,
  sortOptions,
  layout,
  layouts,
  dateFilter = false,
  startDate = '',
  endDate = '',
  compareMode = false,
  compareUnit = 'day',
  comparePeriods = [],
  compareUnits = [],
}) {
  /* HTML du filtre de date */
  const dateHtml = dateFilter
    ? `
      <div class="date-filter-row" role="region" aria-label="Filtre par date">
        <div class="date-filter-col">
          <label for="${esc(id)}-start">Du</label>
          <input type="date" id="${esc(id)}-start" class="date-input" data-action="${esc(prefix)}-start-date" value="${startDate || ''}" autocomplete="off">
        </div>
        <span class="date-filter-separator">à</span>
        <div class="date-filter-col">
          <label for="${esc(id)}-end">Au</label>
          <input type="date" id="${esc(id)}-end" class="date-input" data-action="${esc(prefix)}-end-date" value="${endDate || ''}" autocomplete="off">
        </div>
      </div>`
    : ''

  /* HTML du mode comparaison — jour, semaine ou mois */
  const compareHtml = compareUnits.length > 0
    ? `
      <div class="compare-block ${compareMode ? 'is-open' : ''}">
        <button type="button" class="compare-toggle ${compareMode ? 'is-active' : ''}"
                data-action="${prefix}-compare-mode"
                aria-pressed="${compareMode ? 'true' : 'false'}">
          ${icon('chart', 16)} Comparer
        </button>
        ${compareMode
          ? `<div class="compare-panel">
              <div class="compare-builder">
                <div class="compare-units" role="group" aria-label="Comparer par période">
                  ${compareUnits.map((unit) => `
                    <button type="button" class="${compareUnit === unit.value ? 'is-active' : ''}"
                            data-action="${prefix}-compare-unit" data-value="${esc(unit.value)}"
                            aria-pressed="${compareUnit === unit.value ? 'true' : 'false'}">${esc(unit.label)}</button>`).join('')}
                </div>
                <div class="compare-pick">
                  <input type="date" class="date-input" data-action="${prefix}-compare-date"
                         value="${dayKey(new Date())}" aria-label="Date à comparer">
                  <button type="button" class="btn btn--primary btn--sm" data-action="${prefix}-compare-add">${icon('plus', 14)} Ajouter</button>
                </div>
              </div>
              ${comparePeriods.length
                ? `<div class="compare-chips">
                    ${comparePeriods.map((period, index) => `
                      <span class="compare-chip">
                        ${esc(periodLabel(period.unit, period.date))}
                        <button type="button" class="compare-chip-x" data-action="${prefix}-compare-remove"
                                data-index="${index}" aria-label="Retirer ${esc(periodLabel(period.unit, period.date))}">${icon('x', 11)}</button>
                      </span>`).join('')}
                  </div>`
                : `<p class="compare-hint">Choisissez une date, puis <strong>Ajouter</strong> — le jour, la semaine ou le mois.</p>`}
            </div>`
          : ''}
      </div>`
    : ''

  /* HTML du filtre de recherche */
  const searchHtml = false
    ? `
      <div class="search-filter-row" role="search">
        <input type="search" id="${esc(id)}-search" class="text-input search-input" placeholder="Rechercher" value="${esc(query)}" data-action="${esc(prefix)}-search">
        <button type="button" class="btn icon-btn" data-action="${esc(prefix)}-clear-search" aria-label="Effacer la recherche" title="Effacer">${icon('searchX', 16)}</button>
      </div>`
    : ''

  return `
    <div class="list-toolbar" data-role="toolbar">
      <span class="list-toolbar-label">Tri & présentation</span>
      <label class="sr-only" for="${esc(id)}">Trier</label>
      <select id="${esc(id)}" class="select list-sort" data-action="${esc(prefix)}-sort">
        ${sortOptions
          .map(
            (option) =>
              `<option value="${esc(option.value)}" ${option.value === sort ? 'selected' : ''}>${esc(option.label)}</option>`,
          )
          .join('')}
      </select>
      <div class="layout-switch" role="group" aria-label="Présentation">
        ${layouts
          .map(
            (choice) => `
          <button type="button" class="${layout === choice.value ? 'is-active' : ''}"
                  data-action="${esc(prefix)}-layout" data-value="${esc(choice.value)}"
                  aria-pressed="${layout === choice.value ? 'true' : 'false'}"
                  aria-label="${esc(choice.label)}" title="${esc(choice.label)}">
            ${icon(choice.icon, 15)}
          </button>`,
          )
          .join('')}
      </div>
      ${dateHtml}
      ${compareHtml}
      ${searchHtml}
    </div>`
}

/**
 * Branche une barre « Tri & présentation ».
 *
 * Le select perd le focus avant le redessin : sinon `deferWhileEditing`
 * attendrait la fin de la saisie et le changement resterait sans effet.
 *
 * @param {HTMLElement|null} root conteneur de la barre
 * @param {string} prefix préfixe d'action de la barre
 * @param {{onSort?: (value:string)=>void, onLayout?: (value:string)=>void, onStartDateChange?: (string)=>void, onEndDateChange?: (string)=>void, onCompareModeChange?: (boolean)=>void, onCompareUnitChange?: (string)=>void, onComparePeriodAdd?: (string)=>void, onComparePeriodRemove?: (number)=>void, onSearch?: (string)=>void, onClearSearch?: ()=>void}} handlers
 */
export function bindToolbar(root, prefix, { onSort, onLayout, onStartDateChange, onEndDateChange, onCompareModeChange, onCompareUnitChange, onComparePeriodAdd, onComparePeriodRemove, onSearch, onClearSearch }) {
  const select = root?.querySelector(`[data-action="${prefix}-sort"]`)
  select?.addEventListener('change', () => {
    const value = select.value
    select.blur()
    onSort?.(value)
  })
  root?.querySelectorAll(`[data-action="${prefix}-layout"]`).forEach((button) => {
    button.addEventListener('click', () => {
      button.blur()
      onLayout?.(button.dataset.value)
    })
  })
  // Handle date filtering inputs
  root?.querySelector(`[data-action="${prefix}-start-date"]`)?.addEventListener('change', (event) => {
    onStartDateChange?.(event.target.value)
  })
  root?.querySelector(`[data-action="${prefix}-end-date"]`)?.addEventListener('change', (event) => {
    onEndDateChange?.(event.target.value)
  })
  /* Mode comparaison : bascule, choix de la période, ajout et retrait. */
  root?.querySelector(`[data-action="${prefix}-compare-mode"]`)?.addEventListener('click', (event) => {
    const button = event.currentTarget
    button.blur()
    onCompareModeChange?.(!button.classList.contains('is-active'))
  })
  root?.querySelectorAll(`[data-action="${prefix}-compare-unit"]`).forEach((button) => {
    button.addEventListener('click', () => {
      button.blur()
      onCompareUnitChange?.(button.dataset.value)
    })
  })
  const compareDateInput = root?.querySelector(`[data-action="${prefix}-compare-date"]`)
  const addComparePeriod = () => {
    const date = compareDateInput?.value
    if (!date) return
    onComparePeriodAdd?.(date)
    if (compareDateInput) compareDateInput.value = ''
  }
  root?.querySelector(`[data-action="${prefix}-compare-add"]`)?.addEventListener('click', addComparePeriod)
  compareDateInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    addComparePeriod()
  })
  root?.querySelectorAll(`[data-action="${prefix}-compare-remove"]`).forEach((button) => {
    button.addEventListener('click', () => {
      button.blur()
      onComparePeriodRemove?.(Number(button.dataset.index))
    })
  })
  // Handle search input
  const searchInput = root?.querySelector(`[data-action="${prefix}-search"]`)
  searchInput?.addEventListener('input', (event) => {
    onSearch?.(event.target.value)
  })
  root?.querySelector(`[data-action="${prefix}-clear-search"]`)?.addEventListener('click', () => {
    if (searchInput) searchInput.value = ''
    onClearSearch?.()
  })
}