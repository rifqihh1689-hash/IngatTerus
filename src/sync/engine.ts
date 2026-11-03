/**
 * Mesin sinkron antar perangkat.
 *
 * Aturan penggabungan (bebas konflik & deterministik, sehingga semua perangkat
 * berakhir dengan data yang sama):
 *  - Riwayat ulasan & hasil kuis: tidak pernah diubah → digabung (union).
 *  - Deck, isi kartu, pengaturan: menang yang `updatedAt`-nya paling baru (LWW).
 *  - Jadwal kartu (state, due, S, D, …) TIDAK dikirim: dihitung ulang dari riwayat
 *    ulasan gabungan dengan FSRS. Belajar di laptop & HP sekaligus tetap benar.
 *  - Penghapusan dikirim sebagai tombstone dan menang atas salinan lama.
 */
import {
  CARD_CONTENT_FIELDS,
  SYNCED_SETTING_KEYS,
  SYNC_TABLES,
  getSettings,
  syncTransaction,
  type IngatDB,
  type SyncTable,
} from '../db/db'
import { paramsFromSettings } from '../db/params'
import { newSchedule, pickSchedule, schedule } from '../lib/fsrs'
import type { Card, ReviewLog, Schedule } from '../types'
import type { OutgoingRecord, RemoteRecord, SyncBackend } from './backend'

/** Tarik ulang sedikit ke belakang untuk berjaga-jaga (penerapan bersifat idempoten). */
export const PULL_MARGIN_MS = 10_000

export interface SyncReport {
  pulled: number
  applied: number
  pushed: number
  rescheduled: number
}

type Row = Record<string, unknown> & { _dirty?: number; _mtime?: number; updatedAt?: number }

const keyOf = (table: SyncTable, id: string) => `${table}:${id}`

/** Buang penanda lokal & nilai undefined agar aman disimpan di cloud. */
export function toRemoteData(row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_') && v !== undefined) out[k] = v
  return JSON.parse(JSON.stringify(out)) as Record<string, unknown>
}

const idOf = (table: SyncTable, row: Row) => String(table === 'settings' ? row.key : row.id)

/* ---------- Penghitungan ulang jadwal ---------- */

/**
 * Hitung jadwal kartu dari riwayat ulasannya (setelah `resetAt` bila ada).
 *  - Riwayat lengkap (diawali ulasan saat kartu baru): diputar ulang dari awal → hasil
 *    identik di semua perangkat, termasuk bila kartu diulang di dua perangkat sekaligus.
 *  - Riwayat tidak lengkap (mis. data lama): ulasan yang lebih baru dari `lastReview`
 *    diterapkan di atas jadwal yang ada.
 * Mengembalikan null bila jadwal tidak perlu diubah.
 */
export function replaySchedule(
  card: Card,
  logs: readonly ReviewLog[],
  params: ReturnType<typeof paramsFromSettings>,
  logRemoved = false,
): Schedule | null {
  const from = card.resetAt ?? -Infinity
  const seq = logs.filter((l) => l.reviewedAt > from).sort((a, b) => a.reviewedAt - b.reviewedAt || a.id.localeCompare(b.id))
  if (seq.length === 0) return card.resetAt != null || logRemoved ? newSchedule(card.resetAt ?? card.createdAt) : null

  // Pakai jadwal tersimpan di log bila log itu dihitung dari keadaan yang sama
  // (hasil identik dengan perangkat yang menjawab, walau pengaturan berubah setelahnya);
  // bila tidak (dua perangkat menjawab bersamaan), hitung ulang dengan FSRS.
  const step = (s: Schedule, l: ReviewLog): Schedule =>
    l.after && l.before && l.before.reps === s.reps && l.before.lastReview === s.lastReview
      ? { ...l.after }
      : schedule(s, l.rating, l.reviewedAt, params, card.id).card

  if (seq[0].state === 'new') {
    let s = newSchedule(seq[0].reviewedAt)
    for (const l of seq) s = step(s, l)
    return s
  }
  const newer = seq.filter((l) => card.lastReview == null || l.reviewedAt > card.lastReview)
  if (!newer.length) return null
  let s = pickSchedule(card)
  for (const l of newer) s = step(s, l)
  return s
}

async function rescheduleCards(database: IngatDB, ids: Iterable<string>, logRemoved: ReadonlySet<string> = new Set()): Promise<number> {
  const params = paramsFromSettings(await getSettings(database))
  let n = 0
  for (const id of ids) {
    const card = await database.cards.get(id)
    if (!card) continue
    const logs = await database.reviewLogs.where('cardId').equals(id).toArray()
    const next = replaySchedule(card, logs, params, logRemoved.has(id))
    if (!next) continue
    await database.cards.put({ ...card, ...next })
    n++
  }
  return n
}

/** Hitung ulang jadwal kartu tertentu dari riwayatnya (dipakai setelah pulihkan cadangan "gabung"). */
export function rescheduleAll(database: IngatDB, ids: Iterable<string>): Promise<number> {
  return syncTransaction(database, () => rescheduleCards(database, ids))
}

/* ---------- Tarik & terapkan ---------- */

const newerOrEqual = (remote: Row, local: Row) => {
  const r = Number(remote.updatedAt ?? 0)
  const l = Number(local.updatedAt ?? 0)
  return r > l || (r === l && local._dirty !== 1)
}

/** Terapkan catatan dari cloud ke basis data lokal. Mengembalikan jumlah perubahan & kartu yang dijadwal ulang. */
export async function applyRemote(database: IngatDB, records: readonly RemoteRecord[]): Promise<{ applied: number; rescheduled: number }> {
  if (!records.length) return { applied: 0, rescheduled: 0 }
  return syncTransaction(database, async () => {
    const affected = new Set<string>()
    const logRemoved = new Set<string>()
    let applied = 0
    for (const r of [...records].sort((a, b) => a.serverTime - b.serverTime)) {
      if (!(SYNC_TABLES as readonly string[]).includes(r.table)) continue
      if (r.table === 'settings' && !SYNCED_SETTING_KEYS.has(r.id)) continue
      const table = database.table(r.table)
      const local = (await table.get(r.id)) as Row | undefined

      if (r.data == null) {
        if (local) {
          await table.delete(r.id)
          if (r.table === 'reviewLogs') {
            affected.add(String(local.cardId))
            logRemoved.add(String(local.cardId))
          }
          applied++
        }
        await database.tombstones.delete(keyOf(r.table, r.id))
        continue
      }

      // dihapus di perangkat ini tapi belum terkirim → penghapusan lokal yang menang
      if (await database.tombstones.get(keyOf(r.table, r.id))) continue

      const data = r.data as Row
      switch (r.table) {
        case 'reviewLogs':
        case 'quizResults':
          if (!local) {
            await table.put({ ...data, _dirty: 0 })
            if (r.table === 'reviewLogs') affected.add(String(data.cardId))
            applied++
          }
          break
        case 'decks':
        case 'settings':
          if (!local || newerOrEqual(data, local)) {
            if (!local || JSON.stringify(toRemoteData(local)) !== JSON.stringify(data)) applied++
            await table.put({ ...data, _dirty: 0 })
          }
          break
        case 'cards':
          if (!local) {
            await table.put({ ...data, _dirty: 0 })
            affected.add(r.id)
            applied++
          } else if (newerOrEqual(data, local)) {
            const merged: Row = { ...local, _dirty: 0 }
            for (const f of CARD_CONTENT_FIELDS) {
              if (f in data) merged[f] = data[f]
              else delete merged[f]
            }
            // kartu yang belum dipelajari: jatuh tempo = waktu dibuat (sama di semua perangkat)
            if (merged.state === 'new' && merged.resetAt == null) merged.due = merged.createdAt
            if (merged.resetAt !== local.resetAt) affected.add(r.id)
            if (JSON.stringify(toRemoteData(local)) !== JSON.stringify(toRemoteData(merged))) applied++
            await table.put(merged)
          }
          break
      }
    }
    const rescheduled = await rescheduleCards(database, affected, logRemoved)
    return { applied, rescheduled }
  })
}

/* ---------- Kirim ---------- */

interface Snapshot {
  table: SyncTable | 'tombstones'
  key: string
  mtime: number | undefined
}

/** Kirim semua perubahan lokal yang belum terkirim. */
export async function pushDirty(database: IngatDB, backend: SyncBackend): Promise<number> {
  const outgoing = new Map<string, OutgoingRecord>()
  const snapshots: Snapshot[] = []

  for (const table of SYNC_TABLES) {
    const rows = (await database.table(table).where('_dirty').equals(1).toArray()) as Row[]
    for (const row of rows) {
      const id = idOf(table, row)
      if (table === 'settings' && !SYNCED_SETTING_KEYS.has(id)) continue
      outgoing.set(keyOf(table, id), { table, id, data: toRemoteData(row) })
      snapshots.push({ table, key: id, mtime: row._mtime })
    }
  }
  const tombs = await database.tombstones.where('_dirty').equals(1).toArray()
  for (const t of tombs) {
    // dibuat ulang dengan id yang sama → catatan hidup yang menang
    if (!outgoing.has(t.key) && !(await database.table(t.table).get(t.id))) {
      outgoing.set(t.key, { table: t.table, id: t.id, data: null })
    }
    snapshots.push({ table: 'tombstones', key: t.key, mtime: undefined })
  }
  if (!outgoing.size) {
    if (snapshots.length) await syncTransaction(database, () => database.tombstones.bulkDelete(snapshots.map((s) => s.key)))
    return 0
  }

  await backend.push([...outgoing.values()])

  await syncTransaction(database, async () => {
    for (const s of snapshots) {
      if (s.table === 'tombstones') {
        await database.tombstones.delete(s.key)
        continue
      }
      const table = database.table(s.table)
      const current = (await table.get(s.key)) as Row | undefined
      // hanya bersihkan bila tidak berubah lagi selama pengiriman
      if (current && current._mtime === s.mtime) await table.update(s.key, { _dirty: 0 })
    }
  })
  return outgoing.size
}

/* ---------- Satu putaran sinkron ---------- */

export async function syncOnce(database: IngatDB, backend: SyncBackend): Promise<SyncReport> {
  const settings = await getSettings(database)
  const since = Math.max(0, settings.syncCursor - PULL_MARGIN_MS)
  const remote = await backend.pull(since)
  const { applied, rescheduled } = await applyRemote(database, remote)
  const cursor = remote.reduce((m, r) => Math.max(m, r.serverTime), settings.syncCursor)
  const pushed = await pushDirty(database, backend)
  await syncTransaction(database, async () => {
    await database.settings.put({ key: 'syncCursor', value: cursor, updatedAt: Date.now() })
    await database.settings.put({ key: 'lastSyncAt', value: Date.now(), updatedAt: Date.now() })
  })
  return { pulled: remote.length, applied, pushed, rescheduled }
}

/* ---------- Menghubungkan perangkat pertama kali ---------- */

export type ConnectMode = 'upload' | 'download' | 'merge'

/** Apakah perangkat ini punya data buatan pengguna (bukan sekadar deck contoh yang belum disentuh)? */
export async function hasUserData(database: IngatDB): Promise<boolean> {
  if ((await database.reviewLogs.count()) > 0 || (await database.quizResults.count()) > 0) return true
  const decks = await database.decks.toArray()
  return decks.some((d) => !d.sample)
}

/** Saran mode saat menghubungkan akun. null = tanyakan pengguna. */
export async function suggestConnectMode(database: IngatDB, backend: SyncBackend): Promise<ConnectMode | null> {
  const [remote, local] = await Promise.all([backend.hasData(), hasUserData(database)])
  if (!remote) return 'upload'
  if (!local) return 'download'
  return null
}

async function markAllDirty(database: IngatDB) {
  await syncTransaction(database, async () => {
    for (const table of SYNC_TABLES) {
      const t = database.table(table)
      const rows = (await t.toArray()) as Row[]
      const keep = table === 'settings' ? rows.filter((r) => SYNCED_SETTING_KEYS.has(String(r.key))) : rows
      if (keep.length) await t.bulkPut(keep.map((r) => ({ ...r, _dirty: 1, _mtime: r._mtime ?? 1 })))
    }
  })
}

async function wipeLocal(database: IngatDB) {
  await syncTransaction(database, async () => {
    for (const table of ['decks', 'cards', 'reviewLogs', 'quizResults'] as const) await database.table(table).clear()
    await database.tombstones.clear()
    const synced = (await database.settings.toArray()).filter((r) => SYNCED_SETTING_KEYS.has(r.key)).map((r) => r.key)
    await database.settings.bulkDelete(synced)
  })
}

/** Hapus deck contoh lokal yang belum pernah dipelajari bila deck contoh yang sama sudah ada dari cloud. */
async function dedupeSampleDecks(database: IngatDB, remoteDeckIds: ReadonlySet<string>) {
  const decks = await database.decks.toArray()
  const remoteSamples = new Set(decks.filter((d) => d.sample && remoteDeckIds.has(d.id)).map((d) => d.sample))
  for (const d of decks) {
    if (!d.sample || remoteDeckIds.has(d.id) || !remoteSamples.has(d.sample)) continue
    const used = await database.reviewLogs.where('deckId').equals(d.id).count()
    if (used > 0) continue
    await syncTransaction(database, async () => {
      await database.cards.where('deckId').equals(d.id).delete()
      await database.decks.delete(d.id)
    })
  }
}

/**
 * Hubungkan perangkat ke akun untuk pertama kali.
 *  - upload  : cloud kosong → kirim semua data perangkat ini.
 *  - download: pakai data cloud, data lokal perangkat ini diganti.
 *  - merge   : gabungkan keduanya.
 */
export async function connectDevice(database: IngatDB, backend: SyncBackend, uid: string, mode: ConnectMode): Promise<SyncReport> {
  await syncTransaction(database, async () => {
    await database.settings.put({ key: 'syncCursor', value: 0, updatedAt: Date.now() })
  })
  if (mode === 'download') await wipeLocal(database)
  if (mode !== 'download') await markAllDirty(database)

  const remote = await backend.pull(0)
  const { applied, rescheduled } = await applyRemote(database, remote)
  if (mode === 'merge') {
    const remoteDecks = new Set(remote.filter((r) => r.table === 'decks' && r.data).map((r) => r.id))
    await dedupeSampleDecks(database, remoteDecks)
  }
  // gabungkan jadwal semua kartu dari riwayat gabungan
  const all = (await database.cards.toCollection().primaryKeys()) as string[]
  const fullResched = mode === 'merge' ? await syncTransaction(database, () => rescheduleCards(database, all)) : 0
  const pushed = await pushDirty(database, backend)
  const cursor = remote.reduce((m, r) => Math.max(m, r.serverTime), 0)
  await syncTransaction(database, async () => {
    await database.settings.put({ key: 'syncUid', value: uid, updatedAt: Date.now() })
    await database.settings.put({ key: 'syncCursor', value: cursor, updatedAt: Date.now() })
    await database.settings.put({ key: 'lastSyncAt', value: Date.now(), updatedAt: Date.now() })
  })
  return { pulled: remote.length, applied, pushed, rescheduled: rescheduled + fullResched }
}

/** Putuskan perangkat dari akun (data lokal tetap ada). */
export async function disconnectDevice(database: IngatDB) {
  await syncTransaction(database, async () => {
    await database.settings.put({ key: 'syncUid', value: null, updatedAt: Date.now() })
    await database.settings.put({ key: 'syncCursor', value: 0, updatedAt: Date.now() })
  })
}
