export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

const pad = (n: number) => String(n).padStart(2, '0')

/** Kunci hari lokal dalam format YYYY-MM-DD. */
export function dayKey(time: number | Date = Date.now()): string {
  const d = new Date(time)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Awal hari lokal (00:00) dari sebuah waktu. */
export function startOfDay(time: number): number {
  const d = new Date(time)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Akhir hari lokal (23:59:59.999). */
export function endOfDay(time: number): number {
  const d = new Date(time)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** Selisih hari kalender lokal (b - a), aman terhadap pergantian DST. */
export function calendarDaysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS)
}

/** Ubah kunci hari menjadi waktu tengah hari lokal (aman untuk aritmetika hari). */
export function parseDayKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}

/** Geser kunci hari sejumlah n hari. */
export function shiftDayKey(key: string, n: number): string {
  const d = new Date(parseDayKey(key))
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

const SHORT_DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

export function formatDayShort(key: string): string {
  const d = new Date(parseDayKey(key))
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
}

export function weekdayShort(key: string): string {
  return SHORT_DAYS[new Date(parseDayKey(key)).getDay()]
}

export function formatDateTime(time: number): string {
  const d = new Date(time)
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}.${pad(d.getMinutes())}`
}

/** Format durasi detik menjadi m:ss atau h:mm:ss. */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}
