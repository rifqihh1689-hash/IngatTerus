/** Logika pengingat belajar harian (dipakai aplikasi & service worker). */

export interface ReminderState {
  enabled: boolean
  /** Jam pengingat "HH:MM" waktu lokal. */
  time: string
  /** Hari terakhir notifikasi dikirim (YYYY-MM-DD). */
  lastReminderDay: string | null
  studiedToday: boolean
}

/** Ubah "HH:MM" menjadi menit sejak tengah malam; null bila tidak valid. */
export function parseTime(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Perlu kirim pengingat sekarang? Sekali sehari, setelah jamnya, dan hanya bila belum belajar. */
export function shouldRemind(state: ReminderState, now: Date, today: string): boolean {
  if (!state.enabled || state.studiedToday) return false
  if (state.lastReminderDay === today) return false
  const target = parseTime(state.time)
  if (target == null) return false
  return now.getHours() * 60 + now.getMinutes() >= target
}

export function reminderMessage(dueCount: number, streak: number): { title: string; body: string } {
  const title = streak > 0 ? `Jaga streak ${streak} hari-mu! 🔥` : 'Waktunya belajar! 📚'
  const body =
    dueCount > 0
      ? `${dueCount} kartu menunggu untuk diulang hari ini. Cukup beberapa menit saja.`
      : 'Luangkan beberapa menit untuk belajar kartu baru hari ini.'
  return { title, body }
}
