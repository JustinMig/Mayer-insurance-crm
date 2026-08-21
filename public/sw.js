self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', event => {
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

self.addEventListener('notificationclick', event => {
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
