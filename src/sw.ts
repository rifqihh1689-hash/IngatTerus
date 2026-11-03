/// <reference lib="webworker" />
/**
 * Service worker IngatTerus: cache offline (Workbox precache) + pengingat
 * belajar lewat Periodic Background Sync dan klik notifikasi.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { evaluateReminder, markReminded, REMINDER_TAG } from './lib/reminderCheck'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> }

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting()
})

interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string
}

async function remind() {
  const now = new Date()
  const decision = await evaluateReminder(now)
  if (!decision.notify) return
  await markReminded(now)
  const icon = new URL('pwa-192x192.png', self.registration.scope).href
  await self.registration.showNotification(decision.title, {
    body: decision.body,
    icon,
    badge: icon,
    tag: REMINDER_TAG,
    data: { url: `${self.registration.scope}#/belajar/semua` },
  })
}

self.addEventListener('periodicsync' as keyof ServiceWorkerGlobalScopeEventMap, (event) => {
  const e = event as unknown as PeriodicSyncEvent
  if (e.tag === REMINDER_TAG) e.waitUntil(remind())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target: string = event.notification.data?.url ?? self.registration.scope
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if (client.url.startsWith(self.registration.scope)) {
          await client.focus()
          if ('navigate' in client) await (client as WindowClient).navigate(target).catch(() => undefined)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
