/**
 * Pengelola sinkron di aplikasi: status masuk Google, keputusan saat pertama kali
 * menghubungkan perangkat, dan pemicu sinkron otomatis (setelah perubahan, saat
 * kembali online/aktif, dan berkala).
 */
import { useSyncExternalStore } from 'react'
import { db, getSettings, onLocalChange } from '../db/db'
import { FIREBASE_CONFIG, FIREBASE_EMULATOR, SYNC_CONFIGURED } from './config'
import { connectDevice, disconnectDevice, suggestConnectMode, syncOnce, type ConnectMode } from './engine'
import type { SyncBackend } from './backend'
import type { FirebaseSession } from './firebase'

export type SyncPhase =
  | 'unconfigured' // pemilik aplikasi belum memasang Firebase
  | 'loading'
  | 'signed-out'
  | 'choose' // perangkat & cloud sama-sama berisi data → tanya pengguna
  | 'syncing'
  | 'idle'
  | 'offline'
  | 'error'

export interface SyncUser {
  uid: string
  email: string | null
  name: string | null
  photo: string | null
}

export interface SyncStatus {
  phase: SyncPhase
  user: SyncUser | null
  lastSyncAt: number | null
  error: string | null
}

let status: SyncStatus = { phase: SYNC_CONFIGURED ? 'loading' : 'unconfigured', user: null, lastSyncAt: null, error: null }
const listeners = new Set<() => void>()
function update(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => status,
  )
}

export const getSyncStatus = () => status

let session: FirebaseSession | null = null
let backend: SyncBackend | null = null
let subscribed = false
let running = false
let queued = false
let debounce: ReturnType<typeof setTimeout> | undefined
let triggersInstalled = false

const AUTO_SYNC_DELAY = 3000
const PERIODIC_MS = 2 * 60_000

function message(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/popup-closed-by-user': 'Jendela masuk ditutup sebelum selesai.',
    'auth/cancelled-popup-request': 'Proses masuk dibatalkan.',
    'auth/unauthorized-domain': 'Domain aplikasi belum diizinkan di Firebase (Authentication → Settings → Authorized domains).',
    'auth/network-request-failed': 'Tidak ada koneksi internet.',
    'auth/operation-not-allowed': 'Login Google belum diaktifkan di Firebase (Authentication → Sign-in method).',
    'permission-denied': 'Akses ditolak oleh Firestore. Pastikan aturan (rules) sudah dipasang.',
    unavailable: 'Server sinkron tidak terjangkau. Akan dicoba lagi.',
    'failed-precondition': 'Firestore belum dibuat di proyek Firebase.',
  }
  const key = code.replace(/^firestore\//, '')
  return map[code] ?? map[key] ?? (err instanceof Error ? err.message : 'Terjadi kesalahan saat sinkron.')
}

async function loadSession(): Promise<FirebaseSession> {
  if (!session) {
    const mod = await import('./firebase')
    session = mod.createSession(FIREBASE_CONFIG!, FIREBASE_EMULATOR)
  }
  return session
}

function installTriggers() {
  if (triggersInstalled || typeof window === 'undefined') return
  triggersInstalled = true
  onLocalChange(() => scheduleSync(AUTO_SYNC_DELAY))
  window.addEventListener('online', () => scheduleSync(500))
  window.addEventListener('offline', () => backend && update({ phase: 'offline' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(300)
  })
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, PERIODIC_MS)
}

async function subscribe() {
  const sess = await loadSession()
  if (subscribed) return
  subscribed = true
  void sess.completeRedirect()
  sess.onUser((user) => {
    void (async () => {
      if (!user) {
        backend = null
        update({ phase: 'signed-out', user: null })
        return
      }
      update({ user: { uid: user.uid, email: user.email, name: user.displayName, photo: user.photoURL } })
      backend = sess.backendFor(user.uid)
      installTriggers()
      const s = await getSettings(db)
      if (s.syncUid === user.uid) {
        update({ phase: 'idle' })
        await syncNow()
      } else {
        await decideConnect(user.uid)
      }
    })()
  })
}

async function decideConnect(uid: string) {
  if (!backend) return
  try {
    update({ phase: 'syncing', error: null })
    const mode = await suggestConnectMode(db, backend)
    if (mode) await runConnect(uid, mode)
    else update({ phase: 'choose' })
  } catch (err) {
    update({ phase: navigator.onLine ? 'error' : 'offline', error: message(err) })
  }
}

async function runConnect(uid: string, mode: ConnectMode) {
  if (!backend) return
  running = true
  update({ phase: 'syncing', error: null })
  try {
    await connectDevice(db, backend, uid, mode)
    update({ phase: 'idle', lastSyncAt: Date.now() })
  } catch (err) {
    update({ phase: navigator.onLine ? 'error' : 'offline', error: message(err) })
  } finally {
    running = false
  }
}

/** Mulai saat aplikasi dibuka. Firebase hanya dimuat bila perangkat ini pernah terhubung. */
export async function initSync() {
  if (!SYNC_CONFIGURED) return
  const s = await getSettings(db)
  update({ lastSyncAt: s.lastSyncAt })
  if (!s.syncUid) {
    update({ phase: 'signed-out' })
    return
  }
  try {
    await subscribe()
  } catch (err) {
    update({ phase: 'error', error: message(err) })
  }
}

/** Muat Firebase lebih awal (mis. saat halaman Pengaturan dibuka) agar klik "Masuk" langsung membuka popup. */
export function prepareSignIn() {
  if (!SYNC_CONFIGURED) return
  void subscribe().catch((err) => update({ error: message(err) }))
}

export async function signInWithGoogle() {
  if (!SYNC_CONFIGURED) return
  update({ error: null })
  try {
    // bila sudah dimuat, popup dibuka tanpa jeda (aktivasi klik pengguna masih berlaku)
    const sess = session ?? (await loadSession())
    void subscribe()
    await sess.signIn()
  } catch (err) {
    update({ phase: status.user ? status.phase : 'signed-out', error: message(err) })
  }
}

/** Pilihan pengguna saat perangkat & cloud sama-sama berisi data. */
export async function chooseConnectMode(mode: 'merge' | 'download') {
  if (!status.user) return
  await runConnect(status.user.uid, mode)
}

export async function signOutSync() {
  try {
    await session?.signOut()
  } finally {
    backend = null
    await disconnectDevice(db)
    update({ phase: 'signed-out', user: null, error: null })
  }
}

function scheduleSync(delay: number) {
  if (!backend) return
  clearTimeout(debounce)
  debounce = setTimeout(() => void syncNow(), delay)
}

/** Sinkronkan sekarang (aman dipanggil berkali-kali). */
export async function syncNow() {
  if (!backend || status.phase === 'choose' || !status.user) return
  if (running) {
    queued = true
    return
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    update({ phase: 'offline' })
    return
  }
  running = true
  update({ phase: 'syncing' })
  try {
    await syncOnce(db, backend)
    update({ phase: 'idle', lastSyncAt: Date.now(), error: null })
  } catch (err) {
    update({ phase: navigator.onLine ? 'error' : 'offline', error: message(err) })
  } finally {
    running = false
    if (queued) {
      queued = false
      scheduleSync(1000)
    }
  }
}
