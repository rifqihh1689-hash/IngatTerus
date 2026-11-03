/**
 * Implementasi penjadwal FSRS-6 (Free Spaced Repetition Scheduler).
 *
 * Model memori DSR:
 *  - D (difficulty)    : kesulitan kartu, 1–10.
 *  - S (stability)     : jumlah hari hingga peluang ingat turun ke 90%.
 *  - R (retrievability): peluang ingat saat ini, R(t, S) = (1 + F·t/S)^(−w20).
 *
 * FSRS-6 adalah versi terbaru FSRS dan saat ini termasuk algoritma pengulangan
 * berjarak paling akurat menurut benchmark terbuka open-spaced-repetition
 * (jauh di atas SM-2). Dibanding FSRS-5, kurva lupanya punya kemiringan yang bisa
 * dilatih (w20) dan rumus pengulangan di hari yang sama lebih baik (w19).
 * Parameter bisa dioptimalkan dari riwayat belajar pengguna (lihat optimizer.ts).
 *
 * Referensi: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 */
import { Rating, type Schedule } from '../types'
import { DAY_MS, HOUR_MS, MINUTE_MS, calendarDaysBetween } from './date'

/** Parameter bawaan FSRS-6 (hasil optimasi pada jutaan riwayat ulasan). */
export const DEFAULT_W: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614,
  0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]

/** Batas bawah/atas tiap parameter (dipakai validasi & optimizer). */
export const W_LOWER: readonly number[] = [
  0.001, 0.001, 0.001, 0.001, 1, 0.001, 0.001, 0.001, 0, 0, 0.001, 0.001, 0.001, 0.001, 0, 0, 1, 0, 0, 0, 0.1,
]
export const W_UPPER: readonly number[] = [
  100, 100, 100, 100, 10, 4, 4, 0.75, 4.5, 0.8, 3.5, 5, 0.25, 0.9, 4, 1, 6, 2, 2, 0.8, 0.8,
]

export function isValidWeights(w: unknown): w is number[] {
  return (
    Array.isArray(w) &&
    w.length === DEFAULT_W.length &&
    w.every((x, i) => typeof x === 'number' && Number.isFinite(x) && x >= W_LOWER[i] - 1e-9 && x <= W_UPPER[i] + 1e-9)
  )
}

export interface SchedulerParams {
  w: readonly number[]
  /** Target peluang ingat saat kartu jatuh tempo (0.7–0.97). */
  desiredRetention: number
  /** Interval maksimum dalam hari. */
  maxInterval: number
  /** Langkah belajar kartu baru, dalam menit. */
  learningSteps: readonly number[]
  /** Langkah belajar ulang setelah lupa, dalam menit. */
  relearningSteps: readonly number[]
}

export const DEFAULT_PARAMS: SchedulerParams = {
  w: DEFAULT_W,
  desiredRetention: 0.9,
  maxInterval: 36500,
  learningSteps: [1, 10],
  relearningSteps: [10],
}

export const RATINGS: readonly Rating[] = [Rating.Lupa, Rating.Sulit, Rating.Bisa, Rating.Mudah]

const MIN_DIFFICULTY = 1
const MAX_DIFFICULTY = 10
export const MIN_STABILITY = 0.001

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi)

/** Kemiringan kurva lupa (negatif). */
const decayOf = (w: readonly number[]) => -w[20]
/** F dipilih agar R(S, S) = 0,9. */
const factorOf = (w: readonly number[]) => 0.9 ** (1 / decayOf(w)) - 1

export function makeParams(overrides: Partial<SchedulerParams> = {}): SchedulerParams {
  const p = { ...DEFAULT_PARAMS, ...overrides }
  return {
    ...p,
    w: isValidWeights(p.w) ? p.w : DEFAULT_W,
    desiredRetention: clamp(p.desiredRetention, 0.7, 0.97),
    maxInterval: Math.max(1, Math.round(p.maxInterval)),
  }
}

/** Jadwal awal untuk kartu yang belum pernah dipelajari. */
export function newSchedule(now: number = Date.now()): Schedule {
  return {
    state: 'new',
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    step: 0,
    lastReview: null,
    scheduledDays: 0,
  }
}

/** Kurva lupa: peluang ingat setelah `elapsedDays` hari dengan stabilitas `stability`. */
export function forgettingCurve(elapsedDays: number, stability: number, w: readonly number[] = DEFAULT_W): number {
  if (stability <= 0) return 0
  return (1 + (factorOf(w) * Math.max(0, elapsedDays)) / stability) ** decayOf(w)
}

/** Peluang ingat kartu saat ini (0–1). Kartu baru bernilai 0. */
export function retrievability(card: Schedule, now: number = Date.now(), w: readonly number[] = DEFAULT_W): number {
  if (card.state === 'new' || card.lastReview == null || card.stability <= 0) return 0
  return forgettingCurve((now - card.lastReview) / DAY_MS, card.stability, w)
}

/** Interval mentah (hari, pecahan) agar peluang ingat turun tepat ke target retensi. */
export function rawInterval(stability: number, params: SchedulerParams = DEFAULT_PARAMS): number {
  const { w } = params
  return (stability / factorOf(w)) * (params.desiredRetention ** (1 / decayOf(w)) - 1)
}

/** Interval (hari bulat) agar peluang ingat turun ke target retensi. */
export function nextInterval(stability: number, params: SchedulerParams = DEFAULT_PARAMS): number {
  return clamp(Math.round(rawInterval(stability, params)), 1, params.maxInterval)
}

export function initStability(rating: Rating, w: readonly number[] = DEFAULT_W): number {
  return Math.max(w[rating - 1], MIN_STABILITY)
}

function rawInitDifficulty(rating: Rating, w: readonly number[]): number {
  return w[4] - Math.exp(w[5] * (rating - 1)) + 1
}

export function initDifficulty(rating: Rating, w: readonly number[] = DEFAULT_W): number {
  return clamp(rawInitDifficulty(rating, w), MIN_DIFFICULTY, MAX_DIFFICULTY)
}

/** Pembaruan kesulitan dengan peredaman linear + mean reversion. */
export function nextDifficulty(d: number, rating: Rating, w: readonly number[] = DEFAULT_W): number {
  const delta = -w[6] * (rating - 3)
  const damped = d + (delta * (10 - d)) / 9
  const reverted = w[7] * rawInitDifficulty(Rating.Mudah, w) + (1 - w[7]) * damped
  return clamp(reverted, MIN_DIFFICULTY, MAX_DIFFICULTY)
}

/** Stabilitas baru setelah berhasil mengingat. */
export function nextRecallStability(
  d: number,
  s: number,
  r: number,
  rating: Rating,
  w: readonly number[] = DEFAULT_W,
): number {
  const hardPenalty = rating === Rating.Sulit ? w[15] : 1
  const easyBonus = rating === Rating.Mudah ? w[16] : 1
  const growth =
    Math.exp(w[8]) * (11 - d) * s ** -w[9] * (Math.exp((1 - r) * w[10]) - 1) * hardPenalty * easyBonus
  return Math.max(s * (1 + growth), MIN_STABILITY)
}

/** Stabilitas baru setelah lupa (tidak pernah melebihi stabilitas sebelumnya). */
export function nextForgetStability(d: number, s: number, r: number, w: readonly number[] = DEFAULT_W): number {
  const longTerm = w[11] * d ** -w[12] * ((s + 1) ** w[13] - 1) * Math.exp((1 - r) * w[14])
  const shortTermCap = s / Math.exp(w[17] * w[18])
  return Math.max(Math.min(longTerm, shortTermCap), MIN_STABILITY)
}

/** Stabilitas untuk pengulangan di hari yang sama (jangka pendek, FSRS-6). */
export function nextShortTermStability(s: number, rating: Rating, w: readonly number[] = DEFAULT_W): number {
  let inc = Math.exp(w[17] * (rating - 3 + w[18])) * Math.max(s, MIN_STABILITY) ** -w[19]
  if (rating >= Rating.Bisa) inc = Math.max(inc, 1)
  return Math.max(s * inc, MIN_STABILITY)
}

/** Jeda tombol "Sulit" pada langkah belajar (menit). */
function hardStepMinutes(steps: readonly number[], step: number): number {
  const current = steps[Math.min(step, steps.length - 1)]
  if (step === 0 && steps.length > 1) return (steps[0] + steps[1]) / 2
  if (step === 0) return Math.min(current * 1.5, current + 24 * 60)
  return current
}

/* ---------- Fuzz interval ---------- */

const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Infinity, factor: 0.05 },
]

/** Bilangan semu-acak 0–1 yang deterministik dari sebuah string (FNV-1a + mulberry32). */
export function seededUnit(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let t = (h + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Acak sedikit interval ≥ 3 hari (±5–15%) agar kartu yang dipelajari bersamaan
 * tidak selalu jatuh tempo di hari yang sama. Deterministik per kartu & ulangan,
 * sehingga pratinjau tombol sama persis dengan hasil sebenarnya.
 */
export function fuzzInterval(interval: number, elapsedDays: number, seed: string, maxInterval: number): number {
  if (interval < 2.5) return interval
  let delta = 1
  for (const r of FUZZ_RANGES) delta += r.factor * Math.max(Math.min(interval, r.end) - r.start, 0)
  const ivl = Math.min(interval, maxInterval)
  let min = Math.max(2, Math.round(ivl - delta))
  const max = Math.min(Math.round(ivl + delta), maxInterval)
  if (ivl > elapsedDays) min = Math.max(min, elapsedDays + 1)
  min = Math.min(min, max)
  return Math.floor(seededUnit(seed) * (max - min + 1) + min)
}

export interface ScheduleResult {
  card: Schedule
  log: {
    rating: Rating
    state: Schedule['state']
    elapsedDays: number
    scheduledDays: number
  }
}

/**
 * Hitung hasil keempat tombol sekaligus. Fungsi murni: tidak mengubah `card`.
 * Interval dijaga berurutan: Sulit ≤ Bisa < Mudah.
 * `fuzzSeed` (mis. id kartu) mengaktifkan fuzz interval yang deterministik.
 */
export function scheduleAll(
  card: Schedule,
  now: number = Date.now(),
  params: SchedulerParams = DEFAULT_PARAMS,
  fuzzSeed?: string,
): Record<Rating, Schedule> {
  const { w } = params
  const elapsedDays = card.lastReview == null ? 0 : Math.max(0, calendarDaysBetween(card.lastReview, now))
  const base: Schedule = { ...card, reps: card.reps + 1, lastReview: now }

  const toStep = (s: Schedule, state: 'learning' | 'relearning', step: number, minutes: number): Schedule => ({
    ...s,
    state,
    step,
    due: now + Math.round(minutes * MINUTE_MS),
    scheduledDays: 0,
  })
  const toReview = (s: Schedule, g: Rating): Schedule => {
    let days = nextInterval(s.stability, params)
    if (fuzzSeed) days = fuzzInterval(days, elapsedDays, `${fuzzSeed}:${card.reps}:${g}`, params.maxInterval)
    return { ...s, state: 'review', step: 0, due: now + days * DAY_MS, scheduledDays: days }
  }

  const out = {} as Record<Rating, Schedule>
  const hasMemory = card.state !== 'new' && card.stability > 0 && card.difficulty > 0

  if (!hasMemory) {
    // Kartu baru (atau kartu tanpa data memori yang valid).
    const steps = params.learningSteps
    for (const g of RATINGS) {
      const s: Schedule = { ...base, stability: initStability(g, w), difficulty: initDifficulty(g, w) }
      if (g === Rating.Mudah || steps.length === 0) out[g] = toReview(s, g)
      else if (g === Rating.Lupa) out[g] = toStep(s, 'learning', 0, steps[0])
      else if (g === Rating.Sulit) out[g] = toStep(s, 'learning', 0, hardStepMinutes(steps, 0))
      else out[g] = steps.length > 1 ? toStep(s, 'learning', 1, steps[1]) : toReview(s, g)
    }
  } else if (card.state === 'learning' || card.state === 'relearning') {
    const steps = card.state === 'learning' ? params.learningSteps : params.relearningSteps
    const r = forgettingCurve(elapsedDays, card.stability, w)
    for (const g of RATINGS) {
      const stability =
        elapsedDays === 0
          ? nextShortTermStability(card.stability, g, w)
          : g === Rating.Lupa
            ? nextForgetStability(card.difficulty, card.stability, r, w)
            : nextRecallStability(card.difficulty, card.stability, r, g, w)
      const s: Schedule = { ...base, stability, difficulty: nextDifficulty(card.difficulty, g, w) }
      const step = Math.min(card.step, Math.max(steps.length - 1, 0))
      if (g === Rating.Mudah || steps.length === 0) out[g] = toReview(s, g)
      else if (g === Rating.Lupa) out[g] = toStep(s, card.state, 0, steps[0])
      else if (g === Rating.Sulit) out[g] = toStep(s, card.state, step, hardStepMinutes(steps, step))
      else out[g] = step + 1 < steps.length ? toStep(s, card.state, step + 1, steps[step + 1]) : toReview(s, g)
    }
  } else {
    // Kartu review.
    const r = forgettingCurve(elapsedDays, card.stability, w)
    for (const g of RATINGS) {
      const difficulty = nextDifficulty(card.difficulty, g, w)
      if (g === Rating.Lupa) {
        const s: Schedule = {
          ...base,
          difficulty,
          stability: nextForgetStability(card.difficulty, card.stability, r, w),
          lapses: card.lapses + 1,
        }
        const steps = params.relearningSteps
        out[g] = steps.length > 0 ? toStep(s, 'relearning', 0, steps[0]) : toReview(s, g)
      } else {
        const stability =
          elapsedDays === 0
            ? nextShortTermStability(card.stability, g, w)
            : nextRecallStability(card.difficulty, card.stability, r, g, w)
        out[g] = toReview({ ...base, difficulty, stability }, g)
      }
    }
  }

  enforceIntervalOrder(out, now, params)
  return out
}

function enforceIntervalOrder(out: Record<Rating, Schedule>, now: number, params: SchedulerParams) {
  const ivl = (g: Rating) => (out[g].state === 'review' ? out[g].scheduledDays : null)
  const set = (g: Rating, days: number) => {
    const d = clamp(days, 1, params.maxInterval)
    out[g] = { ...out[g], scheduledDays: d, due: now + d * DAY_MS }
  }
  const hard = ivl(Rating.Sulit)
  const good = ivl(Rating.Bisa)
  if (hard != null && good != null) {
    const h = Math.min(hard, good)
    set(Rating.Sulit, h)
    set(Rating.Bisa, Math.max(good, h + 1))
  }
  const good2 = ivl(Rating.Bisa)
  const easy = ivl(Rating.Mudah)
  if (good2 != null && easy != null) set(Rating.Mudah, Math.max(easy, good2 + 1))
}

/** Jadwalkan ulang kartu untuk satu jawaban. */
export function schedule(
  card: Schedule,
  rating: Rating,
  now: number = Date.now(),
  params: SchedulerParams = DEFAULT_PARAMS,
  fuzzSeed?: string,
): ScheduleResult {
  const next = scheduleAll(card, now, params, fuzzSeed)[rating]
  return {
    card: next,
    log: {
      rating,
      state: card.state,
      elapsedDays: card.lastReview == null ? 0 : Math.max(0, calendarDaysBetween(card.lastReview, now)),
      scheduledDays: next.scheduledDays,
    },
  }
}

/** Ambil hanya bidang penjadwalan dari objek kartu. */
export function pickSchedule<T extends Schedule>(card: T): Schedule {
  const { state, due, stability, difficulty, reps, lapses, step, lastReview, scheduledDays } = card
  return { state, due, stability, difficulty, reps, lapses, step, lastReview, scheduledDays }
}

const fmt1 = (x: number) => {
  const v = Math.round(x * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',')
}

/** Format jeda waktu singkat dalam Bahasa Indonesia, mis. "10 mnt", "3 hr", "1,5 bln". */
export function formatInterval(ms: number): string {
  if (ms < MINUTE_MS) return '<1 mnt'
  if (ms < HOUR_MS) return `${Math.round(ms / MINUTE_MS)} mnt`
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)} jam`
  const days = ms / DAY_MS
  if (days < 30) return `${Math.round(days)} hr`
  if (days < 365) return `${fmt1(days / 30)} bln`
  return `${fmt1(days / 365)} thn`
}
