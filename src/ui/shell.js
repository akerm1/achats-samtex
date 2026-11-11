/* ------------------------------------------------------------------ */
/* Coquille — rail, barre haute, dock, bandeaux, pastilles de sync     */
/*                                                                      */
/* Une seule navigation par taille d'écran :                           */
/*   ≥ 1024 px  le rail vertical porte les quatre écrans, les          */
/*              réglages et la synchronisation ;                        */
/*   < 1024 px  la barre haute porte le titre et la sync, le dock       */
/*              flottant porte les quatre écrans, le FAB ajoute.        */
/* ------------------------------------------------------------------ */

import { $, esc, formatRelative } from '../core/utils.js'
import { isUpdateAvailable } from '../core/update.js'
import { icon } from './icons.js'
import { getPrefs, getState, setPrefs, setSyncMessage, statusLabel } from '../data/store.js'

/* Les quatre écrans du dock et du rail. Les réglages vivent à part,
   dans le pied du rail et dans la barre haute : cinq onglets égaux
   tassaient les libellés sur téléphone. */
export const NAV_ITEMS = [
  { route: 'liste', label: 'Liste', short: 'Liste', icon: 'cart' },
  { route: 'factures', label: 'Factures', short: 'Factures', icon: 'imagePlus' },
  { route: 'depenses', label: 'Dépenses', short: 'Dépenses', icon: 'creditCard' },
  { route: 'analyse', label: 'Analyse', short: 'Analyse', icon: 'analysis' },
]

const SETTINGS_ITEM = { route: 'reglages', label: 'Réglages', short: 'Réglages', icon: 'sliders' }

/* Le bouton flottant suit l'écran : il ajoute ce que l'on regarde. */
const FAB_CONFIG = {
  liste: { label: 'Ajouter un produit', icon: 'plus' },
  factures: { label: 'Ajouter une facture', icon: 'plus' },
  depenses: { label: 'Ajouter une dépense', icon: 'plus' },
  analyse: { label: 'Saisir une recette', icon: 'plus' },
}

const shell = {
  activeRoute: 'liste',
  installEvent: null,
  updateAvailable: false,
  offlineReady: false,
  syncErrorDismissed: null,
}

/** `true` quand la version publiée sur GitHub est plus récente que la nôtre. */
export { isUpdateAvailable }

/* Navigation ------------------------------------------------------- */

export function setActiveRoute(route) {
  shell.activeRoute = route
  renderNav()
}

function activeItem() {
  return (
    NAV_ITEMS.find((item) => item.route === shell.activeRoute) ||
    (shell.activeRoute === SETTINGS_ITEM.route ? SETTINGS_ITEM : null)
  )
}

function railLink(item) {
  const active = item.route === shell.activeRoute
  return `
    <a class="rail-link ${active ? 'is-active' : ''}" href="#/${item.route}"
       aria-current="${active ? 'page' : 'false'}">
      ${icon(item.icon, 17)}<span>${esc(item.label)}</span>
    </a>`
}

function dockTab(item) {
  const active = item.route === shell.activeRoute
  const { pendingCount } = getState()
  const badge =
    item.route === 'liste' && pendingCount ? `<span class="tab-badge">${pendingCount}</span>` : ''
  return `
    <a class="tab ${active ? 'is-active' : ''}" href="#/${item.route}"
       aria-current="${active ? 'page' : 'false'}" aria-label="${esc(item.label)}">
      <span class="tab-icon">${icon(item.icon, 21)}</span>
      <span class="tab-label">${esc(item.short || item.label)}</span>${badge}
    </a>`
}

function renderNav() {
  const current = activeItem()

  const title = document.getElementById('screen-title')
  if (title) title.textContent = current ? current.label : ''
  document.title = current ? `${current.label} — Mes achats` : 'Mes achats'

  const rail = $('#rail-nav')
  if (rail) rail.innerHTML = NAV_ITEMS.map(railLink).join('')

  /* Les réglages sont un lien fixe du pied de rail : on ne repeint que
     son état actif. */
  document.querySelectorAll('.rail-foot [data-route="reglages"]').forEach((link) => {
    const active = shell.activeRoute === 'reglages'
    link.classList.toggle('is-active', active)
    link.setAttribute('aria-current', active ? 'page' : 'false')
  })

  const dock = $('#dock-inner')
  if (dock) dock.innerHTML = NAV_ITEMS.map(dockTab).join('')

  renderFab()
}

/** Le bouton flottant et le bouton du rail changent de libellé — et
    disparaissent sur les Réglages. Sans cela, un grand écran n'avait
    aucun moyen d'ajouter une dépense, une facture ou une recette. */
function renderFab() {
  const config = FAB_CONFIG[shell.activeRoute]
  const label = config ? config.label : ''

  const fab = $('#fab')
  if (fab) {
    fab.hidden = !config
    if (config) {
      fab.dataset.action = 'fab-add'
      fab.setAttribute('aria-label', label)
      fab.title = label
    }
  }

  const railAdd = $('#rail-add')
  if (railAdd) {
    railAdd.hidden = !config
    if (config) {
      railAdd.dataset.action = 'fab-add'
      railAdd.setAttribute('aria-label', label)
      railAdd.title = label
      const text = $('#rail-add-label')
      if (text) text.textContent = label
      /* « N » n'ouvre un produit que sur la Liste. */
      const kbd = railAdd.querySelector('kbd')
      if (kbd) kbd.hidden = shell.activeRoute !== 'liste'
    }
  }
}

/* Pastilles de synchronisation ------------------------------------- */

/* Six états, un style chacun : le statut porte déjà la couleur de l'erreur,
   la pastille n'a plus besoin de deviner. */
const PILL_CLASSES = {
  ready: 'is-ready',
  connecting: 'is-syncing',
  saving: 'is-syncing',
  offline: 'is-offline',
  error: 'is-error',
  local: 'is-config',
}

function syncTitle() {
  const { isConfigured, lastSyncAt, message } = getState()
  return [
    isConfigured ? 'Liste partagée via GitHub' : 'Liste locale — configurez GitHub dans Réglages',
    message ? `⚠ ${message}` : '',
    lastSyncAt ? `Dernier rafraîchissement : ${formatRelative(lastSyncAt)}` : '',
    'Cliquez pour actualiser la liste depuis GitHub',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function renderSyncPill() {
  const { status, lastSyncAt } = getState()
  const stateClass = PILL_CLASSES[status] || 'is-config'
  const title = syncTitle()

  const card = $('#sync-card')
  if (card) {
    card.className = `sync-card ${stateClass}`
    card.innerHTML = `<span class="sync-card-head">${esc(statusLabel(status))}</span>
      <small>${lastSyncAt ? esc(formatRelative(lastSyncAt)) : 'Liste locale'}</small>`
    card.title = title
  }

  const mini = $('#sync-mini')
  if (mini) {
    mini.className = `sync-mini ${stateClass}`
    mini.title = title
    mini.setAttribute('aria-label', `Synchronisation : ${statusLabel(status)}`)
  }
}

/* Bandeaux -------------------------------------------------------- */

export function setInstallEvent(event) {
  shell.installEvent = event
  renderBanners()
  renderInstallButton()
}

export function setUpdateAvailable(value) {
  const changed = shell.updateAvailable !== Boolean(value)
  shell.updateAvailable = Boolean(value)
  renderBanners()
  /* Le bandeau vert ne s'affiche que s'il reste de la place : on prévient aussi
     la ligne d'état, pour que le bouton des Réglages bascule en « Installer ». */
  if (changed && shell.updateAvailable) {
    setSyncMessage('Nouvelle version en ligne — « Installer la mise à jour » recharge l\'application.', 'ok')
  }
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
  renderInstallButton()
  return choice?.outcome === 'accepted'
}

function detectPlatform() {
  const source = `${navigator.userAgent} ${navigator.platform || ''}`
  if (/iphone|ipad|ipod/i.test(source)) return 'ios'
  if (/android/i.test(source)) return 'android'
  return 'other'
}

export function isInstalled() {
  /* Voir `js/core/theme.js` : `?.()` seul ne protège pas la lecture qui suit. */
  return window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true
}

/** `true` si le navigateur est prêt à afficher la boîte d'installation PWA. */
export function canPromptInstall() {
  return Boolean(shell.installEvent)
}

/** `true` si cet appareil est utilisé depuis le téléphone (ou un appareil tactile). */
export function isMobile() {
  return Boolean(window.matchMedia?.('(max-width: 720px)')?.matches || 'ontouchstart' in window)
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
  const { isConfigured, status, message, messageKind, unpublished } = getState()
  const html = []

  /* Des modifications existent sur cet appareil mais la source connectée ne
     peut pas les recevoir : sans cet avertissement, l'application installée
     et le site afficheraient deux listes différentes sans explication. */
  if (unpublished) {
    html.push(`
      <aside class="banner banner--warn">
        <span class="banner-mark">${icon('upload', 15)}</span>
        <div class="banner-text">
          <strong>Modifications non publiées</strong>
          <span>Elles sont sur cet appareil uniquement : collez votre lien privé dans les Réglages pour les partager.</span>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/reglages">Réglages</a>
      </aside>`)
  }

  /* Un jeton refusé (ou un dépôt inaccessible) doit être visible sans
     survol de la souris : la pastille devient un point sur les téléphones.
     Hors ligne, on propose de réessayer plutôt que d'ouvrir les Réglages. */
  if (isConfigured && messageKind === 'error' && message && message !== shell.syncErrorDismissed) {
    const offline = status === 'offline'
    html.push(`
      <aside class="banner banner--error">
        <span class="banner-mark">${icon(offline ? 'wifiOff' : 'alert', 15)}</span>
        <div class="banner-text">
          <strong>${offline ? 'Hors ligne' : 'Synchronisation impossible'}</strong>
          <span>${esc(message)}</span>
        </div>
        ${
          offline
            ? '<button type="button" class="btn btn--ghost btn--sm" data-action="sync-now">Réessayer</button>'
            : '<a class="btn btn--ghost btn--sm" href="#/reglages">Corriger</a>'
        }
        <button type="button" class="icon-btn icon-btn--plain" data-action="hide-sync-error" aria-label="Masquer">${icon('x', 14)}</button>
      </aside>`)
  }

  if (shell.updateAvailable) {
    html.push(`
      <aside class="banner banner--ok">
        <span class="banner-mark">${icon('refresh', 15)}</span>
        <div class="banner-text"><strong>Une nouvelle version est en ligne</strong><span>Installez-la depuis Réglages → Mise à jour de l'application.</span></div>
        <a class="btn btn--primary btn--sm" href="#/reglages">Installer</a>
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

/** Masque le bandeau d'erreur ; il réapparaîtra si le message change. */
export function dismissSyncError() {
  shell.syncErrorDismissed = getState().message || ''
  renderBanners()
}

/* Rendu global ---------------------------------------------------- */

/** Le bouton d'installation du rail n'apparaît que s'il peut servir. */
function renderInstallButton() {
  const installBtn = $('#install-btn')
  if (!installBtn) return
  installBtn.hidden = isInstalled() || !(canPromptInstall() || isMobile())
}

export function renderChrome() {
  renderNav()
  renderSyncPill()
  renderBanners()
  renderInstallButton()
}
