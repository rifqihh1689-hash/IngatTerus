/**
 * Optimizer parameter FSRS-6 dari riwayat belajar pengguna.
 *
 * Cara kerja (versi ringkas dari optimizer resmi FSRS):
 *  1. Riwayat ulasan dikelompokkan per kartu (sejak kartu itu baru).
 *  2. Untuk satu set parameter, memori setiap kartu "diputar ulang" dan peluang
 *     ingat R diprediksi pada setiap ulasan yang berjarak ≥ 1 hari.
 *  3. Kualitas prediksi diukur dengan log loss (binary cross-entropy) terhadap
 *     hasil sebenarnya (ingat = Sulit/Bisa/Mudah, lupa = Lupa).
 *  4. Parameter disesuaikan dengan Adam + gradien numerik, dibatasi pada rentang
 *     yang wajar, dan diregularisasi ke parameter bawaan agar tidak overfit
 *     ketika data masih sedikit.
 * Parameter baru hanya dipakai bila memang memprediksi lebih baik.
 */
import {
  DEFAULT_W,
  W_LOWER,
  W_UPPER,
  forgettingCurve,
  initDifficulty,
  initStability,
  nextDifficulty,
  nextForgetStability,
  nextRecallStability,
  nextShortTermStability,
} from './fsrs'
import { calendarDaysBetween } from './date'
import { Rating, type ReviewLog } from '../types'

export interface TrainItem {
  rating: Rating
  /** Selisih hari kalender sejak ulasan sebelumnya (0 untuk ulasan pertama/hari yang sama). */
  elapsedDays: number
}

export type TrainSequence = TrainItem[]

/** Minimal ulasan berjarak ≥ 1 hari agar optimasi diizinkan. */
export const MIN_TRAIN_REVIEWS = 100
/** Jumlah ulasan yang disarankan untuk hasil yang stabil. */
export const RECOMMENDED_TRAIN_REVIEWS = 400

type LogLike = Pick<ReviewLog, 'cardId' | 'rating' | 'state' | 'reviewedAt'>

/**
 * Susun data latih: satu urutan per kartu, dimulai dari ulasan saat kartu masih
 * baru. Riwayat yang tidak lengkap (tidak diawali kartu baru) dibuang; kartu yang
 * diatur ulang memulai urutan baru.
 */
export function buildDataset(logs: readonly LogLike[]): TrainSequence[] {
  const byCard = new Map<string, LogLike[]>()
  for (const l of logs) {
    const list = byCard.get(l.cardId)
    if (list) list.push(l)
    else byCard.set(l.cardId, [l])
  }
  const out: TrainSequence[] = []
  for (const list of byCard.values()) {
    list.sort((a, b) => a.reviewedAt - b.reviewedAt)
    let seq: TrainSequence | null = null
    let prev: LogLike | null = null
    for (const l of list) {
      if (l.state === 'new') {
        if (seq && seq.length >= 2) out.push(seq)
        seq = [{ rating: l.rating, elapsedDays: 0 }]
      } else if (seq && prev) {
        seq.push({ rating: l.rating, elapsedDays: Math.max(0, calendarDaysBetween(prev.reviewedAt, l.reviewedAt)) })
      }
      prev = l
    }
    if (seq && seq.length >= 2) out.push(seq)
  }
  return out
}

/** Banyak ulasan yang dipakai untuk menilai prediksi (berjarak ≥ 1 hari). */
export function countTrainable(dataset: readonly TrainSequence[]): number {
  let n = 0
  for (const seq of dataset) for (let i = 1; i < seq.length; i++) if (seq[i].elapsedDays > 0) n++
  return n
}

/** Putar ulang memori satu kartu dengan parameter `w`. */
export function replayMemory(seq: readonly TrainItem[], w: readonly number[] = DEFAULT_W): { stability: number; difficulty: number } {
  let s = initStability(seq[0].rating, w)
  let d = initDifficulty(seq[0].rating, w)
  for (let i = 1; i < seq.length; i++) {
    const it = seq[i]
    if (it.elapsedDays > 0) {
      const r = forgettingCurve(it.elapsedDays, s, w)
      s = it.rating === Rating.Lupa ? nextForgetStability(d, s, r, w) : nextRecallStability(d, s, r, it.rating, w)
    } else {
      s = nextShortTermStability(s, it.rating, w)
    }
    d = nextDifficulty(d, it.rating, w)
  }
  return { stability: s, difficulty: d }
}

const EPS = 1e-6

/** Rata-rata log loss prediksi peluang ingat. Lebih kecil = lebih akurat. */
export function datasetLoss(dataset: readonly TrainSequence[], w: readonly number[]): { loss: number; count: number } {
  let sum = 0
  let n = 0
  for (const seq of dataset) {
    let s = initStability(seq[0].rating, w)
    let d = initDifficulty(seq[0].rating, w)
    for (let i = 1; i < seq.length; i++) {
      const it = seq[i]
      if (it.elapsedDays > 0) {
        const r = forgettingCurve(it.elapsedDays, s, w)
        const p = Math.min(Math.max(r, EPS), 1 - EPS)
        sum -= it.rating > Rating.Lupa ? Math.log(p) : Math.log(1 - p)
        n++
        s = it.rating === Rating.Lupa ? nextForgetStability(d, s, r, w) : nextRecallStability(d, s, r, it.rating, w)
      } else {
        s = nextShortTermStability(s, it.rating, w)
      }
      d = nextDifficulty(d, it.rating, w)
    }
  }
  return { loss: n ? sum / n : 0, count: n }
}

/* ---------- Parameterisasi ternormalisasi (0–1) ---------- */

const LOG_SCALE = new Set([0, 1, 2, 3]) // stabilitas awal: rentang 0,001–100 → skala log

function toUnit(w: readonly number[]): number[] {
  return w.map((v, i) => {
    const lo = W_LOWER[i]
    const hi = W_UPPER[i]
    const x = LOG_SCALE.has(i) ? (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : (v - lo) / (hi - lo)
    return Math.min(Math.max(x, 0), 1)
  })
}

function fromUnit(x: readonly number[]): number[] {
  return x.map((u, i) => {
    const lo = W_LOWER[i]
    const hi = W_UPPER[i]
    const c = Math.min(Math.max(u, 0), 1)
    return LOG_SCALE.has(i) ? Math.exp(Math.log(lo) + c * (Math.log(hi) - Math.log(lo))) : lo + c * (hi - lo)
  })
}

export interface OptimizeOptions {
  iterations?: number
  /** Parameter awal (bawaan FSRS-6). */
  initial?: readonly number[]
  /** Kekuatan regularisasi ke parameter awal (dibagi jumlah ulasan). */
  regularization?: number
  /** Batas ulasan per iterasi (mini-batch) agar tetap cepat untuk riwayat besar. */
  batchReviews?: number
  onProgress?: (fraction: number) => void
  /** Beri jeda ke UI setiap n iterasi (0 = tanpa jeda). */
  yieldEvery?: number
  seed?: number
}

export interface OptimizeResult {
  w: number[]
  lossBefore: number
  lossAfter: number
  reviews: number
  /** true bila parameter baru lebih akurat dan dipakai. */
  improved: boolean
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sampleBatch(dataset: readonly TrainSequence[], target: number, rand: () => number): TrainSequence[] {
  const total = countTrainable(dataset)
  if (total <= target) return dataset as TrainSequence[]
  const keep = target / total
  const out = dataset.filter(() => rand() < keep)
  return out.length ? out : (dataset as TrainSequence[])
}

/** Latih parameter FSRS-6 dari data. Fungsi async agar UI tetap responsif. */
export async function optimizeWeights(dataset: readonly TrainSequence[], options: OptimizeOptions = {}): Promise<OptimizeResult> {
  const {
    iterations = 160,
    initial = DEFAULT_W,
    regularization = 4,
    batchReviews = 2500,
    onProgress,
    yieldEvery = 4,
    seed = 42,
  } = options
  const reviews = countTrainable(dataset)
  const lossBefore = datasetLoss(dataset, initial).loss
  if (reviews === 0) return { w: [...initial], lossBefore, lossAfter: lossBefore, reviews, improved: false }

  const x0 = toUnit(initial)
  const x = [...x0]
  const m = new Array(x.length).fill(0)
  const v = new Array(x.length).fill(0)
  const lambda = regularization / reviews
  const h = 1e-3
  const rand = rng(seed)
  const beta1 = 0.9
  const beta2 = 0.999

  const objective = (data: readonly TrainSequence[], xs: readonly number[]) => {
    let reg = 0
    for (let i = 0; i < xs.length; i++) reg += (xs[i] - x0[i]) ** 2
    return datasetLoss(data, fromUnit(xs)).loss + lambda * reg
  }

  for (let it = 0; it < iterations; it++) {
    const batch = sampleBatch(dataset, batchReviews, rand)
    const f0 = objective(batch, x)
    const grad = new Array(x.length).fill(0)
    for (let i = 0; i < x.length; i++) {
      const xi = x[i]
      const step = xi + h <= 1 ? h : -h
      x[i] = xi + step
      grad[i] = (objective(batch, x) - f0) / step
      x[i] = xi
    }
    // laju belajar menurun (cosine) dari 0,04 ke 0,004
    const lr = 0.004 + 0.018 * (1 + Math.cos((Math.PI * it) / iterations))
    for (let i = 0; i < x.length; i++) {
      m[i] = beta1 * m[i] + (1 - beta1) * grad[i]
      v[i] = beta2 * v[i] + (1 - beta2) * grad[i] * grad[i]
      const mh = m[i] / (1 - beta1 ** (it + 1))
      const vh = v[i] / (1 - beta2 ** (it + 1))
      x[i] = Math.min(Math.max(x[i] - (lr * mh) / (Math.sqrt(vh) + 1e-8), 0), 1)
    }
    onProgress?.((it + 1) / iterations)
    if (yieldEvery > 0 && it % yieldEvery === 0) await new Promise((r) => setTimeout(r, 0))
  }

  const w = fromUnit(x).map((val) => Math.round(val * 1e4) / 1e4)
  // pastikan tetap di dalam batas setelah pembulatan
  for (let i = 0; i < w.length; i++) w[i] = Math.min(Math.max(w[i], W_LOWER[i]), W_UPPER[i])
  const lossAfter = datasetLoss(dataset, w).loss
  const improved = lossAfter < lossBefore - 1e-4
  return { w: improved ? w : [...initial], lossBefore, lossAfter: improved ? lossAfter : lossBefore, reviews, improved }
}
