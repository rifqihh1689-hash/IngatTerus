import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useStreak } from '../hooks/useData'
import { PageHeader, Panel, Segmented, EmptyState } from '../components/ui'
import { ColumnChart, DataTable, SegmentedBar } from '../components/Charts'
import { IconChart, IconFlame } from '../components/icons'
import { averageRetrievability, cardMaturity, dailyCounts, dueForecast, formatPercent, retentionRate } from '../lib/stats'
import { DAY_MS, dayKey, formatDateTime, formatDayShort, shiftDayKey, startOfDay, weekdayShort } from '../lib/date'

type Range = 7 | 30 | 90

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3.5 ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  )
}

export function StatsPage() {
  const [range, setRange] = useState<Range>(30)
  const streak = useStreak()
  const today = dayKey()
  const data = useLiveQuery(async () => {
    const since = startOfDay(Date.now()) - 89 * DAY_MS
    const [cards, logs, quizzes, decks] = await Promise.all([
      db.cards.toArray(),
      db.reviewLogs.where('reviewedAt').aboveOrEqual(since).toArray(),
      db.quizResults.where('takenAt').aboveOrEqual(since).reverse().sortBy('takenAt'),
      db.decks.orderBy('createdAt').toArray(),
    ])
    return { cards, logs, quizzes, decks }
  }, [])

  const view = useMemo(() => {
    if (!data) return null
    const now = Date.now()
    const fromDay = shiftDayKey(today, -(range - 1))
    const logs = data.logs.filter((l) => l.day >= fromDay)
    const quizzes = data.quizzes.filter((q) => q.day >= fromDay)
    const maturity = cardMaturity(data.cards)
    const forecast = dueForecast(data.cards, 14, now)
    const daily = dailyCounts(logs, range, today)
    const perDeck = data.decks.map((d) => {
      const cards = data.cards.filter((c) => c.deckId === d.id)
      const deckLogs = logs.filter((l) => l.deckId === d.id)
      return {
        deck: d,
        total: cards.length,
        mature: cardMaturity(cards).matang,
        retention: retentionRate(deckLogs),
        reviews: deckLogs.length,
      }
    })
    return {
      maturity,
      forecast,
      daily,
      perDeck,
      quizzes,
      retention: retentionRate(logs),
      avgR: averageRetrievability(data.cards, now),
      reviews: logs.length,
      activeDays: new Set([...logs.map((l) => l.day), ...quizzes.map((q) => q.day)]).size,
      quizAvg: quizzes.length ? quizzes.reduce((s, q) => s + (q.total ? q.correct / q.total : 0), 0) / quizzes.length : null,
      dueToday: forecast[0]?.count ?? 0,
    }
  }, [data, range, today])

  if (!view || !data) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />

  if (data.cards.length === 0) {
    return (
      <div>
        <PageHeader title="Statistik" />
        <Panel>
          <EmptyState icon={<IconChart />} title="Belum ada data">
            Mulai belajar untuk melihat streak, grafik progres, dan tingkat ingatanmu.
          </EmptyState>
        </Panel>
      </div>
    )
  }

  const m = view.maturity
  const tick = (key: string) => (range === 7 ? weekdayShort(key) : formatDayShort(key))

  return (
    <div className="space-y-4">
      <PageHeader title="Statistik" subtitle="Kemajuan belajarmu" />

      <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white">
        <IconFlame size={40} className="shrink-0" />
        <div className="flex-1">
          <div className="text-4xl leading-none font-bold">{streak?.current ?? 0} hari</div>
          <div className="mt-1 text-sm text-white/90">
            {streak?.studiedToday ? 'Streak terjaga hari ini ✓' : (streak?.current ?? 0) > 0 ? 'Belajar hari ini untuk menjaga streak' : 'Mulai streak baru hari ini'}
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-white/80">Terpanjang</div>
          <div className="text-xl font-semibold">{streak?.longest ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Jatuh tempo hari ini" value={String(view.dueToday)} sub={`${m.baru} kartu baru belum dipelajari`} />
        <Tile label="Peluang ingat saat ini" value={formatPercent(view.avgR)} sub="rata-rata kartu yang sudah dipelajari" />
      </div>

      <Panel>
        <h2 className="font-semibold">Kematangan kartu</h2>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          {data.cards.length} kartu · matang = interval ≥ 21 hari
        </p>
        <SegmentedBar
          label="Kematangan kartu"
          segments={[
            { label: 'Baru', value: m.baru, color: 'var(--viz-1)', ink: '#ffffff' },
            { label: 'Belajar', value: m.belajar, color: 'var(--viz-2)', ink: '#ffffff' },
            { label: 'Muda', value: m.muda, color: 'var(--viz-3)', ink: '#ffffff' },
            { label: 'Matang', value: m.matang, color: 'var(--viz-4)', ink: '#0b0b0b' },
          ]}
        />
        <DataTable
          head={['Kelompok', 'Kartu']}
          rows={[
            ['Baru', m.baru],
            ['Belajar', m.belajar],
            ['Muda (< 21 hari)', m.muda],
            ['Matang (≥ 21 hari)', m.matang],
          ]}
        />
      </Panel>

      <Panel>
        <h2 className="font-semibold">Perkiraan jatuh tempo</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Kartu yang perlu diulang 14 hari ke depan</p>
        <ColumnChart
          label="Perkiraan kartu jatuh tempo 14 hari ke depan"
          unit="kartu"
          data={view.forecast.map((f, i) => ({
            key: f.day,
            tick: i === 0 ? 'Hari ini' : formatDayShort(f.day),
            value: f.count,
            title: i === 0 ? 'Hari ini (termasuk terlambat)' : `${weekdayShort(f.day)}, ${formatDayShort(f.day)}`,
          }))}
        />
        <DataTable head={['Tanggal', 'Kartu']} rows={view.forecast.map((f) => [formatDayShort(f.day), f.count])} />
      </Panel>

      <div className="flex items-center justify-between gap-3 pt-2">
        <h2 className="text-base font-bold">Riwayat</h2>
        <div className="w-56">
          <Segmented
            label="Rentang waktu"
            value={range}
            onChange={setRange}
            options={[
              { value: 7, label: '7 hari' },
              { value: 30, label: '30 hari' },
              { value: 90, label: '90 hari' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Tingkat ingatan" value={formatPercent(view.retention)} sub="kartu review yang diingat" />
        <Tile label="Total ulasan" value={view.reviews.toLocaleString('id-ID')} sub={`${view.activeDays} dari ${range} hari aktif`} />
      </div>

      <Panel>
        <h2 className="font-semibold">Ulasan per hari</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Jumlah kartu yang dijawab setiap hari</p>
        <ColumnChart
          label={`Jumlah ulasan per hari, ${range} hari terakhir`}
          unit="ulasan"
          data={view.daily.map((d) => ({
            key: d.day,
            tick: tick(d.day),
            value: d.total,
            title: `${weekdayShort(d.day)}, ${formatDayShort(d.day)}`,
            details: d.total ? [`${d.correct} diingat · ${d.lapses} lupa`] : undefined,
          }))}
        />
        <DataTable
          head={['Tanggal', 'Ulasan', 'Diingat', 'Lupa']}
          rows={[...view.daily].reverse().map((d) => [formatDayShort(d.day), d.total, d.correct, d.lapses])}
        />
      </Panel>

      <Panel>
        <h2 className="mb-2 font-semibold">Per deck</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-1.5 text-left font-medium">Deck</th>
                <th className="py-1.5 text-right font-medium">Kartu</th>
                <th className="py-1.5 text-right font-medium">Matang</th>
                <th className="py-1.5 text-right font-medium">Ingatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {view.perDeck.map((r) => (
                <tr key={r.deck.id}>
                  <td className="max-w-40 truncate py-2 pr-2">{r.deck.name}</td>
                  <td className="py-2 text-right tabular-nums">{r.total}</td>
                  <td className="py-2 text-right tabular-nums">{r.mature}</td>
                  <td className="py-2 text-right tabular-nums">{formatPercent(r.retention)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <h2 className="font-semibold">Kuis & ujian</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          {view.quizzes.length ? `${view.quizzes.length} kali · rata-rata nilai ${formatPercent(view.quizAvg)}` : 'Belum ada kuis atau ujian di rentang ini'}
        </p>
        {view.quizzes.length > 0 && (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {view.quizzes.slice(0, 10).map((q) => {
              const deck = data.decks.find((d) => d.id === q.deckId)
              const pct = q.total ? Math.round((q.correct / q.total) * 100) : 0
              return (
                <li key={q.id} className="flex items-center gap-3 py-2">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 uppercase dark:bg-slate-800 dark:text-slate-300">{q.mode}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{deck?.name ?? 'Deck terhapus'}</span>
                    <span className="block text-xs text-slate-500">{formatDateTime(q.takenAt)}</span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="font-semibold">{pct}</span>
                    <span className="block text-xs text-slate-500">
                      {q.correct}/{q.total}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
