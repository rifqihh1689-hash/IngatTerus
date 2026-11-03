// Menghasilkan docs/PROMPT-MATERI.md dari prompt asli agar dokumen selalu sama dengan aplikasi.
// Jalankan: UPDATE_DOCS=1 npx vitest run src/lib/aiPrompt.doc.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { buildMaterialPrompt, buildReviewPrompt } from './aiPrompt'

const DOC = new URL('../../docs/PROMPT-MATERI.md', import.meta.url)

function render(): string {
  const main = buildMaterialPrompt({ topic: '[TOPIK]', level: '[TINGKAT, mis. kuliah kedokteran]', count: 30, style: 'pemahaman' })
  const short = buildMaterialPrompt({ topic: '[TOPIK]', level: '[TINGKAT]', count: 30, style: 'singkat' })
  const review = buildReviewPrompt()
  return `# Prompt AI untuk membuat deck dari materi

Prompt ini juga tersedia langsung di aplikasi: **Tambah → ✨ Buat dengan AI → Salin prompt**
(di sana topik, tingkat, jumlah, dan jenis kartu bisa diatur tanpa mengedit teks).

## Cara mencicil materi

1. Buat satu deck per mata kuliah/bab besar, mis. "Biokimia – Nukleotida".
2. Ambil **1–3 halaman** materi per prompt (satu subbab). Potongan kecil = kartu lebih teliti.
3. Salin prompt di bawah ke ChatGPT, Gemini, atau Claude. Ganti bagian dalam kurung siku,
   lalu tempel materi di bagian MATERI (atau lampirkan PDF/foto).
4. Salin **seluruh** jawaban AI → buka IngatTerus → **Tambah** → tempel di kotak *Teks kartu*.
   Isi blok kode diambil otomatis; cek pratinjau, pilih deck yang sama, lalu **Impor**.
5. Ulangi untuk subbab berikutnya. Kartu yang pertanyaannya sudah ada akan dilewati.
6. Baca cepat kartu baru sebelum belajar. Hapus atau edit kartu yang keliru — AI bisa salah.

Tips: lebih baik 20 kartu yang benar-benar dipahami daripada 100 kartu hafalan panjang.
Kartu yang terus-terusan lupa (ditandai **sering lupa**) biasanya terlalu panjang: pecah jadi 2–3 kartu.

## 1. Prompt utama (kartu pemahaman)

\`\`\`\`text
${main}
\`\`\`\`

## 2. Prompt kartu jawaban singkat (untuk kuis & ujian)

\`\`\`\`text
${short}
\`\`\`\`

## 3. Prompt cek ulang (opsional, sebelum diimpor)

\`\`\`\`text
${review}
\`\`\`\`
`
}

describe('docs/PROMPT-MATERI.md', () => {
  it('sinkron dengan prompt di aplikasi', () => {
    const expected = render()
    if (process.env.UPDATE_DOCS) writeFileSync(DOC, expected)
    expect(readFileSync(DOC, 'utf8')).toBe(expected)
  })
})
