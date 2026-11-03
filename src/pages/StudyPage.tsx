import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db, getSettings } from '../db/db'
import { answerCard, newStudiedToday, paramsFromSettings, undoAnswer, type AnswerUndo } from '../db/repo'
import { goBack, navigate } from '../router'
import { CardFace } from '../components/RichText'
import { Button, EmptyState, IconButton, Panel, ProgressBar, cx, toast } from '../components/ui'
import { IconCheck, IconEdit, IconUndo, IconX } from '../components/icons'
import { buildDeckQueue, interleave, pickNext } from '../lib/queue'
import { formatInterval, pickSchedule, scheduleAll, type SchedulerParams } from '../lib/fsrs'
import { formatClock } from '../lib/date'
import { Rating, type Card } from '../types'

interface Session {
  main: Card[]
  learning: Card[]
  current: Card | null
}

interface HistoryEntry {
  undo: AnswerUndo
  session: Session
  rating: Rating
}

const BUTTONS: { rating: Rating; label: string; key: string; cls: string }[] = [
  { rating: Rating.Lupa, label: 'Lupa', key: '1', cls: 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700' },
  { rating: Rating.Sulit, label: 'Sulit', key: '2', cls: 'bg-orange-500 hover:bg-orange-400 active:bg-orange-600' },
  { rating: Rating.Bisa, label: 'Bisa', key: '3', cls: 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700' },
  { rating: Rating.Mudah, label: 'Mudah', key: '4', cls: 'bg-sky-600 hover:bg-sky-500 active:bg-sky-700' },
]

function nextSession(main: Card[], learning: Card[]): Session {
  const pick = pickNext(main, learning, Date.now())
  if (!pick) return { main, learning, current: null }
  return {
    current: pick.card,
    main: pick.from === 'main' ? main.slice(1) : main,
    learning: pick.from === 'learning' ? learning.filter((c) => c.id !== pick.card.id) : learning,
  }
}

export function StudyPage({ deckId }: { deckId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [title, setTitle] = useState('Belajar')
  const [params, setParams] = useState<SchedulerParams | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [stats, setStats] = useState({ reviewed: 0, again: 0 })
  const [initialTotal, setInitialTotal] = useState(0)
  const startedAt = useRef(Date.now())
  const backTo = deckId === 'semua' ? '/' : `/deck/${deckId}`

  // Susun antrean sekali di awal sesi.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const now = Date.now()
      const settings = await getSettings()
      const decks = deckId === 'semua' ? await db.decks.toArray() : [await db.decks.get(deckId)].filter((d) => d != null)
      if (deckId !== 'semua' && decks[0]) setTitle(decks[0].name)
      else if (deckId === 'semua') setTitle('Semua deck')
      const newToday = await newStudiedToday(now)
      const learning: Card[] = []
      const reviews: Card[] = []
      const fresh: Card[] = []
      for (const d of decks) {
        const cards = await db.cards.where('deckId').equals(d.id).toArray()
        const q = buildDeckQueue(cards, now, settings.newPerDay - (newToday.get(d.id) ?? 0))
        learning.push(...q.learning)
        reviews.push(...q.review)
        fresh.push(...q.fresh)
      }
      reviews.sort((a, b) => a.due - b.due)
      if (cancelled) return
      setParams(paramsFromSettings(settings))
      setInitialTotal(learning.length + reviews.length + fresh.length)
      setSession(nextSession(interleave(reviews, fresh), learning))
    })()
    return () => {
      cancelled = true
    }
  }, [deckId])

  const current = session?.current ?? null
  const previews = useMemo(() => {
    if (!current || !params) return null
    const at = Date.now()
    return { at, all: scheduleAll(pickSchedule(current), at, params) }
  }, [current, params])

  const answer = useCallback(
    async (rating: Rating) => {
      if (!session?.current || busy) return
      setBusy(true)
      try {
        const { card: updated, undo } = await answerCard(session.current.id, rating)
        const learning = [...session.learning]
        if (updated.state === 'learning' || updated.state === 'relearning') learning.push(updated)
        setHistory((h) => [...h.slice(-49), { undo, session, rating }])
        setStats((s) => ({ reviewed: s.reviewed + 1, again: s.again + (rating === Rating.Lupa ? 1 : 0) }))
        setSession(nextSession(session.main, learning))
        setRevealed(false)
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Gagal menyimpan jawaban', 'error')
      } finally {
        setBusy(false)
      }
    },
    [session, busy],
  )

  const undoLast = useCallback(async () => {
    const last = history[history.length - 1]
    if (!last || busy) return
    setBusy(true)
    try {
      await undoAnswer(last.undo)
      setHistory((h) => h.slice(0, -1))
      setStats((s) => ({ reviewed: s.reviewed - 1, again: s.again - (last.rating === Rating.Lupa ? 1 : 0) }))
      setSession({ ...last.session, current: last.undo.previous })
      setRevealed(true)
      toast('Jawaban terakhir dibatalkan')
    } finally {
      setBusy(false)
    }
  }, [history, busy])

  // Pintasan keyboard: Spasi/Enter = tampilkan, 1–4 = nilai, U / Ctrl+Z = batalkan.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) || e.key === 'u') {
        e.preventDefault()
        void undoLast()
        return
      }
      if (!current) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed) {
        const b = BUTTONS.find((x) => x.key === e.key)
        if (b) {
          e.preventDefault()
          void answer(b.rating)
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          void answer(Rating.Bisa)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, revealed, answer, undoLast])

  if (!session) {
    return <div className="mt-10 h-64 animate-pulse rounded-3xl bg-slate-200/70 dark:bg-slate-800/60" />
  }

  const remaining = {
    fresh: session.main.filter((c) => c.state === 'new').length + (current?.state === 'new' ? 1 : 0),
    learning: session.learning.length + (current && (current.state === 'learning' || current.state === 'relearning') ? 1 : 0),
    review: session.main.filter((c) => c.state === 'review').length + (current?.state === 'review' ? 1 : 0),
  }
  const left = remaining.fresh + remaining.learning + remaining.review
  const progress = initialTotal === 0 ? 1 : Math.min(1, stats.reviewed / Math.max(1, stats.reviewed + left))

  const topBar = (
    <div className="mb-3 flex items-center gap-2">
      <IconButton label="Akhiri sesi" onClick={() => goBack(backTo)} className="-ml-2">
        <IconX />
      </IconButton>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <ProgressBar value={progress} className="mt-1" />
      </div>
      <IconButton label="Batalkan jawaban terakhir (U)" onClick={undoLast} disabled={history.length === 0 || busy}>
        <IconUndo />
      </IconButton>
    </div>
  )

  if (!current) {
    const elapsed = (Date.now() - startedAt.current) / 1000
    return (
      <div>
        {topBar}
        <Panel className="mt-6 animate-pop text-center">
          {stats.reviewed === 0 ? (
            <EmptyState icon={<IconCheck />} title="Tidak ada kartu untuk sekarang">
              Semua kartu sudah dipelajari. Kembali lagi nanti, atau coba mode kuis untuk latihan tambahan.
            </EmptyState>
          ) : (
            <div className="py-6">
              <div className="text-5xl">🎉</div>
              <h1 className="mt-3 text-2xl font-bold">Sesi selesai!</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kerja bagus, ingatanmu makin kuat.</p>
              <div className="mt-6 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <div className="text-2xl font-bold tabular-nums">{stats.reviewed}</div>
                  <div className="text-xs text-slate-500">ulasan</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <div className="text-2xl font-bold tabular-nums">{Math.round(((stats.reviewed - stats.again) / stats.reviewed) * 100)}%</div>
                  <div className="text-xs text-slate-500">diingat</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <div className="text-2xl font-bold tabular-nums">{formatClock(elapsed)}</div>
                  <div className="text-xs text-slate-500">durasi</div>
                </div>
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" block onClick={() => navigate(backTo, { replace: true })}>
              Selesai
            </Button>
            {deckId !== 'semua' && (
              <Button block onClick={() => navigate(`/kuis/${deckId}`, { replace: true })}>
                Latihan kuis
              </Button>
            )}
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-1.5rem)] flex-col">
      {topBar}
      <div className="mb-2 flex items-center justify-center gap-4 text-sm font-semibold tabular-nums">
        <span className={cx('text-sky-600 dark:text-sky-400', current.state === 'new' && 'underline underline-offset-4')}>{remaining.fresh} baru</span>
        <span className={cx('text-orange-600 dark:text-orange-400', (current.state === 'learning' || current.state === 'relearning') && 'underline underline-offset-4')}>
          {remaining.learning} belajar
        </span>
        <span className={cx('text-emerald-600 dark:text-emerald-400', current.state === 'review' && 'underline underline-offset-4')}>{remaining.review} ulang</span>
      </div>

      <div
        onClick={() => !revealed && setRevealed(true)}
        className={cx(
          'flex flex-1 flex-col rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800',
          !revealed && 'cursor-pointer',
        )}
        key={`${current.id}-${current.reps}`}
      >
        <div className="flex flex-1 animate-pop flex-col justify-center">
          <CardFace text={current.front} image={current.frontImage} className="text-xl leading-relaxed font-medium sm:text-2xl" />
          {revealed && (
            <div className="animate-slide-up">
              <hr className="my-6 border-dashed border-slate-200 dark:border-slate-700" />
              <CardFace text={current.back} image={current.backImage} className="text-lg leading-relaxed text-slate-700 dark:text-slate-200" />
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
          <span>{current.state === 'new' ? 'Kartu baru' : current.lapses > 0 ? `Lupa ${current.lapses}×` : `Diulang ${current.reps}×`}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/kartu/${current.id}`)
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <IconEdit size={14} /> Ubah kartu
          </button>
        </div>
      </div>

      <div className="pb-safe sticky bottom-0 mt-3 bg-slate-50 pt-1 dark:bg-slate-950">
        {!revealed ? (
          <Button size="lg" block onClick={() => setRevealed(true)}>
            Tampilkan jawaban
          </Button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {BUTTONS.map((b) => {
              const next = previews?.all[b.rating]
              return (
                <button
                  key={b.rating}
                  type="button"
                  disabled={busy}
                  onClick={() => answer(b.rating)}
                  className={cx(
                    'flex h-16 flex-col items-center justify-center rounded-2xl text-white shadow-sm transition select-none disabled:opacity-60',
                    b.cls,
                  )}
                  title={`${b.label} (${b.key})`}
                >
                  <span className="text-sm font-bold">{b.label}</span>
                  <span className="text-xs text-white/85 tabular-nums">{next && previews ? formatInterval(next.due - previews.at) : ''}</span>
                </button>
              )
            })}
          </div>
        )}
        <p className="mt-2 hidden text-center text-xs text-slate-400 sm:block">
          Pintasan: Spasi = tampilkan · 1–4 = nilai · U = batalkan
        </p>
      </div>
    </div>
  )
}
