/** Penyusunan antrean belajar (fungsi murni). */
import { endOfDay, MINUTE_MS } from './date'
import { DEFAULT_W, retrievability } from './fsrs'
import type { Card } from '../types'

/** Kartu yang lupa ≥ 8 kali dianggap "leech": sebaiknya ditulis ulang/dipecah. */
export const LEECH_LAPSES = 8
export const isLeech = (card: Pick<Card, 'lapses'>) => card.lapses >= LEECH_LAPSES

/** Kartu langkah belajar boleh ditampilkan lebih awal hingga 20 menit. */
export const LEARN_AHEAD_MS = 20 * MINUTE_MS

export interface DeckQueue {
  learning: Card[]
  review: Card[]
  fresh: Card[]
}

/** Kelompokkan kartu satu deck yang perlu dipelajari sekarang. */
export function buildDeckQueue(cards: readonly Card[], now: number, newRemaining: number): DeckQueue {
  const learning = cards
    .filter((c) => (c.state === 'learning' || c.state === 'relearning') && c.due <= now + LEARN_AHEAD_MS)
    .sort((a, b) => a.due - b.due)
  const eod = endOfDay(now)
  const review = cards.filter((c) => c.state === 'review' && c.due <= eod).sort((a, b) => a.due - b.due)
  const fresh = cards
    .filter((c) => c.state === 'new')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, Math.max(0, newRemaining))
  return { learning, review, fresh }
}

export interface DeckCounts {
  /** Kartu dalam langkah belajar yang jatuh tempo. */
  learning: number
  /** Kartu review yang jatuh tempo hari ini. */
  review: number
  /** Kartu baru yang tersedia hari ini (sesuai batas harian). */
  fresh: number
  /** Total kartu baru di deck. */
  totalNew: number
  total: number
}

export function deckCounts(cards: readonly Card[], now: number, newRemaining: number): DeckCounts {
  const q = buildDeckQueue(cards, now, newRemaining)
  return {
    learning: q.learning.length,
    review: q.review.length,
    fresh: q.fresh.length,
    totalNew: cards.filter((c) => c.state === 'new').length,
    total: cards.length,
  }
}

/** Sisipkan kartu baru secara merata di antara kartu review. */
export function interleave<T>(reviews: readonly T[], fresh: readonly T[]): T[] {
  if (fresh.length === 0) return [...reviews]
  if (reviews.length === 0) return [...fresh]
  const out: T[] = []
  const gap = (reviews.length + fresh.length) / fresh.length
  let r = 0
  let f = 0
  for (let i = 0; i < reviews.length + fresh.length; i++) {
    const wantFresh = f < fresh.length && (r >= reviews.length || i + 1 >= (f + 0.5) * gap)
    if (wantFresh) out.push(fresh[f++])
    else out.push(reviews[r++])
  }
  return out
}

/**
 * Pilih kartu berikutnya dalam sesi:
 * 1) kartu belajar yang sudah jatuh tempo, 2) antrean utama,
 * 3) kartu belajar yang menunggu (ditampilkan lebih awal).
 */
export function pickNext(main: readonly Card[], learning: readonly Card[], now: number): { card: Card; from: 'learning' | 'main' } | null {
  const sorted = [...learning].sort((a, b) => a.due - b.due)
  if (sorted.length > 0 && sorted[0].due <= now) return { card: sorted[0], from: 'learning' }
  if (main.length > 0) return { card: main[0], from: 'main' }
  if (sorted.length > 0) return { card: sorted[0], from: 'learning' }
  return null
}

/** Gabungkan beberapa daftar bergantian (A1, B1, C1, A2, …) agar topik berselang-seling. */
export function roundRobin<T>(lists: readonly (readonly T[])[]): T[] {
  const out: T[] = []
  const max = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < max; i++) for (const l of lists) if (i < l.length) out.push(l[i])
  return out
}

/**
 * Antrean latihan tambahan: kartu yang sudah pernah dipelajari tetapi belum
 * jatuh tempo, diurutkan dari peluang ingat terendah (paling rawan lupa).
 * Cocok untuk persiapan ujian; FSRS tetap menghitung ulangan lebih awal dengan benar.
 */
export function buildExtraQueue(cards: readonly Card[], now: number, limit = 20, w: readonly number[] = DEFAULT_W): Card[] {
  const eod = endOfDay(now)
  return cards
    .filter((c) => c.state === 'review' && c.due > eod)
    .map((c) => ({ c, r: retrievability(c, now, w) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, limit)
    .map((x) => x.c)
}
