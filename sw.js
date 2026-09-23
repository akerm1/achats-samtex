/* ------------------------------------------------------------------ */
/* Service worker — coquille hors-ligne (v6.1)                         */
/*  - navigation : réseau d'abord, repli sur le cache                  */
/*  - fichiers locaux : cache d'abord + mise à jour en arrière-plan    */
/*  - polices : cache dédié                                          */
/* ------------------------------------------------------------------ */

const VERSION = 'mes-achats-v6.1'
const CACHE = `${VERSION}-shell`
const FONT_CACHE = `${VERSION}-fonts`

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
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
  'js/data/seed.js',
  'js/ui/icons.js',
  'js/ui/shell.js',
  'js/ui/view.js',
  'js/ui/product-card.js',
  'js/ui/product-form.js',
  'js/ui/views/home.js',
  'js/ui/views/list.js',
  'js/ui/views/market.js',
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
      .catch(() => undefined),
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

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached || network
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
    event.respondWith(staleWhileRevalidate(request))
  }
})