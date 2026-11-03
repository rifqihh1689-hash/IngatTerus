/**
 * Format teks ringan untuk isi kartu (aman, tanpa HTML mentah):
 *   **tebal**   *miring*   ^pangkat^   ~indeks~   `kode`
 * Baris baru dipertahankan. Penanda harus menempel pada teks
 * (mis. "2 * 3 * 4" tidak dianggap miring).
 */
export type RichNode =
  | { type: 'text'; value: string }
  | { type: 'br' }
  | { type: 'bold' | 'italic' | 'sup' | 'sub' | 'code'; children: RichNode[] }

const PATTERN =
  /\*\*(?=\S)([\s\S]*?\S)\*\*|\*(?=[^\s*])([^*\n]*?[^\s*])\*|\^(?=\S)([^^\n]*?\S)\^|~(?=\S)([^~\n]*?\S)~|`([^`\n]+)`/

function pushText(out: RichNode[], text: string) {
  const parts = text.split('\n')
  parts.forEach((part, i) => {
    if (i > 0) out.push({ type: 'br' })
    if (part) out.push({ type: 'text', value: part })
  })
}

export function parseRich(input: string): RichNode[] {
  const out: RichNode[] = []
  let rest = input.replace(/\r\n?/g, '\n')
  while (rest.length > 0) {
    const m = PATTERN.exec(rest)
    if (!m) {
      pushText(out, rest)
      break
    }
    if (m.index > 0) pushText(out, rest.slice(0, m.index))
    if (m[1] !== undefined) out.push({ type: 'bold', children: parseRich(m[1]) })
    else if (m[2] !== undefined) out.push({ type: 'italic', children: parseRich(m[2]) })
    else if (m[3] !== undefined) out.push({ type: 'sup', children: parseRich(m[3]) })
    else if (m[4] !== undefined) out.push({ type: 'sub', children: parseRich(m[4]) })
    else out.push({ type: 'code', children: [{ type: 'text', value: m[5] }] })
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

/** Teks polos tanpa penanda format (untuk pencarian, kuis, dan ekspor). */
export function toPlainText(input: string): string {
  const walk = (nodes: RichNode[]): string =>
    nodes
      .map((n) => (n.type === 'text' ? n.value : n.type === 'br' ? '\n' : walk(n.children)))
      .join('')
  return walk(parseRich(input)).trim()
}

/** Normalisasi untuk membandingkan jawaban/duplikat. */
export function normalizeForCompare(input: string): string {
  return toPlainText(input).toLocaleLowerCase('id').replace(/\s+/g, ' ').trim()
}
