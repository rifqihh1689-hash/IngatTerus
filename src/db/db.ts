/**
 * Basis data lokal (IndexedDB) via Dexie. Modul ini juga dipakai service
 * worker untuk pengingat, jadi jangan mengimpor apa pun yang bergantung DOM.
 *
 * Sinkronisasi: setiap perubahan lokal pada tabel yang disinkron ditandai
 * `_dirty = 1` (beserta `_mtime`) lewat hook Dexie, lalu dikirim ke cloud oleh
 * mesin sinkron. Penghapusan dicatat di tabel `tombstones`. Perubahan yang
 * datang DARI cloud ditulis di dalam "transaksi sinkron" sehingga tidak
 * ditandai ulang.
 */
import Dexie, { type EntityTable, type Transaction } from 'dexie'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Card,
  type Deck,
  type QuizResult,
  type ReviewLog,
  type SettingRow,
  type Tombstone,
} from '../types'

export type IngatDB = Dexie & {
  decks: EntityTable<Deck, 'id'>
  cards: EntityTable<Card, 'id'>
  reviewLogs: EntityTable<ReviewLog, 'id'>
  quizResults: EntityTable<QuizResult, 'id'>
  settings: EntityTable<SettingRow, 'key'>
  tombstones: EntityTable<Tombstone, 'key'>
}

export const DB_NAME = 'ingatterus'

/** Tabel yang disinkron antar perangkat. */
export const SYNC_TABLES = ['decks', 'cards', 'reviewLogs', 'quizResults', 'settings'] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

/** Pengaturan yang ikut disinkron (sisanya khusus perangkat, mis. jam pengingat). */
export const SYNCED_SETTING_KEYS: ReadonlySet<string> = new Set<keyof AppSettings>([
  'newPerDay',
  'desiredRetention',
  'maxInterval',
  'fsrsParams',
  'optimizedAt',
  'optimizedReviews',
  'optimizedLossBefore',
  'optimizedLossAfter',
])

/** Bidang isi kartu; perubahan jadwal saja tidak perlu dikirim karena dihitung ulang dari riwayat. */
export const CARD_CONTENT_FIELDS: ReadonlySet<string> = new Set([
  'front',
  'back',
  'frontImage',
  'backImage',
  'deckId',
  'createdAt',
  'updatedAt',
  'resetAt',
])

const SYNC_FLAG = '__ingatterusSync'

type FlaggedTx = Transaction & { [SYNC_FLAG]?: boolean; parent?: FlaggedTx }

export function isSyncTransaction(tx: Transaction | null | undefined): boolean {
  for (let t = tx as FlaggedTx | undefined; t; t = t.parent) if (t[SYNC_FLAG]) return true
  return false
}

let mtimeSeq = 0
/** Penanda waktu modifikasi yang unik & naik (µs semu). */
export function nextMtime(): number {
  mtimeSeq = (mtimeSeq + 1) % 1000
  return Date.now() * 1000 + mtimeSeq
}

type ChangeListener = () => void
const changeListeners = new Set<ChangeListener>()
/** Dipanggil setelah ada perubahan lokal yang perlu disinkron. */
export function onLocalChange(fn: ChangeListener): () => void {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}
function notifyChange() {
  if (changeListeners.size) setTimeout(() => changeListeners.forEach((l) => l()), 0)
}

function installSyncHooks(instance: IngatDB) {
  for (const name of SYNC_TABLES) {
    const table = instance.table(name)
    const tracked = (obj: Record<string, unknown>) => name !== 'settings' || SYNCED_SETTING_KEYS.has(String(obj.key))

    table.hook('creating', (_pk, obj: Record<string, unknown>, tx) => {
      if (isSyncTransaction(tx) || !tracked(obj)) return
      obj._dirty = 1
      obj._mtime = nextMtime()
      notifyChange()
    })

    table.hook('updating', (mods: object, _pk, obj: Record<string, unknown>, tx) => {
      if (isSyncTransaction(tx) || !tracked(obj)) return undefined
      const keys = Object.keys(mods)
      if (keys.every((k) => k.startsWith('_'))) return undefined // perubahan internal sinkron
      if (name === 'cards' && !keys.some((k) => CARD_CONTENT_FIELDS.has(k))) return undefined // jadwal saja
      notifyChange()
      return { _dirty: 1, _mtime: nextMtime() }
    })
  }
}

export function createDB(name: string = DB_NAME): IngatDB {
  const instance = new Dexie(name) as IngatDB
  instance.version(1).stores({
    decks: 'id, name, createdAt',
    cards: 'id, deckId, due, state, createdAt, [deckId+state]',
    reviewLogs: 'id, cardId, deckId, reviewedAt, day',
    quizResults: 'id, deckId, takenAt, day',
    settings: 'key',
  })
  instance.version(2).stores({
    decks: 'id, name, createdAt, _dirty',
    cards: 'id, deckId, due, state, createdAt, [deckId+state], _dirty',
    reviewLogs: 'id, cardId, deckId, reviewedAt, day, _dirty',
    quizResults: 'id, deckId, takenAt, day, _dirty',
    settings: 'key, _dirty',
    tombstones: 'key, _dirty',
  })
  installSyncHooks(instance)
  return instance
}

export const db = createDB()

/** Jalankan `fn` dalam transaksi sinkron: penulisan di dalamnya tidak ditandai untuk dikirim. */
export function syncTransaction<T>(database: IngatDB, fn: () => Promise<T>): Promise<T> {
  const tables = [...SYNC_TABLES.map((t) => database.table(t)), database.tombstones]
  return database.transaction('rw', tables, async (tx) => {
    ;(tx as FlaggedTx)[SYNC_FLAG] = true
    return fn()
  })
}

/** Catat penghapusan agar ikut terhapus di perangkat lain. Panggil di dalam transaksi yang mencakup `tombstones`. */
export async function addTombstones(database: IngatDB, table: SyncTable, ids: readonly string[], now = Date.now()) {
  if (!ids.length) return
  await database.tombstones.bulkPut(ids.map((id) => ({ key: `${table}:${id}`, table, id, deletedAt: now, _dirty: 1 })))
  notifyChange()
}

export async function getSettings(database: IngatDB = db): Promise<AppSettings> {
  const rows = await database.settings.toArray()
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const row of rows) if (row.key in DEFAULT_SETTINGS) out[row.key] = row.value
  return out as unknown as AppSettings
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
  database: IngatDB = db,
): Promise<void> {
  await database.settings.put({ key, value, updatedAt: Date.now() })
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
