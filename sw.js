/* ------------------------------------------------------------------ */
/* Service worker — coquille hors-ligne (v6.3.7)                       */
/*  - navigation : réseau d'abord, repli sur le cache                  */
/*  - code (js/css) : réseau d'abord — jamais deux versions mélangées  */
/*  - images et polices : cache d'abord                                */
/*  - hors-ligne : repli sur le cache dans tous les cas               */
/*  - nouvelle version : prise de possession immédiate                */
/* ------------------------------------------------------------------ */

const VERSION = 'mes-achats-v6.3.7'
const CACHE = `${VERSION}-shell`
const FONT_CACHE = `${VERSION}-fonts`

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'sync-defaults.json',
  'css/tokens.css',
  'css/base.css',
  'css/layout.css',
  'css/components.css',
  'css/views.css',
  'js/main.js',
  'js/core/utils.js',
  'js/core/storage.js',
  'js/core/router.js',
  'js/core/theme.js',
  'js/core/feedback.js',
  'js/core/photo.js',
  'js/data/model.js',
  'js/data/colors.js',
  'js/data/github.js',
  'js/data/store.js',
  'js/data/backup.js',
  'js/ui/icons.js',
  'js/ui/shell.js',
  'js/ui/view.js',
  'js/ui/product-card.js',
  'js/ui/product-form.js',
  'js/ui/views/list.js',
  'js/ui/views/settings.js',
  'icons/app-icon.svg',
  'icons/apple-touch-icon-180x180.png',
  'icons/favicon.ico',
  'icons/maskable-icon-512x512.png',
  'icons/pwa-192x192.png',
  'icons/pwa-512x512.png',
  'icons/pwa-64x64.png',
]

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => undefined)
      /* Prise de possession immédiate : sans cela, la version précédente garde
         le contrôle et sert ses fichiers périmés jusqu'à la fermeture de
         l'onglet — l'application ne peut alors pas se mettre à jour elle-même. */
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) cache.put(request, response.clone())
  return response
}

/**
 * Réseau d'abord pour le code.
 *
 * L'application est faite de modules ES : servir un `main.js` récent avec un
 * `shell.js` périmé fait échouer le chargement (« n'exporte pas … »). Un seul
 * jeu de fichiers vient donc toujours du réseau, le cache ne servant qu'en
 * cas de coupure — ce qui reste le rôle du mode hors-ligne.
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw error
  }
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put('index.html', response.clone())
    return response
  } catch {
    return (await cache.match('index.html')) || (await cache.match('./')) || Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, FONT_CACHE))
    return
  }

  if (url.origin === self.location.origin) {
    /* Icônes et images ne changent pas d'une version à l'autre : cache d'abord. */
    if (/\.(?:png|svg|ico|webp|jpe?g|gif)$/i.test(url.pathname)) {
      event.respondWith(cacheFirst(request, CACHE))
      return
    }
    event.respondWith(networkFirst(request))
  }
})