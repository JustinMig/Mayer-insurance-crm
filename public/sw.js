const CACHE = 'mayer-crm-shell-v2'
const SHELL = ['/login']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return

  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  // Authenticated CRM pages should always come from the network. The service worker
  // only provides the cached login shell as an offline fallback for document navigation.
  if (url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/clients')) return

  event.respondWith(
    fetch(event.request).catch(() => caches.match('/login'))
  )
})
