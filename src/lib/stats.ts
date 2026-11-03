/** Perhitungan statistik belajar (fungsi murni). */
import { dayKey, endOfDay, shiftDayKey, DAY_MS, startOfDay } from './date'
import { retrievability } from './fsrs'
import type { Card, ReviewLog } from '../types'

export interface Streak {
  current: number
  longest: number
  studiedToday: boolean
}

/**
 * Streak harian. Streak tetap "hidup" bila hari ini belum belajar tapi kemarin
 * belajar (masih ada kesempatan menjaga streak hari ini).
 */
export function computeStreak(days: Iterable<string>, today: string = dayKey()): Streak {
  const set = new Set(days)
  const studiedToday = set.has(today)
  let current = 0
  let cursor = studiedToday ? today : shiftDayKey(today, -1)
  while (set.has(cursor)) {
    current++
    cursor = shiftDayKey(cursor, -1)
  }
  let longest = 0
  for (const d of set) {
    if (set.has(shiftDayKey(d, -1))) continue // bukan awal rangkaian
    let len = 1
    let next = shiftDayKey(d, 1)
    while (set.has(next)) {
      len++
      next = shiftDayKey(next, 1)
    }
    longest = Math.max(longest, len)
  }
  return { current, longest, studiedToday }
}

/**
 * Tingkat ingatan ("true retention"): persentase kartu review yang berhasil
 * diingat (bukan "Lupa"). null bila belum ada data.
 */
export function retentionRate(logs: readonly Pick<ReviewLog, 'state' | 'rating'>[]): number | null {
  const reviews = logs.filter((l) => l.state === 'review')
  if (reviews.length === 0) return null
  return reviews.filter((l) => l.rating > 1).length / reviews.length
}

export interface DayCount {
  day: string
  total: number
  correct: number
  lapses: number
}

/** Jumlah ulasan per hari untuk `days` hari terakhir (termasuk hari ini). */
export function dailyCounts(logs: readonly Pick<ReviewLog, 'day' | 'rating'>[], days: number, today: string = dayKey()): DayCount[] {
  const map = new Map<string, DayCount>()
  for (let i = days - 1; i >= 0; i--) {
    const d = shiftDayKey(today, -i)
    map.set(d, { day: d, total: 0, correct: 0, lapses: 0 })
  }
  for (const l of logs) {
    const row = map.get(l.day)
    if (!row) continue
    row.total++
    if (l.rating === 1) row.lapses++
    else row.correct++
  }
  return [...map.values()]
}

/** Perkiraan jumlah kartu jatuh tempo untuk `days` hari ke depan (hari 0 = hari ini, termasuk yang terlambat). */
export function dueForecast(cards: readonly Pick<Card, 'state' | 'due'>[], days: number, now: number = Date.now()): { day: string; count: number }[] {
  const today = startOfDay(now)
  const rows = Array.from({ length: days }, (_, i) => ({ day: dayKey(today + i * DAY_MS + DAY_MS / 2), count: 0 }))
  for (const c of cards) {
    if (c.state === 'new') continue
    const idx = c.due <= endOfDay(now) ? 0 : Math.round((startOfDay(c.due) - today) / DAY_MS)
    if (idx >= 0 && idx < days) rows[idx].count++
  }
  return rows
}

export interface Maturity {
  baru: number
  belajar: number
  muda: number
  matang: number
}

/** Kelompok kartu: baru, sedang belajar, muda (interval < 21 hari), matang (≥ 21 hari). */
export function cardMaturity(cards: readonly Pick<Card, 'state' | 'scheduledDays'>[]): Maturity {
  const m: Maturity = { baru: 0, belajar: 0, muda: 0, matang: 0 }
  for (const c of cards) {
    if (c.state === 'new') m.baru++
    else if (c.state === 'learning' || c.state === 'relearning') m.belajar++
    else if (c.scheduledDays >= 21) m.matang++
    else m.muda++
  }
  return m
}

/** Rata-rata peluang ingat kartu yang sudah dipelajari saat ini (0–1) atau null. */
export function averageRetrievability(cards: readonly Card[], now: number = Date.now()): number | null {
  const studied = cards.filter((c) => c.state !== 'new' && c.lastReview != null)
  if (studied.length === 0) return null
  return studied.reduce((sum, c) => sum + retrievability(c, now), 0) / studied.length
}

export function formatPercent(x: number | null, digits = 0): string {
  if (x == null) return '–'
  return `${(x * 100).toFixed(digits).replace('.', ',')}%`
}
