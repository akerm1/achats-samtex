/* ------------------------------------------------------------------ */
/* Formulaire produit — ajout et modification (dialog natif)           */
/* ------------------------------------------------------------------ */

import { esc, toNumber } from '../core/utils.js'
import { compressPhoto, readableSize } from '../core/photo.js'
import { icon } from './icons.js'
import { CATEGORIES, CATEGORY_VALUES, PRIORITIES, UNITS, colorHex, defaultUnitFor, displayName, knownSuppliers } from '../data/model.js'
import { colorFromText, colorList } from '../data/colors.js'
import { addProduct, getProducts, updateProduct } from '../data/store.js'
import { toast } from '../core/feedback.js'

let current = null

const optionsOf = (entries, selected) =>
  entries
    .map(
      ([value, item]) =>
        `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(item.label)}</option>`,
    )
    .join('')

/**
 * Ouvre la fenêtre d'ajout (sans argument) ou de modification (produit).
 * @param {object|null} product
 * @param {{ onSaved?: (product:object) => void }} [options]
 */
export function openProductForm(product = null, { onSaved = null } = {}) {
  if (current) return current
  const editing = Boolean(product)
  const suppliers = knownSuppliers(getProducts())
  const initialType = CATEGORY_VALUES.includes(product?.type) ? product.type : 'autre'
  const initialUnit = product?.unit || defaultUnitFor(initialType)
  const initialPriority = PRIORITIES.some((item) => item.value === product?.priority) ? product.priority : 'normale'
  const hex = colorHex(product)
  const pickerHex = hex || '#808080'

  let photo = product?.photo || ''
  let busy = false
  let priority = initialPriority

  const dialog = document.createElement('dialog')
  dialog.className = 'dialog'
  dialog.innerHTML = `
    <form class="product-form" novalidate>
      <div class="dialog-body u-stack">
        <div class="panel-head" style="margin-bottom:0">
          <div>
            <h2>${editing ? 'Modifier le produit' : 'Nouveau produit à acheter'}</h2>
            <p>${editing ? 'Ajustez la fiche puis enregistrez.' : 'Photo, nom, couleur et prix : tout est optionnel.'}</p>
          </div>
          <button type="button" class="icon-btn" data-action="close-form" aria-label="Fermer">${icon('x', 15)}</button>
        </div>

        <div class="picker">
          <div>
            <div class="photo-picker" data-preview>
              ${
                photo
                  ? `<img src="${esc(photo)}" alt="Aperçu">`
                  : `<span class="placeholder">${icon('imagePlus', 24)}Ajoutez une photo du produit</span>`
              }
            </div>
            <div class="picker-actions">
              <button type="button" class="btn btn--secondary btn--sm" data-action="pick-camera">${icon('camera', 14)} Caméra</button>
              <button type="button" class="btn btn--secondary btn--sm" data-action="pick-gallery">${icon('imagePlus', 14)} Galerie</button>
              <button type="button" class="btn btn--ghost btn--sm" data-action="clear-photo">${icon('trash', 13)} Retirer</button>
            </div>
            <input type="file" accept="image/*" capture="environment" data-input="camera" hidden>
            <input type="file" accept="image/*" data-input="gallery" hidden>
          </div>

        <div class="form-grid">
            <div class="field">
              <label for="product-name">Nom du produit <small class="field-hint">(optionnel — une photo suffit)</small></label>
              <input class="input" id="product-name" data-field="name" autocomplete="off"
                     placeholder="Ex. Ceinture satin ivoire" value="${esc(product?.name || '')}">
            </div>
            <div class="range-row">
              <div class="field">
                <label for="product-type">Catégorie</label>
                <select class="select" id="product-type" data-field="type">
                  ${optionsOf(Object.entries(CATEGORIES), initialType)}
                </select>
              </div>
              <div class="field">
                <label for="product-color">Couleur / finition</label>
                <div class="color-line">
                  <input class="input" id="product-color" data-field="color" autocomplete="off"
                         placeholder="Ex. rose bébé, bleu roi, ivoire" value="${esc(product?.color || '')}">
                  <input class="color-box" data-rgb-picker type="color" value="${esc(pickerHex)}"
                         aria-label="Couleur de finition" title="Choisir une couleur">
                </div>
                <div class="color-preview" data-role="color-preview" tabindex="0" role="button"
                     aria-label="Aperçu de la couleur" title="Aperçu — cliquez pour changer"></div>
                <div class="color-hint">Suggestions — touchez une couleur pour la sélectionner :</div>
                <div class="color-swatches" data-role="color-swatches" aria-label="Couleurs suggérées">
                  ${colorList()
                    .map(
                      ({ label, hex }) => `
                    <button type="button" data-color-swatch="${esc(label)}" style="--sw:${hex}" title="${esc(label)}">
                      <span class="swatch" style="background:${hex}"></span>
                      <span class="swatch-name">${esc(label)}</span>
                    </button>`,
                    )
                    .join('')}
                </div>
              </div>
            </div>
            <div class="range-row">
              <div class="field">
                <label for="product-supplier">Fournisseur</label>
                <input class="input" id="product-supplier" data-field="supplier" list="supplier-options"
                       autocomplete="off" placeholder="Ex. Marché Saint-Pierre" value="${esc(product?.supplier || '')}">
                <datalist id="supplier-options">
                  ${suppliers.map((name) => `<option value="${esc(name)}"></option>`).join('')}
                </datalist>
              </div>
              <div class="field">
                <label>Priorité</label>
                <div class="segmented" role="group" aria-label="Priorité">
                  ${PRIORITIES.map(
                    (item) => `
                    <button type="button" data-priority="${esc(item.value)}" class="${item.value === initialPriority ? 'is-active' : ''}">
                      ${esc(item.label)}
                    </button>`,
                  ).join('')}
                </div>
              </div>
            </div>
            <div class="range-row">
              <div class="field">
                <label>Quantité</label>
                <div class="stepper">
                  <button type="button" data-step="-1" aria-label="Diminuer">${icon('minus', 14)}</button>
                  <input id="product-qty" data-field="qty" type="number" min="1" step="1" inputmode="numeric"
                         value="${esc(product?.qty || 1)}">
                  <button type="button" data-step="1" aria-label="Augmenter">${icon('plus', 14)}</button>
                </div>
              </div>
              <div class="field">
                <label for="product-unit">Unité</label>
                <select class="select" id="product-unit" data-field="unit">
                  ${optionsOf(UNITS.map((unit) => [unit.value, unit]), initialUnit)}
                </select>
              </div>
              <div class="field">
                <label for="product-price">Prix unitaire (€)</label>
                <input class="input" id="product-price" data-field="price" type="text" inputmode="decimal"
                       autocomplete="off" placeholder="Ex. 1,50" value="${product?.price ?? ''}">
              </div>
            </div>
            <div class="field">
              <label for="product-note">Détails (optionnel)</label>
              <textarea class="textarea" id="product-note" data-field="note"
                        placeholder="Ex. mariage, finition brillant, lot de 40 m…">${esc(product?.note || '')}</textarea>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-foot">
        <span class="form-message" data-role="message"></span>
        <button type="button" class="btn btn--ghost" data-action="close-form">Annuler</button>
        <button type="submit" class="btn btn--primary" data-role="submit">
          ${editing ? `${icon('save', 14)} Enregistrer` : `${icon('plus', 14)} Ajouter à la liste`}
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
      : `<span class="placeholder">${icon('imagePlus', 24)}Ajoutez une photo du produit</span>`
  }

  const priorityButtons = Array.from(dialog.querySelectorAll('[data-priority]'))
  priorityButtons.forEach((button) => {
    button.addEventListener('click', () => {
      priority = button.dataset.priority
      priorityButtons.forEach((other) => other.classList.toggle('is-active', other === button))
    })
  })

  /* L'unité suit la catégorie choisie (comportement d'origine conservé). */
  field('type')?.addEventListener('change', (event) => {
    const unitSelect = field('unit')
    if (unitSelect) unitSelect.value = defaultUnitFor(event.target.value)
  })

  dialog.querySelectorAll('[data-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = field('qty')
      const step = Number(button.dataset.step) || 1
      input.value = String(Math.max(1, Math.round(toNumber(input.value) || 1) + step))
    })
  })

  /* Couleur : petite boîte à côté du nom + grande boîte d'aperçu en dessous. */
  const picker = dialog.querySelector('[data-rgb-picker]')
  const colorPreview = dialog.querySelector('[data-role="color-preview"]')
  let currentHex = hex || null

  const hexToRgb = (value) => {
    const clean = String(value || '').replace('#', '')
    if (clean.length !== 6) return null
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    }
  }
  const paintColor = (value) => {
    currentHex = value || null
    if (!colorPreview) return
    colorPreview.style.background = value || ''
    colorPreview.classList.toggle('is-empty', !value)
    if (value && picker) picker.value = value
  }
  picker?.addEventListener('input', () => paintColor(picker.value || null))
  /* Saisie du libellé de couleur : la table française remplit boîte + aperçu. */
  field('color')?.addEventListener('input', () => {
    const found = colorFromText(field('color')?.value)
    if (found) paintColor(found)
  })
  /* Palette de suggestions : un toucher remplit le libellé, la boîte et l'aperçu. */
  dialog.querySelectorAll('[data-color-swatch]').forEach((button) => {
    button.addEventListener('click', () => {
      field('color').value = button.dataset.colorSwatch
      paintColor(button.style.getPropertyValue('--sw'))
    })
  })
  colorPreview?.addEventListener('click', () => picker?.click())
  colorPreview?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      picker?.click()
    }
  })
  paintColor(hex)

  const pick = (kind) => dialog.querySelector(`[data-input="${kind}"]`)?.click()

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
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
    const colorRgb = currentHex ? hexToRgb(currentHex) : null
    const payload = {
      name: String(field('name')?.value || '').trim(),
      photo,
      note: field('note')?.value || '',
      type: field('type')?.value || 'autre',
      color: field('color')?.value || '',
      colorRgb,
      supplier: field('supplier')?.value || '',
      qty: Math.max(1, Math.round(toNumber(field('qty')?.value) || 1)),
      unit: field('unit')?.value || defaultUnitFor(field('type')?.value || 'autre'),
      price: toNumber(field('price')?.value),
      priority,
    }
    try {
      const saved = editing ? updateProduct(product.id, payload) : addProduct(payload)
      toast(editing ? `« ${displayName(saved)} » a été mis à jour.` : `« ${displayName(saved)} » a été ajouté à la liste.`, { type: 'ok' })
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
  /* Clic sur le fond assombri : fermeture. */
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close()
  })

  document.body.appendChild(dialog)
  dialog.showModal()
  requestAnimationFrame(() => field('name')?.focus())
  current = dialog
  return dialog
}

export const isProductFormOpen = () => Boolean(current)