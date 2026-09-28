/* ------------------------------------------------------------------ */
/* Service worker — lecture des fichiers, jamais leur stockage          */
/*                                                                     */
/*  - une seule règle : le réseau d'abord, pour tout le site            */
/*  - aucun cache de code (donc aucun mélange de versions possible)    */
/*  - garde le mode hors-ligne, avec un repli explicite et limited      */
/*                                                                     */
/* La mise à jour de l'application ne passe pas par ici : elle est     */
/* pilotée par `version.json` et le bouton des Réglages (voir           */
/* `js/core/update.js`).                                                */
/* ------------------------------------------------------------------ */

const VERSION = 'mes-achats-v7.1.0'

/* Repli hors-ligne : juste de quoi afficher l'écran d'attente. */
const FALLBACK_URLS = ['./', 'index.html', 'css/tokens.css', 'css/base.css', 'css/layout.css', 'css/components.css', 'css/views.css', 'js/main.js']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      /* Seul le repli hors-ligne est mis en cache ; le code, lui, ne l'est pas. */
      .then((store) => store.addAll(FALLBACK_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

/**
 * Réseau d'abord, repli sur le cache si — et seulement si — le réseau
 * échoue. Rien n'est mis en cache quand le réseau répond : un fichier
 * périmé ne peut donc plus être resservi.
 */
async function networkFirst(request, { cache = false } = {}) {
  try {
    return await fetch(request)
  } catch (error) {
    if (!cache) throw error
    const store = await caches.open(VERSION)
    const cached = await store.match(request, { ignoreSearch: true })
    if (cached) return cached
    throw error
  }
}

/* Hors-ligne : la dernière page connue, servie depuis le cache local. */
async function offlinePage() {
  const store = await caches.open(VERSION)
  for (const url of ['./', 'index.html']) {
    const cached = await store.match(url)
    if (cached) return cached
  }
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Hors ligne</title>' +
      '<body style="font:16px system-ui;padding:2rem;max-width:32rem;margin:auto">' +
      '<h1>Hors ligne</h1><p>Connectez-vous à Internet, puis rechargez la page : ' +
      'vos produits sont conservés sur cet appareil.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

async function handleNavigation(request) {
  try {
    return await fetch(request)
  } catch {
    const store = await caches.open(VERSION)
    const cached = await store.match(request, { ignoreSearch: true })
    return cached || offlinePage()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  /* Les images et polices ne changent pas d'une version à l'autre : elles
     restent en cache pour ne pas dépendre du réseau à chaque icône. */
  if (/\.(?:png|svg|ico|webp|jpe?g|gif|woff2?)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request, { cache: true }))
    return
  }

  /* Code et données : jamais de cache. */
  event.respondWith(networkFirst(request))
})
