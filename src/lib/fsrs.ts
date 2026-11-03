/**
 * Implementasi penjadwal FSRS-5 (Free Spaced Repetition Scheduler).
 *
 * Model memori DSR:
 *  - D (difficulty)   : kesulitan kartu, 1–10.
 *  - S (stability)    : jumlah hari hingga peluang ingat turun ke 90%.
 *  - R (retrievability): peluang ingat saat ini, R(t, S) = (1 + F·t/S)^C.
 *
 * Referensi rumus: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 * Kartu baru melewati "langkah belajar" (default 1 & 10 menit) sebelum lulus ke
 * jadwal harian; kartu yang lupa melewati "langkah belajar ulang" (10 menit).
 */
import { Rating, type Schedule } from '../types'
import { DAY_MS, HOUR_MS, MINUTE_MS, calendarDaysBetween } from './date'

/** Parameter bawaan FSRS-5 (hasil optimasi pada jutaan riwayat ulasan). */
export const DEFAULT_W: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]

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

const DECAY = -0.5
/** F = 0.9^(1/C) − 1 = 19/81, sehingga R(S, S) = 0.9. */
const FACTOR = 0.9 ** (1 / DECAY) - 1
const MIN_DIFFICULTY = 1
const MAX_DIFFICULTY = 10
const MIN_STABILITY = 0.01

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi)

export function makeParams(overrides: Partial<SchedulerParams> = {}): SchedulerParams {
  const p = { ...DEFAULT_PARAMS, ...overrides }
  return {
    ...p,
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
export function forgettingCurve(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0
  return (1 + (FACTOR * Math.max(0, elapsedDays)) / stability) ** DECAY
}

/** Peluang ingat kartu saat ini (0–1). Kartu baru bernilai 0. */
export function retrievability(card: Schedule, now: number = Date.now()): number {
  if (card.state === 'new' || card.lastReview == null || card.stability <= 0) return 0
  return forgettingCurve((now - card.lastReview) / DAY_MS, card.stability)
}

/** Interval (hari) agar peluang ingat turun tepat ke target retensi. */
export function nextInterval(stability: number, params: SchedulerParams = DEFAULT_PARAMS): number {
  const raw = (stability / FACTOR) * (params.desiredRetention ** (1 / DECAY) - 1)
  return clamp(Math.round(raw), 1, params.maxInterval)
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

/** Pembaruan kesulitan dengan peredaman linear + mean reversion (FSRS-5). */
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
  const sf = w[11] * d ** -w[12] * ((s + 1) ** w[13] - 1) * Math.exp((1 - r) * w[14])
  return clamp(sf, MIN_STABILITY, Math.max(s, MIN_STABILITY))
}

/** Stabilitas untuk pengulangan di hari yang sama (jangka pendek). */
export function nextShortTermStability(s: number, rating: Rating, w: readonly number[] = DEFAULT_W): number {
  return Math.max(s * Math.exp(w[17] * (rating - 3 + w[18])), MIN_STABILITY)
}

/** Jeda tombol "Sulit" pada langkah belajar (menit). */
function hardStepMinutes(steps: readonly number[], step: number): number {
  const current = steps[Math.min(step, steps.length - 1)]
  if (step === 0 && steps.length > 1) return (steps[0] + steps[1]) / 2
  if (step === 0) return Math.min(current * 1.5, current + 24 * 60)
  return current
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
 */
export function scheduleAll(
  card: Schedule,
  now: number = Date.now(),
  params: SchedulerParams = DEFAULT_PARAMS,
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
  const toReview = (s: Schedule): Schedule => {
    const days = nextInterval(s.stability, params)
    return { ...s, state: 'review', step: 0, due: now + days * DAY_MS, scheduledDays: days }
  }

  const out = {} as Record<Rating, Schedule>
  const hasMemory = card.state !== 'new' && card.stability > 0 && card.difficulty > 0

  if (!hasMemory) {
    // Kartu baru (atau kartu tanpa data memori yang valid).
    const steps = params.learningSteps
    for (const g of RATINGS) {
      const s: Schedule = { ...base, stability: initStability(g, w), difficulty: initDifficulty(g, w) }
      if (g === Rating.Mudah || steps.length === 0) out[g] = toReview(s)
      else if (g === Rating.Lupa) out[g] = toStep(s, 'learning', 0, steps[0])
      else if (g === Rating.Sulit) out[g] = toStep(s, 'learning', 0, hardStepMinutes(steps, 0))
      else out[g] = steps.length > 1 ? toStep(s, 'learning', 1, steps[1]) : toReview(s)
    }
  } else if (card.state === 'learning' || card.state === 'relearning') {
    const steps = card.state === 'learning' ? params.learningSteps : params.relearningSteps
    const r = forgettingCurve(elapsedDays, card.stability)
    for (const g of RATINGS) {
      const stability =
        elapsedDays === 0
          ? nextShortTermStability(card.stability, g, w)
          : g === Rating.Lupa
            ? nextForgetStability(card.difficulty, card.stability, r, w)
            : nextRecallStability(card.difficulty, card.stability, r, g, w)
      const s: Schedule = { ...base, stability, difficulty: nextDifficulty(card.difficulty, g, w) }
      const step = Math.min(card.step, Math.max(steps.length - 1, 0))
      if (g === Rating.Mudah || steps.length === 0) out[g] = toReview(s)
      else if (g === Rating.Lupa) out[g] = toStep(s, card.state, 0, steps[0])
      else if (g === Rating.Sulit) out[g] = toStep(s, card.state, step, hardStepMinutes(steps, step))
      else out[g] = step + 1 < steps.length ? toStep(s, card.state, step + 1, steps[step + 1]) : toReview(s)
    }
  } else {
    // Kartu review.
    const r = forgettingCurve(elapsedDays, card.stability)
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
        out[g] = steps.length > 0 ? toStep(s, 'relearning', 0, steps[0]) : toReview(s)
      } else {
        const stability =
          elapsedDays === 0
            ? nextShortTermStability(card.stability, g, w)
            : nextRecallStability(card.difficulty, card.stability, r, g, w)
        out[g] = toReview({ ...base, difficulty, stability })
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
): ScheduleResult {
  const next = scheduleAll(card, now, params)[rating]
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
