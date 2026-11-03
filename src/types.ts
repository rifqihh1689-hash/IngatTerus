/** Nilai jawaban saat mengulang kartu. */
export const Rating = {
  Lupa: 1,
  Sulit: 2,
  Bisa: 3,
  Mudah: 4,
} as const
export type Rating = (typeof Rating)[keyof typeof Rating]

export type CardState = 'new' | 'learning' | 'review' | 'relearning'

/** Data penjadwalan (FSRS) yang melekat pada setiap kartu. */
export interface Schedule {
  state: CardState
  /** Waktu jatuh tempo (epoch ms). */
  due: number
  /** Stabilitas memori dalam hari (S). */
  stability: number
  /** Kesulitan kartu 1–10 (D). */
  difficulty: number
  /** Jumlah pengulangan. */
  reps: number
  /** Berapa kali lupa setelah hafal. */
  lapses: number
  /** Indeks langkah belajar (learning/relearning). */
  step: number
  /** Waktu pengulangan terakhir (epoch ms) atau null bila belum pernah. */
  lastReview: number | null
  /** Interval terjadwal dalam hari (0 untuk langkah belajar). */
  scheduledDays: number
}

export interface Deck {
  id: string
  name: string
  description: string
  /** Kunci warna aksen (lihat DECK_COLORS). */
  color: string
  createdAt: number
  updatedAt: number
  /** Penanda deck contoh bawaan. */
  sample?: string
}

export interface Card extends Schedule {
  id: string
  deckId: string
  front: string
  back: string
  /** Gambar sisi depan (data URL) – opsional. */
  frontImage?: string
  /** Gambar sisi belakang (data URL) – opsional. */
  backImage?: string
  createdAt: number
  updatedAt: number
}

export interface ReviewLog {
  id: string
  cardId: string
  deckId: string
  rating: Rating
  /** Status kartu sebelum dijawab. */
  state: CardState
  reviewedAt: number
  /** Kunci hari lokal YYYY-MM-DD. */
  day: string
  elapsedDays: number
  scheduledDays: number
  /** Lama berpikir sebelum menjawab (ms) – opsional. */
  durationMs?: number
}

export type QuizMode = 'kuis' | 'ujian'

export interface QuizResult {
  id: string
  deckId: string
  mode: QuizMode
  total: number
  correct: number
  durationSec: number
  takenAt: number
  day: string
}

export interface SettingRow {
  key: string
  value: unknown
}

export interface AppSettings {
  newPerDay: number
  desiredRetention: number
  maxInterval: number
  reminderEnabled: boolean
  reminderTime: string
  lastReminderDay: string | null
  seeded: boolean
  onboarded: boolean
  /** Parameter FSRS-6 hasil optimasi pribadi; null = bawaan. */
  fsrsParams: number[] | null
  optimizedAt: number | null
  optimizedReviews: number
  optimizedLossBefore: number | null
  optimizedLossAfter: number | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  newPerDay: 20,
  desiredRetention: 0.9,
  maxInterval: 36500,
  reminderEnabled: false,
  reminderTime: '19:00',
  lastReminderDay: null,
  seeded: false,
  onboarded: false,
  fsrsParams: null,
  optimizedAt: null,
  optimizedReviews: 0,
  optimizedLossBefore: null,
  optimizedLossAfter: null,
}
