import { useEffect, useState } from 'react'
import { DECK_COLORS, createDeck, updateDeck } from '../db/repo'
import type { Deck } from '../types'
import { Button, Field, Modal, TextArea, TextInput, cx, toast } from './ui'

export const COLOR_CLASSES: Record<string, { dot: string; soft: string; text: string; bar: string }> = {
  indigo: { dot: 'bg-indigo-500', soft: 'bg-indigo-50 dark:bg-indigo-950/60', text: 'text-indigo-700 dark:text-indigo-300', bar: 'from-indigo-500 to-violet-500' },
  emerald: { dot: 'bg-emerald-500', soft: 'bg-emerald-50 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-300', bar: 'from-emerald-500 to-teal-500' },
  amber: { dot: 'bg-amber-500', soft: 'bg-amber-50 dark:bg-amber-950/60', text: 'text-amber-700 dark:text-amber-300', bar: 'from-amber-500 to-orange-500' },
  rose: { dot: 'bg-rose-500', soft: 'bg-rose-50 dark:bg-rose-950/60', text: 'text-rose-700 dark:text-rose-300', bar: 'from-rose-500 to-pink-500' },
  sky: { dot: 'bg-sky-500', soft: 'bg-sky-50 dark:bg-sky-950/60', text: 'text-sky-700 dark:text-sky-300', bar: 'from-sky-500 to-blue-500' },
  violet: { dot: 'bg-violet-500', soft: 'bg-violet-50 dark:bg-violet-950/60', text: 'text-violet-700 dark:text-violet-300', bar: 'from-violet-500 to-fuchsia-500' },
  teal: { dot: 'bg-teal-500', soft: 'bg-teal-50 dark:bg-teal-950/60', text: 'text-teal-700 dark:text-teal-300', bar: 'from-teal-500 to-cyan-500' },
  orange: { dot: 'bg-orange-500', soft: 'bg-orange-50 dark:bg-orange-950/60', text: 'text-orange-700 dark:text-orange-300', bar: 'from-orange-500 to-red-500' },
}

export const colorOf = (key: string) => COLOR_CLASSES[key] ?? COLOR_CLASSES.indigo

export function DeckFormModal({
  open,
  onClose,
  deck,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  deck?: Deck
  onSaved?: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<string>('indigo')

  useEffect(() => {
    if (!open) return
    setName(deck?.name ?? '')
    setDescription(deck?.description ?? '')
    setColor(deck?.color ?? DECK_COLORS[Math.floor(Math.random() * DECK_COLORS.length)])
  }, [open, deck])

  const save = async () => {
    if (!name.trim()) {
      toast('Nama deck wajib diisi', 'error')
      return
    }
    if (deck) {
      await updateDeck(deck.id, { name: name.trim(), description: description.trim(), color })
      toast('Deck diperbarui', 'success')
      onSaved?.(deck.id)
    } else {
      const id = await createDeck({ name, description, color })
      toast('Deck dibuat', 'success')
      onSaved?.(id)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={deck ? 'Ubah deck' : 'Deck baru'}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Nama deck">
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Biologi Bab 3" maxLength={80} />}
        </Field>
        <Field label="Deskripsi (opsional)">
          {(id) => (
            <TextArea id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tentang apa deck ini?" className="min-h-16" maxLength={300} />
          )}
        </Field>
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Warna</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Warna deck">
            {DECK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cx(
                  'h-9 w-9 rounded-full ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900',
                  COLOR_CLASSES[c].dot,
                  color === c ? 'ring-2 ring-slate-900 dark:ring-white' : 'opacity-80 hover:opacity-100',
                )}
              />
            ))}
          </div>
        </div>
        <Button type="submit" block>
          {deck ? 'Simpan perubahan' : 'Buat deck'}
        </Button>
      </form>
    </Modal>
  )
}
