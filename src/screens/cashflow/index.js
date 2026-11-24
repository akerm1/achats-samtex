/* ------------------------------------------------------------------ */
/* Écran Caisse — suivi des flux d'argent entre personnes                */
/*                                                                      */
/* Affiche le cash disponible (recettes + investissements - dépenses - factures) */
/* et les soldes de chaque personne. Permet les transferts et l'ajout    */
/* de nouvelles personnes.                                               */
/* ------------------------------------------------------------------ */

import { esc, formatMoney, toNumber } from '../../core/utils.js'
import { icon } from '../../ui/icons.js'
import { CARD_LIST_LAYOUTS, toolbarHtml } from '../../ui/toolbar.js'
import { closeDialog, loadingBlock } from '../../ui/dialog.js'
import { toast, confirmAction } from '../../core/feedback.js'
import * as cashflowModel from '../../data/cashflow-model.js'
import * as cashflowStore from '../../data/cashflow-store.js'
import * as expStore from '../../data/expenses-store.js'
import { getBills } from '../../data/store.js'

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

let host = null
let query = ''
let layout = 'cards'
let showTransfers = false

const LAYOUTS = [
  { value: 'cards', label: 'Cartes', icon: 'grid' },
  { value: 'list', label: 'Liste', icon: 'list' },
]

/* ------------------------------------------------------------------ */
/* Header                                                             */
/* ------------------------------------------------------------------ */

function header() {
  const { persons, transfers, settings } = cashflowStore.getCashFlow()
  
  // Calculate cash available
  const expenses = expStore.getExpenses()
  const revenues = expenses.revenues
  const bills = getBills()
  const expenseList = expenses.expenses
  
  const availableCash = cashflowModel.calculateAvailableCash(revenues, bills, expenseList, expenses.investments)
  const personsWithBalances = cashflowModel.calculatePersonBalances(persons, transfers)
  const totalPersonBalances = cashflowModel.totalPersonBalances(personsWithBalances)
  /* Ce qui reste vraiment une fois les soldes des personnes honorés. */
  const remaining = Math.round((availableCash - totalPersonBalances) * 100) / 100
  const remainingClass = remaining >= 0 ? 'text-success' : 'text-danger'
  const totalBalancesClass = totalPersonBalances >= 0 ? 'text-success' : 'text-danger'
  const cashLibreClass = availableCash >= 0 ? 'text-success' : 'text-danger'

  return `
    <header class="screen-head">
      <div class="screen-head-main">
        <span class="screen-eyebrow">Caisse &amp; Flux</span>
        <h1 class="screen-title">Caisse</h1>
        <p class="screen-sub">
          <span class="screen-total ${remainingClass}">
            ${formatMoney(remaining, settings.currency)} reste disponible
          </span>
          · ${formatMoney(availableCash, settings.currency)} de cash libre
          · ${formatMoney(totalPersonBalances, settings.currency)} avec les personnes
        </p>
      </div>
      <div class="screen-stats">
        <div class="stat ${cashLibreClass}">
          <span class="stat-label">Cash libre</span>
          <span class="stat-value">${formatMoney(availableCash, settings.currency)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Soldes personnes</span>
          <span class="stat-value ${totalBalancesClass}">${formatMoney(totalPersonBalances, settings.currency)}</span>
        </div>
        <div class="stat">
          <span class="stat-label ${remainingClass}">Reste disponible</span>
          <span class="stat-value ${remainingClass}">${formatMoney(remaining, settings.currency)}</span>
        </div>
      </div>
    </header>`
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                            */
/* ------------------------------------------------------------------ */

function toolbar() {
  return toolbarHtml({
    id: 'cashflow-sort',
    prefix: 'set-cashflow',
    sort: 'recent',
    sortOptions: [],
    layout,
    layouts: LAYOUTS,
  })
}

/* ------------------------------------------------------------------ */
/* Actions                                                            */
/* ------------------------------------------------------------------ */

function actions() {
  return `
    <div class="section-actions">
      <button type="button" class="btn btn--primary btn--sm" data-action="open-person-form">${icon('user', 14)} Ajouter une personne</button>
      <button type="button" class="btn btn--secondary btn--sm" data-action="open-transfer-form">${icon('send', 14)} Transfert</button>
    </div>`
}

/* ------------------------------------------------------------------ */
/* Persons List                                                       */
/* ------------------------------------------------------------------ */

function renderPersonCard(person, balances, settings) {
  const balance = balances.find(b => b.id === person.id)?.currentBalance || person.balance || 0
  const balanceClass = balance > 0 ? 'text-success' : balance < 0 ? 'text-danger' : 'text-muted'
  
  return `
    <article class="card person-card" data-id="${esc(person.id)}">
      <div class="card-body" data-role="card-body">
        <div class="card-top">
          <h4 class="card-name">${esc(person.name)}</h4>
          <span class="card-amount ${balanceClass}">${formatMoney(balance, settings.currency)}</span>
        </div>
        ${person.note ? `<p class="card-note">${icon('messageSquare', 12)} ${esc(person.note)}</p>` : ''}
        <div class="card-actions">
          <button type="button" class="btn btn--secondary btn--sm" data-action="edit-person-balance" data-id="${esc(person.id)}">${icon('edit', 13)} Modifier solde</button>
          <button type="button" class="icon-btn icon-btn--plain" data-action="delete-person" data-id="${esc(person.id)}" aria-label="Supprimer" title="Supprimer">${icon('trash', 14)}</button>
        </div>
      </div>
    </article>`
}

function renderPersonList(persons, balances, settings) {
  if (!persons.length && !showTransfers) {
    return emptyState()
  }
  
  const gridClass = layout === 'list' ? 'grid grid--list' : 'grid grid--card'
  
  return `
    ${persons.length
      ? `<section class="group">
          <div class="${gridClass}">${persons
            .map(p => renderPersonCard(p, balances, settings))
            .join('')}</div>
        </section>`
      : ''
    }
    ${showTransfers ? renderTransfersSection(balances, settings) : ''}
  `
}

/* ------------------------------------------------------------------ */
/* Transfers Section                                                  */
/* ------------------------------------------------------------------ */

function renderTransfersSection(balances, settings) {
  const { transfers } = cashflowStore.getCashFlow()
  
  if (!transfers.length) {
    return `
      <section class="group">
        <h2 class="group-title">Transferts</h2>
        <div class="empty">
          <span class="empty-mark">${icon('send', 30)}</span>
          <p class="empty-copy">Aucun transfert enregistré.</p>
        </div>
      </section>
    `
  }
  
  const sorted = [...transfers].sort((a, b) => new Date(b.date) - new Date(a.date))
  
  return `
    <section class="group">
      <h2 class="group-title">Transferts</h2>
      ${sorted.map(t => renderTransferItem(t, balances, settings)).join('')}
    </section>
  `
}

function renderTransferItem(transfer, balances, settings) {
  const from = balances.find(b => b.id === transfer.from)
  const to = balances.find(b => b.id === transfer.to)
  
  return `
    <article class="card transfer-card" data-id="${esc(transfer.id)}">
      <div class="card-body">
        <div class="card-top">
          <span class="badge badge--accent">${formatMoney(transfer.amount, settings.currency)}</span>
          <span class="transfer-dater">${esc(transfer.date)}</span>
        </div>
        <div class="transfer-between">
          <span class="transfer-from">${esc(from?.name || transfer.from)}</span>
          ${icon('send', 12)}
          <span class="transfer-to">${esc(to?.name || transfer.to)}</span>
        </div>
        ${transfer.note ? `<p class="card-note">${icon('messageSquare', 12)} ${esc(transfer.note)}</p>` : ''}
        <div class="card-actions">
          <button type="button" class="icon-btn icon-btn--plain" data-action="edit-transfer" data-id="${esc(transfer.id)}" aria-label="Modifier" title="Modifier">${icon('edit', 14)}</button>
          <button type="button" class="icon-btn icon-btn--plain is-danger" data-action="delete-transfer" data-id="${esc(transfer.id)}" aria-label="Supprimer" title="Supprimer">${icon('trash', 14)}</button>
        </div>
      </div>
    </article>
  `
}

/* ------------------------------------------------------------------ */
/* Empty State                                                        */
/* ------------------------------------------------------------------ */

function emptyState() {
  return `
    <div class="empty">
      <span class="empty-mark">${icon('wallet', 30)}</span>
      <div class="empty-copy">
        <strong>Aucune personne</strong>
        <p>Ajoutez des personnes pour suivre les transferts d'argent entre collaborateurs.</p>
      </div>
      <button type="button" class="btn btn--primary btn--lg" data-action="open-person-form">${icon('user', 16)} Ajouter une personne</button>
    </div>
  `
}

/* ------------------------------------------------------------------ */
/* Results                                                            */
/* ------------------------------------------------------------------ */

function results() {
  const { persons, transfers, settings } = cashflowStore.getCashFlow()
  const balances = cashflowModel.calculatePersonBalances(persons, transfers)
  
  // Always show persons, and show transfers section when requested
  return renderPersonList(persons, balances, settings)
}

/* ------------------------------------------------------------------ */
/* Dialog - Person Form                                               */
/* ------------------------------------------------------------------ */

export function openPersonForm(person = null) {
  const { settings } = cashflowStore.getCashFlow()
  const isEdit = Boolean(person)
  const title = isEdit ? 'Modifier la personne' : 'Nouvelle personne'
  
  const initialName = person?.name || ''
  const initialBalance = person?.balance !== undefined ? person.balance : ''
  const initialNote = person?.note || ''
  
  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--form'
  dialog.innerHTML = `
    <form method="dialog" id="person-form">
      <div class="dialog-body u-stack">
        <h2>${icon('user', 18)} ${esc(title)}</h2>
        
        <div class="field">
          <label for="person-name">Nom</label>
          <input id="person-name" type="text" required placeholder="Ex: Moh, Salim, Hakima" 
                 value="${esc(initialName)}">
        </div>
        
        <div class="field">
          <label for="person-balance">Solde initial</label>
          <input id="person-balance" type="number" inputmode="decimal" 
                 placeholder="0" value="${esc(initialBalance)}">
          <p class="field-hint">Solde en ${settings.currency}. Positive = argent reçu, négative = argent envoyé.</p>
        </div>
        
        <div class="field">
          <label for="person-note">Note (facultatif)</label>
          <textarea id="person-note" rows="2" placeholder="Collaborateur, partenaire, etc...">${esc(initialNote)}</textarea>
        </div>
      </div>
      
      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>${icon('x', 13)} Annuler</button>
        <button type="submit" class="btn btn--primary">${icon('save', 13)} ${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>
  `
  
  dialog.addEventListener('close', () => dialog.remove())
  
  const form = dialog.querySelector('#person-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    
    const name = form.querySelector('#person-name').value.trim()
    const balance = toNumber(form.querySelector('#person-balance').value) || 0
    const note = form.querySelector('#person-note').value.trim()
    
    if (!name) {
      toast('Le nom est obligatoire.', { type: 'error' })
      return
    }
    
    try {
      if (isEdit) {
        cashflowStore.updatePerson(person.id, { name, balance, note })
        toast('Personne modifiée.', { type: 'ok' })
      } else {
        cashflowStore.addPerson({ name, balance, note })
        toast('Personne ajoutée.', { type: 'ok' })
      }
      closeDialog(dialog)
    } catch (error) {
      toast(error.message || 'Erreur lors de l\'enregistrement.', { type: 'error' })
    }
  })
  
  form.querySelector('[data-close]')?.addEventListener('click', () => closeDialog(dialog))
  document.body.appendChild(dialog)
  dialog.showModal()
  form.querySelector('#person-name')?.focus()
}

/* ------------------------------------------------------------------ */
/* Dialog - Transfer Form                                             */
/* ------------------------------------------------------------------ */

export function openTransferForm(transfer = null) {
  const { persons, transfers, settings } = cashflowStore.getCashFlow()
  const isEdit = Boolean(transfer)
  const title = isEdit ? 'Modifier le transfert' : 'Nouveau transfert'
  
  // Calculate current balances to show available amounts
  const balances = cashflowModel.calculatePersonBalances(persons, transfers)
  
  const initialFrom = transfer?.from || (persons[0]?.id || '')
  const initialTo = transfer?.to || (persons[1]?.id || persons[0]?.id || '')
  const initialAmount = transfer?.amount !== undefined ? transfer.amount : ''
  const initialDate = transfer?.date || new Date().toISOString().slice(0, 10)
  const initialNote = transfer?.note || ''
  
  const personOptions = persons
    .map(p => {
      const bal = balances.find(b => b.id === p.id)?.currentBalance || p.balance || 0
      return `<option value="${esc(p.id)}">${esc(p.name)} (${formatMoney(bal, settings.currency)})</option>`
    })
    .join('')
  
  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--form'
  dialog.innerHTML = `
    <form method="dialog" id="transfer-form">
      <div class="dialog-body u-stack">
        <h2>${icon('send', 18)} ${esc(title)}</h2>
        
        <div class="field">
          <label for="transfer-from">De</label>
          <select id="transfer-from" required>
            <option value="">Sélectionner l'expéditeur</option>
            ${personOptions}
          </select>
        </div>
        
        <div class="field">
          <label for="transfer-to">Vers</label>
          <select id="transfer-to" required>
            <option value="">Sélectionner le destinataire</option>
            ${personOptions}
          </select>
        </div>
        
        <div class="field">
          <label for="transfer-amount">Montant</label>
          <input id="transfer-amount" type="number" inputmode="decimal" required 
                 placeholder="0,00" value="${esc(initialAmount)}">
          <p class="field-hint">Montant en ${settings.currency}</p>
        </div>
        
        <div class="field">
          <label for="transfer-date">Date</label>
          <input id="transfer-date" type="date" required value="${esc(initialDate)}">
        </div>
        
        <div class="field">
          <label for="transfer-note">Note (facultatif)</label>
          <textarea id="transfer-note" rows="2" placeholder="Motif du transfert...">${esc(initialNote)}</textarea>
        </div>
      </div>
      
      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>${icon('x', 13)} Annuler</button>
        ${isEdit ? `<button type="button" class="btn btn--danger btn--sm" data-action="delete-transfer" data-id="${esc(transfer.id)}">${icon('trash', 13)} Supprimer</button>` : ''}
        <button type="submit" class="btn btn--primary">${icon('save', 13)} ${isEdit ? 'Enregistrer' : 'Envoyer'}</button>
      </div>
    </form>
  `
  
  dialog.addEventListener('close', () => dialog.remove())
  
  const form = dialog.querySelector('#transfer-form')
  
  // Prevent selecting same person for from and to
  form.querySelector('#transfer-from')?.addEventListener('change', () => {
    const toSelect = form.querySelector('#transfer-to')
    const fromValue = form.querySelector('#transfer-from').value
    const options = toSelect.querySelectorAll('option')
    options.forEach(opt => {
      opt.disabled = opt.value === fromValue
    })
  })
  
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    
    const from = form.querySelector('#transfer-from').value
    const to = form.querySelector('#transfer-to').value
    const amount = toNumber(form.querySelector('#transfer-amount').value)
    const date = form.querySelector('#transfer-date').value
    const note = form.querySelector('#transfer-note').value.trim()
    
    if (!from || !to || !amount || amount <= 0) {
      toast('Veuillez remplir tous les champs obligatoires.', { type: 'error' })
      return
    }
    
    if (from === to) {
      toast('L\'expéditeur et le destinataire ne peuvent pas être identiques.', { type: 'error' })
      return
    }
    
    // Validate sender has enough balance
    const fromPerson = persons.find(p => p.id === from)
    const fromBalance = balances.find(b => b.id === from)?.currentBalance || fromPerson?.balance || 0
    
    try {
      if (isEdit) {
        cashflowStore.updateTransfer(transfer.id, { from, to, amount, date, note })
        toast('Transfert modifié.', { type: 'ok' })
      } else {
        cashflowStore.addTransfer({ from, to, amount, date, note })
      }
      closeDialog(dialog)
    } catch (error) {
      toast(error.message || 'Erreur lors de l\'enregistrement.', { type: 'error' })
    }
  })
  
  form.querySelector('[data-close]')?.addEventListener('click', () => closeDialog(dialog))
  
  form.querySelector('[data-action="delete-transfer"]')?.addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Supprimer ce transfert ?',
      message: 'Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (confirmed) {
      cashflowStore.deleteTransfer(transfer.id)
      toast('Transfert supprimé.', { type: 'info' })
      closeDialog(dialog)
    }
  })
  
  document.body.appendChild(dialog)
  dialog.showModal()
  form.querySelector('#transfer-from')?.focus()
  
  // Set up same-person prevention for edit mode
  const fromSelect = form.querySelector('#transfer-from')
  const toSelect = form.querySelector('#transfer-to')
  if (fromSelect && transfer) {
    fromSelect.value = transfer.from
    // Disable the selected "from" option in "to" dropdown
    if (toSelect) {
      toSelect.value = transfer.to
      const fromOption = toSelect.querySelector(`option[value="${transfer.from}"]`)
      if (fromOption) fromOption.disabled = true
    }
  }
}

/* ------------------------------------------------------------------ */
/* Main Paint Function                                                */
/* ------------------------------------------------------------------ */

function paint() {
  if (!host) return
  
  const { persons, transfers, settings } = cashflowStore.getCashFlow()
  
  host.innerHTML = `
    <section class="view view--cashflow">
      ${header()}
      ${actions()}
      ${toolbar()}
      <div class="list-results" data-role="results">${results()}</div>
    </section>`
  
  bindActions()
}

/* ------------------------------------------------------------------ */
/* Event Binding                                                      */
/* ------------------------------------------------------------------ */

function bindActions() {
  if (!host) return
  
  host.querySelectorAll('[data-action="open-person-form"]').forEach(btn => {
    btn.addEventListener('click', () => openPersonForm())
  })
  
  host.querySelectorAll('[data-action="edit-person-balance"]').forEach(btn => {
    btn.addEventListener('click', (event) => {
      const id = btn.dataset.id
      const person = cashflowStore.getCashFlow().persons.find(p => p.id === id)
      openPersonForm(person)
    })
  })
  
  host.querySelectorAll('[data-action="delete-person"]').forEach(btn => {
    btn.addEventListener('click', async (event) => {
      const id = btn.dataset.id
      const confirmed = await confirmAction({
        title: 'Supprimer cette personne ?',
        message: 'Cette action supprimera aussi tous les transferts associés.',
        confirmLabel: 'Supprimer',
        danger: true,
      })
      if (confirmed) {
        cashflowStore.deletePerson(id)
        toast('Personne supprimée.', { type: 'info' })
      }
    })
  })
  
  // Card click handler - open edit form when clicking on person card body
  host.querySelectorAll('.person-card .card-body').forEach(cardBody => {
    cardBody.addEventListener('click', (event) => {
      // Don't open form if clicking on action buttons
      if (event.target.closest('[data-action]')) return
      const article = cardBody.closest('[data-id]')
      if (article) {
        const id = article.dataset.id
        const person = cashflowStore.getCashFlow().persons.find(p => p.id === id)
        if (person) openPersonForm(person)
      }
    })
  })
  
  host.querySelectorAll('[data-action="open-transfer-form"]').forEach(btn => {
    btn.addEventListener('click', () => openTransferForm())
  })
  
  host.querySelectorAll('[data-action="edit-transfer"]').forEach(btn => {
    btn.addEventListener('click', (event) => {
      const id = btn.dataset.id
      const transfer = cashflowStore.getCashFlow().transfers.find(t => t.id === id)
      if (transfer) openTransferForm(transfer)
    })
  })
  
  host.querySelectorAll('[data-action="delete-transfer"]').forEach(btn => {
    btn.addEventListener('click', async (event) => {
      const id = btn.dataset.id
      const confirmed = await confirmAction({
        title: 'Supprimer ce transfert ?',
        message: 'Cette action est irréversible.',
        confirmLabel: 'Supprimer',
        danger: true,
      })
      if (confirmed) {
        cashflowStore.deleteTransfer(id)
        toast('Transfert supprimé.', { type: 'info' })
      }
    })
  })
  
  // Layout selector
  host.querySelectorAll('[data-layout-choice]').forEach(btn => {
    btn.addEventListener('click', () => {
      layout = btn.dataset.layoutChoice
      paint()
    })
  })
}

/* ------------------------------------------------------------------ */
/* Export View                                                        */
/* ------------------------------------------------------------------ */

export const cashflowView = {
  id: 'cashflow',
  route: 'caisse',
  label: 'Caisse',
  icon: 'wallet',
  mount(element) {
    host = element
    query = ''
    layout = 'cards'
    showTransfers = false
    
    // Seed default persons if empty
    const { persons } = cashflowStore.getCashFlow()
    if (persons.length === 0) {
      cashflowStore.seedDefaultPersons()
    }
    
    paint()
  },
  update() {
    paint()
  },
}