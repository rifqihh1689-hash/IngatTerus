/**
 * Pemeriksaan pengingat yang bisa dijalankan dari aplikasi maupun service worker
 * (tanpa ketergantungan DOM).
 */
import { db as defaultDb, getSettings, setSetting, type IngatDB } from '../db/db'
import { dayKey, endOfDay } from './date'
import { reminderMessage, shouldRemind } from './reminder'
import { computeStreak } from './stats'

export const REMINDER_TAG = 'ingatterus-pengingat'

export interface ReminderDecision {
  notify: boolean
  title: string
  body: string
}

export async function evaluateReminder(now: Date = new Date(), database: IngatDB = defaultDb): Promise<ReminderDecision> {
  const today = dayKey(now)
  const settings = await getSettings(database)
  const [reviewDays, quizDays] = await Promise.all([
    database.reviewLogs.orderBy('day').uniqueKeys(),
    database.quizResults.orderBy('day').uniqueKeys(),
  ])
  const streak = computeStreak([...reviewDays, ...quizDays].map(String), today)
  const notify = shouldRemind(
    {
      enabled: settings.reminderEnabled,
      time: settings.reminderTime,
      lastReminderDay: settings.lastReminderDay,
      studiedToday: streak.studiedToday,
    },
    now,
    today,
  )
  if (!notify) return { notify: false, title: '', body: '' }
  const due = await database.cards.where('due').belowOrEqual(endOfDay(now.getTime())).filter((c) => c.state !== 'new').count()
  return { notify: true, ...reminderMessage(due, streak.current) }
}

export async function markReminded(now: Date = new Date(), database: IngatDB = defaultDb) {
  await setSetting('lastReminderDay', dayKey(now), database)
}
