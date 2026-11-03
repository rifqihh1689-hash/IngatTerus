/**
 * Konfigurasi Firebase untuk sinkron antar perangkat.
 *
 * Isi objek FIREBASE_WEB_CONFIG di bawah dengan nilai dari Firebase Console:
 *   Project settings → Your apps → (aplikasi Web) → SDK setup and configuration → Config
 * Nilai-nilai ini memang publik (bukan rahasia); keamanan data dijaga oleh
 * aturan Firestore (firestore.rules) yang hanya mengizinkan pemilik akun.
 *
 * Alternatif tanpa mengubah kode: set variabel build VITE_FIREBASE_CONFIG berisi JSON yang sama.
 */
export interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  storageBucket?: string
  messagingSenderId?: string
}

const FIREBASE_WEB_CONFIG: FirebaseWebConfig | null = null

/** Mode emulator lokal untuk pengujian (VITE_FIREBASE_EMULATOR=1). */
export const FIREBASE_EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === '1'

function isConfig(c: unknown): c is FirebaseWebConfig {
  if (!c || typeof c !== 'object') return false
  const o = c as Record<string, unknown>
  return ['apiKey', 'authDomain', 'projectId', 'appId'].every((k) => typeof o[k] === 'string' && o[k])
}

function fromEnv(): FirebaseWebConfig | null {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isConfig(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const FIREBASE_CONFIG: FirebaseWebConfig | null = FIREBASE_EMULATOR
  ? { apiKey: 'demo-api-key', authDomain: 'demo-ingatterus.firebaseapp.com', projectId: 'demo-ingatterus', appId: 'demo-app' }
  : (fromEnv() ?? FIREBASE_WEB_CONFIG)

export const SYNC_CONFIGURED = FIREBASE_CONFIG != null
