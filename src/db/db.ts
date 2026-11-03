/**
 * Basis data lokal (IndexedDB) via Dexie. Modul ini juga dipakai service
 * worker untuk pengingat, jadi jangan mengimpor apa pun yang bergantung DOM.
 */
import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_SETTINGS, type AppSettings, type Card, type Deck, type QuizResult, type ReviewLog, type SettingRow } from '../types'

export type IngatDB = Dexie & {
  decks: EntityTable<Deck, 'id'>
  cards: EntityTable<Card, 'id'>
  reviewLogs: EntityTable<ReviewLog, 'id'>
  quizResults: EntityTable<QuizResult, 'id'>
  settings: EntityTable<SettingRow, 'key'>
}

export const DB_NAME = 'ingatterus'

export function createDB(name: string = DB_NAME): IngatDB {
  const instance = new Dexie(name) as IngatDB
  instance.version(1).stores({
    decks: 'id, name, createdAt',
    cards: 'id, deckId, due, state, createdAt, [deckId+state]',
    reviewLogs: 'id, cardId, deckId, reviewedAt, day',
    quizResults: 'id, deckId, takenAt, day',
    settings: 'key',
  })
  return instance
}

export const db = createDB()

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
  await database.settings.put({ key, value })
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
