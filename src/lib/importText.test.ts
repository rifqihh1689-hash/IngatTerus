import { describe, expect, it } from 'vitest'
import { detectDelimiter, findDuplicates, parseCardText, splitRows, toCardText } from './importText'

describe('parseCardText — format "pertanyaan;jawaban"', () => {
  it('membaca satu kartu per baris', () => {
    const r = parseCardText('Ibu kota Indonesia?;Jakarta\n2 + 2?;4')
    expect(r.delimiter).toBe(';')
    expect(r.errors).toEqual([])
    expect(r.cards).toEqual([
      { front: 'Ibu kota Indonesia?', back: 'Jakarta', line: 1 },
      { front: '2 + 2?', back: '4', line: 2 },
    ])
  })

  it('memangkas spasi, melewati baris kosong dan komentar #', () => {
    const r = parseCardText('# daftar kosakata; jangan diimpor\n\n  apple ;  apel  \n\r\n   \nbook;buku')
    expect(r.cards.map((c) => [c.front, c.back])).toEqual([
      ['apple', 'apel'],
      ['book', 'buku'],
    ])
    expect(r.cards[0].line).toBe(3)
  })

  it('menangani CRLF dan BOM dari Excel', () => {
    const r = parseCardText('﻿satu;one\r\ndua;two\r\n')
    expect(r.cards.map((c) => [c.front, c.back])).toEqual([
      ['satu', 'one'],
      ['dua', 'two'],
    ])
  })

  it('melaporkan baris tanpa pemisah atau dengan sisi kosong', () => {
    const r = parseCardText('tanpa pemisah\n;jawaban saja\npertanyaan saja;\nbaik;oke')
    expect(r.cards).toHaveLength(1)
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 3])
    expect(r.errors[0].message).toMatch(/pemisah/)
    expect(r.errors[1].message).toBe('Pertanyaan kosong')
    expect(r.errors[2].message).toBe('Jawaban kosong')
    expect(r.errors[0].raw).toBe('tanpa pemisah')
  })

  it('pemisah tambahan menjadi bagian jawaban; kolom kosong di ujung diabaikan', () => {
    const r = parseCardText('Rumus luas persegi panjang?;p × l; dengan p = panjang\nhalo;hai;;')
    expect(r.cards[0].back).toBe('p × l; dengan p = panjang')
    expect(r.cards[1].back).toBe('hai')
  })

  it('mendukung kolom berkutip, kutip ganda, dan baris baru di dalam kutip', () => {
    const text = '"Apa arti ""hello""?";"halo; salam"\n"Dua baris";"baris 1\nbaris 2"\nakhir;ok'
    const r = parseCardText(text)
    expect(r.errors).toEqual([])
    expect(r.cards[0]).toMatchObject({ front: 'Apa arti "hello"?', back: 'halo; salam', line: 1 })
    expect(r.cards[1]).toMatchObject({ front: 'Dua baris', back: 'baris 1\nbaris 2', line: 2 })
    expect(r.cards[2]).toMatchObject({ front: 'akhir', line: 4 })
  })

  it('mengubah \\n menjadi baris baru', () => {
    const r = parseCardText('Sila pertama?;Ketuhanan Yang Maha Esa\\n(lambang bintang)')
    expect(r.cards[0].back).toBe('Ketuhanan Yang Maha Esa\n(lambang bintang)')
  })

  it('mendeteksi dan melewati header', () => {
    const r = parseCardText('Pertanyaan;Jawaban\nkucing;cat')
    expect(r.headerSkipped).toBe(true)
    expect(r.cards).toHaveLength(1)
    const tanpa = parseCardText('kucing;cat\nanjing;dog')
    expect(tanpa.headerSkipped).toBe(false)
    expect(tanpa.cards).toHaveLength(2)
  })

  it('opsi header dapat dipaksa', () => {
    expect(parseCardText('a;b\nc;d', { header: true }).cards).toHaveLength(1)
    expect(parseCardText('front;back\nc;d', { header: false }).cards).toHaveLength(2)
  })

  it('mendukung CSV koma dan TSV (tab)', () => {
    const csv = parseCardText('apple,apel\n"one, two","satu, dua"')
    expect(csv.delimiter).toBe(',')
    expect(csv.cards[1]).toMatchObject({ front: 'one, two', back: 'satu, dua' })
    const tsv = parseCardText('apple\tapel\nbook\tbuku')
    expect(tsv.delimiter).toBe('\t')
    expect(tsv.cards).toHaveLength(2)
  })

  it('pemisah eksplisit mengalahkan deteksi otomatis', () => {
    const r = parseCardText('a,b;c', { delimiter: ',' })
    expect(r.cards[0]).toMatchObject({ front: 'a', back: 'b;c' })
  })

  it('teks kosong menghasilkan nol kartu', () => {
    const r = parseCardText('   \n\n')
    expect(r.cards).toEqual([])
    expect(r.errors).toEqual([])
  })
})

describe('detectDelimiter & splitRows', () => {
  it('titik koma diutamakan bila dipakai mayoritas baris', () => {
    expect(detectDelimiter('a;b, c\nd;e')).toBe(';')
    expect(detectDelimiter('a,b\nc,d')).toBe(',')
    expect(detectDelimiter('a\tb')).toBe('\t')
    expect(detectDelimiter('tanpa pemisah')).toBe(';')
  })

  it('splitRows mencatat nomor baris awal setiap baris', () => {
    const rows = splitRows('"a\nb";c\nd;e', ';')
    expect(rows.map((r) => r.line)).toEqual([1, 3])
    expect(rows[0].fields).toEqual(['a\nb', 'c'])
  })
})

describe('duplikat & ekspor', () => {
  it('menandai kartu yang sudah ada atau berulang (abaikan huruf besar & format)', () => {
    const { cards } = parseCardText('Apple;apel\nbook;buku\nBOOK;buku lagi\nnew;baru')
    const dupes = findDuplicates(cards, ['**apple**'])
    expect([...dupes].sort()).toEqual([0, 2])
  })

  it('ekspor teks bisa diimpor kembali tanpa kehilangan isi', () => {
    const cards = [
      { front: 'Apa arti "hello"?', back: 'halo; salam' },
      { front: 'Dua baris', back: 'satu\ndua' },
      { front: 'biasa', back: 'saja' },
    ]
    const text = toCardText(cards)
    const r = parseCardText(text)
    expect(r.headerSkipped).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.cards.map(({ front, back }) => ({ front, back }))).toEqual(cards)
  })
})

describe('teks hasil AI', () => {
  it('hanya mengambil isi blok kode pertama; nomor baris tetap sesuai teks asli', () => {
    const ai = [
      'Berikut flashcard-nya:',
      '',
      '```text',
      'Apa itu ATP?;Pembawa **energi** sel',
      'Apa beda DNA dan RNA?;**DNA**: deoksiribosa\\n**RNA**: ribosa',
      '```',
      '',
      'CATATAN: bagian 3 dilewati karena ambigu.',
    ].join('\n')
    const r = parseCardText(ai)
    expect(r.errors).toEqual([])
    expect(r.cards.map((c) => c.line)).toEqual([4, 5])
    expect(r.cards[1].back).toBe('**DNA**: deoksiribosa\n**RNA**: ribosa')
  })

  it('blok kode tanpa penutup tetap terbaca; teks tanpa blok kode tidak berubah', async () => {
    const { keepFirstCodeBlock } = await import('./importText')
    expect(parseCardText('```\na;b\nc;d').cards).toHaveLength(2)
    expect(keepFirstCodeBlock('a;b\nc;d')).toBe('a;b\nc;d')
  })
})
