const CACHE = 'mayer-crm-shell-v3'
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

  // Never intercept authenticated CRM navigation. This avoids stale/login fallbacks
  // on Dashboard, Client Records, Medicare Plan Finder, forms, and account pages.
  if (url.pathname !== '/' && url.pathname !== '/login') return

  event.respondWith(fetch(event.request).catch(() => caches.match('/login')))
})
