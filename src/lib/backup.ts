/** Format cadangan JSON lengkap (deck, kartu, riwayat, hasil kuis, pengaturan). */
import { newSchedule } from './fsrs'
import { dayKey } from './date'
import type { Card, CardState, Deck, QuizResult, ReviewLog, SettingRow } from '../types'

export const BACKUP_FORMAT = 'ingatterus-backup'
export const BACKUP_VERSION = 1

export interface BackupData {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
  quizResults: QuizResult[]
  settings: SettingRow[]
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

export interface BackupContent {
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
  quizResults: QuizResult[]
  settings: SettingRow[]
}

export function buildBackup(content: BackupContent, now: number = Date.now()): BackupData {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    ...content,
  }
}

const STATES: CardState[] = ['new', 'learning', 'review', 'relearning']
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const optStr = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

export interface ParsedBackup {
  data: BackupData
  /** Jumlah entri yang dilewati karena rusak/tidak lengkap. */
  skipped: number
}

/** Validasi & normalisasi isi berkas cadangan. Melempar BackupError bila tidak valid. */
export function parseBackup(json: string, now: number = Date.now()): ParsedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new BackupError('Berkas bukan JSON yang valid.')
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) {
    throw new BackupError('Berkas ini bukan cadangan IngatTerus.')
  }
  const version = num(raw.version, 0)
  if (version < 1 || version > BACKUP_VERSION) {
    throw new BackupError(`Versi cadangan (${String(raw.version)}) tidak didukung. Perbarui aplikasi terlebih dulu.`)
  }
  if (!Array.isArray(raw.decks) || !Array.isArray(raw.cards)) {
    throw new BackupError('Cadangan tidak berisi daftar deck dan kartu.')
  }

  let skipped = 0
  const decks: Deck[] = []
  for (const d of raw.decks) {
    if (!isObj(d) || !str(d.id) || !str(d.name).trim()) {
      skipped++
      continue
    }
    decks.push({
      id: str(d.id),
      name: str(d.name).trim(),
      description: str(d.description),
      color: str(d.color, 'indigo'),
      createdAt: num(d.createdAt, now),
      updatedAt: num(d.updatedAt, now),
      ...(optStr(d.sample) ? { sample: optStr(d.sample) } : {}),
    })
  }
  const deckIds = new Set(decks.map((d) => d.id))

  const cards: Card[] = []
  for (const c of raw.cards) {
    if (!isObj(c) || !str(c.id) || !deckIds.has(str(c.deckId)) || (!str(c.front).trim() && !optStr(c.frontImage))) {
      skipped++
      continue
    }
    const base = newSchedule(now)
    const state = STATES.includes(c.state as CardState) ? (c.state as CardState) : 'new'
    cards.push({
      id: str(c.id),
      deckId: str(c.deckId),
      front: str(c.front),
      back: str(c.back),
      ...(optStr(c.frontImage) ? { frontImage: optStr(c.frontImage) } : {}),
      ...(optStr(c.backImage) ? { backImage: optStr(c.backImage) } : {}),
      createdAt: num(c.createdAt, now),
      updatedAt: num(c.updatedAt, now),
      ...(typeof c.resetAt === 'number' ? { resetAt: c.resetAt } : {}),
      state,
      due: num(c.due, base.due),
      stability: num(c.stability, 0),
      difficulty: num(c.difficulty, 0),
      reps: num(c.reps, 0),
      lapses: num(c.lapses, 0),
      step: num(c.step, 0),
      lastReview: typeof c.lastReview === 'number' ? c.lastReview : null,
      scheduledDays: num(c.scheduledDays, 0),
    })
  }
  const cardIds = new Set(cards.map((c) => c.id))

  const reviewLogs: ReviewLog[] = []
  for (const l of Array.isArray(raw.reviewLogs) ? raw.reviewLogs : []) {
    const rating = num(isObj(l) ? l.rating : undefined, 0)
    if (!isObj(l) || !str(l.id) || !cardIds.has(str(l.cardId)) || ![1, 2, 3, 4].includes(rating)) {
      skipped++
      continue
    }
    const reviewedAt = num(l.reviewedAt, now)
    reviewLogs.push({
      id: str(l.id),
      cardId: str(l.cardId),
      deckId: str(l.deckId),
      rating: rating as ReviewLog['rating'],
      state: STATES.includes(l.state as CardState) ? (l.state as CardState) : 'review',
      reviewedAt,
      day: str(l.day) || dayKey(reviewedAt),
      elapsedDays: num(l.elapsedDays, 0),
      scheduledDays: num(l.scheduledDays, 0),
      ...(typeof l.durationMs === 'number' && l.durationMs > 0 ? { durationMs: l.durationMs } : {}),
      ...(isObj(l.before) && typeof l.before.reps === 'number' ? { before: { reps: l.before.reps, lastReview: typeof l.before.lastReview === 'number' ? l.before.lastReview : null } } : {}),
      ...(isObj(l.after) && STATES.includes(l.after.state as CardState) && typeof l.after.due === 'number' ? { after: l.after as unknown as ReviewLog['after'] } : {}),
    })
  }

  const quizResults: QuizResult[] = []
  for (const q of Array.isArray(raw.quizResults) ? raw.quizResults : []) {
    if (!isObj(q) || !str(q.id) || !deckIds.has(str(q.deckId))) {
      skipped++
      continue
    }
    const takenAt = num(q.takenAt, now)
    quizResults.push({
      id: str(q.id),
      deckId: str(q.deckId),
      mode: q.mode === 'ujian' ? 'ujian' : 'kuis',
      total: num(q.total, 0),
      correct: num(q.correct, 0),
      durationSec: num(q.durationSec, 0),
      takenAt,
      day: str(q.day) || dayKey(takenAt),
    })
  }

  const settings: SettingRow[] = []
  for (const s of Array.isArray(raw.settings) ? raw.settings : []) {
    if (isObj(s) && str(s.key)) settings.push({ key: str(s.key), value: s.value })
  }

  return {
    data: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: str(raw.exportedAt, new Date(now).toISOString()),
      decks,
      cards,
      reviewLogs,
      quizResults,
      settings,
    },
    skipped,
  }
}

export function backupFileName(now: number = Date.now()): string {
  return `ingatterus-cadangan-${dayKey(now)}.json`
}
