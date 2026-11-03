/** Antarmuka penyimpanan cloud untuk sinkronisasi (Firestore di produksi, memori di tes). */
import type { SyncTable } from '../db/db'

export interface RemoteRecord {
  table: SyncTable
  id: string
  /** null = catatan penghapusan (tombstone). */
  data: Record<string, unknown> | null
  /** Waktu server saat catatan terakhir ditulis (ms). */
  serverTime: number
}

export interface OutgoingRecord {
  table: SyncTable
  id: string
  data: Record<string, unknown> | null
}

export interface SyncBackend {
  /** Semua catatan yang ditulis setelah `sinceServerTime`, urut naik. */
  pull(sinceServerTime: number): Promise<RemoteRecord[]>
  push(records: readonly OutgoingRecord[]): Promise<void>
  /** Apakah akun cloud sudah berisi data. */
  hasData(): Promise<boolean>
}

/** Backend dalam memori — meniru Firestore (satu dokumen per catatan + waktu server naik). */
export class MemoryBackend implements SyncBackend {
  readonly docs = new Map<string, RemoteRecord>()
  private clock = 1_000
  pushes = 0
  failNext = false

  async pull(since: number): Promise<RemoteRecord[]> {
    return [...this.docs.values()].filter((d) => d.serverTime > since).sort((a, b) => a.serverTime - b.serverTime).map((d) => structuredClone(d))
  }

  async push(records: readonly OutgoingRecord[]): Promise<void> {
    if (this.failNext) {
      this.failNext = false
      throw new Error('jaringan terputus (simulasi)')
    }
    this.pushes++
    const t = (this.clock += 10)
    for (const r of records) this.docs.set(`${r.table}:${r.id}`, { ...structuredClone(r), serverTime: t })
  }

  async hasData(): Promise<boolean> {
    return this.docs.size > 0
  }
}
