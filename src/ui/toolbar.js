/* ------------------------------------------------------------------ */
/* Barre « Tri & présentation » — un seul dessin pour toutes les vues   */
/*                                                                     */
/* Chaque écran choisit ses tris et ses présentations ; la barre, elle, */
/* reste la même : un libellé, un select et des boutons d'icône.       */
/* Maintenant prise en charge : mode comparaison de dates.             */
/* ------------------------------------------------------------------ */

/import { esc } from '../core/utils.js'
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
 * @param {Array<string>} options.compareDates dates sélectionnées en AAAA-MM-JJ
 * @param {Array<{value:string,label:string}>} options.compareModes modes de comparaison disponibles
 * @param {function} options.onCompareModeChange appelé quand le mode de comparaison change
 * @param {function} options.onCompareDateAdd appelé quand une date est ajoutée à la comparaison
 * @param {function} options.onCompareDateRemove appelé quand une date est retirée de la comparaison
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
  compareDates = [],
  compareModes = [],
  onCompareModeChange,
  onCompareDateAdd,
  onCompareDateRemove,
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

  /* HTML du mode comparaison */
  const compareHtml = compareModes && compareModes.length > 0
    ? `
      <div class="compare-toggle-row" role="region" aria-label="Mode comparaison">
        <button type="button" class="${compareMode ? 'is-active' : ''}"
                data-action="${prefix}-compare-mode"
                aria-pressed="${compareMode ? 'true' : 'false'}"
                aria-label="${compareMode ? 'Mode comparaison actif' : 'Mode comparaison'}">
          ${icon(compareMode ? 'check' : 'plus', 18)}
          ${compareMode ? ' Comparaison' : ' Comparer'}
        </button>
        ${compareMode
          ? `
            <div class="compare-dates-row">
              <span>Dates :</span>
              ${compareDates.map((d, i) => `
                <span class="compare-date" data-index="${i}" data-action="${prefix}-compare-date-remove" title="Retirer">${dayLabel(d)}</span>
              `).join(' ')}
              <span class="compare-date-add">
                <input type="date" class="compare-date-input" data-action="${prefix}-compare-date-add">
                <button type="button" class="btn btn--plain btn--tiny" data-action="${prefix}-compare-date-add-submit">${icon('check', 14)}</button>
              </span>
            </div>`
          : ''}
        <span class="compare-dates-total text-primary">${compareDates.length} ${compareDates.length === 1 ? 'date' : 'dates'}</span>
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
 * @param {{onSort?: (value:string)=>void, onLayout?: (value:string)=>void, onStartDateChange?: (string)=>void, onEndDateChange?: (string)=>void, onCompareModeChange?: (boolean)=>void, onCompareDateAdd?: (string)=>void, onCompareDateRemove?: (string)=>void, onSearch?: (string)=>void, onClearSearch?: ()=>void}} handlers
 */
export function bindToolbar(root, prefix, { onSort, onLayout, onStartDateChange, onEndDateChange, onCompareModeChange, onCompareDateAdd, onCompareDateRemove, onSearch, onClearSearch }) {
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
  // Handle compare mode toggle
  root?.querySelector(`[data-action="${prefix}-compare-mode"]`)?.addEventListener('click', (event) => {
    event.target.blur()
    const newMode = !event.target.classList.contains('is-active')
    event.target.classList.toggle('is-active', newMode)
    onCompareModeChange?.(newMode)
  })
  // Handle compare date add input
  const compareDateInput = root?.querySelector(`[data-action="${prefix}-compare-date-add"]`)
  if (compareDateInput) {
    compareDateInput.addEventListener('change', (event) => {
      const date = event.target.value
      if (date && onCompareDateAdd) {
        onCompareDateAdd(date)
        compareDateInput.value = ''
      }
    })
    // Also handle enter key
    compareDateInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.target.blur()
        if (onCompareDateAdd) {
          onCompareDateAdd(compareDateInput.value)
          compareDateInput.value = ''
        }
      }
    })
  }
  // Handle compare date remove buttons
  root?.querySelectorAll(`[data-action="${prefix}-compare-date-remove"]`).forEach((button) => {
    button.addEventListener('click', (event) => {
      event.target.blur()
      const index = parseInt(button.dataset.index, 10)
      if (onCompareDateRemove) {
        onCompareDateRemove(compareDates[index])
      }
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