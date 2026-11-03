/**
 * Backend Firestore + masuk dengan Google. Modul ini dimuat secara lazy (dynamic
 * import) hanya bila sinkron dipakai, agar aplikasi tetap ringan.
 *
 * Struktur data: users/{uid}/records/{tabel}:{id}
 *   { t: tabel, i: id, d: data | null, del: boolean, s: serverTimestamp }
 */
import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import {
  Timestamp,
  collection,
  connectFirestoreEmulator,
  doc,
  getDocsFromServer,
  initializeFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore'
import type { FirebaseWebConfig } from './config'
import type { OutgoingRecord, RemoteRecord, SyncBackend } from './backend'
import type { SyncTable } from '../db/db'

const PAGE = 500
const REDIRECT_FLAG = 'ingatterus-auth-redirect'
/** Batas aman per batch (Firestore: maks 500 operasi & ±10 MB per permintaan). */
const BATCH_OPS = 400
const BATCH_BYTES = 8_000_000
/** Dokumen Firestore maksimal 1 MiB; gambar dibuang bila kartu terlalu besar. */
const DOC_BYTES = 950_000

export class FirestoreBackend implements SyncBackend {
  constructor(
    private readonly fs: Firestore,
    private readonly uid: string,
  ) {}

  private col() {
    return collection(this.fs, 'users', this.uid, 'records')
  }

  async pull(since: number): Promise<RemoteRecord[]> {
    const out: RemoteRecord[] = []
    let last: QueryDocumentSnapshot | null = null
    for (;;) {
      const after = Timestamp.fromMillis(since)
      const q: Query = last
        ? query(this.col(), where('s', '>', after), orderBy('s'), startAfter(last), limit(PAGE))
        : query(this.col(), where('s', '>', after), orderBy('s'), limit(PAGE))
      const snap: QuerySnapshot = await getDocsFromServer(q)
      for (const d of snap.docs) {
        const v = d.data() as { t: SyncTable; i: string; d: Record<string, unknown> | null; del: boolean; s: Timestamp | null }
        out.push({ table: v.t, id: v.i, data: v.del ? null : v.d, serverTime: v.s ? v.s.toMillis() : Date.now() })
      }
      if (snap.size < PAGE) break
      last = snap.docs[snap.docs.length - 1]
    }
    return out
  }

  async push(records: readonly OutgoingRecord[]): Promise<void> {
    let batch = writeBatch(this.fs)
    let ops = 0
    let bytes = 0
    for (const r of records) {
      let data = r.data
      let size = data ? JSON.stringify(data).length : 0
      if (data && size > DOC_BYTES) {
        // kartu dengan gambar sangat besar: kirim tanpa gambar daripada gagal total
        const { frontImage: _f, backImage: _b, ...rest } = data
        data = { ...rest, imagesOmitted: true }
        size = JSON.stringify(data).length
      }
      if (ops >= BATCH_OPS || bytes + size > BATCH_BYTES) {
        await batch.commit()
        batch = writeBatch(this.fs)
        ops = 0
        bytes = 0
      }
      batch.set(doc(this.col(), `${r.table}:${r.id}`), { t: r.table, i: r.id, d: data, del: data == null, s: serverTimestamp() })
      ops++
      bytes += size
    }
    if (ops) await batch.commit()
  }

  async hasData(): Promise<boolean> {
    const snap = await getDocsFromServer(query(this.col(), limit(1)))
    return !snap.empty
  }
}

export interface FirebaseSession {
  onUser(cb: (user: User | null) => void): () => void
  signIn(): Promise<void>
  signOut(): Promise<void>
  completeRedirect(): Promise<void>
  backendFor(uid: string): SyncBackend
}

export function createSession(config: FirebaseWebConfig, emulator: boolean): FirebaseSession {
  const app = initializeApp(config)
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  })
  auth.languageCode = 'id'
  const fs = initializeFirestore(app, {})
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(fs, '127.0.0.1', 8080)
  }
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })

  return {
    onUser: (cb) => onAuthStateChanged(auth, cb),
    async signIn() {
      if (emulator) {
        // Emulator: akun Google tiruan (token JSON tanpa tanda tangan, khusus Auth Emulator)
        const email = localStorage.getItem('ingatterus-emulator-user') || 'pelajar@example.com'
        const token = JSON.stringify({ sub: `uid-${email}`, email, email_verified: true, name: 'Pelajar Uji' })
        await signInWithCredential(auth, GoogleAuthProvider.credential(token))
        return
      }
      try {
        // dipanggil langsung dari klik agar popup tidak diblokir peramban
        await signInWithPopup(auth, provider)
      } catch (err) {
        const code = (err as { code?: string }).code
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          sessionStorage.setItem(REDIRECT_FLAG, '1')
          await signInWithRedirect(auth, provider)
          return
        }
        throw err
      }
    },
    signOut: () => signOut(auth),
    async completeRedirect() {
      if (!sessionStorage.getItem(REDIRECT_FLAG)) return
      sessionStorage.removeItem(REDIRECT_FLAG)
      try {
        await getRedirectResult(auth)
      } catch {
        /* tidak ada alur redirect yang tertunda */
      }
    },
    backendFor: (uid) => new FirestoreBackend(fs, uid),
  }
}
