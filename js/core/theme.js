/* ------------------------------------------------------------------ */
/* Thème — clair / sombre / système                                    */
/* ------------------------------------------------------------------ */

import { storage } from './storage.js'

const KEY = 'purchase-gros-theme-v1'
export const THEMES = [
  { value: 'light', label: 'Clair', icon: 'sun' },
  { value: 'dark', label: 'Sombre', icon: 'moon' },
  { value: 'system', label: 'Système', icon: 'monitor' },
]
const VALID = THEMES.map((theme) => theme.value)

let preference = VALID.includes(storage.get(KEY)) ? storage.get(KEY) : 'system'

function prefersDark() {
  /* `?.()` ne protège que l'appel : sans le second `?.`, un navigateur sans
     `matchMedia` ferait échouer la lecture de `.matches` sur `undefined`. */
  return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches)
}

export function resolveTheme(value = preference) {
  return value === 'system' ? (prefersDark() ? 'dark' : 'light') : value
}

export function getThemePreference() {
  return preference
}

/* La couleur de la barre du navigateur suit le fond réel du thème.
   `index.html` déclare deux `meta[name="theme-color"]`, une par média :
   elles couvrent le premier rendu, avant que ce module ne s'exécute. Une
   fois le thème résolu, on retire cet attribut `media` de la
   declaration retenue et on fixe sa couleur — sinon la déclaration vide
   resterait prioritaire et la barre garderait la couleur du système. */
const CHROME = { light: '#f4f6f9', dark: '#0a101c' }

export function applyTheme() {
  const resolved = resolveTheme()
  document.documentElement.dataset.theme = resolved
  const color = CHROME[resolved] || CHROME.light
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    if (meta.media) {
      /* Le média ne correspond pas au thème résolu : on retire la
         déclaration plutôt que de la laisser décider. */
      if (meta.media.includes(resolved)) {
        meta.removeAttribute('media')
        meta.setAttribute('content', color)
      } else {
        meta.remove()
      }
    } else {
      meta.setAttribute('content', color)
    }
  }
  return resolved
}

export function setTheme(value) {
  preference = VALID.includes(value) ? value : 'system'
  storage.set(KEY, preference)
  applyTheme()
  return preference
}

export function initTheme() {
  applyTheme()
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (preference === 'system') applyTheme()
  })
}