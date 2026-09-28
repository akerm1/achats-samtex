/* ------------------------------------------------------------------ */
/* Mise à jour de l'application                                        */
/*                                                                     */
/* Le mécanisme est volontairement entier, sans état caché :           */
/*                                                                     */
/*   1. `version.json` est publié à la racine du dépôt sur GitHub      */
/*      Pages. C'est le seul repère de version : on ne compare jamais   */
/*      deux fichiers entre eux.                                        */
/*   2. Au démarrage, puis à chaque clic sur le bouton des Réglages,   */
/*      ce fichier est relu sans cache (`no-store`).                   */
/*   3. Si la version publiée est plus récente, le bouton bascule en    */
/*      « Installer la mise à jour » : c'est l'utilisateur qui clique.  */
/*   4. L'installation vide le cache du service worker, revalide la    */
/*      coquille hors-ligne puis recharge la page. Comme le service    */
/*      worker sert le code « réseau d'abord », tous les fichiers      */
/*      repassent par GitHub : plus aucun mélange de versions.        */
/* ------------------------------------------------------------------ */

import { APP_VERSION } from './app.js'

/* `js/core/update.js` → deux niveaux au-dessus → la racine du dépôt. */
export const VERSION_FILE = new URL('../../version.json', import.meta.url)

const state = {
  published: '',
  releasedAt: '',
  checking: false,
  installing: false,
  offline: false,
  error: '',
}

const listeners = new Set()

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch (error) {
      console.error('Erreur dans un abonné de la mise à jour :', error)
    }
  }
}

/** Compare deux versions « 7.0.0 » ; > 0 si `a` est plus récente que `b`. */
export function compareVersions(a, b) {
  if (!a || !b) return 0
  const left = String(a).split('.').map((part) => Number.parseInt(part, 10) || 0)
  const right = String(b).split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0)
    if (diff) return diff > 0 ? 1 : -1
  }
  return 0
}

export function isUpdateAvailable() {
  return compareVersions(state.published, APP_VERSION) > 0
}

export function getUpdateState() {
  return {
    ...state,
    current: APP_VERSION,
    available: isUpdateAvailable(),
  }
}

/**
 * Relit `version.json` sur GitHub, sans passer par un cache.
 * @returns {Promise<{current:string, published:string, available:boolean, offline:boolean, error:string}>}
 */
export async function checkForUpdate() {
  if (state.checking) return getUpdateState()
  state.checking = true
  emit()
  try {
    const response = await fetch(VERSION_FILE, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    state.published = typeof data?.version === 'string' ? data.version.trim() : ''
    state.releasedAt = typeof data?.releasedAt === 'string' ? data.releasedAt.trim() : ''
    state.offline = false
    state.error = state.published ? '' : 'Fichier de version illisible sur GitHub.'
  } catch (error) {
    state.offline = true
    state.error = 'Impossible de vérifier les mises à jour (hors ligne ?).'
  } finally {
    state.checking = false
    emit()
  }
  return getUpdateState()
}

/** Vide le cache du service worker : plus aucun fichier périmé en mémoire. */
async function clearCaches() {
  if (!('caches' in window)) return
  const keys = await caches.keys()
  await Promise.all(keys.map((key) => caches.delete(key)))
}

/** Force la revalidation de la coquille hors-ligne et sa prise de possession. */
async function refreshServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return
    await registration.update()
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  } catch (error) {
    console.warn('Service worker non revalidé :', error)
  }
}

/**
 * Installe la version publiée : cache vidé, coquille revalidée, page
 * rechargée avec une empreinte dans l'URL (le fichier HTML est ainsi relu
 * même s'il traîne dans le cache du navigateur).
 */
export async function installUpdate() {
  if (state.installing) return
  const { published } = getUpdateState()
  state.installing = true
  emit()
  /* Si la page ne se recharge pas (navigation bloquée), on ne laisse pas le
     bouton désactivé pour toujours. */
  setTimeout(() => {
    state.installing = false
    emit()
  }, 15000)
  await clearCaches()
  await refreshServiceWorker()
  const url = new URL(window.location.href)
  url.searchParams.set('v', `${published || 'manuel'}-${Date.now()}`)
  window.location.replace(url.toString())
}
