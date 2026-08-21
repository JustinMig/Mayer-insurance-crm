const CACHE = 'mayer-crm-shell-v4'
const SHELL = ['/login']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ])
  )
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

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = payload.title || 'Mayer CRM'
  const options = {
    body: payload.body || 'New CRM notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'mayer-crm-notification',
    renotify: true,
    data: { url: payload.url || '/notifications' },
  }

  const tasks = [self.registration.showNotification(title, options)]
  const badgeValue = Number(payload.badge || 0)
  if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
    tasks.push(badgeValue > 0 ? self.navigator.setAppBadge(badgeValue) : self.navigator.clearAppBadge())
  }

  event.waitUntil(Promise.all(tasks))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetPath = event.notification?.data?.url || '/notifications'
  const targetUrl = new URL(targetPath, self.location.origin).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        if ('navigate' in client) await client.navigate(targetUrl).catch(() => undefined)
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    return undefined
  })())
})
