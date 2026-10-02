/* ------------------------------------------------------------------ */
/* Formulaire Facture — ajout et modification (dialog natif)           */
/* ------------------------------------------------------------------ */

import { esc, toNumber } from '../core/utils.js'
import { compressPhoto, readableSize } from '../core/photo.js'
import { icon } from './icons.js'
import { BILL_STATUS, knownBillSuppliers } from '../data/model.js'
import { addBill, getBills, updateBill, isStorageFull } from '../data/store.js'
import { toast } from '../core/feedback.js'

let current = null

export function openBillForm(bill = null, { onSaved = null } = {}) {
  if (current) return current
  const editing = Boolean(bill)
  const suppliers = knownBillSuppliers(getBills())

  let photo = bill?.photo || ''
  let busy = false

  const dialog = document.createElement('dialog')
  dialog.className = 'dialog'
  dialog.innerHTML = `
    <form class="product-form" novalidate>
      <div class="dialog-body u-stack">
        <div class="panel-head" style="margin-bottom:0">
          <div>
            <h2>${editing ? 'Modifier la facture' : 'Nouvelle facture'}</h2>
            <p>${editing ? 'Ajustez la facture puis enregistrez.' : 'Photo du ticket/facture, fournisseur, montant.'}</p>
          </div>
          <button type="button" class="icon-btn" data-action="close-form" aria-label="Fermer">${icon('x', 15)}</button>
        </div>

        <div class="picker">
          <div>
            <div class="photo-picker" data-preview>
              ${photo
    ? `<img src="${esc(photo)}" alt="Aperçu">`
    : `<span class="placeholder">${icon('imagePlus', 24)}Ajouter une photo du ticket/facture</span>`}
            </div>
            <div class="picker-actions">
              <button type="button" class="btn btn--secondary btn--sm" data-action="pick-camera">${icon('camera', 14)} Caméra</button>
              <button type="button" class="btn btn--secondary btn--sm" data-action="pick-gallery">${icon('imagePlus', 14)} Galerie</button>
              <button type="button" class="btn btn--ghost btn--sm" data-action="clear-photo">${icon('trash', 13)} Retirer</button>
            </div>
            <input type="file" accept="image/*" capture="environment" data-input="camera" hidden>
            <input type="file" accept="image/*" data-input="gallery" hidden>
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="bill-supplier">Fournisseur <small class="field-hint">(obligatoire)</small></label>
            <input class="input" id="bill-supplier" data-field="supplier" list="supplier-options"
                   autocomplete="off" placeholder="Ex. Marché Saint-Pierre" value="${esc(bill?.supplier || '')}" required>
            <datalist id="supplier-options">
              ${suppliers.map((name) => `<option value="${esc(name)}"></option>`).join('')}
            </datalist>
          </div>
          <div class="field">
            <label for="bill-amount">Montant (€)</label>
            <input class="input" id="bill-amount" data-field="amount" type="text" inputmode="decimal"
                   autocomplete="off" placeholder="Ex. 150,00" value="${bill?.amount ?? ''}">
          </div>
          <div class="field">
            <label>Statut</label>
            <div class="segmented" role="group" aria-label="Statut de la facture">
              ${Object.entries(BILL_STATUS).map(
    ([key, value]) => `
                <button type="button" data-status="${esc(value)}" class="${value === (bill?.status || BILL_STATUS.PENDING) ? 'is-active' : ''}">
                  ${esc(key === 'PENDING' ? 'En attente' : 'Payée')}
                </button>`,
  ).join('')}
            </div>
          </div>
          <div class="field">
            <label for="bill-note">Note (optionnel)</label>
            <textarea class="textarea" id="bill-note" data-field="note"
                      placeholder="Ex. Acompte, facture n°123, échéance…">${esc(bill?.note || '')}</textarea>
          </div>
        </div>
      </div>

      <div class="dialog-foot">
        <span class="form-message" data-role="message"></span>
        <button type="button" class="btn btn--ghost" data-action="close-form">Annuler</button>
        <button type="submit" class="btn btn--primary" data-role="submit">
          ${editing ? `${icon('save', 14)} Enregistrer` : `${icon('plus', 14)} Ajouter la facture`}
        </button>
      </div>
    </form>`

  const field = (name) => dialog.querySelector(`[data-field="${name}"]`)
  const message = dialog.querySelector('[data-role="message"]')
  const submitButton = dialog.querySelector('[data-role="submit"]')
  const preview = dialog.querySelector('[data-preview]')

  const setMessage = (text, kind = '') => {
    message.textContent = text || ''
    message.className = `form-message${kind ? ` is-${kind}` : ''}`
  }

  const paintPreview = () => {
    preview.innerHTML = photo
      ? `<img src="${photo}" alt="Aperçu">`
      : `<span class="placeholder">${icon('imagePlus', 24)}Ajouter une photo du ticket/facture</span>`
  }

  const statusButtons = Array.from(dialog.querySelectorAll('[data-status]'))
  let status = bill?.status || BILL_STATUS.PENDING
  statusButtons.forEach((button) => {
    button.addEventListener('click', () => {
      status = button.dataset.status
      statusButtons.forEach((other) => other.classList.toggle('is-active', other === button))
    })
  })

  const pick = (kind) => dialog.querySelector(`[data-input="${kind}"]`)?.click()

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (isStorageFull()) {
      setMessage(
        'Stockage du navigateur plein : une photo de plus ne serait pas enregistrée et disparaîtrait à la fermeture.',
        'error',
      )
      return
    }
    busy = true
    submitButton.disabled = true
    setMessage('Préparation de la photo…')
    try {
      photo = await compressPhoto(file)
      paintPreview()
      setMessage(`Photo prête (${readableSize(photo)}).`, 'ok')
    } catch (error) {
      setMessage(error.message, 'error')
    } finally {
      busy = false
      submitButton.disabled = false
    }
  }

  dialog.querySelectorAll('input[type="file"]').forEach((input) => input.addEventListener('change', handleFile))
  dialog.querySelector('[data-action="clear-photo"]')?.addEventListener('click', () => {
    photo = ''
    paintPreview()
    setMessage('')
  })
  dialog.querySelector('[data-action="pick-camera"]')?.addEventListener('click', () => pick('camera'))
  dialog.querySelector('[data-action="pick-gallery"]')?.addEventListener('click', () => pick('gallery'))

  const close = () => dialog.close()
  dialog.querySelectorAll('[data-action="close-form"]').forEach((button) => button.addEventListener('click', close))

  dialog.querySelector('form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    if (busy) return
    const supplier = String(field('supplier')?.value || '').trim()
    const amount = toNumber(field('amount')?.value)
    const note = field('note')?.value || ''

    if (!supplier) {
      setMessage('Le fournisseur est obligatoire.', 'error')
      return
    }

    const payload = {
      supplier,
      amount: amount !== null && amount > 0 ? amount : null,
      photo,
      note,
      status,
    }

    try {
      const saved = editing ? updateBill(bill.id, payload) : addBill(payload)
      toast(editing ? `Facture « ${saved.supplier} » mise à jour.` : `Facture « ${saved.supplier} » ajoutée.`, { type: 'ok' })
      onSaved?.(saved)
      close()
    } catch (error) {
      setMessage(error.message, 'error')
    }
  })

  dialog.addEventListener('close', () => {
    dialog.remove()
    current = null
  })
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close()
  })

  document.body.appendChild(dialog)
  dialog.showModal()
  requestAnimationFrame(() => field('supplier')?.focus())
  current = dialog
  return dialog
}

export const isBillFormOpen = () => Boolean(current)