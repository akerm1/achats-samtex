/* ------------------------------------------------------------------ */
/* Coquille — barre du haut, navigation, bandeaux, pastille sync       */
/* ------------------------------------------------------------------ */

import { $, esc, formatRelative } from '../core/utils.js'
import { icon } from './icons.js'
import { getPrefs, getState, setPrefs, statusLabel } from '../data/store.js'

export const NAV_ITEMS = [
  { route: 'accueil', label: 'Accueil', icon: 'home' },
  { route: 'liste', label: 'Liste', icon: 'cart' },
  { route: 'marche', label: 'Marché', icon: 'bag' },
  { route: 'reglages', label: 'Réglages', icon: 'sliders' },
]

const shell = {
  activeRoute: 'accueil',
  installEvent: null,
  updateAvailable: false,
  offlineReady: false,
}

/* Navigation ------------------------------------------------------- */

export function setActiveRoute(route) {
  shell.activeRoute = route
  renderNav()
}

function renderNav() {
  const top = $('#appbar-nav')
  if (top) {
    top.innerHTML = NAV_ITEMS.map(
      (item) => `
        <a class="navlink ${item.route === shell.activeRoute ? 'is-active' : ''}" href="#/${item.route}"
           aria-current="${item.route === shell.activeRoute ? 'page' : 'false'}">
          ${icon(item.icon, 14)}<span>${esc(item.label)}</span>
        </a>`,
    ).join('')
  }

  const bottom = $('#bottomnav-inner')
  if (!bottom) return
  const { pendingCount } = getState()
  bottom.innerHTML = NAV_ITEMS.map((item) => {
    const active = item.route === shell.activeRoute
    const badge =
      item.route === 'liste' && pendingCount ? `<span class="navtab-badge">${pendingCount}</span>` : ''
    return `
      <a class="navtab ${active ? 'is-active' : ''}" href="#/${item.route}"
         aria-current="${active ? 'page' : 'false'}">
        ${icon(item.icon, 19)}<span>${esc(item.label)}</span>${badge}
      </a>`
  }).join('')
}

/* Pastille de synchronisation ------------------------------------- */

const PILL_CLASSES = {
  live: 'is-live',
  config: 'is-config',
  syncing: 'is-syncing',
  pending: 'is-syncing',
  offline: 'is-offline',
}

export function renderSyncPill() {
  const pill = $('#sync-pill')
  if (!pill) return
  const { status, isConfigured, lastSyncAt, message } = getState()
  pill.className = `sync-pill ${PILL_CLASSES[status] || 'is-config'}`
  pill.innerHTML = `<span>${esc(statusLabel(status))}</span>${
    lastSyncAt ? `<small>${formatRelative(lastSyncAt)}</small>` : ''
  }`
  pill.title = [
    isConfigured ? 'Liste partagée via GitHub' : 'Liste locale — configurez GitHub dans Réglages',
    message ? `⚠ ${message}` : '',
    lastSyncAt ? `Dernière synchro : ${formatRelative(lastSyncAt)}` : '',
    'Cliquez pour synchroniser maintenant',
  ]
    .filter(Boolean)
    .join(' · ')
}

/* Bandeaux -------------------------------------------------------- */

export function setInstallEvent(event) {
  shell.installEvent = event
  renderBanners()
}

export function setUpdateAvailable(value) {
  shell.updateAvailable = value
  renderBanners()
}

export function setOfflineReady(value) {
  shell.offlineReady = value
  renderBanners()
}

export function dismissInstall() {
  setPrefs({ installHidden: true })
  renderBanners()
}

export async function promptInstall() {
  const event = shell.installEvent
  if (!event) return false
  event.prompt()
  const choice = await event.userChoice
  shell.installEvent = null
  setPrefs({ installHidden: true })
  renderBanners()
  return choice?.outcome === 'accepted'
}

export function applyUpdate() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload())
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
  } else {
    window.location.reload()
  }
}

function detectPlatform() {
  const source = `${navigator.userAgent} ${navigator.platform || ''}`
  if (/iphone|ipad|ipod/i.test(source)) return 'ios'
  if (/android/i.test(source)) return 'android'
  return 'other'
}

export function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
}

/** `true` si le navigateur est prêt à afficher la boîte d'installation PWA. */
export function canPromptInstall() {
  return Boolean(shell.installEvent)
}

/** `true` si cet appareil est utilisé depuis le téléphone (ou un appareil tactile). */
export function isMobile() {
  return Boolean(window.matchMedia?.('(max-width: 720px)').matches || 'ontouchstart' in window)
}

function installHint() {
  const kind = detectPlatform()
  if (kind === 'ios') return 'Partager → « Sur l’écran d’accueil »'
  if (kind === 'android') return 'Menu ⋮ → « Installer l’application »'
  return 'Ouvrez cette page depuis le navigateur du téléphone'
}

/**
 * Dialogue d'aide à l'installation, avec bouton immédiat quand le
 * navigateur est prêt à installer (beforeinstallprompt).
 */
export function showInstallHelp() {
  const promptable = canPromptInstall()
  const subscript = promptable
    ? isMobile()
      ? 'Installez l’application sur l’écran d’accueil de ce téléphone.'
      : 'Installez l’application sur cet ordinateur pour l’ouvrir depuis le bureau.'
    : platformHelp()
  const dialog = document.createElement('dialog')
  dialog.className = 'dialog dialog--sm'
  dialog.innerHTML = `
    <form method="dialog">
      <div class="dialog-body u-stack">
        <h2>${icon('download', 18)} Installer l’application</h2>
        <p class="u-muted" style="font-size:13px;line-height:1.6">${esc(subscript)}</p>
        <p class="u-muted" style="font-size:12px;line-height:1.55">
          Une fois installée, la liste est disponible comme une vraie application : sans navigateur,
          avec icône sur l’écran, et elle reste consultable hors-ligne. Vos données restent liées à
          votre compte GitHub.
        </p>
      </div>
      <div class="dialog-foot">
        <button type="button" class="btn btn--ghost" data-close>Fermer</button>
        ${promptable ? '<button type="button" class="btn btn--primary" data-dialog-install>Installer maintenant</button>' : ''}
      </div>
    </form>`
  dialog.addEventListener('close', () => dialog.remove())
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close())
  document.body.appendChild(dialog)
  dialog.showModal()
  dialog.querySelector('[data-dialog-install]')?.addEventListener('click', () => {
    dialog.close()
    requestAnimationFrame(() => promptInstall())
  })
}

function platformHelp() {
  const kind = detectPlatform()
  if (kind === 'ios') {
    return `Sur iPhone / iPad : touchez le bouton « Partager » (le carré avec une flèche ↑) dans Safari,
      puis « Sur l’écran d’accueil » → OK.`
  }
  if (kind === 'android') {
    return 'Sur Android : ouvrez le menu ⋮ de Chrome, puis « Installer l’application ».'
  }
  return installHint()
}

export function renderBanners() {
  const region = $('#banners')
  if (!region) return
  const { installHidden } = getPrefs()
  const html = []

  if (shell.updateAvailable) {
    html.push(`
      <aside class="banner banner--ok">
        <span class="banner-mark">${icon('refresh', 15)}</span>
        <div class="banner-text"><strong>Une nouvelle version est prête</strong><span>Rechargez pour profiter des dernières nouveautés.</span></div>
        <button type="button" class="btn btn--primary btn--sm" data-action="apply-update">Recharger</button>
      </aside>`)
  } else if (shell.offlineReady) {
    html.push(`
      <aside class="banner banner--ok">
        <span class="banner-mark">${icon('wifiOff', 15)}</span>
        <div class="banner-text"><strong>Disponible hors-ligne</strong><span>La liste reste consultable sans connexion.</span></div>
        <button type="button" class="icon-btn icon-btn--plain" data-action="hide-offline" aria-label="Masquer">${icon('x', 14)}</button>
      </aside>`)
  }

  if (!isInstalled() && !installHidden && !shell.updateAvailable && !shell.offlineReady) {
    html.push(`
      <aside class="banner banner--install">
        <span class="banner-mark">${icon('download', 16)}</span>
        <div class="banner-text"><strong>Installer l’application</strong><span>${esc(installHint())}</span></div>
        ${shell.installEvent ? '<button type="button" class="btn btn--primary btn--sm" data-action="install-app">Installer</button>' : ''}
        <button type="button" class="icon-btn icon-btn--plain" data-action="hide-install" aria-label="Masquer l’invite">${icon('x', 14)}</button>
      </aside>`)
  }

  region.innerHTML = html.join('')
}

export function hideOfflineNotice() {
  shell.offlineReady = false
  renderBanners()
}

/* Rendu global ---------------------------------------------------- */

export function renderChrome() {
  renderNav()
  renderSyncPill()
  renderBanners()
  const installBtn = $('#install-btn')
  if (installBtn) installBtn.hidden = isInstalled()
}