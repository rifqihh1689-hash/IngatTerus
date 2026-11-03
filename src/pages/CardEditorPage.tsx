import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addCard, deleteCard, resetCard, updateCard } from '../db/repo'
import { goBack, navigate } from '../router'
import { RichEditor } from '../components/RichEditor'
import { Button, EmptyState, Field, PageHeader, Panel, Select, confirmDialog, toast } from '../components/ui'
import { IconRefresh, IconTrash } from '../components/icons'
import { formatDateTime } from '../lib/date'
import { DEFAULT_W, isValidWeights, retrievability } from '../lib/fsrs'
import { isLeech } from '../lib/queue'
import { useSettings } from '../hooks/useData'
import { formatPercent } from '../lib/stats'
import type { Card } from '../types'

const STATE_LABEL: Record<Card['state'], string> = {
  new: 'Baru',
  learning: 'Sedang dipelajari',
  review: 'Pengulangan',
  relearning: 'Dipelajari ulang',
}

export function CardEditorPage({ deckId, cardId }: { deckId?: string; cardId?: string }) {
  const existing = useLiveQuery(() => (cardId ? db.cards.get(cardId) : undefined), [cardId], null)
  const decks = useLiveQuery(() => db.decks.orderBy('createdAt').toArray(), [])
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [frontImage, setFrontImage] = useState<string | undefined>()
  const [backImage, setBackImage] = useState<string | undefined>()
  const [targetDeck, setTargetDeck] = useState(deckId ?? '')
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const settings = useSettings()
  const w = isValidWeights(settings.fsrsParams) ? settings.fsrsParams : DEFAULT_W

  useEffect(() => {
    if (existing && existing.id !== loadedId) {
      setFront(existing.front)
      setBack(existing.back)
      setFrontImage(existing.frontImage)
      setBackImage(existing.backImage)
      setTargetDeck(existing.deckId)
      setLoadedId(existing.id)
    }
  }, [existing, loadedId])

  if (cardId && existing === undefined) {
    return <EmptyState title="Kartu tidak ditemukan" />
  }
  if (cardId && existing === null) return <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />

  const isEdit = !!existing
  const valid = (front.trim() || frontImage) && (back.trim() || backImage)

  const save = async (again: boolean) => {
    if (!valid) {
      toast('Isi sisi depan dan belakang (teks atau gambar)', 'error')
      return
    }
    setSaving(true)
    try {
      const input = { front, back, frontImage, backImage }
      if (existing) {
        await updateCard(existing.id, input)
        if (targetDeck && targetDeck !== existing.deckId) await db.cards.update(existing.id, { deckId: targetDeck })
        toast('Kartu disimpan', 'success')
        goBack(`/deck/${targetDeck}`)
      } else {
        await addCard(targetDeck, input)
        toast('Kartu ditambahkan', 'success')
        if (again) {
          setFront('')
          setBack('')
          setFrontImage(undefined)
          setBackImage(undefined)
          document.querySelector<HTMLTextAreaElement>('textarea')?.focus()
        } else {
          goBack(`/deck/${targetDeck}`)
        }
      }
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    const ok = await confirmDialog({ title: 'Hapus kartu?', message: 'Kartu dan riwayat belajarnya akan dihapus permanen.', confirmLabel: 'Hapus', danger: true })
    if (!ok) return
    await deleteCard(existing.id)
    toast('Kartu dihapus', 'success')
    navigate(`/deck/${existing.deckId}`, { replace: true })
  }

  const reset = async () => {
    if (!existing) return
    const ok = await confirmDialog({ title: 'Atur ulang kemajuan?', message: 'Kartu akan kembali menjadi kartu baru. Riwayat lama tetap tersimpan.', confirmLabel: 'Atur ulang' })
    if (!ok) return
    await resetCard(existing.id)
    toast('Kemajuan kartu diatur ulang', 'success')
  }

  return (
    <div className="space-y-4">
      <PageHeader back={`/deck/${targetDeck}`} title={isEdit ? 'Ubah kartu' : 'Kartu baru'} subtitle={decks?.find((d) => d.id === targetDeck)?.name} />

      <Panel className="space-y-5">
        <RichEditor
          label="Depan (pertanyaan)"
          value={front}
          onChange={setFront}
          image={frontImage}
          onImageChange={setFrontImage}
          placeholder="mis. Apa ibu kota Jepang?"
          autoFocus={!isEdit}
        />
        <RichEditor
          label="Belakang (jawaban)"
          value={back}
          onChange={setBack}
          image={backImage}
          onImageChange={setBackImage}
          placeholder="mis. **Tokyo**"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Format: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">**tebal**</code>,{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">*miring*</code>,{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">x^2^</code>,{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">H~2~O</code>. Pintasan: Ctrl+B / Ctrl+I.
        </p>
        {decks && decks.length > 1 && (
          <Field label="Deck">
            {(id) => (
              <Select id={id} value={targetDeck} onChange={(e) => setTargetDeck(e.target.value)}>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {!isEdit && (
            <Button variant="secondary" block disabled={saving || !targetDeck} onClick={() => save(true)}>
              Simpan & tambah lagi
            </Button>
          )}
          <Button block disabled={saving || !targetDeck} onClick={() => save(false)}>
            Simpan
          </Button>
        </div>
      </Panel>

      {existing && (
        <Panel className="space-y-3">
          <h2 className="font-semibold">Kemajuan kartu</h2>
          {isLeech(existing) && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Kartu ini sudah {existing.lapses}× lupa. Biasanya kartu seperti ini terlalu panjang atau mirip kartu lain: coba pecah
              menjadi 2–3 kartu kecil, tambahkan contoh, atau tulis ulang pertanyaannya.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Status</dt>
            <dd className="text-right font-medium">{STATE_LABEL[existing.state]}</dd>
            <dt className="text-slate-500">Diulang</dt>
            <dd className="text-right font-medium">{existing.reps}× (lupa {existing.lapses}×)</dd>
            {existing.state !== 'new' && (
              <>
                <dt className="text-slate-500">Jatuh tempo</dt>
                <dd className="text-right font-medium">{formatDateTime(existing.due)}</dd>
                <dt className="text-slate-500">Stabilitas</dt>
                <dd className="text-right font-medium">{existing.stability.toFixed(1).replace('.', ',')} hari</dd>
                <dt className="text-slate-500">Kesulitan</dt>
                <dd className="text-right font-medium">{existing.difficulty.toFixed(1).replace('.', ',')} / 10</dd>
                <dt className="text-slate-500">Peluang ingat saat ini</dt>
                <dd className="text-right font-medium">{formatPercent(retrievability(existing, Date.now(), w))}</dd>
              </>
            )}
          </dl>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={reset} disabled={existing.state === 'new'}>
              <IconRefresh size={16} /> Atur ulang
            </Button>
            <Button variant="danger-ghost" size="sm" onClick={remove}>
              <IconTrash size={16} /> Hapus kartu
            </Button>
          </div>
        </Panel>
      )}
    </div>
  )
}
