/**
 * Pembuat prompt AI (ChatGPT/Gemini/Claude) untuk mengubah materi belajar menjadi
 * flashcard berformat impor IngatTerus. Isinya mengikuti prinsip flashcard yang
 * terbukti efektif: atomik, satu jawaban jelas, pecah daftar panjang, sertakan
 * kartu "mengapa/bagaimana", dua arah untuk istilah, dan kartu pembanding.
 */

export type CardStyle = 'pemahaman' | 'singkat' | 'istilah'

export const CARD_STYLES: { value: CardStyle; label: string; hint: string }[] = [
  { value: 'pemahaman', label: 'Pemahaman', hint: 'Campuran apa/mengapa/bagaimana — paling bagus untuk mode belajar' },
  { value: 'singkat', label: 'Jawaban singkat', hint: 'Jawaban 1–5 kata — paling cocok untuk kuis & ujian' },
  { value: 'istilah', label: 'Istilah ↔ arti', hint: 'Kosakata, singkatan, definisi — dua arah' },
]

export interface PromptOptions {
  topic?: string
  level?: string
  count: number
  style: CardStyle
  /** Materi yang ditempel langsung; kosong = beri penanda tempat. */
  material?: string
}

export const MATERIAL_PLACEHOLDER = '[TEMPEL MATERI DI SINI]'

const STYLE_RULES: Record<CardStyle, string[]> = {
  pemahaman: [
    'Campurkan kartu fakta ("apa"), pemahaman ("mengapa", "bagaimana"), dan penerapan (contoh kasus singkat).',
    'Untuk istilah kunci, buat dua arah: istilah → arti dan arti → istilah.',
  ],
  singkat: [
    'Jawaban harus SANGAT singkat: 1–5 kata (nama, angka, istilah, atau rumus), tanpa penjelasan.',
    'Pertanyaan dibuat cukup spesifik sehingga jawaban singkat itu tidak ambigu.',
    'Hindari jawaban "ya/tidak" dan jawaban yang mirip satu sama lain.',
  ],
  istilah: [
    'Buat DUA kartu untuk setiap istilah: "Apa arti/definisi <istilah>?" dan "Istilah untuk <definisi singkat>?".',
    'Sertakan singkatan beserta kepanjangannya, dan contoh pemakaian bila ada di materi.',
  ],
}

/** Prompt utama untuk membuat kartu dari materi. */
export function buildMaterialPrompt(opts: PromptOptions): string {
  const count = Math.max(1, Math.min(200, Math.round(opts.count || 20)))
  const topic = opts.topic?.trim()
  const level = opts.level?.trim()
  const material = opts.material?.trim() || MATERIAL_PLACEHOLDER
  const intro = [
    `Ubah MATERI di bawah menjadi sekitar ${count} flashcard`,
    topic ? `tentang "${topic}"` : '',
    level ? `untuk tingkat ${level}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const rules = [
    'Satu kartu = satu fakta atau konsep (atomik). Jawaban sesingkat mungkin: idealnya ≤ 15 kata, maksimal 3 baris.',
    'Pertanyaan harus spesifik, bisa dipahami tanpa melihat kartu lain, dan hanya punya satu jawaban benar. Tambahkan konteks bila perlu (mis. "Pada jalur X, …").',
    'Daftar lebih dari 3 butir jangan dijadikan satu kartu: pecah per butir atau per kelompok kecil.',
    ...STYLE_RULES[opts.style],
    'Buat kartu pembanding untuk hal yang mudah tertukar ("Apa beda X dan Y?").',
    'Gunakan bahasa Indonesia yang ringkas; pertahankan istilah teknis/asing aslinya.',
    'HANYA gunakan informasi dari materi. Jangan menebak atau menambah fakta. Bila ada bagian yang ambigu atau tampak keliru, jangan dibuat kartunya — tulis di CATATAN.',
    'Urutkan dari konsep dasar ke lanjutan.',
  ]

  return `Kamu adalah pembuat flashcard ahli untuk aplikasi spaced repetition (IngatTerus).
${intro}.

PRINSIP ISI (agar mudah diingat jangka panjang):
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

FORMAT WAJIB (agar bisa langsung diimpor):
- Satu kartu per baris: pertanyaan;jawaban
- Tanda titik koma (;) hanya dipakai SATU kali per baris sebagai pemisah. Di dalam teks pakai koma, jangan titik koma.
- Baris baru di dalam jawaban ditulis \\n (garis miring terbalik + huruf n), bukan Enter.
- Tebalkan kata kunci dengan **dua bintang**, miring dengan *satu bintang*.
- Pangkat ditulis x^2^ atau x², indeks H~2~O atau H₂O.
- Tanpa nomor urut, tanpa judul, tanpa baris kosong, tanpa tabel.
- Tulis SEMUA kartu di dalam SATU blok kode (\`\`\`). Setelah blok kode, tulis CATATAN singkat: bagian materi yang dilewati atau perlu dicek.

CONTOH FORMAT:
Apa fungsi utama mitokondria?;Menghasilkan **ATP** lewat respirasi sel
Mengapa sel otot punya banyak mitokondria?;Kontraksi otot butuh **ATP** dalam jumlah besar
Apa beda gula pada DNA dan RNA?;**DNA**: deoksiribosa\\n**RNA**: ribosa

MATERI:
"""
${material}
"""`
}

/** Prompt lanjutan untuk mengecek & merapikan kartu hasil AI sebelum diimpor. */
export function buildReviewPrompt(cards = '[TEMPEL KARTU DI SINI]'): string {
  return `Periksa flashcard berikut (format: pertanyaan;jawaban, satu kartu per baris).

Untuk setiap kartu:
1. Pastikan faktanya benar. Bila salah atau meragukan, perbaiki dan sebutkan di CATATAN.
2. Pecah kartu yang berisi lebih dari satu fakta atau daftar lebih dari 3 butir.
3. Pertajam pertanyaan yang ambigu atau punya lebih dari satu jawaban benar.
4. Persingkat jawaban yang terlalu panjang (idealnya ≤ 15 kata).
5. Hapus kartu duplikat.

Pertahankan format persis: satu kartu per baris, titik koma (;) hanya sekali sebagai pemisah, \\n untuk baris baru, **tebal** untuk kata kunci. Tulis hasil akhir dalam SATU blok kode, lalu CATATAN perubahan di luar blok.

KARTU:
"""
${cards.trim() || '[TEMPEL KARTU DI SINI]'}
"""`
}
