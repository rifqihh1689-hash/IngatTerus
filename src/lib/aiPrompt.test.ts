import { describe, expect, it } from 'vitest'
import { MATERIAL_PLACEHOLDER, buildMaterialPrompt, buildReviewPrompt } from './aiPrompt'
import { parseCardText } from './importText'

describe('prompt AI pembuat kartu', () => {
  it('memuat topik, tingkat, jumlah, materi, dan aturan format impor', () => {
    const p = buildMaterialPrompt({ topic: 'Metabolisme nukleotida', level: 'kuliah kedokteran', count: 30, style: 'pemahaman', material: 'Purin terdiri dari adenin dan guanin.' })
    expect(p).toContain('sekitar 30 flashcard tentang "Metabolisme nukleotida" untuk tingkat kuliah kedokteran')
    expect(p).toContain('pertanyaan;jawaban')
    expect(p).toContain('\\n (garis miring terbalik')
    expect(p).toContain('Purin terdiri dari adenin dan guanin.')
    expect(p).toContain('mengapa')
    expect(p).not.toContain(MATERIAL_PLACEHOLDER)
  })

  it('memberi penanda tempat materi & aturan khusus tiap jenis kartu', () => {
    expect(buildMaterialPrompt({ count: 20, style: 'singkat' })).toContain(MATERIAL_PLACEHOLDER)
    expect(buildMaterialPrompt({ count: 20, style: 'singkat' })).toContain('1–5 kata')
    expect(buildMaterialPrompt({ count: 20, style: 'istilah' })).toContain('DUA kartu')
    expect(buildMaterialPrompt({ count: 0, style: 'pemahaman' })).toContain('sekitar 20 flashcard')
  })

  it('contoh format di dalam prompt bisa diimpor tanpa error', () => {
    const p = buildMaterialPrompt({ count: 10, style: 'pemahaman' })
    const example = p.split('CONTOH FORMAT:\n')[1].split('\n\nMATERI:')[0]
    const r = parseCardText(example)
    expect(r.errors).toEqual([])
    expect(r.cards).toHaveLength(3)
    expect(r.cards[2].back).toBe('**DNA**: deoksiribosa\n**RNA**: ribosa')
  })

  it('prompt pengecekan menyertakan kartu', () => {
    expect(buildReviewPrompt('a;b')).toContain('"""\na;b\n"""')
  })
})
