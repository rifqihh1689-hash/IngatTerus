/** Pembuat soal pilihan ganda dari kartu di sebuah deck. */
import { normalizeForCompare } from './richtext'

export interface QuizSource {
  id: string
  front: string
  back: string
  frontImage?: string
  backImage?: string
}

export type QuizDirection = 'depan' | 'belakang'

export interface QuizQuestion {
  cardId: string
  prompt: string
  promptImage?: string
  options: string[]
  correctIndex: number
}

export type Rng = () => number

/** RNG deterministik (mulberry32) — berguna untuk tes. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Kartu yang bisa dipakai untuk kuis: jawabannya berupa teks. */
export function quizEligible(cards: readonly QuizSource[], direction: QuizDirection = 'depan'): QuizSource[] {
  return cards.filter((c) =>
    direction === 'depan' ? c.back.trim() && (c.front.trim() || c.frontImage) : c.front.trim() && c.back.trim(),
  )
}

/** Banyak jawaban berbeda — kuis butuh minimal 2. */
export function distinctAnswerCount(cards: readonly QuizSource[], direction: QuizDirection = 'depan'): number {
  return new Set(quizEligible(cards, direction).map((c) => normalizeForCompare(direction === 'depan' ? c.back : c.front))).size
}

export interface BuildQuizOptions {
  count: number
  optionCount?: number
  direction?: QuizDirection
  rng?: Rng
}

/**
 * Buat soal: pertanyaan dari satu sisi, jawaban benar dari sisi lain, dan
 * pengecoh dari jawaban kartu lain di deck yang sama (tanpa duplikat).
 */
export function buildQuiz(cards: readonly QuizSource[], options: BuildQuizOptions): QuizQuestion[] {
  const { count, optionCount = 4, direction = 'depan', rng = Math.random } = options
  const pool = quizEligible(cards, direction)
  const answerOf = (c: QuizSource) => (direction === 'depan' ? c.back : c.front)

  // kumpulan jawaban unik untuk pengecoh
  const answers = new Map<string, string>()
  for (const c of pool) {
    const key = normalizeForCompare(answerOf(c))
    if (!answers.has(key)) answers.set(key, answerOf(c).trim())
  }
  if (answers.size < 2) return []

  const picked = shuffle(pool, rng).slice(0, Math.max(0, Math.min(count, pool.length)))
  return picked.map((card) => {
    const correct = answerOf(card).trim()
    const correctKey = normalizeForCompare(correct)
    const distractors = shuffle(
      [...answers.entries()].filter(([k]) => k !== correctKey).map(([, v]) => v),
      rng,
    ).slice(0, Math.max(1, optionCount - 1))
    const opts = shuffle([correct, ...distractors], rng)
    return {
      cardId: card.id,
      prompt: direction === 'depan' ? card.front : card.back,
      promptImage: direction === 'depan' ? card.frontImage : card.backImage,
      options: opts,
      correctIndex: opts.indexOf(correct),
    }
  })
}

export interface QuizScore {
  total: number
  correct: number
  wrong: number
  unanswered: number
  percent: number
}

/** Nilai jawaban; `answers[i]` = indeks pilihan atau null bila tidak dijawab. */
export function scoreQuiz(questions: readonly QuizQuestion[], answers: readonly (number | null | undefined)[]): QuizScore {
  let correct = 0
  let unanswered = 0
  questions.forEach((q, i) => {
    const a = answers[i]
    if (a == null) unanswered++
    else if (a === q.correctIndex) correct++
  })
  const total = questions.length
  return {
    total,
    correct,
    unanswered,
    wrong: total - correct - unanswered,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
  }
}
