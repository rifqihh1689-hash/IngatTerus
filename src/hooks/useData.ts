import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../db/db'
import { dayKey } from '../lib/date'
import { deckCounts, type DeckCounts } from '../lib/queue'
import { computeStreak, type Streak } from '../lib/stats'
import { DEFAULT_SETTINGS, type AppSettings, type Card, type Deck } from '../types'

export function useSettings(): AppSettings {
  return useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS)
}

export interface DeckSummary {
  deck: Deck
  counts: DeckCounts
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
    return decks.map((deck) => ({
      deck,
      counts: deckCounts(byDeck.get(deck.id) ?? [], now, settings.newPerDay - (newToday.get(deck.id) ?? 0)),
    }))
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
