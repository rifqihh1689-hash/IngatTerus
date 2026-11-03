/**
 * Parser impor kartu dari teks/CSV. Format utama: satu kartu per baris,
 *   pertanyaan;jawaban
 * Mendukung juga koma atau tab sebagai pemisah, kolom berkutip ("..."),
 * kutip ganda di dalam kutip (""), baris komentar (#), header opsional,
 * dan "\n" sebagai baris baru di dalam teks.
 */
import { normalizeForCompare } from './richtext'

export type Delimiter = ';' | ',' | '\t'

export interface ParsedCard {
  front: string
  back: string
  /** Nomor baris (mulai 1) pada teks asli. */
  line: number
}

export interface ParseError {
  line: number
  message: string
  raw: string
}

export interface ParseResult {
  cards: ParsedCard[]
  errors: ParseError[]
  delimiter: Delimiter
  headerSkipped: boolean
}

export interface ParseOptions {
  delimiter?: Delimiter | 'auto'
  /** true = baris pertama selalu header, false = tidak pernah, 'auto' = deteksi. */
  header?: boolean | 'auto'
}

const FRONT_HEADERS = /^(pertanyaan|soal|depan|sisi depan|front|question|term|istilah|kata)$/i
const BACK_HEADERS = /^(jawaban|belakang|sisi belakang|back|answer|definisi|definition|arti|makna)$/i

interface Row {
  fields: string[]
  line: number
  raw: string
}

/** Pecah teks menjadi baris & kolom ala CSV (RFC 4180, pemisah dapat diatur). */
export function splitRows(text: string, delimiter: Delimiter): Row[] {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const rows: Row[] = []
  let fields: string[] = []
  let field = ''
  let inQuotes = false
  let fieldStart = true
  let line = 1
  let rowLine = 1
  let rowStart = 0

  const endRow = (endIdx: number) => {
    fields.push(field)
    rows.push({ fields, line: rowLine, raw: src.slice(rowStart, endIdx) })
    fields = []
    field = ''
    fieldStart = true
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        if (ch === '\n') line++
        field += ch
      }
      continue
    }
    if (ch === '"' && fieldStart && field.trim() === '') {
      inQuotes = true
      field = ''
      fieldStart = false
      continue
    }
    if (ch === delimiter) {
      fields.push(field)
      field = ''
      fieldStart = true
      continue
    }
    if (ch === '\n') {
      endRow(i)
      line++
      rowLine = line
      rowStart = i + 1
      continue
    }
    field += ch
    if (ch !== ' ' && ch !== '\t') fieldStart = false
  }
  if (field !== '' || fields.length > 0) endRow(src.length)
  return rows
}

/** Tebak pemisah: titik koma diutamakan, lalu tab, lalu koma. */
export function detectDelimiter(text: string): Delimiter {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .slice(0, 50)
  if (lines.length === 0) return ';'
  const share = (d: string) => lines.filter((l) => l.includes(d)).length / lines.length
  if (share(';') >= 0.5) return ';'
  if (share('\t') >= 0.5) return '\t'
  if (share(',') >= 0.5) return ','
  return ';'
}

const unescapeText = (s: string) => s.replace(/\\n/g, '\n').trim()

const FENCE = /^\s*```/

/**
 * Bila teks berisi blok kode Markdown (hasil salinan jawaban AI), ambil hanya isi
 * blok kode pertama. Baris di luar blok dikosongkan agar nomor baris tetap sesuai.
 */
export function keepFirstCodeBlock(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const open = lines.findIndex((l) => FENCE.test(l))
  if (open === -1) return text
  let close = lines.findIndex((l, i) => i > open && FENCE.test(l))
  if (close === -1) close = lines.length
  return lines.map((l, i) => (i > open && i < close ? l : '')).join('\n')
}

export function parseCardText(rawText: string, options: ParseOptions = {}): ParseResult {
  const text = keepFirstCodeBlock(rawText)
  const delimiter =
    !options.delimiter || options.delimiter === 'auto' ? detectDelimiter(text) : options.delimiter
  const headerMode = options.header ?? 'auto'
  const cards: ParsedCard[] = []
  const errors: ParseError[] = []
  let headerSkipped = false
  let first = true

  for (const row of splitRows(text, delimiter)) {
    const fields = [...row.fields]
    // abaikan kolom kosong di ujung (mis. "a;b;;" dari spreadsheet)
    while (fields.length > 0 && fields[fields.length - 1].trim() === '') fields.pop()
    if (fields.length === 0) continue
    if (row.raw.trimStart().startsWith('#')) continue

    const front = unescapeText(fields[0])
    const back = unescapeText(fields.slice(1).join(delimiter))

    if (first) {
      first = false
      const looksLikeHeader = FRONT_HEADERS.test(front) && BACK_HEADERS.test(back)
      if (headerMode === true || (headerMode === 'auto' && looksLikeHeader)) {
        headerSkipped = true
        continue
      }
    }

    const label = delimiter === '\t' ? 'tab' : `"${delimiter}"`
    if (row.fields.length < 2) {
      errors.push({ line: row.line, message: `Tidak ada pemisah ${label} antara pertanyaan dan jawaban`, raw: row.raw })
    } else if (!front) {
      errors.push({ line: row.line, message: 'Pertanyaan kosong', raw: row.raw })
    } else if (!back) {
      errors.push({ line: row.line, message: 'Jawaban kosong', raw: row.raw })
    } else {
      cards.push({ front, back, line: row.line })
    }
  }
  return { cards, errors, delimiter, headerSkipped }
}

/** Tandai kartu yang sisi depannya sudah ada (di deck atau di daftar impor itu sendiri). */
export function findDuplicates(cards: ParsedCard[], existingFronts: Iterable<string>): Set<number> {
  const seen = new Set<string>()
  for (const f of existingFronts) seen.add(normalizeForCompare(f))
  const dupes = new Set<number>()
  cards.forEach((c, i) => {
    const key = normalizeForCompare(c.front)
    if (seen.has(key)) dupes.add(i)
    else seen.add(key)
  })
  return dupes
}

const csvEscape = (value: string, delimiter: Delimiter) => {
  const v = value.replace(/\r\n?/g, '\n')
  return /["\n]/.test(v) || v.includes(delimiter) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Ekspor kartu ke teks "pertanyaan;jawaban" yang bisa diimpor kembali. */
export function toCardText(cards: { front: string; back: string }[], delimiter: Delimiter = ';'): string {
  const lines = ['pertanyaan;jawaban'.replace(';', delimiter)]
  for (const c of cards) lines.push(`${csvEscape(c.front, delimiter)}${delimiter}${csvEscape(c.back, delimiter)}`)
  return lines.join('\n') + '\n'
}
