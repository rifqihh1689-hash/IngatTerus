import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db, getSettings } from '../db/db'
import { answerCard, newStudiedToday, paramsFromSettings, undoAnswer, type AnswerUndo } from '../db/repo'
import { goBack, navigate } from '../router'
import { CardFace, RichText } from '../components/RichText'
import { Button, IconButton, ProgressBar, cx, toast } from '../components/ui'
import { IconEdit, IconFlame, IconTarget, IconUndo, IconX } from '../components/icons'
import { buildDeckQueue, buildExtraQueue, interleave, isLeech, pickNext, roundRobin } from '../lib/queue'
import { formatInterval, pickSchedule, scheduleAll, type SchedulerParams } from '../lib/fsrs'
import { DAY_MS, dayKey, endOfDay, formatClock } from '../lib/date'
import { computeStreak } from '../lib/stats'
import { confetti, haptic } from '../lib/celebrate'
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

const BUTTONS: { rating: Rating; label: string; hint: string; key: string; cls: string }[] = [
  { rating: Rating.Lupa, label: 'Lupa', hint: 'tidak ingat', key: '1', cls: 'from-rose-500 to-rose-600 shadow-rose-600/25' },
  { rating: Rating.Sulit, label: 'Sulit', hint: 'ingat susah', key: '2', cls: 'from-amber-500 to-orange-500 shadow-orange-500/25' },
  { rating: Rating.Bisa, label: 'Bisa', hint: 'ingat', key: '3', cls: 'from-emerald-500 to-emerald-600 shadow-emerald-600/25' },
  { rating: Rating.Mudah, label: 'Mudah', hint: 'langsung', key: '4', cls: 'from-sky-500 to-blue-600 shadow-blue-600/25' },
]

const STATE_CHIP: Record<Card['state'], { label: string; cls: string }> = {
  new: { label: 'Kartu baru', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  learning: { label: 'Sedang dipelajari', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  relearning: { label: 'Dipelajari ulang', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  review: { label: 'Pengulangan', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
}

function nextSession(main: Card[], learning: Card[]): Session {
  const pick = pickNext(main, learning, Date.now())
  if (!pick) return { main, learning, current: null }
  return {
    current: pick.card,
    main: pick.from === 'main' ? main.slice(1) : main,
    learning: pick.from === 'learning' ? learning.filter((c) => c.id !== pick.card.id) : learning,
  }
}

interface Summary {
  tomorrow: number
  streak: number
}

export function StudyPage({ deckId, extra = false }: { deckId: string; extra?: boolean }) {
  const [session, setSession] = useState<Session | null>(null)
  const [title, setTitle] = useState('Belajar')
  const [params, setParams] = useState<SchedulerParams | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [stats, setStats] = useState({ reviewed: 0, again: 0 })
  const [canExtra, setCanExtra] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const startedAt = useRef(Date.now())
  const shownAt = useRef(Date.now())
  const celebrated = useRef(false)
  const backTo = deckId === 'semua' ? '/' : `/deck/${deckId}`

  // Susun antrean sekali di awal sesi.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const now = Date.now()
      const settings = await getSettings()
      const p = paramsFromSettings(settings)
      const decks = deckId === 'semua' ? await db.decks.toArray() : [await db.decks.get(deckId)].filter((d) => d != null)
      const name = deckId === 'semua' ? 'Semua deck' : (decks[0]?.name ?? 'Belajar')
      setTitle(extra ? `Latihan tambahan · ${name}` : name)
      const newToday = await newStudiedToday(now)
      const learning: Card[] = []
      const reviews: Card[] = []
      const freshPerDeck: Card[][] = []
      const all: Card[] = []
      for (const d of decks) {
        const cards = await db.cards.where('deckId').equals(d.id).toArray()
        all.push(...cards)
        const q = buildDeckQueue(cards, now, settings.newPerDay - (newToday.get(d.id) ?? 0))
        learning.push(...q.learning)
        reviews.push(...q.review)
        freshPerDeck.push(q.fresh)
      }
      if (cancelled) return
      setParams(p)
      setCanExtra(buildExtraQueue(all, now, 1, p.w).length > 0)
      if (extra) {
        setSession(nextSession(buildExtraQueue(all, now, 20, p.w), []))
      } else {
        reviews.sort((a, b) => a.due - b.due)
        // kartu baru dari beberapa deck diselang-seling (interleaving) agar tidak monoton
        setSession(nextSession(interleave(reviews, roundRobin(freshPerDeck)), learning))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [deckId, extra])

  const current = session?.current ?? null

  useEffect(() => {
    shownAt.current = Date.now()
  }, [current?.id, current?.reps])

  const previews = useMemo(() => {
    if (!current || !params) return null
    const at = Date.now()
    return { at, all: scheduleAll(pickSchedule(current), at, params, current.id) }
  }, [current, params])

  // Ringkasan akhir sesi (kartu besok & streak) + perayaan.
  useEffect(() => {
    if (!session || session.current || stats.reviewed === 0 || celebrated.current) return
    celebrated.current = true
    confetti()
    haptic([15, 60, 25])
    ;(async () => {
      const tomorrowEnd = endOfDay(Date.now() + DAY_MS)
      const ids = deckId === 'semua' ? null : new Set([deckId])
      const [tomorrow, reviewDays, quizDays] = await Promise.all([
        db.cards
          .where('due')
          .belowOrEqual(tomorrowEnd)
          .filter((c) => c.state !== 'new' && (!ids || ids.has(c.deckId)))
          .count(),
        db.reviewLogs.orderBy('day').uniqueKeys(),
        db.quizResults.orderBy('day').uniqueKeys(),
      ])
      setSummary({ tomorrow, streak: computeStreak([...reviewDays, ...quizDays].map(String), dayKey()).current })
    })()
  }, [session, stats.reviewed, deckId])

  const reveal = useCallback(() => {
    if (!current || revealed) return
    setRevealed(true)
    haptic(6)
  }, [current, revealed])

  const answer = useCallback(
    async (rating: Rating) => {
      if (!session?.current || busy) return
      setBusy(true)
      try {
        const thinking = Date.now() - shownAt.current
        const { card: updated, undo } = await answerCard(session.current.id, rating, Date.now(), undefined, thinking)
        haptic(rating === Rating.Lupa ? [25, 40, 25] : 10)
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
      celebrated.current = false
      setSummary(null)
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
        reveal()
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
  }, [current, revealed, answer, undoLast, reveal])

  if (!session) {
    return <div className="mt-16 h-[60dvh] animate-pulse rounded-3xl bg-slate-200/70 dark:bg-slate-800/60" />
  }

  const remaining = {
    fresh: session.main.filter((c) => c.state === 'new').length + (current?.state === 'new' ? 1 : 0),
    learning: session.learning.length + (current && (current.state === 'learning' || current.state === 'relearning') ? 1 : 0),
    review: session.main.filter((c) => c.state === 'review').length + (current?.state === 'review' ? 1 : 0),
  }
  const left = remaining.fresh + remaining.learning + remaining.review
  const progress = stats.reviewed + left === 0 ? 1 : stats.reviewed / (stats.reviewed + left)

  const topBar = (
    <div className="mb-3 flex items-center gap-2">
      <IconButton label="Akhiri sesi" onClick={() => goBack(backTo)} className="-ml-2">
        <IconX />
      </IconButton>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold">{title}</p>
          {left > 0 && <p className="shrink-0 text-xs text-slate-500 tabular-nums dark:text-slate-400">{left} lagi</p>}
        </div>
        <ProgressBar value={progress} className="mt-1.5" color="bg-gradient-to-r from-indigo-500 to-violet-500" />
      </div>
      <IconButton label="Batalkan jawaban terakhir (U)" onClick={undoLast} disabled={history.length === 0 || busy}>
        <IconUndo />
      </IconButton>
    </div>
  )

  if (!current) {
    const elapsed = (Date.now() - startedAt.current) / 1000
    const pct = stats.reviewed ? Math.round(((stats.reviewed - stats.again) / stats.reviewed) * 100) : 0
    return (
      <div>
        {topBar}
        <div className="mt-6 animate-pop rounded-3xl bg-white p-6 text-center ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
          {stats.reviewed === 0 ? (
            <div className="py-6">
              <div className="text-5xl">✅</div>
              <h1 className="mt-3 text-xl font-bold">{extra ? 'Belum ada kartu untuk latihan tambahan' : 'Tidak ada kartu untuk sekarang'}</h1>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
                {extra
                  ? 'Latihan tambahan memakai kartu yang sudah pernah kamu pelajari. Belajar dulu beberapa kartu, ya.'
                  : 'Semua kartu hari ini sudah beres. Algoritma akan memanggil kartu berikutnya tepat sebelum kamu lupa.'}
              </p>
            </div>
          ) : (
            <div className="py-4">
              <div className="text-6xl">🎉</div>
              <h1 className="mt-3 text-2xl font-bold">Sesi selesai!</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {pct >= 85 ? 'Luar biasa, ingatanmu kuat sekali.' : pct >= 65 ? 'Kerja bagus, ingatanmu makin kuat.' : 'Kartu yang lupa akan diulang lebih sering — itu tandanya algoritma bekerja.'}
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2">
                {[
                  { v: String(stats.reviewed), l: 'kartu' },
                  { v: `${pct}%`, l: 'diingat' },
                  { v: formatClock(elapsed), l: 'durasi' },
                ].map((x) => (
                  <div key={x.l} className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
                    <div className="text-2xl font-bold">{x.v}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{x.l}</div>
                  </div>
                ))}
              </div>
              {summary && (
                <div className="mt-3 flex items-center justify-center gap-4 text-sm text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <IconFlame size={16} className="text-amber-500" /> Streak {summary.streak} hari
                  </span>
                  <span>Besok: {summary.tomorrow} kartu</span>
                </div>
              )}
            </div>
          )}
          <div className="mt-5 flex flex-col gap-2">
            {!extra && canExtra && (
              <Button variant="secondary" block onClick={() => navigate(`/belajar/${deckId}?mode=ekstra`, { replace: true })}>
                <IconTarget size={18} /> Latihan tambahan (kartu paling rawan lupa)
              </Button>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" block onClick={() => navigate(backTo, { replace: true })}>
                Selesai
              </Button>
              {deckId !== 'semua' && (
                <Button block onClick={() => navigate(`/kuis/${deckId}`, { replace: true })}>
                  Latihan kuis
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const chip = STATE_CHIP[current.state]
  const leech = isLeech(current)
  const faceBase =
    'col-start-1 row-start-1 flex flex-col overflow-y-auto rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200/80 [backface-visibility:hidden] dark:bg-slate-900 dark:ring-slate-800'

  return (
    <div className="flex min-h-[calc(100dvh-1.5rem)] flex-col">
      {topBar}
      <div className="mb-3 flex items-center justify-center gap-4 text-xs font-semibold tabular-nums">
        <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
          <span className="h-2 w-2 rounded-full bg-sky-500" /> {remaining.fresh} baru
        </span>
        <span className="inline-flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
          <span className="h-2 w-2 rounded-full bg-orange-500" /> {remaining.learning} belajar
        </span>
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> {remaining.review} ulang
        </span>
      </div>

      <div className="relative flex min-h-[22rem] flex-1 flex-col [perspective:1600px]" key={`${current.id}-${current.reps}`}>
        <div
          onClick={reveal}
          className={cx(
            'grid flex-1 grid-rows-1 transition-transform duration-500 ease-out [transform-style:preserve-3d] motion-reduce:transition-none',
            revealed && '[transform:rotateY(180deg)]',
            !revealed && 'cursor-pointer',
          )}
        >
          {/* Sisi depan */}
          <div className={cx(faceBase, 'animate-pop')} aria-hidden={revealed}>
            <div className="flex items-center justify-between gap-2">
              <span className={cx('rounded-full px-2.5 py-1 text-[11px] font-semibold', chip.cls)}>{chip.label}</span>
              {current.lapses > 0 && <span className="text-[11px] text-slate-400">lupa {current.lapses}×</span>}
            </div>
            <div className="flex flex-1 flex-col justify-center py-6">
              <CardFace text={current.front} image={current.frontImage} className="text-xl leading-relaxed font-medium sm:text-2xl" />
            </div>
            <p className="text-xs text-slate-400">Jawab dalam hati dulu, lalu ketuk kartu</p>
          </div>

          {/* Sisi belakang */}
          <div className={cx(faceBase, '[transform:rotateY(180deg)]')} aria-hidden={!revealed}>
            <div className="border-b border-dashed border-slate-200 pb-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <RichText text={current.front || '(gambar)'} className="line-clamp-3" />
            </div>
            <div className="flex flex-1 flex-col justify-center py-5">
              <CardFace text={current.back} image={current.backImage} className="text-lg leading-relaxed text-slate-800 dark:text-slate-100" />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
              {leech ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Sering lupa — coba pecah kartunya
                </span>
              ) : (
                <span>Seberapa baik kamu ingat?</span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/kartu/${current.id}`)
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <IconEdit size={14} /> Ubah
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pb-safe sticky bottom-0 mt-3 bg-slate-50 pt-1 dark:bg-slate-950">
        {!revealed ? (
          <button
            type="button"
            onClick={reveal}
            className="flex h-16 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            Tampilkan jawaban
          </button>
        ) : (
          <div className="grid animate-slide-up grid-cols-4 gap-2">
            {BUTTONS.map((b) => {
              const next = previews?.all[b.rating]
              return (
                <button
                  key={b.rating}
                  type="button"
                  disabled={busy}
                  onClick={() => answer(b.rating)}
                  className={cx(
                    'flex h-16 flex-col items-center justify-center rounded-2xl bg-gradient-to-b text-white shadow-lg transition select-none active:scale-95 disabled:opacity-60',
                    b.cls,
                  )}
                  title={`${b.label} — ${b.hint} (${b.key})`}
                >
                  <span className="text-sm font-bold">{b.label}</span>
                  <span className="text-xs text-white/85 tabular-nums">{next && previews ? formatInterval(next.due - previews.at) : ''}</span>
                </button>
              )
            })}
          </div>
        )}
        <p className="mt-2 hidden text-center text-xs text-slate-400 sm:block">Pintasan: Spasi = tampilkan · 1–4 = nilai · U = batalkan</p>
      </div>
    </div>
  )
}
