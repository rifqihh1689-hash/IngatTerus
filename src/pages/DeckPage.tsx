import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { deleteDeck } from '../db/repo'
import { navigate, Link } from '../router'
import { useDeckSummaries } from '../hooks/useData'
import { DeckFormModal, colorOf } from '../components/DeckForm'
import { CountChips } from './HomePage'
import { Button, EmptyState, IconButton, Modal, PageHeader, Panel, TextInput, confirmDialog, cx, toast } from '../components/ui'
import {
  IconDownload,
  IconEdit,
  IconImage,
  IconLayers,
  IconMore,
  IconPlay,
  IconPlus,
  IconQuiz,
  IconSearch,
  IconTarget,
  IconTimer,
  IconTrash,
  IconUpload,
} from '../components/icons'
import { toPlainText } from '../lib/richtext'
import { formatInterval } from '../lib/fsrs'
import { toCardText } from '../lib/importText'
import { downloadText } from '../lib/image'
import { distinctAnswerCount } from '../lib/quiz'
import { isLeech } from '../lib/queue'
import type { Card } from '../types'

const PAGE = 40

function StateBadge({ card, now }: { card: Card; now: number }) {
  if (card.state === 'new') return <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">Baru</span>
  if (card.state === 'learning' || card.state === 'relearning')
    return <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300">Belajar</span>
  const dueIn = card.due - now
  return (
    <span
      className={cx(
        'rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        dueIn <= 0
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      )}
    >
      {dueIn <= 0 ? 'Jatuh tempo' : formatInterval(dueIn)}
    </span>
  )
}

export function DeckPage({ deckId }: { deckId: string }) {
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId], null)
  const cards = useLiveQuery(() => db.cards.where('deckId').equals(deckId).sortBy('createdAt'), [deckId])
  const summary = useDeckSummaries()?.find((s) => s.deck.id === deckId)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const now = Date.now()

  const filtered = useMemo(() => {
    if (!cards) return []
    const q = query.trim().toLocaleLowerCase('id')
    if (!q) return cards
    return cards.filter((c) => `${toPlainText(c.front)} ${toPlainText(c.back)}`.toLocaleLowerCase('id').includes(q))
  }, [cards, query])

  if (deck === undefined) {
    return (
      <EmptyState title="Deck tidak ditemukan">
        <Link to="/" className="font-semibold text-indigo-600">
          Kembali ke beranda
        </Link>
      </EmptyState>
    )
  }
  if (deck === null || !cards) return <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />

  const c = colorOf(deck.color)
  const pending = summary ? summary.counts.fresh + summary.counts.learning + summary.counts.review : 0
  const canQuiz = distinctAnswerCount(cards) >= 2
  const hasReviewed = cards.some((x) => x.state === 'review')

  const exportCsv = () => {
    downloadText(
      toCardText(cards.map((x) => ({ front: x.front, back: x.back }))),
      `${deck.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.csv`,
      'text/csv',
    )
    setMenu(false)
  }

  const remove = async () => {
    setMenu(false)
    const ok = await confirmDialog({
      title: 'Hapus deck?',
      message: (
        <>
          Deck <b>{deck.name}</b> beserta {cards.length} kartu dan riwayat belajarnya akan dihapus permanen.
        </>
      ),
      confirmLabel: 'Hapus deck',
      danger: true,
    })
    if (!ok) return
    await deleteDeck(deck.id)
    toast('Deck dihapus', 'success')
    navigate('/', { replace: true })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        back="/"
        title={deck.name}
        subtitle={`${cards.length} kartu`}
        actions={
          <>
            <IconButton label="Ubah deck" onClick={() => setEditing(true)}>
              <IconEdit />
            </IconButton>
            <IconButton label="Menu lainnya" onClick={() => setMenu(true)}>
              <IconMore />
            </IconButton>
          </>
        }
      />

      <Panel className="space-y-4">
        <div className={cx('h-1.5 w-16 rounded-full bg-gradient-to-r', c.bar)} />
        {deck.description && <p className="text-sm text-slate-600 dark:text-slate-300">{deck.description}</p>}
        {summary && <CountChips counts={summary.counts} />}
        {pending > 0 || !hasReviewed ? (
          <Button size="lg" block disabled={pending === 0} onClick={() => navigate(`/belajar/${deck.id}`)}>
            <IconPlay size={18} /> {pending === 0 ? 'Tidak ada kartu untuk hari ini' : `Belajar (${pending})`}
          </Button>
        ) : (
          <Button size="lg" block onClick={() => navigate(`/belajar/${deck.id}?mode=ekstra`)}>
            <IconTarget size={18} /> Semua beres · latihan tambahan
          </Button>
        )}
        {summary && summary.counts.total > 0 && (
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={cx('h-full rounded-full bg-gradient-to-r', c.bar)} style={{ width: `${Math.round(summary.mastery * 100)}%` }} />
            </div>
            <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{Math.round(summary.mastery * 100)}% dikuasai</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={!canQuiz} onClick={() => navigate(`/kuis/${deck.id}`)}>
            <IconQuiz size={18} /> Kuis
          </Button>
          <Button variant="secondary" disabled={!canQuiz} onClick={() => navigate(`/ujian/${deck.id}`)}>
            <IconTimer size={18} /> Ujian
          </Button>
        </div>
        {!canQuiz && cards.length > 0 && (
          <p className="text-xs text-slate-500">Kuis & ujian butuh minimal 2 kartu dengan jawaban berbeda.</p>
        )}
      </Panel>

      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-base font-bold">Kartu</h2>
        <Button size="sm" variant="secondary" onClick={() => navigate(`/impor?deck=${deck.id}`)}>
          <IconUpload size={16} /> Impor
        </Button>
        <Button size="sm" onClick={() => navigate(`/deck/${deck.id}/kartu-baru`)}>
          <IconPlus size={16} /> Kartu
        </Button>
      </div>

      {cards.length > 6 && (
        <div className="relative">
          <IconSearch size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <TextInput
            type="search"
            placeholder="Cari kartu…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            className="pl-10"
            aria-label="Cari kartu"
          />
        </div>
      )}

      {cards.length === 0 ? (
        <Panel>
          <EmptyState icon={<IconLayers />} title="Deck ini masih kosong">
            Tambahkan kartu satu per satu atau impor dari teks/CSV.
          </EmptyState>
        </Panel>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Tidak ada kartu yang cocok dengan “{query}”.</p>
      ) : (
        <ul className="divide-y divide-slate-200/80 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
          {filtered.slice(0, limit).map((card) => (
            <li key={card.id}>
              <Link to={`/kartu/${card.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {(card.frontImage || card.backImage) && <IconImage size={14} className="mr-1 inline text-slate-400" />}
                    {toPlainText(card.front) || <span className="text-slate-400 italic">(gambar)</span>}
                  </p>
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">{toPlainText(card.back).replace(/\n/g, ' · ')}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StateBadge card={card} now={now} />
                  {isLeech(card) && (
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">sering lupa</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {filtered.length > limit && (
        <Button variant="ghost" block onClick={() => setLimit((l) => l + PAGE)}>
          Tampilkan lebih banyak ({filtered.length - limit} lagi)
        </Button>
      )}

      <DeckFormModal open={editing} onClose={() => setEditing(false)} deck={deck} />
      <Modal open={menu} onClose={() => setMenu(false)} title="Menu deck">
        <div className="space-y-2">
          <Button variant="secondary" block onClick={exportCsv} disabled={cards.length === 0}>
            <IconDownload size={18} /> Ekspor kartu ke CSV
          </Button>
          <Button variant="secondary" block onClick={() => navigate(`/impor?deck=${deck.id}`)}>
            <IconUpload size={18} /> Impor kartu ke deck ini
          </Button>
          <Button variant="danger" block onClick={remove}>
            <IconTrash size={18} /> Hapus deck
          </Button>
        </div>
      </Modal>
    </div>
  )
}
