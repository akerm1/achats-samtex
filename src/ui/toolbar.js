/* ------------------------------------------------------------------ */
/* Barre « Tri & présentation » — un seul dessin pour toutes les vues   */
/*                                                                     */
/* Chaque écran choisit ses tris et ses présentations ; la barre, elle, */
/* reste la même : un libellé, un select et des boutons d'icône.       */
/* ------------------------------------------------------------------ */

import { esc } from '../core/utils.js'
import { icon } from './icons.js'

/** Présentation « cartes » (grille) et « liste » (une colonne). */
export const LAYOUT_GRID = { value: 'cards', label: 'Grille', icon: 'grid' }
export const LAYOUT_LIST = { value: 'list', label: 'Liste', icon: 'list' }

export const CARD_LIST_LAYOUTS = [LAYOUT_LIST, LAYOUT_GRID]

/**
 * @param {object} options
 * @param {string} options.id identifiant du select (unique par écran)
 * @param {string} options.prefix préfixe d'action : `${prefix}-sort`, `${prefix}-layout`
 * @param {string} options.sort valeur de tri courante
 * @param {Array<{value:string,label:string}>} options.sortOptions
 * @param {string} options.layout présentation courante
 * @param {Array<{value:string,label:string,icon:string}>} options.layouts
 * @param {boolean} options.dateFilter afficher le filtre de date
 * @param {string} options.startDate date de début
 * @param {string} options.endDate date de fin
 */
export function toolbarHtml({ id, prefix, sort, sortOptions, layout, layouts, dateFilter = false, startDate = '', endDate = '' }) {
  const dateHtml = dateFilter
    ? `
      <div class="date-filter" role="region" aria-label="Filtre par date">
        <label class="sr-only" for="${esc(id)}-start">Date de début</label>
        <input type="date" id="${esc(id)}-start" class="select list-date" data-action="${esc(prefix)}-start-date" value="${startDate || ''}">
        <label class="sr-only" for="${esc(id)}-end">Date de fin</label>
        <input type="date" id="${esc(id)}-end" class="select list-date" data-action="${esc(prefix)}-end-date" value="${endDate || ''}">
      </div>`
    : ''

  return `
    <div class="list-toolbar" data-role="toolbar">
      <span class="list-toolbar-label">Tri &amp; présentation</span>
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
 * @param {{onSort?: (value:string)=>void, onLayout?: (value:string)=>void, onStartDate?: (value:string)=>void, onEndDate?: (value:string)=>void}} handlers
 */
export function bindToolbar(root, prefix, { onSort, onLayout, onStartDate, onEndDate } = {}) {
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
  // Handle date filtering
  root?.querySelector(`[data-action="${prefix}-start-date"]`)?.addEventListener('change', (event) => {
    onStartDate?.(event.target.value)
  })
  root?.querySelector(`[data-action="${prefix}-end-date"]`)?.addEventListener('change', (event) => {
    onEndDate?.(event.target.value)
  })
}