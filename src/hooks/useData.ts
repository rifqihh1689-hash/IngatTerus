import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../db/db'
import { dayKey, shiftDayKey } from '../lib/date'
import { deckCounts, isLeech, type DeckCounts } from '../lib/queue'
import { cardMaturity, computeStreak, type Maturity, type Streak } from '../lib/stats'
import { DEFAULT_SETTINGS, type AppSettings, type Card, type Deck } from '../types'

export function useSettings(): AppSettings {
  return useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS)
}

/** Seperti useSettings, tetapi undefined selama masih memuat. */
export function useLoadedSettings(): AppSettings | undefined {
  return useLiveQuery(() => getSettings(), [])
}

export interface DeckSummary {
  deck: Deck
  counts: DeckCounts
  maturity: Maturity
  /** Porsi kartu yang sudah masuk jadwal harian (muda + matang), 0–1. */
  mastery: number
  leeches: number
}

/** Ringkasan semua deck beserta jumlah kartu jatuh tempo; undefined saat memuat. */
export function useDeckSummaries(): DeckSummary[] | undefined {
  return useLiveQuery(async () => {
    const now = Date.now()
    const [decks, cards, todayLogs, settings] = await Promise.all([
      db.decks.orderBy('createdAt').toArray(),
      db.cards.toArray(),
      db.reviewLogs.where('day').equals(dayKey(now)).toArray(),
      getSettings(),
    ])
    const byDeck = new Map<string, Card[]>()
    for (const c of cards) {
      const list = byDeck.get(c.deckId)
      if (list) list.push(c)
      else byDeck.set(c.deckId, [c])
    }
    const newToday = new Map<string, number>()
    for (const l of todayLogs) if (l.state === 'new') newToday.set(l.deckId, (newToday.get(l.deckId) ?? 0) + 1)
    return decks.map((deck) => {
      const list = byDeck.get(deck.id) ?? []
      const maturity = cardMaturity(list)
      return {
        deck,
        counts: deckCounts(list, now, settings.newPerDay - (newToday.get(deck.id) ?? 0)),
        maturity,
        mastery: list.length ? (maturity.muda + maturity.matang) / list.length : 0,
        leeches: list.filter(isLeech).length,
      }
    })
  }, [])
}

/** Hari-hari belajar (ulasan kartu atau kuis/ujian) untuk streak. */
export function useStreak(): Streak | undefined {
  return useLiveQuery(async () => {
    const [reviewDays, quizDays] = await Promise.all([
      db.reviewLogs.orderBy('day').uniqueKeys(),
      db.quizResults.orderBy('day').uniqueKeys(),
    ])
    return computeStreak([...reviewDays, ...quizDays].map(String), dayKey())
  }, [])
}

export interface TodayStats {
  reviewed: number
  remembered: number
  /** Median detik per kartu dari ulasan terakhir (bawaan 8 detik). */
  secPerCard: number
  /** 7 hari terakhir (lama → hari ini) dan apakah ada aktivitas belajar. */
  week: { day: string; studied: boolean }[]
}

export function useTodayStats(): TodayStats | undefined {
  return useLiveQuery(async () => {
    const today = dayKey()
    const from = shiftDayKey(today, -6)
    const [todayLogs, recent, weekLogs, weekQuiz] = await Promise.all([
      db.reviewLogs.where('day').equals(today).toArray(),
      db.reviewLogs.orderBy('reviewedAt').reverse().limit(200).toArray(),
      db.reviewLogs.where('day').between(from, today, true, true).toArray(),
      db.quizResults.where('day').between(from, today, true, true).toArray(),
    ])
    const durations = recent
      .map((l) => l.durationMs)
      .filter((d): d is number => typeof d === 'number' && d > 0)
      .sort((a, b) => a - b)
    const median = durations.length ? durations[Math.floor(durations.length / 2)] / 1000 : 8
    const active = new Set([...weekLogs.map((l) => l.day), ...weekQuiz.map((q) => q.day)])
    return {
      reviewed: todayLogs.length,
      remembered: todayLogs.filter((l) => l.rating > 1).length,
      secPerCard: Math.min(Math.max(median + 2, 4), 60),
      week: Array.from({ length: 7 }, (_, i) => {
        const day = shiftDayKey(today, i - 6)
        return { day, studied: active.has(day) }
      }),
    }
  }, [])
}
