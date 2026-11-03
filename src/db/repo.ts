/** Operasi data tingkat aplikasi di atas Dexie. */
import { db as defaultDb, getSettings, setSetting, uid, type IngatDB } from './db'
import { DEFAULT_W, isValidWeights, makeParams, newSchedule, pickSchedule, schedule } from '../lib/fsrs'
import { buildDataset, optimizeWeights, replayMemory, type OptimizeResult } from '../lib/optimizer'
import { dayKey } from '../lib/date'
import { buildBackup, type BackupData } from '../lib/backup'
import type { AppSettings, Card, Deck, QuizResult, Rating, ReviewLog } from '../types'

export const DECK_COLORS = ['indigo', 'emerald', 'amber', 'rose', 'sky', 'violet', 'teal', 'orange'] as const

export interface CardInput {
  front: string
  back: string
  frontImage?: string
  backImage?: string
}

export function paramsFromSettings(s: AppSettings) {
  return makeParams({
    w: isValidWeights(s.fsrsParams) ? s.fsrsParams : DEFAULT_W,
    desiredRetention: s.desiredRetention,
    maxInterval: s.maxInterval,
  })
}

export async function createDeck(
  input: { name: string; description?: string; color?: string; sample?: string },
  database: IngatDB = defaultDb,
): Promise<string> {
  const now = Date.now()
  const deck: Deck = {
    id: uid(),
    name: input.name.trim() || 'Deck tanpa nama',
    description: input.description?.trim() ?? '',
    color: input.color ?? 'indigo',
    createdAt: now,
    updatedAt: now,
    ...(input.sample ? { sample: input.sample } : {}),
  }
  await database.decks.add(deck)
  return deck.id
}

export async function updateDeck(
  id: string,
  changes: Partial<Pick<Deck, 'name' | 'description' | 'color'>>,
  database: IngatDB = defaultDb,
) {
  await database.decks.update(id, { ...changes, updatedAt: Date.now() })
}

export async function deleteDeck(id: string, database: IngatDB = defaultDb) {
  await database.transaction('rw', [database.decks, database.cards, database.reviewLogs, database.quizResults], async () => {
    await database.cards.where('deckId').equals(id).delete()
    await database.reviewLogs.where('deckId').equals(id).delete()
    await database.quizResults.where('deckId').equals(id).delete()
    await database.decks.delete(id)
  })
}

function makeCard(deckId: string, input: CardInput, now: number, order = 0): Card {
  return {
    id: uid(),
    deckId,
    front: input.front.trim(),
    back: input.back.trim(),
    ...(input.frontImage ? { frontImage: input.frontImage } : {}),
    ...(input.backImage ? { backImage: input.backImage } : {}),
    // createdAt bertambah sedikit agar urutan kartu baru mengikuti urutan input
    createdAt: now + order,
    updatedAt: now,
    ...newSchedule(now),
  }
}

export async function addCard(deckId: string, input: CardInput, database: IngatDB = defaultDb): Promise<string> {
  const card = makeCard(deckId, input, Date.now())
  await database.cards.add(card)
  await database.decks.update(deckId, { updatedAt: Date.now() })
  return card.id
}

export async function addCards(deckId: string, inputs: CardInput[], database: IngatDB = defaultDb): Promise<number> {
  const now = Date.now()
  const cards = inputs.map((c, i) => makeCard(deckId, c, now, i))
  await database.cards.bulkAdd(cards)
  await database.decks.update(deckId, { updatedAt: now })
  return cards.length
}

export async function updateCard(id: string, input: CardInput, database: IngatDB = defaultDb) {
  const existing = await database.cards.get(id)
  if (!existing) throw new Error('Kartu tidak ditemukan')
  const next: Card = {
    ...existing,
    front: input.front.trim(),
    back: input.back.trim(),
    updatedAt: Date.now(),
  }
  if (input.frontImage) next.frontImage = input.frontImage
  else delete next.frontImage
  if (input.backImage) next.backImage = input.backImage
  else delete next.backImage
  await database.cards.put(next)
}

export async function deleteCard(id: string, database: IngatDB = defaultDb) {
  await database.transaction('rw', [database.cards, database.reviewLogs], async () => {
    await database.reviewLogs.where('cardId').equals(id).delete()
    await database.cards.delete(id)
  })
}

/** Atur ulang jadwal kartu menjadi kartu baru. */
export async function resetCard(id: string, database: IngatDB = defaultDb) {
  await database.cards.update(id, { ...newSchedule(Date.now()) })
}

export interface AnswerUndo {
  previous: Card
  logId: string
}

/** Simpan jawaban kartu: perbarui jadwal & catat riwayat dalam satu transaksi. */
export async function answerCard(
  cardId: string,
  rating: Rating,
  now: number = Date.now(),
  database: IngatDB = defaultDb,
  durationMs?: number,
): Promise<{ card: Card; undo: AnswerUndo }> {
  const settings = await getSettings(database)
  const params = paramsFromSettings(settings)
  return database.transaction('rw', [database.cards, database.reviewLogs], async () => {
    const card = await database.cards.get(cardId)
    if (!card) throw new Error('Kartu tidak ditemukan')
    const result = schedule(pickSchedule(card), rating, now, params, card.id)
    const updated: Card = { ...card, ...result.card }
    const log: ReviewLog = {
      id: uid(),
      cardId,
      deckId: card.deckId,
      rating,
      state: result.log.state,
      reviewedAt: now,
      day: dayKey(now),
      elapsedDays: result.log.elapsedDays,
      scheduledDays: result.log.scheduledDays,
      ...(durationMs != null && durationMs > 0 ? { durationMs: Math.min(Math.round(durationMs), 10 * 60_000) } : {}),
    }
    await database.cards.put(updated)
    await database.reviewLogs.add(log)
    return { card: updated, undo: { previous: card, logId: log.id } }
  })
}

export async function undoAnswer(undo: AnswerUndo, database: IngatDB = defaultDb) {
  await database.transaction('rw', [database.cards, database.reviewLogs], async () => {
    await database.cards.put(undo.previous)
    await database.reviewLogs.delete(undo.logId)
  })
}

/** Jumlah kartu baru yang sudah dipelajari hari ini per deck. */
export async function newStudiedToday(now: number = Date.now(), database: IngatDB = defaultDb): Promise<Map<string, number>> {
  const logs = await database.reviewLogs.where('day').equals(dayKey(now)).toArray()
  const map = new Map<string, number>()
  for (const l of logs) if (l.state === 'new') map.set(l.deckId, (map.get(l.deckId) ?? 0) + 1)
  return map
}

export async function saveQuizResult(
  input: Omit<QuizResult, 'id' | 'day' | 'takenAt'> & { takenAt?: number },
  database: IngatDB = defaultDb,
) {
  const takenAt = input.takenAt ?? Date.now()
  await database.quizResults.add({ ...input, id: uid(), takenAt, day: dayKey(takenAt) })
}

export async function exportAll(database: IngatDB = defaultDb): Promise<BackupData> {
  const [decks, cards, reviewLogs, quizResults, settings] = await Promise.all([
    database.decks.toArray(),
    database.cards.toArray(),
    database.reviewLogs.toArray(),
    database.quizResults.toArray(),
    database.settings.toArray(),
  ])
  return buildBackup({ decks, cards, reviewLogs, quizResults, settings })
}

export type RestoreMode = 'gabung' | 'ganti'

/**
 * Pulihkan cadangan.
 *  - "ganti": hapus semua data lalu isi dengan cadangan.
 *  - "gabung": tambahkan/timpa entri dengan id yang sama, data lain tetap.
 */
export async function restoreBackup(data: BackupData, mode: RestoreMode, database: IngatDB = defaultDb) {
  const tables = [database.decks, database.cards, database.reviewLogs, database.quizResults, database.settings]
  await database.transaction('rw', tables, async () => {
    if (mode === 'ganti') await Promise.all(tables.map((t) => t.clear()))
    await database.decks.bulkPut(data.decks)
    await database.cards.bulkPut(data.cards)
    await database.reviewLogs.bulkPut(data.reviewLogs)
    await database.quizResults.bulkPut(data.quizResults)
    // pengaturan hanya dipulihkan saat mode ganti agar preferensi perangkat ini tidak tertimpa
    if (mode === 'ganti') await database.settings.bulkPut(data.settings)
    else await database.settings.put({ key: 'seeded', value: true })
  })
}

export async function wipeAll(database: IngatDB = defaultDb) {
  const tables = [database.decks, database.cards, database.reviewLogs, database.quizResults]
  await database.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
  })
}

/** Data latih optimizer dari seluruh riwayat ulasan. */
export async function loadTrainingData(database: IngatDB = defaultDb) {
  return buildDataset(await database.reviewLogs.toArray())
}

/**
 * Optimalkan parameter FSRS-6 dari riwayat, simpan bila lebih akurat, lalu hitung
 * ulang stabilitas & kesulitan kartu (tanggal jatuh tempo tidak diubah).
 */
export async function optimizeAndApply(
  onProgress?: (fraction: number) => void,
  database: IngatDB = defaultDb,
): Promise<OptimizeResult> {
  const dataset = await loadTrainingData(database)
  const result = await optimizeWeights(dataset, { onProgress })
  if (result.improved) {
    await database.transaction('rw', [database.settings], async () => {
      await setSetting('fsrsParams', result.w, database)
      await setSetting('optimizedAt', Date.now(), database)
      await setSetting('optimizedReviews', result.reviews, database)
      await setSetting('optimizedLossBefore', result.lossBefore, database)
      await setSetting('optimizedLossAfter', result.lossAfter, database)
    })
    await recomputeMemoryStates(result.w, database)
  }
  return result
}

/** Kembali ke parameter bawaan FSRS-6. */
export async function resetOptimizedParams(database: IngatDB = defaultDb) {
  await setSetting('fsrsParams', null, database)
  await setSetting('optimizedAt', null, database)
  await setSetting('optimizedReviews', 0, database)
  await setSetting('optimizedLossBefore', null, database)
  await setSetting('optimizedLossAfter', null, database)
  await recomputeMemoryStates(DEFAULT_W, database)
}

/** Hitung ulang S & D kartu dari riwayatnya dengan parameter `w`. Mengembalikan jumlah kartu yang diperbarui. */
export async function recomputeMemoryStates(w: readonly number[], database: IngatDB = defaultDb): Promise<number> {
  const [cards, logs] = await Promise.all([database.cards.toArray(), database.reviewLogs.toArray()])
  const byCard = new Map<string, ReviewLog[]>()
  for (const l of logs) {
    const list = byCard.get(l.cardId)
    if (list) list.push(l)
    else byCard.set(l.cardId, [l])
  }
  const updates: Card[] = []
  for (const card of cards) {
    if (card.state === 'new') continue
    const seqs = buildDataset(byCard.get(card.id) ?? [])
    const last = seqs[seqs.length - 1]
    if (!last) continue
    const m = replayMemory(last, w)
    updates.push({ ...card, stability: m.stability, difficulty: m.difficulty })
  }
  if (updates.length) await database.cards.bulkPut(updates)
  return updates.length
}
