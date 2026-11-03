import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDB, getSettings, setSetting, type IngatDB } from './db'
import {
  addCard,
  addCards,
  answerCard,
  createDeck,
  deleteDeck,
  exportAll,
  newStudiedToday,
  restoreBackup,
  saveQuizResult,
  undoAnswer,
  updateCard,
} from './repo'
import { parseBackup } from '../lib/backup'
import { parseCardText } from '../lib/importText'
import { Rating } from '../types'

let db: IngatDB
let n = 0

beforeEach(async () => {
  db = createDB(`tes-${++n}`)
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('repositori data', () => {
  it('impor teks → kartu baru di deck', async () => {
    const deckId = await createDeck({ name: 'Impor' }, db)
    const parsed = parseCardText('satu;one\ndua;two\nrusak')
    const count = await addCards(deckId, parsed.cards, db)
    expect(count).toBe(2)
    expect(parsed.errors).toHaveLength(1)
    const cards = await db.cards.where('deckId').equals(deckId).sortBy('createdAt')
    expect(cards.map((c) => c.front)).toEqual(['satu', 'dua'])
    expect(cards.every((c) => c.state === 'new' && c.reps === 0)).toBe(true)
  })

  it('menjawab kartu memperbarui jadwal, mencatat riwayat, dan bisa dibatalkan', async () => {
    const deckId = await createDeck({ name: 'A' }, db)
    const cardId = await addCard(deckId, { front: 'q', back: 'a' }, db)
    const now = Date.now()
    const { card, undo } = await answerCard(cardId, Rating.Bisa, now, db)
    expect(card.state).toBe('learning')
    expect(card.reps).toBe(1)
    expect(await db.reviewLogs.count()).toBe(1)
    expect((await newStudiedToday(now, db)).get(deckId)).toBe(1)

    await undoAnswer(undo, db)
    const restored = await db.cards.get(cardId)
    expect(restored?.state).toBe('new')
    expect(restored?.reps).toBe(0)
    expect(await db.reviewLogs.count()).toBe(0)
  })

  it('memakai pengaturan target retensi saat menjadwalkan', async () => {
    await setSetting('desiredRetention', 0.8, db)
    expect((await getSettings(db)).desiredRetention).toBe(0.8)
    const deckId = await createDeck({ name: 'A' }, db)
    const cardId = await addCard(deckId, { front: 'q', back: 'a' }, db)
    const { card } = await answerCard(cardId, Rating.Mudah, Date.now(), db)
    // S0(Mudah)=15,69 → dengan retensi 80% interval jauh lebih panjang dari 16 hari
    expect(card.scheduledDays).toBeGreaterThan(30)
  })

  it('mengedit kartu dapat menghapus gambar', async () => {
    const deckId = await createDeck({ name: 'A' }, db)
    const id = await addCard(deckId, { front: 'q', back: 'a', frontImage: 'data:image/png;base64,AA==' }, db)
    await updateCard(id, { front: 'q2', back: 'a2' }, db)
    const c = await db.cards.get(id)
    expect(c?.front).toBe('q2')
    expect(c?.frontImage).toBeUndefined()
  })

  it('menghapus deck ikut menghapus kartu, riwayat, dan hasil kuis', async () => {
    const keep = await createDeck({ name: 'Tetap' }, db)
    const gone = await createDeck({ name: 'Hapus' }, db)
    await addCard(keep, { front: 'k', back: 'k' }, db)
    const c = await addCard(gone, { front: 'g', back: 'g' }, db)
    await answerCard(c, Rating.Lupa, Date.now(), db)
    await saveQuizResult({ deckId: gone, mode: 'kuis', total: 5, correct: 4, durationSec: 30 }, db)
    await deleteDeck(gone, db)
    expect(await db.decks.count()).toBe(1)
    expect(await db.cards.count()).toBe(1)
    expect(await db.reviewLogs.count()).toBe(0)
    expect(await db.quizResults.count()).toBe(0)
  })

  it('ekspor lalu pulihkan cadangan (mode ganti & gabung)', async () => {
    const deckId = await createDeck({ name: 'Asli' }, db)
    const cardId = await addCard(deckId, { front: 'q', back: 'a' }, db)
    await answerCard(cardId, Rating.Mudah, Date.now(), db)
    await setSetting('newPerDay', 7, db)
    const json = JSON.stringify(await exportAll(db))

    const other = createDB(`tes-lain-${n}`)
    await other.open()
    try {
      const extraDeck = await createDeck({ name: 'Lokal' }, other)
      await setSetting('newPerDay', 30, other)

      const { data } = parseBackup(json)
      await restoreBackup(data, 'gabung', other)
      expect((await other.decks.toArray()).map((d) => d.name).sort()).toEqual(['Asli', 'Lokal'])
      expect((await getSettings(other)).newPerDay).toBe(30)
      // gabung dua kali tidak menggandakan data
      await restoreBackup(data, 'gabung', other)
      expect(await other.cards.count()).toBe(1)

      await restoreBackup(data, 'ganti', other)
      const decks = await other.decks.toArray()
      expect(decks.map((d) => d.id)).toEqual([deckId])
      expect(decks.some((d) => d.id === extraDeck)).toBe(false)
      expect((await other.cards.get(cardId))?.state).toBe('review')
      expect(await other.reviewLogs.count()).toBe(1)
      expect((await getSettings(other)).newPerDay).toBe(7)
    } finally {
      await other.delete()
    }
  })
})

describe('deck contoh', () => {
  it('menambahkan 3 deck contoh sekali saja', async () => {
    const { seedSampleDecks, SAMPLE_DECKS } = await import('../data/sampleDecks')
    expect(await seedSampleDecks(db)).toBe(3)
    expect(await seedSampleDecks(db)).toBe(0)
    const decks = await db.decks.toArray()
    expect(decks.map((d) => d.sample).sort()).toEqual(['kosakata-inggris', 'rumus-matematika', 'twk-dasar'])
    for (const sample of SAMPLE_DECKS) {
      expect(sample.cards.length).toBeGreaterThanOrEqual(25)
      const fronts = sample.cards.map(([f]) => f.toLowerCase())
      expect(new Set(fronts).size).toBe(fronts.length)
    }
    expect(await db.cards.count()).toBe(SAMPLE_DECKS.reduce((n, d) => n + d.cards.length, 0))
    expect((await getSettings(db)).seeded).toBe(true)
  })

  it('format teks deck contoh valid (tidak ada penanda yang tersisa)', async () => {
    const { SAMPLE_DECKS } = await import('../data/sampleDecks')
    const { toPlainText } = await import('../lib/richtext')
    for (const d of SAMPLE_DECKS)
      for (const [front, back] of d.cards) {
        expect(toPlainText(front)).not.toMatch(/\*\*|\^|~/)
        expect(toPlainText(back)).not.toMatch(/\*\*|\^|~/)
      }
  })
})
