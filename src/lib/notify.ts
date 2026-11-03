/** Notifikasi browser & sinkronisasi berkala untuk pengingat harian. */
import { evaluateReminder, markReminded, REMINDER_TAG } from './reminderCheck'

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

const iconUrl = () => `${import.meta.env.BASE_URL}pwa-192x192.png`

export async function showNotification(title: string, body: string) {
  if (notificationPermission() !== 'granted') return false
  const options: NotificationOptions = {
    body,
    icon: iconUrl(),
    badge: iconUrl(),
    tag: REMINDER_TAG,
    data: { url: `${import.meta.env.BASE_URL}#/belajar/semua` },
  }
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) {
      await reg.showNotification(title, options)
      return true
    }
  } catch {
    /* lanjut ke Notification biasa */
  }
  try {
    const n = new Notification(title, options)
    n.onclick = () => {
      window.focus()
      window.location.hash = '/belajar/semua'
      n.close()
    }
    return true
  } catch {
    return false
  }
}

/** Periksa & kirim pengingat bila waktunya (dipanggil berkala selama aplikasi terbuka). */
export async function checkReminderNow() {
  if (notificationPermission() !== 'granted') return
  const now = new Date()
  const decision = await evaluateReminder(now)
  if (!decision.notify) return
  await markReminded(now)
  await showNotification(decision.title, decision.body)
}

interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval: number }): Promise<void>
  unregister(tag: string): Promise<void>
  getTags(): Promise<string[]>
}

/**
 * Daftarkan Periodic Background Sync (Chrome/Edge, PWA terpasang) agar pengingat
 * tetap bisa muncul walau aplikasi tertutup. Mengembalikan true bila berhasil.
 */
export async function setupBackgroundReminder(enabled: boolean): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const periodic = (reg as ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }).periodicSync
    if (!periodic) return false
    if (!enabled) {
      await periodic.unregister(REMINDER_TAG)
      return false
    }
    const status = await navigator.permissions
      .query({ name: 'periodic-background-sync' as PermissionName })
      .catch(() => null)
    if (status && status.state !== 'granted') return false
    await periodic.register(REMINDER_TAG, { minInterval: 60 * 60 * 1000 })
    return true
  } catch {
    return false
  }
}
