/** Pendaftaran service worker & status pembaruan aplikasi. */
import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

let needRefresh = false
let offlineReady = false
let updateFn: ((reload?: boolean) => Promise<void>) | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function initPWA() {
  if (!('serviceWorker' in navigator)) return
  updateFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true
      emit()
    },
    onOfflineReady() {
      offlineReady = true
      emit()
      window.setTimeout(() => {
        offlineReady = false
        emit()
      }, 4000)
    },
  })
}

export function applyUpdate() {
  void updateFn?.(true)
}

export function dismissPWA() {
  needRefresh = false
  offlineReady = false
  emit()
}

let snapshot = { needRefresh, offlineReady }
export function usePWAStatus() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => {
      if (snapshot.needRefresh !== needRefresh || snapshot.offlineReady !== offlineReady) snapshot = { needRefresh, offlineReady }
      return snapshot
    },
  )
}

/* ---------- Tombol "Pasang aplikasi" (beforeinstallprompt) ---------- */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let installEvent: BeforeInstallPromptEvent | null = null
const installListeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e as BeforeInstallPromptEvent
    installListeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    installListeners.forEach((l) => l())
  })
}

export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (cb) => {
      installListeners.add(cb)
      return () => installListeners.delete(cb)
    },
    () => installEvent != null,
  )
}

export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false
  await installEvent.prompt()
  const { outcome } = await installEvent.userChoice
  installEvent = null
  installListeners.forEach((l) => l())
  return outcome === 'accepted'
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
