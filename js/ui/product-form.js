/* ------------------------------------------------------------------ */
/* Formulaire produit — ajout et modification (dialog natif)           */
/* ------------------------------------------------------------------ */

import { esc, toNumber } from '../core/utils.js'
import { compressPhoto, readableSize } from '../core/photo.js'
import { icon } from './icons.js'
import { CATEGORIES, CATEGORY_VALUES, PRIORITIES, UNITS, colorHex, defaultUnitFor, displayName, knownSuppliers } from '../data/model.js'
import {
  colorFromText,
  hexToRgb,
  hslToHex,
  nearestColor,
  rgbToHsl,
  searchColors,
} from '../data/colors.js'
import { addProduct, getProducts, updateProduct, isStorageFull } from '../data/store.js'
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
                         role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="color-suggest"
                         placeholder="Commencez à taper : bleu, rose, ivoire…" value="${esc(product?.color || '')}">
                  <button type="button" class="color-box" data-role="color-picker" aria-label="Choisir une couleur à la roue"
                          title="Choisir une couleur à la roue"></button>
                </div>
                <div class="color-preview" data-role="color-preview" tabindex="0" role="button"
                     aria-label="Aperçu de la couleur" title="Aperçu — cliquez pour ouvrir la roue"></div>
                <div class="color-suggest" id="color-suggest" data-role="color-suggest" role="listbox"
                     aria-label="Couleurs suggérées" hidden></div>
                <div class="color-hint" data-role="color-hint">
                  Tapez un nom de couleur, ou touchez la grande pastille pour la choisir à la roue.
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

  /* Couleur : saisie suggestive + roue chromatique. */
  const colorBox = dialog.querySelector('[data-role="color-picker"]')
  const colorPreview = dialog.querySelector('[data-role="color-preview"]')
  const suggestBox = dialog.querySelector('[data-role="color-suggest"]')
  const colorInput = field('color')
  let currentHex = hex || null

  const paintColor = (value) => {
    currentHex = value || null
    if (colorPreview) {
      colorPreview.style.background = value || ''
      colorPreview.classList.toggle('is-empty', !value)
    }
    if (colorBox) {
      colorBox.style.setProperty('--sw', value || '')
      colorBox.classList.toggle('is-empty', !value)
    }
  }

  /* --- Suggestions pendant la frappe ------------------------------- */
  let suggestIndex = -1
  let suggestItems = []

  const closeSuggest = () => {
    suggestBox.hidden = true
    suggestBox.innerHTML = ''
    suggestIndex = -1
    suggestItems = []
    colorInput?.setAttribute('aria-expanded', 'false')
  }

  const applyColor = (label, value) => {
    if (colorInput) colorInput.value = label ?? ''
    paintColor(value)
    closeSuggest()
  }

  const openSuggest = (needle) => {
    const found = searchColors(needle, 8)
    suggestItems = found
    suggestIndex = -1
    if (!found.length) {
      closeSuggest()
      return
    }
    suggestBox.innerHTML = found
      .map(
        ({ label: name, hex }, index) => `
      <button type="button" class="color-suggest-item" data-suggest-index="${index}"
              data-suggest-label="${esc(name)}" data-suggest-hex="${hex}" role="option" aria-selected="false">
        <span class="swatch" style="background:${hex}"></span>
        <span class="color-suggest-name">${esc(name)}</span>
      </button>`,
      )
      .join('')
    suggestBox.hidden = false
    colorInput?.setAttribute('aria-expanded', 'true')
  }

  const moveSuggest = (delta) => {
    if (suggestBox.hidden || !suggestItems.length) return
    const next = (suggestIndex + delta + suggestItems.length) % suggestItems.length
    suggestIndex = next
    suggestBox.querySelectorAll('[data-suggest-index]').forEach((node, index) => {
      const active = index === next
      node.classList.toggle('is-active', active)
      node.setAttribute('aria-selected', active ? 'true' : 'false')
      if (active) node.scrollIntoView({ block: 'nearest' })
    })
  }

  const takeSuggest = (index) => {
    const item = suggestItems[index]
    if (item) applyColor(item.label, item.hex)
  }

  colorInput?.addEventListener('input', () => {
    const text = colorInput.value
    /* La couleur suit la frappe quand le libellé est reconnu : c'est le
       comportement le plus utile, mais on n'impose rien à l'utilisateur. */
    const found = colorFromText(text)
    if (found) paintColor(found)
    else if (!text.trim()) paintColor(null)
    if (text.trim().length >= 1) openSuggest(text)
    else closeSuggest()
  })

  colorInput?.addEventListener('keydown', (event) => {
    if (suggestBox.hidden) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSuggest(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSuggest(-1)
    } else if (event.key === 'Enter' && suggestIndex >= 0) {
      event.preventDefault()
      takeSuggest(suggestIndex)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeSuggest()
    }
  })

  colorInput?.addEventListener('blur', () => {
    /* Le clic sur une suggestion passe par ce blur : on attend le prochain tour
       de boucle, sinon le clic n'atteindrait jamais l'élément suggéré. */
    setTimeout(() => {
      if (!suggestBox.contains(document.activeElement)) closeSuggest()
    }, 120)
  })

  suggestBox?.addEventListener('mousedown', (event) => event.preventDefault())
  suggestBox?.addEventListener('click', (event) => {
    const node = event.target.closest('[data-suggest-index]')
    if (node) takeSuggest(Number(node.dataset.suggestIndex))
  })

  /* --- Roue chromatique -------------------------------------------- */
  /* Un disque de teintes ; la boule se déplace au doigt, à la souris ou aux
     flèches du clavier. Le centre est le gris, le bord la couleur pure : c'est
     la roue HSL, donc ce qu'on cherche est exactement ce qu'on voit. */
  const openColorWheel = () => {
    const wheel = document.createElement('dialog')
    wheel.className = 'dialog dialog--sm color-wheel-dialog'
    const start = currentHex || '#3d9958'
    wheel.innerHTML = `
      <form method="dialog">
        <div class="dialog-body u-stack">
          <div class="panel-head" style="margin-bottom:0">
            <div>
              <h2>${icon('palette', 16)} Choisir une couleur</h2>
              <p>Déplacez la boule jusqu'à la teinte voulue, ou utilisez les flèches.</p>
            </div>
            <button type="button" class="icon-btn" data-close aria-label="Fermer">${icon('x', 15)}</button>
          </div>
          <div class="color-wheel-stage">
            <div class="color-wheel" data-role="wheel" tabindex="0" role="application"
                 aria-label="Roue des couleurs. Flèches pour se déplacer, Origine du clavier pour choisir."
                 style="--hue:${esc(start)}">
              <div class="color-wheel-ball" data-role="ball"></div>
            </div>
            <div class="color-wheel-side">
              <div class="color-wheel-swatch" data-role="wheel-swatch" style="background:${esc(start)}"></div>
              <output class="color-wheel-readout" data-role="wheel-readout">${esc(start)}</output>
              <div class="color-wheel-name" data-role="wheel-name"></div>
            </div>
          </div>
          <label class="field-hint" for="wheel-lightness">Clarté</label>
          <input class="range" id="wheel-lightness" type="range" min="4" max="100" step="1"
                 data-role="wheel-light" aria-label="Clarté de la couleur">
        </div>
        <div class="dialog-foot">
          <button type="button" class="btn btn--ghost" data-clear>${icon('trash', 13)} Effacer</button>
          <button type="button" class="btn btn--ghost" data-close>Annuler</button>
          <button type="submit" class="btn btn--primary">OK</button>
        </div>
      </form>`
    wheel.addEventListener('close', () => wheel.remove())

    const disk = wheel.querySelector('[data-role="wheel"]')
    const ball = wheel.querySelector('[data-role="ball"]')
    const swatch = wheel.querySelector('[data-role="wheel-swatch"]')
    const readout = wheel.querySelector('[data-role="wheel-readout"]')
    const nameBox = wheel.querySelector('[data-role="wheel-name"]')
    const lightInput = wheel.querySelector('[data-role="wheel-light"]')

    const hsl = rgbToHsl(hexToRgb(start) || { r: 61, g: 153, b: 88 })
    const state = { h: hsl.h, s: Math.max(hsl.s, 0.6), l: hsl.l }

    /* La teinte affichée ne dépend que de h et l : la boule se place sur le
       disque, la clarté vient du curseur. */
    const render = () => {
      const hex = hslToHex({ h: state.h, s: state.s, l: state.l })
      const angle = (state.h - 90) * (Math.PI / 180)
      const radius = state.s * 50
      ball.style.left = `${50 + Math.cos(angle) * radius}%`
      ball.style.top = `${50 + Math.sin(angle) * radius}%`
      ball.style.background = hex
      swatch.style.background = hex
      readout.textContent = hex
      lightInput.value = String(Math.round(state.l * 100))
      /* Un nom connu pour la teinte choisie : la fiche reste lisible sur les
         deux appareils, même quand la couleur sort de la table. */
      const near = nearestColor(hex)
      nameBox.textContent = near ? near.label : ''
      return hex
    }

    const pickFrom = (event) => {
      const box = disk.getBoundingClientRect()
      const dx = (event.clientX - box.left) / box.width - 0.5
      const dy = (event.clientY - box.top) / box.height - 0.5
      const distance = Math.min(1, Math.hypot(dx, dy) * 2)
      state.s = distance
      if (distance > 0.02) {
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
        state.h = (deg + 360) % 360
      }
      render()
      refreshChosen()
    }

    /* `chosen` suit chaque interaction (boule, clarté, clavier) : sans cela,
       le bouton OK validait la teinte affichée au premier rendu, et un déplacement
       de la boule n'était pas pris en compte. */
    let chosen = render()
    const refreshChosen = () => { chosen = render() }

    let dragging = false
    disk.addEventListener('pointerdown', (event) => {
      dragging = true
      disk.setPointerCapture?.(event.pointerId)
      disk.focus()
      pickFrom(event)
      event.preventDefault()
    })
    disk.addEventListener('pointermove', (event) => {
      if (dragging) pickFrom(event)
    })
    const stopDrag = (event) => {
      if (!dragging) return
      dragging = false
      disk.releasePointerCapture?.(event.pointerId)
    }
    disk.addEventListener('pointerup', stopDrag)
    disk.addEventListener('pointercancel', stopDrag)

    /* Clavier : la roue doit rester utilisable sans souris. Origine = centre
       (gris), car on ne peut pas être « à la bonne distance » du centre. */
    disk.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 10 : 2
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']
      if (!keys.includes(event.key)) return
      event.preventDefault()
      if (event.key === 'ArrowLeft') state.h = (state.h - step + 360) % 360
      else if (event.key === 'ArrowRight') state.h = (state.h + step) % 360
      else if (event.key === 'ArrowUp') state.s = Math.min(1, state.s + step / 100)
      else if (event.key === 'ArrowDown') state.s = Math.max(0, state.s - step / 100)
      else if (event.key === 'Home') state.s = 0
      else if (event.key === 'End') state.s = 1
      render()
      refreshChosen()
    })

    lightInput?.addEventListener('input', () => {
      state.l = Number(lightInput.value) / 100
      render()
      refreshChosen()
    })

    /* OK valide la teinte affichée ; le nom proche n'est qu'une aide, on ne
       l'impose pas — l'utilisateur peut préférer un autre libellé. */
    wheel.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault()
      applyColor(colorInput?.value || '', chosen)
      wheel.close()
    })
    /* Une touche sur le nom propose la teinte comme un choix nommé. */
    nameBox?.addEventListener('click', () => {
      if (nameBox.textContent) {
        applyColor(nameBox.textContent, chosen)
        wheel.close()
      }
    })
    wheel.querySelector('[data-clear]')?.addEventListener('click', () => {
      applyColor('', null)
      wheel.close()
    })
    wheel.querySelector('[data-close]')?.addEventListener('click', () => wheel.close())

    document.body.appendChild(wheel)
    wheel.showModal()
    requestAnimationFrame(() => disk.focus())
  }

  colorBox?.addEventListener('click', openColorWheel)
  colorPreview?.addEventListener('click', openColorWheel)
  colorPreview?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openColorWheel()
    }
  })
  colorInput?.addEventListener('focus', () => {
    if (colorInput.value.trim()) openSuggest(colorInput.value)
  })

  paintColor(hex)

  const pick = (kind) => dialog.querySelector(`[data-input="${kind}"]`)?.click()

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    /* Une fois le quota atteint, accepter une photo reviendrait à la perdre
       en silence à la fermeture. On le dit avant, pas après. */
    if (isStorageFull()) {
      setMessage(
        'Stockage du navigateur plein : une photo de plus ne serait pas enregistrée et disparaîtrait à la fermeture. Enregistrez le produit sans photo, ou exportez une sauvegarde JSON puis retirez des photos.',
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