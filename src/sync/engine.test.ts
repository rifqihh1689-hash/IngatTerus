import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDB, getSettings, setSetting, syncTransaction, type IngatDB } from '../db/db'
import { addCard, answerCard, createDeck, deleteCard, deleteDeck, resetCard, undoAnswer, updateCard, updateDeck } from '../db/repo'
import { seedSampleDecks } from '../data/sampleDecks'
import { MemoryBackend } from './backend'
import { connectDevice, pushDirty, replaySchedule, suggestConnectMode, syncOnce } from './engine'
import { paramsFromSettings } from '../db/params'
import { pickSchedule } from '../lib/fsrs'
import { Rating, type Card } from '../types'

const DAY = 86_400_000
const T0 = new Date(2026, 0, 5, 9).getTime()

let n = 0
let laptop: IngatDB
let hp: IngatDB
let cloud: MemoryBackend

beforeEach(async () => {
  n++
  laptop = createDB(`laptop-${n}`)
  hp = createDB(`hp-${n}`)
  await Promise.all([laptop.open(), hp.open()])
  cloud = new MemoryBackend()
})

afterEach(async () => {
  await Promise.all([laptop.delete(), hp.delete()])
})

/** Bandingkan isi dua perangkat (tanpa penanda sinkron lokal). */
async function snapshot(database: IngatDB) {
  const strip = <T extends object>(rows: T[]) =>
    rows
      .map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_'))))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  return {
    decks: strip(await database.decks.toArray()),
    cards: strip(await database.cards.toArray()),
    logs: strip(await database.reviewLogs.toArray()),
    quiz: strip(await database.quizResults.toArray()),
  }
}

async function syncBoth() {
  await syncOnce(laptop, cloud)
  await syncOnce(hp, cloud)
  await syncOnce(laptop, cloud)
}

describe('penanda perubahan lokal', () => {
  it('menandai data baru & isi kartu, tetapi tidak menandai perubahan jadwal saja', async () => {
    const deckId = await createDeck({ name: 'A' }, laptop)
    const cardId = await addCard(deckId, { front: 'q', back: 'a' }, laptop)
    expect((await laptop.cards.get(cardId))?._dirty).toBe(1)
    await pushDirty(laptop, cloud)
    expect((await laptop.cards.get(cardId))?._dirty).toBe(0)
    expect((await laptop.decks.get(deckId))?._dirty).toBe(0)

    await answerCard(cardId, Rating.Bisa, T0, laptop)
    expect((await laptop.cards.get(cardId))?._dirty).toBe(0) // jadwal dihitung ulang dari riwayat
    expect((await laptop.reviewLogs.toArray())[0]._dirty).toBe(1)

    await updateCard(cardId, { front: 'q2', back: 'a' }, laptop)
    expect((await laptop.cards.get(cardId))?._dirty).toBe(1)
  })

  it('hanya pengaturan tertentu yang disinkron; tulisan dari sinkron tidak ditandai', async () => {
    await setSetting('desiredRetention', 0.85, laptop)
    await setSetting('reminderTime', '06:30', laptop)
    const rows = await laptop.settings.toArray()
    expect(rows.find((r) => r.key === 'desiredRetention')?._dirty).toBe(1)
    expect(rows.find((r) => r.key === 'reminderTime')?._dirty).toBeUndefined()
    await syncTransaction(laptop, () => laptop.decks.put({ id: 'x', name: 'x', description: '', color: 'indigo', createdAt: 1, updatedAt: 1 }))
    expect((await laptop.decks.get('x'))?._dirty).toBeUndefined()
  })

  it('setiap jalur hapus mencatat tombstone', async () => {
    const deckId = await createDeck({ name: 'A' }, laptop)
    const c1 = await addCard(deckId, { front: '1', back: '1' }, laptop)
    const c2 = await addCard(deckId, { front: '2', back: '2' }, laptop)
    const { undo } = await answerCard(c1, Rating.Bisa, T0, laptop)
    await undoAnswer(undo, laptop)
    await answerCard(c2, Rating.Bisa, T0, laptop)
    await deleteCard(c2, laptop)
    await deleteDeck(deckId, laptop)
    const keys = (await laptop.tombstones.toArray()).map((t) => t.key).sort()
    expect(keys.some((k) => k.startsWith('reviewLogs:'))).toBe(true)
    expect(keys).toContain(`cards:${c1}`)
    expect(keys).toContain(`cards:${c2}`)
    expect(keys).toContain(`decks:${deckId}`)
  })
})

describe('sinkron laptop ↔ HP', () => {
  it('HP baru mengunduh semua data laptop', async () => {
    const deckId = await createDeck({ name: 'Biokimia' }, laptop)
    const cardId = await addCard(deckId, { front: 'Apa itu PRPP?', back: 'Ribosa teraktivasi', frontImage: 'data:image/png;base64,AA==' }, laptop)
    await answerCard(cardId, Rating.Bisa, T0, laptop)
    await answerCard(cardId, Rating.Bisa, T0 + 10 * 60_000, laptop)
    await setSetting('desiredRetention', 0.85, laptop)

    expect(await suggestConnectMode(laptop, cloud)).toBe('upload')
    await connectDevice(laptop, cloud, 'user-1', 'upload')

    await seedSampleDecks(hp) // HP baru: hanya deck contoh
    expect(await suggestConnectMode(hp, cloud)).toBe('download')
    await connectDevice(hp, cloud, 'user-1', 'download')

    expect(await snapshot(hp)).toEqual(await snapshot(laptop))
    expect((await getSettings(hp)).desiredRetention).toBe(0.85)
    expect((await getSettings(hp)).syncUid).toBe('user-1')
    const c = (await hp.cards.get(cardId)) as Card
    expect(c.state).toBe('review')
    expect(c.frontImage).toBe('data:image/png;base64,AA==')
  })

  it('belajar di dua perangkat secara offline → riwayat digabung & jadwal sama persis', async () => {
    const deckId = await createDeck({ name: 'A' }, laptop)
    const ids = [] as string[]
    for (let i = 0; i < 4; i++) ids.push(await addCard(deckId, { front: `q${i}`, back: `a${i}` }, laptop))
    await connectDevice(laptop, cloud, 'u', 'upload')
    await connectDevice(hp, cloud, 'u', 'download')

    // offline: laptop mengulang kartu 0 & 2, HP mengulang kartu 1 & 2 (kartu 2 di keduanya)
    await answerCard(ids[0], Rating.Bisa, T0, laptop)
    await answerCard(ids[2], Rating.Lupa, T0 + 1000, laptop)
    await answerCard(ids[1], Rating.Mudah, T0 + 2000, hp)
    await answerCard(ids[2], Rating.Bisa, T0 + 3 * DAY, hp)

    await syncBoth()
    const a = await snapshot(laptop)
    const b = await snapshot(hp)
    expect(b).toEqual(a)
    expect(a.logs).toHaveLength(4)

    // jadwal kartu 2 = hasil memutar ulang kedua ulasan secara berurutan
    const card2 = a.cards.find((c) => c.id === ids[2]) as unknown as Card
    const params = paramsFromSettings(await getSettings(laptop))
    const logs = (await laptop.reviewLogs.where('cardId').equals(ids[2]).toArray())
    expect(pickSchedule(card2)).toEqual(replaySchedule({ ...card2, lastReview: null }, logs, params))
    expect(card2.reps).toBe(2)
    expect(card2.lapses).toBe(0) // lupa saat masih kartu baru bukan "lapse"
  })

  it('suntingan terbaru menang (last-writer-wins) dan tidak mengganggu jadwal', async () => {
    const deckId = await createDeck({ name: 'Lama' }, laptop)
    const cardId = await addCard(deckId, { front: 'versi 0', back: 'x' }, laptop)
    await connectDevice(laptop, cloud, 'u', 'upload')
    await connectDevice(hp, cloud, 'u', 'download')

    await updateCard(cardId, { front: 'versi laptop', back: 'x' }, laptop)
    await new Promise((r) => setTimeout(r, 5))
    await updateCard(cardId, { front: 'versi HP (lebih baru)', back: 'x' }, hp)
    await answerCard(cardId, Rating.Bisa, Date.now(), laptop)
    await updateDeck(deckId, { name: 'Baru dari HP' }, hp)

    await syncBoth()
    for (const d of [laptop, hp]) {
      expect((await d.cards.get(cardId))?.front).toBe('versi HP (lebih baru)')
      expect((await d.cards.get(cardId))?.state).toBe('learning')
      expect((await d.decks.get(deckId))?.name).toBe('Baru dari HP')
    }
  })

  it('penghapusan & pembatalan jawaban ikut tersinkron', async () => {
    const deckId = await createDeck({ name: 'A' }, laptop)
    const keep = await addCard(deckId, { front: 'tetap', back: '1' }, laptop)
    const gone = await addCard(deckId, { front: 'hapus', back: '2' }, laptop)
    await answerCard(gone, Rating.Bisa, T0, laptop)
    const { undo } = await answerCard(keep, Rating.Mudah, T0, laptop)
    await connectDevice(laptop, cloud, 'u', 'upload')
    await connectDevice(hp, cloud, 'u', 'download')
    expect((await hp.cards.get(keep))?.state).toBe('review')

    await deleteCard(gone, hp)
    await undoAnswer(undo, laptop)
    await syncBoth()

    for (const d of [laptop, hp]) {
      expect(await d.cards.get(gone)).toBeUndefined()
      expect(await d.reviewLogs.count()).toBe(0)
      expect((await d.cards.get(keep))?.state).toBe('new')
    }
    expect(await snapshot(hp)).toEqual(await snapshot(laptop))

    await deleteDeck(deckId, laptop)
    await syncBoth()
    expect(await hp.decks.count()).toBe(0)
    expect(await hp.cards.count()).toBe(0)
  })

  it('atur ulang kartu tersinkron: riwayat lama diabaikan di perangkat lain', async () => {
    const deckId = await createDeck({ name: 'A' }, laptop)
    const cardId = await addCard(deckId, { front: 'q', back: 'a' }, laptop)
    await answerCard(cardId, Rating.Mudah, T0, laptop)
    await connectDevice(laptop, cloud, 'u', 'upload')
    await connectDevice(hp, cloud, 'u', 'download')
    await resetCard(cardId, laptop)
    await syncBoth()
    expect((await hp.cards.get(cardId))?.state).toBe('new')
    await answerCard(cardId, Rating.Bisa, Date.now(), hp)
    await syncBoth()
    expect((await laptop.cards.get(cardId))?.state).toBe('learning')
    expect((await laptop.cards.get(cardId))?.reps).toBe(1)
  })

  it('gabungkan dua perangkat yang sama-sama punya data, tanpa duplikat deck contoh', async () => {
    await seedSampleDecks(laptop)
    const lDeck = await createDeck({ name: 'Punya laptop' }, laptop)
    await addCard(lDeck, { front: 'L', back: 'L' }, laptop)
    await connectDevice(laptop, cloud, 'u', 'upload')

    await seedSampleDecks(hp)
    const hDeck = await createDeck({ name: 'Punya HP' }, hp)
    const hCard = await addCard(hDeck, { front: 'H', back: 'H' }, hp)
    await answerCard(hCard, Rating.Bisa, T0, hp)
    expect(await suggestConnectMode(hp, cloud)).toBeNull() // tanyakan pengguna
    await connectDevice(hp, cloud, 'u', 'merge')
    await syncOnce(laptop, cloud)

    const names = (await laptop.decks.toArray()).map((d) => d.name).sort()
    expect(names).toEqual(['Kosakata Bahasa Inggris', 'Pengetahuan Umum & TWK Dasar', 'Punya HP', 'Punya laptop', 'Rumus Matematika Dasar'])
    expect(await snapshot(hp)).toEqual(await snapshot(laptop))
  })

  it('gagal kirim tidak kehilangan data; sinkron berikutnya melanjutkan', async () => {
    const deckId = await createDeck({ name: 'A' }, laptop)
    await connectDevice(laptop, cloud, 'u', 'upload')
    await addCard(deckId, { front: 'baru', back: 'x' }, laptop)
    cloud.failNext = true
    await expect(syncOnce(laptop, cloud)).rejects.toThrow('simulasi')
    expect(await laptop.cards.where('_dirty').equals(1).count()).toBe(1)
    const report = await syncOnce(laptop, cloud)
    expect(report.pushed).toBe(2) // kartu baru + deck (updatedAt berubah)
    const again = await syncOnce(laptop, cloud)
    expect(again.pushed).toBe(0) // tidak ada yang dikirim ulang
  })

  it('pengaturan perangkat (pengingat) tidak ikut tersinkron', async () => {
    await setSetting('reminderTime', '05:00', laptop)
    await setSetting('newPerDay', 35, laptop)
    await connectDevice(laptop, cloud, 'u', 'upload')
    await setSetting('reminderTime', '21:00', hp)
    await connectDevice(hp, cloud, 'u', 'download')
    const s = await getSettings(hp)
    expect(s.newPerDay).toBe(35)
    expect(s.reminderTime).toBe('21:00')
  })
})
