import { useState } from 'react'
import { Link, navigate } from '../router'
import { useDeckSummaries, useSettings, useStreak } from '../hooks/useData'
import { DeckFormModal, colorOf } from '../components/DeckForm'
import { Button, EmptyState, Panel, cx } from '../components/ui'
import { IconBell, IconChevronRight, IconFlame, IconLayers, IconPlay, IconPlus, IconUpload } from '../components/icons'
import { parseTime } from '../lib/reminder'
import type { DeckCounts } from '../lib/queue'

function greeting(h: number) {
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 18) return 'Selamat sore'
  return 'Selamat malam'
}

export function CountChips({ counts, compact }: { counts: DeckCounts; compact?: boolean }) {
  const items = [
    { n: counts.fresh, label: 'baru', cls: 'text-sky-600 dark:text-sky-400' },
    { n: counts.learning, label: 'belajar', cls: 'text-orange-600 dark:text-orange-400' },
    { n: counts.review, label: 'ulang', cls: 'text-emerald-600 dark:text-emerald-400' },
  ]
  return (
    <div className={cx('flex items-center gap-3 tabular-nums', compact ? 'text-xs' : 'text-sm')}>
      {items.map((i) => (
        <span key={i.label} className={cx('font-semibold', i.n === 0 ? 'text-slate-400 dark:text-slate-600' : i.cls)}>
          {i.n} <span className="font-normal">{i.label}</span>
        </span>
      ))}
    </div>
  )
}

export function HomePage() {
  const summaries = useDeckSummaries()
  const streak = useStreak()
  const settings = useSettings()
  const [showForm, setShowForm] = useState(false)

  const totals = (summaries ?? []).reduce(
    (acc, s) => ({
      due: acc.due + s.counts.learning + s.counts.review,
      fresh: acc.fresh + s.counts.fresh,
      cards: acc.cards + s.counts.total,
    }),
    { due: 0, fresh: 0, cards: 0 },
  )
  const toStudy = totals.due + totals.fresh
  const now = new Date()
  const reminderMinutes = parseTime(settings.reminderTime)
  const pastReminder = reminderMinutes != null && now.getHours() * 60 + now.getMinutes() >= reminderMinutes
  const nudge = streak && !streak.studiedToday && toStudy > 0 && (pastReminder || streak.current > 0)

  return (
    <div className="space-y-5">
      <Panel className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-600 text-white ring-0 dark:from-indigo-700 dark:to-violet-800 dark:ring-0">
        <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-indigo-100">{greeting(now.getHours())} 👋</p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight">
                {summaries === undefined
                  ? 'Memuat…'
                  : toStudy > 0
                    ? `${toStudy} kartu menunggu`
                    : totals.cards > 0
                      ? 'Semua beres hari ini! 🎉'
                      : 'Ayo mulai belajar'}
              </h1>
              {toStudy > 0 && (
                <p className="mt-1 text-sm text-indigo-100">
                  {totals.due} untuk diulang · {totals.fresh} kartu baru
                </p>
              )}
            </div>
            <Link
              to="/statistik"
              className="flex shrink-0 flex-col items-center rounded-2xl bg-white/15 px-3 py-2 backdrop-blur hover:bg-white/20"
              aria-label={`Streak ${streak?.current ?? 0} hari`}
            >
              <IconFlame size={22} className={cx(streak?.studiedToday ? 'text-amber-300' : 'text-white/60')} />
              <span className="text-lg leading-tight font-bold tabular-nums">{streak?.current ?? 0}</span>
              <span className="text-[10px] text-indigo-100">hari</span>
            </Link>
          </div>
          {toStudy > 0 && (
            <button
              type="button"
              className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-white text-base font-semibold text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={() => navigate('/belajar/semua')}
            >
              <IconPlay size={18} /> Belajar sekarang
            </button>
          )}
        </div>
      </Panel>

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
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
            ))}
          </div>
        ) : summaries.length === 0 ? (
          <Panel>
            <EmptyState icon={<IconLayers />} title="Belum ada deck">
              Buat deck pertama, impor kartu dari CSV, atau tambahkan deck contoh di Pengaturan.
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={() => setShowForm(true)}>
                  <IconPlus size={16} /> Buat deck
                </Button>
                <Button variant="secondary" onClick={() => navigate('/impor')}>
                  <IconUpload size={16} /> Impor
                </Button>
              </div>
            </EmptyState>
          </Panel>
        ) : (
          <ul className="space-y-2">
            {summaries.map(({ deck, counts }) => {
              const c = colorOf(deck.color)
              const pending = counts.fresh + counts.learning + counts.review
              return (
                <li key={deck.id}>
                  <div className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200/80 transition hover:ring-slate-300 dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-slate-700">
                    <Link to={`/deck/${deck.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold', c.soft, c.text)}>
                        {deck.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{deck.name}</span>
                        <span className="mt-0.5 block">
                          <CountChips counts={counts} compact />
                        </span>
                      </span>
                      <IconChevronRight size={18} className="shrink-0 text-slate-400" />
                    </Link>
                    <button
                      type="button"
                      disabled={pending === 0}
                      onClick={() => navigate(`/belajar/${deck.id}`)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                      aria-label={`Belajar ${deck.name}`}
                      title={pending === 0 ? 'Tidak ada kartu untuk hari ini' : 'Belajar'}
                    >
                      <IconPlay size={18} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <DeckFormModal open={showForm} onClose={() => setShowForm(false)} onSaved={(id) => navigate(`/deck/${id}`)} />
    </div>
  )
}
