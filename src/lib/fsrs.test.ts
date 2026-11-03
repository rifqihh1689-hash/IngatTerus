import { describe, expect, it } from 'vitest'
import { Rating, type Schedule } from '../types'
import { DAY_MS, MINUTE_MS } from './date'
import {
  DEFAULT_PARAMS,
  DEFAULT_W,
  fuzzInterval,
  isValidWeights,
  nextShortTermStability,
  forgettingCurve,
  formatInterval,
  initDifficulty,
  initStability,
  makeParams,
  newSchedule,
  nextDifficulty,
  nextInterval,
  retrievability,
  schedule,
  scheduleAll,
} from './fsrs'

const T0 = new Date(2026, 0, 5, 9, 0, 0).getTime() // Senin, 5 Jan 2026 09.00 lokal

/** Kartu review yang terakhir diulang `daysAgo` hari sebelum `now`. */
function reviewCard(overrides: Partial<Schedule> = {}, daysAgo = 10, now = T0): Schedule {
  return {
    ...newSchedule(now),
    state: 'review',
    stability: 10,
    difficulty: 5,
    reps: 5,
    lastReview: now - daysAgo * DAY_MS,
    due: now,
    scheduledDays: daysAgo,
    ...overrides,
  }
}

describe('kurva lupa & interval', () => {
  it('peluang ingat = 100% saat t=0 dan 90% saat t=S', () => {
    expect(forgettingCurve(0, 5)).toBeCloseTo(1, 10)
    expect(forgettingCurve(5, 5)).toBeCloseTo(0.9, 10)
    expect(forgettingCurve(42, 42)).toBeCloseTo(0.9, 10)
  })

  it('peluang ingat menurun seiring waktu', () => {
    expect(forgettingCurve(10, 5)).toBeLessThan(forgettingCurve(5, 5))
    expect(forgettingCurve(100, 5)).toBeGreaterThan(0)
  })

  it('interval sama dengan stabilitas pada target retensi 90%', () => {
    expect(nextInterval(10)).toBe(10)
    expect(nextInterval(3.4)).toBe(3)
  })

  it('target retensi lebih tinggi menghasilkan interval lebih pendek', () => {
    const tinggi = nextInterval(30, makeParams({ desiredRetention: 0.95 }))
    const rendah = nextInterval(30, makeParams({ desiredRetention: 0.8 }))
    expect(tinggi).toBeLessThan(30)
    expect(rendah).toBeGreaterThan(30)
  })

  it('interval minimal 1 hari dan dibatasi interval maksimum', () => {
    expect(nextInterval(0.01)).toBe(1)
    expect(nextInterval(100_000, makeParams({ maxInterval: 365 }))).toBe(365)
  })

  it('makeParams membatasi target retensi ke rentang aman', () => {
    expect(makeParams({ desiredRetention: 0.5 }).desiredRetention).toBe(0.7)
    expect(makeParams({ desiredRetention: 1 }).desiredRetention).toBe(0.97)
  })
})

describe('kesulitan & stabilitas awal', () => {
  it('stabilitas awal mengikuti parameter w0–w3 (FSRS-6)', () => {
    expect(DEFAULT_W).toHaveLength(21)
    expect(initStability(Rating.Lupa)).toBeCloseTo(0.212)
    expect(initStability(Rating.Mudah)).toBeCloseTo(8.2956)
  })

  it('kesulitan awal lebih tinggi untuk jawaban yang lebih buruk', () => {
    const d = [Rating.Lupa, Rating.Sulit, Rating.Bisa, Rating.Mudah].map((g) => initDifficulty(g))
    expect(d[0]).toBeGreaterThan(d[1])
    expect(d[1]).toBeGreaterThan(d[2])
    expect(d[2]).toBeGreaterThan(d[3])
    for (const x of d) {
      expect(x).toBeGreaterThanOrEqual(1)
      expect(x).toBeLessThanOrEqual(10)
    }
  })

  it('kesulitan tetap di rentang 1–10 setelah banyak jawaban ekstrem', () => {
    let d = 5
    for (let i = 0; i < 100; i++) d = nextDifficulty(d, Rating.Lupa)
    expect(d).toBeLessThanOrEqual(10)
    expect(d).toBeGreaterThan(9)
    for (let i = 0; i < 100; i++) d = nextDifficulty(d, Rating.Mudah)
    expect(d).toBeGreaterThanOrEqual(1)
    expect(d).toBeLessThan(4)
  })
})

describe('kartu baru', () => {
  const card = newSchedule(T0)

  it('Lupa → langkah belajar pertama (1 menit)', () => {
    const { card: next, log } = schedule(card, Rating.Lupa, T0)
    expect(next.state).toBe('learning')
    expect(next.step).toBe(0)
    expect(next.due - T0).toBe(1 * MINUTE_MS)
    expect(next.reps).toBe(1)
    expect(next.lastReview).toBe(T0)
    expect(log.state).toBe('new')
    expect(log.scheduledDays).toBe(0)
  })

  it('Sulit → rata-rata langkah pertama & kedua (5,5 menit)', () => {
    const next = schedule(card, Rating.Sulit, T0).card
    expect(next.state).toBe('learning')
    expect(next.due - T0).toBe(5.5 * MINUTE_MS)
  })

  it('Bisa → langkah belajar kedua (10 menit)', () => {
    const next = schedule(card, Rating.Bisa, T0).card
    expect(next.state).toBe('learning')
    expect(next.step).toBe(1)
    expect(next.due - T0).toBe(10 * MINUTE_MS)
  })

  it('Mudah → langsung lulus ke jadwal harian', () => {
    const next = schedule(card, Rating.Mudah, T0).card
    expect(next.state).toBe('review')
    expect(next.scheduledDays).toBe(8) // round(S0(Mudah) = 8,30)
    expect(next.due).toBe(T0 + 8 * DAY_MS)
    expect(next.difficulty).toBeCloseTo(initDifficulty(Rating.Mudah))
  })

  it('tanpa langkah belajar, Bisa langsung masuk jadwal harian', () => {
    const p = makeParams({ learningSteps: [] })
    const all = scheduleAll(card, T0, p)
    for (const g of [Rating.Lupa, Rating.Sulit, Rating.Bisa, Rating.Mudah]) expect(all[g].state).toBe('review')
    expect(all[Rating.Mudah].scheduledDays).toBeGreaterThan(all[Rating.Bisa].scheduledDays)
  })

  it('tidak mengubah objek kartu asli (fungsi murni)', () => {
    const copy = structuredClone(card)
    scheduleAll(card, T0)
    expect(card).toEqual(copy)
  })
})

describe('kartu dalam langkah belajar', () => {
  it('Bisa di langkah terakhir → lulus dengan interval ≥ 1 hari', () => {
    const s1 = schedule(newSchedule(T0), Rating.Bisa, T0).card // langkah 2 (10 mnt)
    const t1 = s1.due
    const s2 = schedule(s1, Rating.Bisa, t1).card
    expect(s2.state).toBe('review')
    expect(s2.scheduledDays).toBeGreaterThanOrEqual(1)
    expect(s2.due).toBe(t1 + s2.scheduledDays * DAY_MS)
    // pengulangan di hari yang sama memakai stabilitas jangka pendek → tidak turun bila Bisa
    expect(s2.stability).toBeGreaterThanOrEqual(s1.stability)
  })

  it('Lupa di langkah belajar kembali ke langkah pertama', () => {
    const s1 = schedule(newSchedule(T0), Rating.Bisa, T0).card
    const s2 = schedule(s1, Rating.Lupa, s1.due).card
    expect(s2.state).toBe('learning')
    expect(s2.step).toBe(0)
    expect(s2.due - s1.due).toBe(MINUTE_MS)
    expect(s2.stability).toBeLessThan(s1.stability)
  })

  it('Sulit mengulang langkah yang sama', () => {
    const s1 = schedule(newSchedule(T0), Rating.Bisa, T0).card
    const s2 = schedule(s1, Rating.Sulit, s1.due).card
    expect(s2.state).toBe('learning')
    expect(s2.step).toBe(1)
    expect(s2.due - s1.due).toBe(10 * MINUTE_MS)
  })
})

describe('kartu review', () => {
  it('urutan interval: Sulit ≤ Bisa < Mudah', () => {
    const all = scheduleAll(reviewCard(), T0)
    const h = all[Rating.Sulit].scheduledDays
    const g = all[Rating.Bisa].scheduledDays
    const e = all[Rating.Mudah].scheduledDays
    expect(h).toBeLessThanOrEqual(g)
    expect(g).toBeLessThan(e)
    expect(h).toBeGreaterThanOrEqual(1)
  })

  it('Bisa tepat waktu menaikkan stabilitas dan interval', () => {
    const card = reviewCard()
    const next = schedule(card, Rating.Bisa, T0).card
    expect(next.state).toBe('review')
    expect(next.stability).toBeGreaterThan(card.stability)
    expect(next.scheduledDays).toBeGreaterThan(card.scheduledDays)
    expect(next.lapses).toBe(0)
  })

  it('Lupa → belajar ulang, jumlah lupa bertambah, stabilitas turun', () => {
    const card = reviewCard({ lapses: 1 })
    const next = schedule(card, Rating.Lupa, T0).card
    expect(next.state).toBe('relearning')
    expect(next.lapses).toBe(2)
    expect(next.stability).toBeLessThan(card.stability)
    expect(next.due - T0).toBe(10 * MINUTE_MS)
    expect(next.difficulty).toBeGreaterThan(card.difficulty)
  })

  it('belajar ulang lalu Bisa → kembali ke jadwal harian', () => {
    const lapsed = schedule(reviewCard(), Rating.Lupa, T0).card
    const back = schedule(lapsed, Rating.Bisa, lapsed.due).card
    expect(back.state).toBe('review')
    expect(back.scheduledDays).toBeGreaterThanOrEqual(1)
  })

  it('mengulang terlambat (R lebih rendah) memberi kenaikan stabilitas lebih besar', () => {
    const tepat = schedule(reviewCard({}, 10), Rating.Bisa, T0).card
    const telat = schedule(reviewCard({}, 30), Rating.Bisa, T0).card
    expect(telat.stability).toBeGreaterThan(tepat.stability)
  })

  it('interval tumbuh terus bila selalu dijawab Bisa tepat waktu', () => {
    let card = newSchedule(T0)
    let now = T0
    const intervals: number[] = []
    // lulus dari langkah belajar
    card = schedule(card, Rating.Bisa, now).card
    now = card.due
    card = schedule(card, Rating.Bisa, now).card
    for (let i = 0; i < 6; i++) {
      intervals.push(card.scheduledDays)
      now = card.due
      card = schedule(card, Rating.Bisa, now).card
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1])
  })

  it('menghormati interval maksimum', () => {
    const p = makeParams({ maxInterval: 30 })
    const all = scheduleAll(reviewCard({ stability: 500 }, 400), T0, p)
    expect(all[Rating.Mudah].scheduledDays).toBeLessThanOrEqual(30)
    expect(all[Rating.Bisa].scheduledDays).toBeLessThanOrEqual(30)
  })
})

describe('retrievability & format', () => {
  it('kartu baru bernilai 0, kartu review mengikuti kurva lupa', () => {
    expect(retrievability(newSchedule(T0), T0)).toBe(0)
    const card = reviewCard({ stability: 10 }, 10)
    expect(retrievability(card, T0)).toBeCloseTo(0.9, 5)
  })

  it('format interval dalam Bahasa Indonesia', () => {
    expect(formatInterval(30_000)).toBe('<1 mnt')
    expect(formatInterval(10 * MINUTE_MS)).toBe('10 mnt')
    expect(formatInterval(3 * 60 * MINUTE_MS)).toBe('3 jam')
    expect(formatInterval(4 * DAY_MS)).toBe('4 hr')
    expect(formatInterval(45 * DAY_MS)).toBe('1,5 bln')
    expect(formatInterval(730 * DAY_MS)).toBe('2 thn')
  })

  it('parameter bawaan memakai langkah 1 & 10 menit', () => {
    expect(DEFAULT_PARAMS.learningSteps).toEqual([1, 10])
    expect(DEFAULT_PARAMS.relearningSteps).toEqual([10])
  })
})

describe('FSRS-6: kurva lupa yang bisa dilatih & stabilitas jangka pendek', () => {
  it('R(S, S) selalu 90% berapa pun kemiringan kurva (w20)', () => {
    for (const decay of [0.1, 0.1542, 0.5, 0.8]) {
      const w = [...DEFAULT_W]
      w[20] = decay
      expect(forgettingCurve(7, 7, w)).toBeCloseTo(0.9, 10)
    }
  })

  it('w20 lebih besar → lupa lebih cepat setelah melewati S', () => {
    const datar = [...DEFAULT_W]
    datar[20] = 0.1
    const curam = [...DEFAULT_W]
    curam[20] = 0.8
    expect(forgettingCurve(30, 5, curam)).toBeLessThan(forgettingCurve(30, 5, datar))
  })

  it('jawaban Bisa/Mudah di hari yang sama tidak menurunkan stabilitas', () => {
    for (const s of [0.5, 2, 10, 80]) {
      expect(nextShortTermStability(s, Rating.Bisa)).toBeGreaterThanOrEqual(s)
      expect(nextShortTermStability(s, Rating.Mudah)).toBeGreaterThanOrEqual(s)
      expect(nextShortTermStability(s, Rating.Lupa)).toBeLessThan(s)
    }
  })

  it('validasi parameter: panjang 21 & di dalam batas', () => {
    expect(isValidWeights([...DEFAULT_W])).toBe(true)
    expect(isValidWeights(DEFAULT_W.slice(0, 19))).toBe(false)
    expect(isValidWeights([...DEFAULT_W.slice(0, 20), 5])).toBe(false)
    expect(isValidWeights('bukan array')).toBe(false)
    // parameter tidak valid diganti bawaan
    expect(makeParams({ w: [1, 2, 3] }).w).toBe(DEFAULT_W)
  })
})

describe('fuzz interval', () => {
  it('interval pendek (< 2,5 hari) tidak diacak', () => {
    expect(fuzzInterval(1, 0, 'a', 36500)).toBe(1)
    expect(fuzzInterval(2, 0, 'b', 36500)).toBe(2)
  })

  it('deterministik untuk seed yang sama dan tetap dalam rentang ±5–15%', () => {
    expect(fuzzInterval(30, 10, 'kartu-1:3:3', 36500)).toBe(fuzzInterval(30, 10, 'kartu-1:3:3', 36500))
    const values = new Set<number>()
    for (let i = 0; i < 200; i++) {
      const v = fuzzInterval(30, 10, `kartu-${i}`, 36500)
      expect(v).toBeGreaterThanOrEqual(27)
      expect(v).toBeLessThanOrEqual(33)
      values.add(v)
    }
    expect(values.size).toBeGreaterThan(3) // benar-benar tersebar
  })

  it('tidak melewati interval maksimum', () => {
    for (let i = 0; i < 50; i++) expect(fuzzInterval(400, 300, `x${i}`, 365)).toBeLessThanOrEqual(365)
  })

  it('pratinjau tombol sama dengan hasil sebenarnya & urutan interval tetap terjaga', () => {
    const card = reviewCard({ stability: 25 }, 25)
    for (let i = 0; i < 30; i++) {
      const seed = `kartu-${i}`
      const all = scheduleAll(card, T0, DEFAULT_PARAMS, seed)
      expect(schedule(card, Rating.Bisa, T0, DEFAULT_PARAMS, seed).card).toEqual(all[Rating.Bisa])
      expect(all[Rating.Sulit].scheduledDays).toBeLessThanOrEqual(all[Rating.Bisa].scheduledDays)
      expect(all[Rating.Bisa].scheduledDays).toBeLessThan(all[Rating.Mudah].scheduledDays)
    }
  })
})
