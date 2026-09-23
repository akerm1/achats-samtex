/* ------------------------------------------------------------------ */
/* Routeur — navigation par hash (#/liste, #/marche, …)               */
/* ------------------------------------------------------------------ */

const listeners = new Set()

/** @returns {string} identifiant de vue, chaîne vide si racine. */
export function currentRoute() {
  const raw = String(window.location.hash || '').replace(/^#\/?/, '')
  return raw.split('?')[0].trim()
}

export function currentParams() {
  const raw = String(window.location.hash || '')
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : ''
  return new URLSearchParams(query)
}

export function navigate(route, { replace = false } = {}) {
  const target = `#/${route}`
  if (window.location.hash === target) {
    emit()
    return
  }
  if (replace) window.location.replace(`${window.location.pathname}${window.location.search}${target}`)
  else window.location.hash = target
}

export function onRouteChange(handler) {
  listeners.add(handler)
  return () => listeners.delete(handler)
}

function emit() {
  const route = currentRoute()
  for (const handler of [...listeners]) {
    try {
      handler(route)
    } catch (error) {
      console.error('Erreur de routage :', error)
    }
  }
}

/**
 * Démarre l'écoute du hash.
 * @param {(route: string) => void} [handler] appelé à chaque changement de vue.
 */
export function startRouter(handler) {
  if (typeof handler === 'function') onRouteChange(handler)
  window.addEventListener('hashchange', emit)
  emit()
  return () => window.removeEventListener('hashchange', emit)
}