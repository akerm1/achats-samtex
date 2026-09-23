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
  return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
}

export function resolveTheme(value = preference) {
  return value === 'system' ? (prefersDark() ? 'dark' : 'light') : value
}

export function getThemePreference() {
  return preference
}

export function applyTheme() {
  const resolved = resolveTheme()
  document.documentElement.dataset.theme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0c0f14' : '#14795a')
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