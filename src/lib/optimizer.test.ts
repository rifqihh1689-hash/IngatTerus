import { describe, expect, it } from 'vitest'
import { buildDataset, countTrainable, datasetLoss, optimizeWeights, replayMemory, type TrainSequence } from './optimizer'
import {
  DEFAULT_PARAMS,
  DEFAULT_W,
  forgettingCurve,
  initDifficulty,
  initStability,
  isValidWeights,
  nextDifficulty,
  nextForgetStability,
  nextInterval,
  nextRecallStability,
  schedule,
  newSchedule,
} from './fsrs'
import { seededRng } from './quiz'
import { DAY_MS } from './date'
import { Rating } from '../types'

/** Pelajar sintetis yang memorinya mengikuti FSRS-6 dengan parameter `truth`. */
function simulate(truth: readonly number[], cards: number, reviewsPerCard: number, seed: number): TrainSequence[] {
  const rand = seededRng(seed)
  const out: TrainSequence[] = []
  for (let c = 0; c < cards; c++) {
    const first: Rating = rand() < 0.15 ? Rating.Lupa : rand() < 0.1 ? Rating.Sulit : rand() < 0.08 ? Rating.Mudah : Rating.Bisa
    const seq: TrainSequence = [{ rating: first, elapsedDays: 0 }]
    let s = initStability(first, truth)
    let d = initDifficulty(first, truth)
    for (let k = 0; k < reviewsPerCard; k++) {
      // jadwal bervariasi (0,5×–3× interval ideal) agar kemiringan kurva bisa dipelajari
      const ideal = nextInterval(s, { ...DEFAULT_PARAMS, w: truth })
      const t = Math.max(1, Math.round(ideal * (0.5 + rand() * 2.5)))
      const r = forgettingCurve(t, s, truth)
      const recalled = rand() < r
      const g: Rating = !recalled ? Rating.Lupa : rand() < 0.75 ? Rating.Bisa : rand() < 0.5 ? Rating.Sulit : Rating.Mudah
      seq.push({ rating: g, elapsedDays: t })
      s = g === Rating.Lupa ? nextForgetStability(d, s, r, truth) : nextRecallStability(d, s, r, g, truth)
      d = nextDifficulty(d, g, truth)
    }
    out.push(seq)
  }
  return out
}

describe('penyusunan data latih', () => {
  const day = (n: number, h = 9) => new Date(2026, 0, 1 + n, h).getTime()

  it('mengelompokkan per kartu, menghitung selisih hari, dan memecah di kartu yang diatur ulang', () => {
    const logs = [
      { cardId: 'a', rating: Rating.Bisa, state: 'new' as const, reviewedAt: day(0) },
      { cardId: 'a', rating: Rating.Bisa, state: 'learning' as const, reviewedAt: day(0, 10) },
      { cardId: 'a', rating: Rating.Lupa, state: 'review' as const, reviewedAt: day(3) },
      // kartu diatur ulang → mulai urutan baru
      { cardId: 'a', rating: Rating.Mudah, state: 'new' as const, reviewedAt: day(10) },
      { cardId: 'a', rating: Rating.Bisa, state: 'review' as const, reviewedAt: day(18) },
      // riwayat tidak lengkap (tidak diawali kartu baru) → dibuang
      { cardId: 'b', rating: Rating.Bisa, state: 'review' as const, reviewedAt: day(2) },
      { cardId: 'b', rating: Rating.Bisa, state: 'review' as const, reviewedAt: day(9) },
      // hanya satu ulasan → dibuang
      { cardId: 'c', rating: Rating.Bisa, state: 'new' as const, reviewedAt: day(1) },
    ]
    const ds = buildDataset([...logs].reverse())
    expect(ds).toEqual([
      [
        { rating: Rating.Bisa, elapsedDays: 0 },
        { rating: Rating.Bisa, elapsedDays: 0 },
        { rating: Rating.Lupa, elapsedDays: 3 },
      ],
      [
        { rating: Rating.Mudah, elapsedDays: 0 },
        { rating: Rating.Bisa, elapsedDays: 8 },
      ],
    ])
    expect(countTrainable(ds)).toBe(2)
  })

  it('putar ulang memori sama dengan penjadwal sungguhan', () => {
    let card = newSchedule(day(0))
    const seq: TrainSequence = []
    const plan: [Rating, number][] = [
      [Rating.Bisa, day(0)],
      [Rating.Bisa, day(0, 10)],
      [Rating.Bisa, day(3)],
      [Rating.Lupa, day(12)],
      [Rating.Bisa, day(12, 11)],
      [Rating.Mudah, day(20)],
    ]
    let prev: number | null = null
    for (const [g, t] of plan) {
      seq.push({ rating: g, elapsedDays: prev == null ? 0 : Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date(prev).setHours(0, 0, 0, 0)) / DAY_MS) })
      card = schedule(card, g, t).card
      prev = t
    }
    const m = replayMemory(seq)
    expect(m.stability).toBeCloseTo(card.stability, 8)
    expect(m.difficulty).toBeCloseTo(card.difficulty, 8)
  })
})

describe('optimizer FSRS-6', () => {
  // "kebenaran": pelajar yang ingatan awalnya lebih kuat & kurvanya lebih curam dari rata-rata
  const truth = [...DEFAULT_W]
  truth[0] = 0.8
  truth[1] = 3
  truth[2] = 6
  truth[3] = 20
  truth[20] = 0.4

  it('menurunkan log loss dan mendekati parameter sebenarnya', async () => {
    const data = simulate(truth, 260, 6, 7)
    expect(countTrainable(data)).toBeGreaterThan(1000)
    const progress: number[] = []
    const res = await optimizeWeights(data, { iterations: 120, yieldEvery: 0, onProgress: (p) => progress.push(p) })
    expect(res.improved).toBe(true)
    expect(res.lossAfter).toBeLessThan(res.lossBefore)
    expect(isValidWeights(res.w)).toBe(true)
    // stabilitas awal "Bisa" bergerak dari 2,31 ke arah 6
    expect(Math.abs(res.w[2] - truth[2])).toBeLessThan(Math.abs(DEFAULT_W[2] - truth[2]))
    // loss dengan parameter hasil optimasi mendekati loss dengan parameter sebenarnya
    const best = datasetLoss(data, truth).loss
    expect(res.lossAfter - best).toBeLessThan((res.lossBefore - best) * 0.5)
    expect(progress[progress.length - 1]).toBe(1)
  }, 30_000)

  it('tidak mengubah apa pun bila data tidak cukup atau tidak ada perbaikan', async () => {
    const empty = await optimizeWeights([], { iterations: 5 })
    expect(empty.improved).toBe(false)
    expect(empty.w).toEqual([...DEFAULT_W])

    // data dari parameter bawaan sendiri → bawaan sudah hampir optimal
    const data = simulate(DEFAULT_W, 40, 4, 3)
    const res = await optimizeWeights(data, { iterations: 30, yieldEvery: 0 })
    expect(res.lossAfter).toBeLessThanOrEqual(res.lossBefore)
    expect(isValidWeights(res.w)).toBe(true)
  }, 30_000)
})
