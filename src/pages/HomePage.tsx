import { useState } from 'react'
import { Link, navigate } from '../router'
import { useDeckSummaries, useLoadedSettings, useStreak, useTodayStats } from '../hooks/useData'
import { DeckFormModal, colorOf } from '../components/DeckForm'
import { ProgressRing } from '../components/ProgressRing'
import { Onboarding } from '../components/Onboarding'
import { Button, EmptyState, Panel, cx } from '../components/ui'
import { IconBell, IconFlame, IconLayers, IconPlay, IconPlus, IconTarget, IconUpload } from '../components/icons'
import { parseTime } from '../lib/reminder'
import { weekdayShort } from '../lib/date'
import type { DeckCounts } from '../lib/queue'

function greeting(h: number) {
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 18) return 'Selamat sore'
  return 'Selamat malam'
}

function minutesLabel(cards: number, secPerCard: number) {
  const min = Math.max(1, Math.round((cards * secPerCard) / 60))
  return `± ${min} menit`
}

export function CountChips({ counts, compact }: { counts: DeckCounts; compact?: boolean }) {
  const items = [
    { n: counts.fresh, label: 'baru', dot: 'bg-sky-500', cls: 'text-sky-700 dark:text-sky-300' },
    { n: counts.learning, label: 'belajar', dot: 'bg-orange-500', cls: 'text-orange-700 dark:text-orange-300' },
    { n: counts.review, label: 'ulang', dot: 'bg-emerald-500', cls: 'text-emerald-700 dark:text-emerald-300' },
  ]
  return (
    <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums', compact ? 'text-xs' : 'text-sm')}>
      {items.map((i) => (
        <span key={i.label} className={cx('inline-flex items-center gap-1 font-semibold', i.n === 0 ? 'text-slate-400 dark:text-slate-600' : i.cls)}>
          <span className={cx('h-1.5 w-1.5 rounded-full', i.n === 0 ? 'bg-slate-300 dark:bg-slate-700' : i.dot)} />
          {i.n} <span className="font-normal">{i.label}</span>
        </span>
      ))}
    </div>
  )
}

export function HomePage() {
  const summaries = useDeckSummaries()
  const streak = useStreak()
  const today = useTodayStats()
  const settings = useLoadedSettings()
  const [showForm, setShowForm] = useState(false)

  const totals = (summaries ?? []).reduce(
    (acc, s) => ({
      due: acc.due + s.counts.learning + s.counts.review,
      fresh: acc.fresh + s.counts.fresh,
      cards: acc.cards + s.counts.total,
      studied: acc.studied + s.maturity.muda + s.maturity.matang + s.maturity.belajar,
    }),
    { due: 0, fresh: 0, cards: 0, studied: 0 },
  )
  const toStudy = totals.due + totals.fresh
  const reviewed = today?.reviewed ?? 0
  const goal = reviewed + toStudy
  const now = new Date()
  const reminderMinutes = settings ? parseTime(settings.reminderTime) : null
  const pastReminder = reminderMinutes != null && now.getHours() * 60 + now.getMinutes() >= reminderMinutes
  const nudge = streak && !streak.studiedToday && toStudy > 0 && (pastReminder || streak.current > 0)

  return (
    <div className="space-y-5">
      {/* Kartu utama hari ini */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-xl shadow-indigo-600/20 dark:from-indigo-700 dark:via-violet-700 dark:to-fuchsia-800">
        <div className="pointer-events-none absolute -top-16 -right-12 h-48 w-48 rounded-full bg-white/10 blur-sm" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-fuchsia-300/20 blur-md" />
        <div className="relative">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-indigo-100">{greeting(now.getHours())} 👋</p>
              <h1 className="mt-0.5 text-2xl leading-tight font-bold tracking-tight">
                {summaries === undefined
                  ? 'Memuat…'
                  : toStudy > 0
                    ? `${toStudy} kartu menunggu`
                    : totals.cards > 0
                      ? 'Semua beres hari ini!'
                      : 'Ayo mulai belajar'}
              </h1>
              <p className="mt-1 text-sm text-indigo-100">
                {toStudy > 0
                  ? `${minutesLabel(toStudy, today?.secPerCard ?? 8)} · ${totals.due} ulang · ${totals.fresh} baru`
                  : totals.cards > 0
                    ? `${reviewed} kartu diulang hari ini. Sampai besok! 🌙`
                    : 'Tambahkan materi pertamamu.'}
              </p>
            </div>
            <ProgressRing value={goal === 0 ? (totals.cards > 0 ? 1 : 0) : reviewed / goal} size={88} stroke={8} label={`Kemajuan hari ini ${reviewed} dari ${goal} kartu`}>
              <span className="text-xl leading-none font-bold">{reviewed}</span>
              <span className="text-[10px] text-indigo-100">/ {goal} hari ini</span>
            </ProgressRing>
          </div>

          {/* Strip minggu ini */}
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
            <Link to="/statistik" className="flex items-center gap-1.5 text-sm font-semibold" aria-label={`Streak ${streak?.current ?? 0} hari`}>
              <IconFlame size={18} className={streak?.studiedToday ? 'text-amber-300' : 'text-white/60'} />
              {streak?.current ?? 0} hari
            </Link>
            <ol className="flex gap-1.5" aria-label="Aktivitas 7 hari terakhir">
              {(today?.week ?? []).map((d, i) => (
                <li key={d.day} className="flex flex-col items-center gap-1">
                  <span
                    className={cx(
                      'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold',
                      d.studied ? 'bg-amber-300 text-amber-900' : 'bg-white/15 text-white/70',
                      i === 6 && 'ring-2 ring-white/80',
                    )}
                    title={d.studied ? 'Belajar' : 'Belum belajar'}
                  >
                    {d.studied ? '✓' : ''}
                  </span>
                  <span className="text-[9px] text-indigo-100">{weekdayShort(d.day)}</span>
                </li>
              ))}
            </ol>
          </div>

          {toStudy > 0 && (
            <button
              type="button"
              className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-white text-base font-bold text-indigo-700 shadow-lg shadow-indigo-900/20 transition hover:bg-indigo-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={() => navigate('/belajar/semua')}
            >
              <IconPlay size={18} /> Belajar sekarang
            </button>
          )}
        </div>
      </section>

      {nudge && (
        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
          <IconBell size={18} className="shrink-0" />
          <span>
            {streak && streak.current > 0
              ? `Belum belajar hari ini — jaga streak ${streak.current} hari-mu!`
              : 'Kamu belum belajar hari ini. Beberapa menit saja sudah cukup.'}
          </span>
        </div>
      )}

      {/* Aksi cepat */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/impor?tab=ai"
          className="group flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200/80 transition hover:ring-indigo-300 dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-indigo-700"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-lg text-white">✨</span>
          <span className="min-w-0 text-sm leading-tight">
            <span className="block font-semibold">Tambah materi</span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">dibantu AI</span>
          </span>
        </Link>
        <button
          type="button"
          disabled={totals.studied === 0}
          onClick={() => navigate('/belajar/semua?mode=ekstra')}
          className="flex items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-slate-200/80 transition hover:ring-indigo-300 disabled:opacity-50 dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-indigo-700"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
            <IconTarget size={20} />
          </span>
          <span className="min-w-0 text-sm leading-tight">
            <span className="block font-semibold">Latihan ekstra</span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">kartu rawan lupa</span>
          </span>
        </button>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">Deck saya</h2>
          <Button size="sm" variant="secondary" onClick={() => setShowForm(true)}>
            <IconPlus size={16} /> Deck baru
          </Button>
        </div>

        {summaries === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
            ))}
          </div>
        ) : summaries.length === 0 ? (
          <Panel>
            <EmptyState icon={<IconLayers />} title="Belum ada deck">
              Buat deck pertama, atau ubah catatanmu menjadi kartu dengan bantuan AI.
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={() => navigate('/impor?tab=ai')}>
                  <IconUpload size={16} /> Tambah materi
                </Button>
                <Button variant="secondary" onClick={() => setShowForm(true)}>
                  <IconPlus size={16} /> Deck kosong
                </Button>
              </div>
            </EmptyState>
          </Panel>
        ) : (
          <ul className="space-y-2.5">
            {summaries.map(({ deck, counts, mastery, leeches }) => {
              const c = colorOf(deck.color)
              const pending = counts.fresh + counts.learning + counts.review
              return (
                <li key={deck.id}>
                  <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80 transition hover:ring-slate-300 dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-slate-700">
                    <div className="flex items-center gap-3 p-3">
                      <Link to={`/deck/${deck.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white shadow-sm', c.bar)}>
                          {deck.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{deck.name}</span>
                          <span className="mt-0.5 block">
                            <CountChips counts={counts} compact />
                          </span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        disabled={pending === 0}
                        onClick={() => navigate(`/belajar/${deck.id}`)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-500 active:scale-95 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                        aria-label={`Belajar ${deck.name}`}
                        title={pending === 0 ? 'Tidak ada kartu untuk hari ini' : 'Belajar'}
                      >
                        <IconPlay size={18} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={cx('h-full rounded-full bg-gradient-to-r', c.bar)} style={{ width: `${Math.round(mastery * 100)}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        {Math.round(mastery * 100)}% dikuasai · {counts.total} kartu
                      </span>
                      {leeches > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {leeches} sering lupa
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <DeckFormModal open={showForm} onClose={() => setShowForm(false)} onSaved={(id) => navigate(`/deck/${id}`)} />
      <Onboarding open={settings != null && !settings.onboarded} />
    </div>
  )
}
