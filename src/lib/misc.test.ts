import { describe, expect, it } from 'vitest'
import { normalizeForCompare, parseRich, toPlainText } from './richtext'
import { buildQuiz, distinctAnswerCount, scoreQuiz, seededRng, shuffle } from './quiz'
import { cardMaturity, computeStreak, dailyCounts, dueForecast, retentionRate } from './stats'
import { buildDeckQueue, interleave, pickNext } from './queue'
import { parseTime, reminderMessage, shouldRemind } from './reminder'
import { newSchedule } from './fsrs'
import { DAY_MS, MINUTE_MS, dayKey, shiftDayKey } from './date'
import type { Card } from '../types'

describe('format teks kartu', () => {
  it('mengenali tebal, miring, pangkat, indeks, kode, dan baris baru', () => {
    expect(parseRich('**tebal** dan *miring*')).toEqual([
      { type: 'bold', children: [{ type: 'text', value: 'tebal' }] },
      { type: 'text', value: ' dan ' },
      { type: 'italic', children: [{ type: 'text', value: 'miring' }] },
    ])
    expect(parseRich('x^2^ + H~2~O')).toEqual([
      { type: 'text', value: 'x' },
      { type: 'sup', children: [{ type: 'text', value: '2' }] },
      { type: 'text', value: ' + H' },
      { type: 'sub', children: [{ type: 'text', value: '2' }] },
      { type: 'text', value: 'O' },
    ])
    expect(parseRich('a\nb')).toEqual([{ type: 'text', value: 'a' }, { type: 'br' }, { type: 'text', value: 'b' }])
  })

  it('format bersarang & tanda bintang perkalian tidak dianggap miring', () => {
    expect(parseRich('**sangat *penting***')[0]).toMatchObject({ type: 'bold' })
    expect(parseRich('2 * 3 * 4')).toEqual([{ type: 'text', value: '2 * 3 * 4' }])
  })

  it('tidak pernah menghasilkan HTML mentah', () => {
    expect(toPlainText('<b>halo</b> **dunia**')).toBe('<b>halo</b> dunia')
    expect(normalizeForCompare('  **Halo**   Dunia ')).toBe('halo dunia')
  })
})

describe('kuis pilihan ganda', () => {
  const cards = ['satu', 'dua', 'tiga', 'empat', 'lima'].map((back, i) => ({ id: `c${i}`, front: `Soal ${i}`, back }))

  it('membuat soal dengan 4 pilihan unik dan satu jawaban benar', () => {
    const qs = buildQuiz(cards, { count: 5, rng: seededRng(42) })
    expect(qs).toHaveLength(5)
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      const card = cards.find((c) => c.id === q.cardId)!
      expect(q.options[q.correctIndex]).toBe(card.back)
      expect(q.prompt).toBe(card.front)
    }
    expect(new Set(qs.map((q) => q.cardId)).size).toBe(5)
  })

  it('deterministik dengan seed yang sama', () => {
    expect(buildQuiz(cards, { count: 3, rng: seededRng(7) })).toEqual(buildQuiz(cards, { count: 3, rng: seededRng(7) }))
  })

  it('pilihan menyesuaikan bila deck kecil & arah bisa dibalik', () => {
    const two = cards.slice(0, 2)
    const qs = buildQuiz(two, { count: 10, rng: seededRng(1) })
    expect(qs).toHaveLength(2)
    expect(qs[0].options).toHaveLength(2)
    const rev = buildQuiz(cards, { count: 1, direction: 'belakang', rng: seededRng(3) })
    expect(rev[0].options[rev[0].correctIndex]).toMatch(/^Soal /)
  })

  it('tidak membuat soal bila jawaban berbeda kurang dari 2', () => {
    const same = [
      { id: 'a', front: 'x', back: 'Sama' },
      { id: 'b', front: 'y', back: '**sama**' },
    ]
    expect(distinctAnswerCount(same)).toBe(1)
    expect(buildQuiz(same, { count: 2 })).toEqual([])
  })

  it('menilai jawaban, termasuk yang tidak dijawab', () => {
    const qs = buildQuiz(cards, { count: 4, rng: seededRng(9) })
    const answers = [qs[0].correctIndex, (qs[1].correctIndex + 1) % 4, null, qs[3].correctIndex]
    expect(scoreQuiz(qs, answers)).toEqual({ total: 4, correct: 2, wrong: 1, unanswered: 1, percent: 50 })
    expect(scoreQuiz([], []).percent).toBe(0)
  })

  it('shuffle tidak mengubah array asli', () => {
    const arr = [1, 2, 3, 4]
    const out = shuffle(arr, seededRng(5))
    expect(arr).toEqual([1, 2, 3, 4])
    expect([...out].sort()).toEqual([1, 2, 3, 4])
  })
})

describe('statistik', () => {
  const today = '2026-03-10'

  it('streak berjalan termasuk hari ini', () => {
    const s = computeStreak(['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-01', '2026-03-02'], today)
    expect(s).toEqual({ current: 3, longest: 3, studiedToday: true })
  })

  it('streak tetap hidup bila belum belajar hari ini tapi kemarin belajar', () => {
    const s = computeStreak(['2026-03-08', '2026-03-09'], today)
    expect(s.current).toBe(2)
    expect(s.studiedToday).toBe(false)
  })

  it('streak putus bila melewatkan satu hari; rekor terpanjang tetap tercatat', () => {
    const s = computeStreak(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-08'], today)
    expect(s.current).toBe(0)
    expect(s.longest).toBe(4)
    expect(computeStreak([], today)).toEqual({ current: 0, longest: 0, studiedToday: false })
  })

  it('streak melintasi pergantian bulan', () => {
    expect(computeStreak(['2026-02-27', '2026-02-28', '2026-03-01'], '2026-03-01').current).toBe(3)
  })

  it('tingkat ingatan hanya menghitung kartu review', () => {
    const logs = [
      { state: 'review' as const, rating: 3 as const },
      { state: 'review' as const, rating: 1 as const },
      { state: 'review' as const, rating: 4 as const },
      { state: 'review' as const, rating: 2 as const },
      { state: 'new' as const, rating: 1 as const },
    ]
    expect(retentionRate(logs)).toBe(0.75)
    expect(retentionRate([])).toBeNull()
  })

  it('jumlah ulasan harian & perkiraan jatuh tempo', () => {
    const counts = dailyCounts(
      [
        { day: today, rating: 3 },
        { day: today, rating: 1 },
        { day: shiftDayKey(today, -2), rating: 4 },
        { day: '2020-01-01', rating: 4 },
      ],
      7,
      today,
    )
    expect(counts).toHaveLength(7)
    expect(counts[6]).toEqual({ day: today, total: 2, correct: 1, lapses: 1 })
    expect(counts[4].total).toBe(1)

    const now = new Date(2026, 2, 10, 9).getTime()
    const f = dueForecast(
      [
        { state: 'review', due: now - 5 * DAY_MS },
        { state: 'review', due: now + 2 * 3600_000 },
        { state: 'review', due: now + DAY_MS },
        { state: 'new', due: now },
        { state: 'review', due: now + 30 * DAY_MS },
      ],
      7,
      now,
    )
    expect(f[0]).toEqual({ day: dayKey(now), count: 2 })
    expect(f[1].count).toBe(1)
    expect(f.reduce((a, b) => a + b.count, 0)).toBe(3)
  })

  it('kelompok kematangan kartu', () => {
    expect(
      cardMaturity([
        { state: 'new', scheduledDays: 0 },
        { state: 'learning', scheduledDays: 0 },
        { state: 'relearning', scheduledDays: 0 },
        { state: 'review', scheduledDays: 5 },
        { state: 'review', scheduledDays: 30 },
      ]),
    ).toEqual({ baru: 1, belajar: 2, muda: 1, matang: 1 })
  })
})

describe('antrean belajar', () => {
  const now = new Date(2026, 2, 10, 9).getTime()
  const mk = (id: string, over: Partial<Card>): Card => ({
    id,
    deckId: 'd',
    front: id,
    back: id,
    createdAt: 0,
    updatedAt: 0,
    ...newSchedule(now),
    ...over,
  })

  it('mengelompokkan kartu jatuh tempo & membatasi kartu baru', () => {
    const cards = [
      mk('baru1', { createdAt: 2 }),
      mk('baru2', { createdAt: 1 }),
      mk('baru3', { createdAt: 3 }),
      mk('rev-hari-ini', { state: 'review', due: now + 3 * 3600_000 }),
      mk('rev-besok', { state: 'review', due: now + DAY_MS }),
      mk('belajar', { state: 'learning', due: now + 5 * MINUTE_MS }),
      mk('belajar-nanti', { state: 'learning', due: now + 60 * MINUTE_MS }),
    ]
    const q = buildDeckQueue(cards, now, 2)
    expect(q.fresh.map((c) => c.id)).toEqual(['baru2', 'baru1'])
    expect(q.review.map((c) => c.id)).toEqual(['rev-hari-ini'])
    expect(q.learning.map((c) => c.id)).toEqual(['belajar'])
    expect(buildDeckQueue(cards, now, 0).fresh).toEqual([])
  })

  it('menyisipkan kartu baru merata', () => {
    expect(interleave(['r1', 'r2', 'r3', 'r4'], ['n1', 'n2'])).toEqual(['r1', 'n1', 'r2', 'r3', 'n2', 'r4'])
    expect(interleave([], ['n1'])).toEqual(['n1'])
    expect(interleave(['r1'], [])).toEqual(['r1'])
  })

  it('mendahulukan kartu belajar yang jatuh tempo', () => {
    const due = mk('due', { state: 'learning', due: now - 1 })
    const later = mk('later', { state: 'learning', due: now + MINUTE_MS })
    const main = [mk('m', {})]
    expect(pickNext(main, [later, due], now)).toEqual({ card: due, from: 'learning' })
    expect(pickNext(main, [later], now)?.card.id).toBe('m')
    expect(pickNext([], [later], now)).toEqual({ card: later, from: 'learning' })
    expect(pickNext([], [], now)).toBeNull()
  })
})

describe('pengingat', () => {
  const at = (h: number, m = 0) => new Date(2026, 2, 10, h, m)
  const base = { enabled: true, time: '19:00', lastReminderDay: null, studiedToday: false }

  it('mengirim sekali setelah jam pengingat bila belum belajar', () => {
    expect(shouldRemind(base, at(18, 59), '2026-03-10')).toBe(false)
    expect(shouldRemind(base, at(19, 0), '2026-03-10')).toBe(true)
    expect(shouldRemind({ ...base, lastReminderDay: '2026-03-10' }, at(20), '2026-03-10')).toBe(false)
    expect(shouldRemind({ ...base, lastReminderDay: '2026-03-09' }, at(20), '2026-03-10')).toBe(true)
  })

  it('tidak mengirim bila nonaktif, sudah belajar, atau jam tidak valid', () => {
    expect(shouldRemind({ ...base, enabled: false }, at(20), '2026-03-10')).toBe(false)
    expect(shouldRemind({ ...base, studiedToday: true }, at(20), '2026-03-10')).toBe(false)
    expect(shouldRemind({ ...base, time: '25:00' }, at(20), '2026-03-10')).toBe(false)
    expect(parseTime('7:05')).toBe(425)
    expect(parseTime('abc')).toBeNull()
  })

  it('pesan menyebut jumlah kartu & streak', () => {
    expect(reminderMessage(12, 5).title).toContain('5 hari')
    expect(reminderMessage(12, 5).body).toContain('12 kartu')
    expect(reminderMessage(0, 0).title).toBe('Waktunya belajar! 📚')
  })
})

describe('fitur belajar tambahan', () => {
  const now = new Date(2026, 2, 10, 9).getTime()
  const mk = (id: string, over: Partial<Card>): Card => ({
    id,
    deckId: 'd',
    front: id,
    back: id,
    createdAt: 0,
    updatedAt: 0,
    ...newSchedule(now),
    ...over,
  })

  it('round-robin menyelang-nyeling kartu baru antar deck', async () => {
    const { roundRobin } = await import('./queue')
    expect(roundRobin([['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']])).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3'])
    expect(roundRobin([])).toEqual([])
  })

  it('latihan tambahan memilih kartu belum jatuh tempo dengan peluang ingat terendah', async () => {
    const { buildExtraQueue } = await import('./queue')
    const cards = [
      // terakhir diulang 20 hari lalu, S=10 → R rendah
      mk('rawan', { state: 'review', stability: 10, difficulty: 5, lastReview: now - 20 * DAY_MS, due: now + 2 * DAY_MS }),
      // baru diulang kemarin, S=30 → R tinggi
      mk('aman', { state: 'review', stability: 30, difficulty: 5, lastReview: now - DAY_MS, due: now + 29 * DAY_MS }),
      mk('sedang', { state: 'review', stability: 10, difficulty: 5, lastReview: now - 5 * DAY_MS, due: now + 5 * DAY_MS }),
      // jatuh tempo hari ini → masuk antrean biasa, bukan latihan tambahan
      mk('jatuh-tempo', { state: 'review', stability: 5, difficulty: 5, lastReview: now - 6 * DAY_MS, due: now - DAY_MS }),
      mk('baru', {}),
    ]
    expect(buildExtraQueue(cards, now).map((c) => c.id)).toEqual(['rawan', 'sedang', 'aman'])
    expect(buildExtraQueue(cards, now, 1).map((c) => c.id)).toEqual(['rawan'])
  })

  it('kartu leech ditandai setelah 8 kali lupa', async () => {
    const { isLeech } = await import('./queue')
    expect(isLeech({ lapses: 7 })).toBe(false)
    expect(isLeech({ lapses: 8 })).toBe(true)
  })
})
