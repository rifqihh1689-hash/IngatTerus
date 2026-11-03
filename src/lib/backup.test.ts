import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, BackupError, buildBackup, parseBackup } from './backup'
import { newSchedule } from './fsrs'
import type { Card, Deck } from '../types'

const NOW = new Date(2026, 4, 1, 10).getTime()

const deck: Deck = { id: 'd1', name: 'Kosakata', description: '', color: 'indigo', createdAt: NOW, updatedAt: NOW }
const card: Card = {
  id: 'c1',
  deckId: 'd1',
  front: 'apple',
  back: 'apel',
  createdAt: NOW,
  updatedAt: NOW,
  ...newSchedule(NOW),
  state: 'review',
  stability: 12.5,
  difficulty: 4.2,
  reps: 3,
  lastReview: NOW - 86_400_000,
  scheduledDays: 12,
}

describe('cadangan JSON', () => {
  it('buildBackup → JSON → parseBackup mempertahankan data', () => {
    const backup = buildBackup(
      {
        decks: [deck],
        cards: [card],
        reviewLogs: [
          { id: 'l1', cardId: 'c1', deckId: 'd1', rating: 3, state: 'review', reviewedAt: NOW, day: '2026-05-01', elapsedDays: 1, scheduledDays: 12 },
        ],
        quizResults: [{ id: 'q1', deckId: 'd1', mode: 'ujian', total: 10, correct: 8, durationSec: 120, takenAt: NOW, day: '2026-05-01' }],
        settings: [{ key: 'newPerDay', value: 15 }],
      },
      NOW,
    )
    expect(backup.format).toBe(BACKUP_FORMAT)
    const { data, skipped } = parseBackup(JSON.stringify(backup), NOW)
    expect(skipped).toBe(0)
    expect(data.decks).toEqual([deck])
    expect(data.cards).toEqual([card])
    expect(data.reviewLogs).toHaveLength(1)
    expect(data.quizResults[0].mode).toBe('ujian')
    expect(data.settings).toEqual([{ key: 'newPerDay', value: 15 }])
  })

  it('menolak JSON rusak dan berkas yang bukan cadangan', () => {
    expect(() => parseBackup('{ tidak valid')).toThrow(BackupError)
    expect(() => parseBackup('{ tidak valid')).toThrow('bukan JSON')
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow('bukan cadangan IngatTerus')
    expect(() => parseBackup(JSON.stringify([1, 2]))).toThrow(BackupError)
  })

  it('menolak versi yang lebih baru dari aplikasi', () => {
    const raw = { format: BACKUP_FORMAT, version: 99, decks: [], cards: [] }
    expect(() => parseBackup(JSON.stringify(raw))).toThrow('tidak didukung')
  })

  it('menolak cadangan tanpa daftar deck/kartu', () => {
    expect(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1 }))).toThrow('deck dan kartu')
  })

  it('melewati entri rusak dan melengkapi bidang yang hilang', () => {
    const raw = {
      format: BACKUP_FORMAT,
      version: 1,
      decks: [{ id: 'd1', name: '  Deck A  ' }, { id: '', name: 'tanpa id' }, 'sampah'],
      cards: [
        { id: 'c1', deckId: 'd1', front: 'tanya', back: 'jawab' },
        { id: 'c2', deckId: 'tidak-ada', front: 'yatim', back: 'x' },
        { id: 'c3', deckId: 'd1', front: '', back: 'tanpa depan' },
        { id: 'c4', deckId: 'd1', front: 'x', back: 'y', state: 'aneh', due: 'besok' },
      ],
      reviewLogs: [
        { id: 'l1', cardId: 'c1', deckId: 'd1', rating: 9 },
        { id: 'l2', cardId: 'c1', deckId: 'd1', rating: 1, reviewedAt: NOW },
      ],
    }
    const { data, skipped } = parseBackup(JSON.stringify(raw), NOW)
    expect(data.decks).toHaveLength(1)
    expect(data.decks[0]).toMatchObject({ name: 'Deck A', color: 'indigo', description: '' })
    expect(data.cards.map((c) => c.id)).toEqual(['c1', 'c4'])
    expect(data.cards[0]).toMatchObject({ state: 'new', reps: 0, lastReview: null, due: NOW })
    expect(data.cards[1]).toMatchObject({ state: 'new', due: NOW })
    expect(data.reviewLogs).toHaveLength(1)
    expect(data.reviewLogs[0].day).toBe('2026-05-01')
    expect(data.quizResults).toEqual([])
    expect(skipped).toBe(2 + 2 + 1)
  })
})
