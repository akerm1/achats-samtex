/* ------------------------------------------------------------------ */
/* Vue Factures (Bills) — tickets et factures fournisseurs            */
/* ------------------------------------------------------------------ */

import { esc, formatMoney } from '../../core/utils.js'
import { icon } from '../icons.js'
import { BILL_STATUS, filterBills, sortBills, sumBills } from '../../data/model.js'
import { PROVIDER_WORKER } from '../../data/sync.js'
import { getBills, getState, isLoaded } from '../../data/store.js'
import { deferWhileEditing, loadingBlock } from '../view.js'

let host = null
let query = ''

const STATUS_TABS = [
  { value: 'all', label: 'Toutes' },
  { value: BILL_STATUS.PENDING, label: 'En attente' },
  { value: BILL_STATUS.PAID, label: 'Payées' },
]

let statusFilter = 'all'

function counts() {
  const bills = getBills()
  return {
    all: bills.length,
    pending: bills.filter((bill) => bill.status === BILL_STATUS.PENDING).length,
    paid: bills.filter((bill) => bill.status === BILL_STATUS.PAID).length,
  }
}

/**
 * Les factures ne voyagent que par le lien privé : `products.json` ne les
 * porte pas. Sans cette ligne, quelqu'un peut ajouter un ticket, changer
 * d'appareil, et croire à une perte de données. Une phrase vaut mieux.
 */
function syncNote() {
  const { provider } = getState()
  if (provider === PROVIDER_WORKER) return ''
  return `<p class="list-head-note">${icon('cloud', 12)} Les factures ne sont synchronisées qu'avec le lien privé Cloudflare — ici, elles restent sur cet appareil.</p>`
}

function header() {
  const sorted = sortBills(filterBills(getBills(), { status: statusFilter, query }), 'recent')
  const totals = sumBills(sorted)
  const count = sorted.length

  return `
    <header class="list-head">
      <div class="list-head-copy">
        <h1>Factures</h1>
        <p class="list-head-sub">
          <strong>${count}</strong> facture${count > 1 ? 's' : ''}
          ${totals.total ? ` · <span class="list-head-total">${formatMoney(totals.total)}</span>` : ''}
        </p>
        ${syncNote()}
      </div>
    </header>`
}

function statusTabsHtml() {
  const total = counts()
  return STATUS_TABS.map(
    (tab) => `
      <button type="button" class="tabchip ${statusFilter === tab.value ? 'is-active' : ''}" role="tab"
              data-action="set-bill-status" data-value="${tab.value}"
              aria-selected="${statusFilter === tab.value ? 'true' : 'false'}">
        ${esc(tab.label)}<span class="tabchip-count">${total[tab.value]}</span>
      </button>`,
  ).join('')
}

function filterbar() {
  return `
    <div class="filterbar" data-role="filterbar">
      <div class="filterbar-search">
        <label class="input-wrap" for="bills-search">
          ${icon('search', 16)}
          <input id="bills-search" type="search" autocomplete="off" enterkeyhint="search"
                 placeholder="Rechercher un fournisseur, une note…"
                 value="${esc(query)}" aria-label="Rechercher dans les factures">
        </label>
        <!-- Hors du <label> : un bouton dans un label se déclencherait au
             focus de l'input, ce qui ferait boucler effacer puis refocuser. -->
        <button type="button" class="filterbar-clear" data-action="clear-bills-search"
                aria-label="Effacer la recherche" title="Effacer" ${query ? '' : 'hidden'}>
          ${icon('x', 16)}
        </button>
      </div>
      <div class="filterbar-tabs" data-role="bill-status-tabs" role="tablist" aria-label="Statut">
        ${statusTabsHtml()}
      </div>
    </div>`
}

function results() {
  const sorted = sortBills(filterBills(getBills(), { status: statusFilter, query }), 'recent')
  if (!sorted.length) return emptyState()

  return `
    <section class="group">
      <div class="grid grid--card">${sorted.map((bill) => renderBillCard(bill)).join('')}</div>
    </section>`
}

function emptyState() {
  const needle = query.trim()
  let title = 'Aucune facture'
  let message = 'Ajoutez votre première facture : une photo du ticket, le fournisseur et le montant.'
  if (needle) {
    title = 'Aucun résultat'
    message = `Aucune facture ne correspond à « ${esc(needle)} ».`
  } else if (statusFilter === BILL_STATUS.PENDING) {
    title = 'Aucune facture en attente'
    message = 'Les factures non payées apparaîtront ici.'
  } else if (statusFilter === BILL_STATUS.PAID) {
    title = 'Aucune facture payée'
    message = 'Les factures marquées payées apparaîtront ici.'
  }

  const { isConfigured, message: syncMessage, messageKind } = getState()
  const syncFailed = isConfigured && messageKind === 'error'
  /* Une connexion en échec rendrait « synchronisée automatiquement » faux :
     on montre alors la cause et le chemin de réparation. */
  if (syncFailed && !needle) message = syncMessage
  const intro = syncFailed
    ? `
      <div class="setup-card setup-card--error" data-role="setup">
        <span class="setup-mark">${icon('alert', 18)}</span>
        <div class="setup-copy">
          <strong>La liste GitHub n'est pas à jour</strong>
          <p>${esc(syncMessage)}</p>
        </div>
        <button type="button" class="btn btn--primary btn--sm" data-action="go-settings">${icon('sliders', 13)} Corriger la connexion</button>
      </div>`
    : ''

  return `
    ${intro}
    <div class="empty">
      <span class="empty-mark">${icon(needle ? 'searchX' : 'imagePlus', 30)}</span>
      <div class="empty-copy">
        <strong>${title}</strong>
        <p>${message}</p>
      </div>
      ${
        needle
          ? '<button type="button" class="btn btn--secondary" data-action="reset-bill-filters">Réinitialiser les filtres</button>'
          : `<button type="button" class="btn btn--primary btn--lg" data-action="open-bill-form">${icon('plus', 16)} Ajouter une facture</button>`
      }
    </div>`
}

function renderBillCard(bill) {
  const amount = bill.hasAmount ? formatMoney(bill.amount) : '—'

  return `
    <article class="card ${bill.isPaid ? 'card--bought' : ''}" data-id="${esc(bill.id)}">
      <div class="card-media">
        ${
          bill.photo
            ? `<img src="${esc(bill.photo)}" alt="" loading="lazy" data-action="preview-bill-photo" data-id="${esc(bill.id)}">`
            : '<div class="card-color is-empty" aria-hidden="true"></div>'
        }
      </div>
      <div class="card-body">
        <div class="card-top">
          <h4 class="card-name">${esc(bill.supplier)}</h4>
          <span class="card-amount ${bill.isPaid ? 'is-paid' : ''}">${esc(amount)}</span>
        </div>
        ${bill.note ? `<p class="card-note">${icon('messageSquare', 12)} ${esc(bill.note)}</p>` : ''}
        <div class="card-actions">
          ${
            bill.isPaid
              ? `<span class="badge badge--teal">${icon('check', 10)} Payée</span>`
              : `<button type="button" class="btn btn--ghost btn--sm" data-action="toggle-paid" data-id="${esc(bill.id)}">${icon('check', 13)} Payée</button>`
          }
          ${
            bill.photo
              ? `<button type="button" class="icon-btn icon-btn--plain" data-action="preview-bill-photo" data-id="${esc(bill.id)}" aria-label="Voir la facture" title="Voir la facture">${icon('image', 14)}</button>`
              : ''
          }
          <button type="button" class="icon-btn icon-btn--plain" data-action="edit-bill" data-id="${esc(bill.id)}" aria-label="Modifier la facture" title="Modifier">${icon('edit', 14)}</button>
          <button type="button" class="icon-btn icon-btn--plain" data-action="delete-bill" data-id="${esc(bill.id)}" aria-label="Supprimer la facture" title="Supprimer">${icon('trash', 14)}</button>
        </div>
      </div>
    </article>`
}

function paint() {
  host.innerHTML = `
    <section class="view view--list">
      ${header()}
      ${filterbar()}
      <div class="list-results" data-role="results">${results()}</div>
    </section>`
  bindSearch()
}

/** La recherche a son propre cycle de vie : elle ne se repeint qu'elle-même. */
function bindSearch() {
  const input = host.querySelector('#bills-search')
  input?.addEventListener('input', (event) => {
    query = event.target.value
    const clear = host.querySelector('[data-action="clear-bills-search"]')
    if (clear) clear.hidden = !query
    refreshResults()
  })
}

function refreshResults() {
  const region = host?.querySelector('[data-role="results"]')
  if (region) region.innerHTML = results()
  const tabs = host?.querySelector('[data-role="bill-status-tabs"]')
  if (tabs) tabs.innerHTML = statusTabsHtml()
  refreshHeader()
}

function refreshHeader() {
  const head = host?.querySelector('.list-head')
  if (head) head.outerHTML = header()
}

function refresh() {
  if (!host) return
  if (!host.querySelector('section.view')) {
    paint()
    return
  }
  /* Une saisie en cours n'est jamais cassée par un redessin. */
  if (deferWhileEditing(host, refresh)) return
  host.querySelector('.list-head')?.remove()
  host.querySelector('.filterbar')?.remove()
  host.querySelector('section.view')?.insertAdjacentHTML('afterbegin', `${header()}${filterbar()}`)
  bindSearch()
  refreshResults()
}

export const billsView = {
  id: 'bills',
  route: 'factures',
  label: 'Factures',
  icon: 'imagePlus',
  mount(element) {
    host = element
    query = ''
    statusFilter = 'all'
    if (!isLoaded()) {
      host.innerHTML = loadingBlock()
      return
    }
    paint()
  },
  update() {
    refresh()
  },
  resetFilters() {
    query = ''
    statusFilter = 'all'
  },
  clearSearch() {
    query = ''
    const field = host?.querySelector('#bills-search')
    if (field) field.value = ''
    const clear = host?.querySelector('[data-action="clear-bills-search"]')
    if (clear) clear.hidden = true
    refreshResults()
  },
  focusSearch() {
    host?.querySelector('#bills-search')?.focus()
  },
  setStatus(value) {
    statusFilter = STATUS_TABS.some((tab) => tab.value === value) ? value : 'all'
    refresh()
  },
}