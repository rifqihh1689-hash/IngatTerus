/**
 * Grafik SVG ringan tanpa pustaka: kolom satu seri dengan tooltip per batang,
 * dan batang tersegmentasi (satu keseluruhan dibagi beberapa bagian).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from './ui'

function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth || fallback)
    const ro = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width) || fallback))
    ro.observe(el)
    return () => ro.disconnect()
  }, [fallback])
  return [ref, width] as const
}

/** Batas atas sumbu-y yang "bulat" (1, 2, 5 × 10ⁿ) beserta 3 tick. */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1, 2]
  const raw = max / 2
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const s = Math.max(1, Math.ceil(step))
  return [0, s, s * 2]
}

const fmtNum = (n: number) => n.toLocaleString('id-ID')

export interface ColumnDatum {
  key: string
  /** Label sumbu-x singkat. */
  tick: string
  value: number
  /** Judul tooltip (mis. tanggal lengkap). */
  title: string
  /** Baris tambahan tooltip. */
  details?: string[]
}

/** Path kolom: ujung data membulat 4px, persegi di garis dasar. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export function ColumnChart({
  data,
  label,
  unit,
  height = 168,
  color = 'var(--viz-1)',
}: {
  data: ColumnDatum[]
  label: string
  unit: string
  height?: number
  color?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const pad = { top: 10, right: 4, bottom: 22, left: 30 }
  const plotW = Math.max(40, width - pad.left - pad.right)
  const plotH = height - pad.top - pad.bottom
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.value)))
  const yMax = ticks[ticks.length - 1]
  const band = plotW / Math.max(1, data.length)
  const barW = Math.max(2, Math.min(24, band - 2, band * 0.72))
  const every = Math.max(1, Math.ceil((data.length * 38) / plotW))
  const y = (v: number) => pad.top + plotH - (v / yMax) * plotH
  const act = active != null ? data[active] : null
  const actX = active != null ? pad.left + band * active + band / 2 : 0

  return (
    <div ref={ref} className="relative select-none" onPointerLeave={() => setActive(null)}>
      <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const h = (d.value / yMax) * plotH
          const x = pad.left + band * i + (band - barW) / 2
          return (
            <g key={d.key}>
              {d.value > 0 && (
                <path d={columnPath(x, y(d.value), barW, h)} fill={color} opacity={active == null || active === i ? 1 : 0.55} className="transition-opacity" />
              )}
              {i % every === 0 && (
                <text x={pad.left + band * i + band / 2} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--viz-muted)">
                  {d.tick}
                </text>
              )}
              <rect
                x={pad.left + band * i}
                y={pad.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${d.title}: ${fmtNum(d.value)} ${unit}${d.details ? `, ${d.details.join(', ')}` : ''}`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="cursor-default outline-none"
              />
            </g>
          )
        })}
      </svg>
      {act && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-28 -translate-x-1/2 rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
          style={{ left: Math.min(Math.max(actX, 60), width - 60) }}
        >
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {fmtNum(act.value)} {unit}
            </span>
          </div>
          <div className="text-slate-500 dark:text-slate-400">{act.title}</div>
          {act.details?.map((line) => (
            <div key={line} className="text-slate-500 dark:text-slate-400">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export interface Segment {
  label: string
  value: number
  color: string
  /** Warna teks di dalam blok (putih atau hampir hitam sesuai luminans). */
  ink: string
}

/** Batang tersegmentasi tinggi (28px): bagian proporsional, persentase di dalam blok bila muat. */
export function SegmentedBar({ segments, label }: { segments: Segment[]; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const total = segments.reduce((s, x) => s + x.value, 0)
  const [active, setActive] = useState<number | null>(null)
  const visible = segments.map((s, i) => ({ ...s, i })).filter((s) => s.value > 0)
  const gap = 2
  const usable = Math.max(0, width - gap * Math.max(0, visible.length - 1))
  const act = active != null ? segments[active] : null
  const share = (v: number) => (total === 0 ? 0 : Math.round((v / total) * 100))

  return (
    <div className="space-y-3">
      <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
        {total === 0 ? (
          <div className="h-7 rounded bg-slate-100 dark:bg-slate-800" />
        ) : (
          <div className="flex h-7" style={{ gap }} role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
            {visible.map((s) => {
              const w = (s.value / total) * usable
              const text = `${share(s.value)}%`
              const fits = w >= text.length * 7 + 12
              return (
                <div
                  key={s.label}
                  tabIndex={0}
                  aria-label={`${s.label}: ${s.value} kartu (${share(s.value)}%)`}
                  onPointerEnter={() => setActive(s.i)}
                  onPointerDown={() => setActive(s.i)}
                  onFocus={() => setActive(s.i)}
                  onBlur={() => setActive(null)}
                  className={cx('flex h-full items-center rounded px-1.5 text-xs font-semibold outline-none transition-opacity', active != null && active !== s.i && 'opacity-60')}
                  style={{ width: w, background: s.color, color: s.ink }}
                >
                  {fits ? text : null}
                </div>
              )
            })}
          </div>
        )}
        {act && (
          <div className="pointer-events-none absolute top-9 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-white px-3 py-2 text-xs whitespace-nowrap shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            <span className="text-sm font-bold text-slate-900 dark:text-white">{act.value} kartu</span>
            <span className="ml-1.5 text-slate-500 dark:text-slate-400">
              {act.label} · {share(act.value)}%
            </span>
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Tampilan tabel untuk aksesibilitas (data yang sama dengan grafik). */
export function DataTable({ head, rows, summary = 'Lihat tabel' }: { head: string[]; rows: ReactNode[][]; summary?: string }) {
  return (
    <details className="group mt-2 text-xs">
      <summary className="cursor-pointer text-slate-500 select-none hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">{summary}</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
            <tr>
              {head.map((h, i) => (
                <th key={h} className={cx('px-3 py-1.5 font-semibold', i > 0 && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={cx('px-3 py-1.5', j > 0 && 'text-right tabular-nums')}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

const HEAT_STEPS = [
  { min: 0, label: '0' },
  { min: 1, label: '1–9' },
  { min: 10, label: '10–29' },
  { min: 30, label: '30–59' },
  { min: 60, label: '60+' },
]
const heatLevel = (n: number) => (n >= 60 ? 4 : n >= 30 ? 3 : n >= 10 ? 2 : n >= 1 ? 1 : 0)

/**
 * Kalender aktivitas ala GitHub: satu kotak per hari, kolom = minggu (Senin di atas).
 * Satu hue berurutan (terang → gelap = sedikit → banyak) dengan langkah terpisah untuk mode gelap.
 */
export function Heatmap({
  days,
  label,
}: {
  /** Urut dari lama ke hari ini. */
  days: { day: string; count: number; title: string }[]
  label: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  // geser agar kolom pertama dimulai hari Senin
  const firstDow = (new Date(`${days[0]?.day ?? '2026-01-05'}T12:00:00`).getDay() + 6) % 7
  const cells: ({ day: string; count: number; title: string } | null)[] = [...Array(firstDow).fill(null), ...days]
  const weeks = Math.ceil(cells.length / 7)
  const gap = 3
  const labelW = 22
  const size = Math.max(8, Math.min(16, Math.floor((width - labelW - gap * (weeks - 1)) / weeks)))
  const act = active != null ? cells[active] : null
  const DOW = ['Sen', '', 'Rab', '', 'Jum', '', 'Min']

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
      <div className="flex" role="img" aria-label={label}>
        <div className="flex flex-col text-[9px] text-slate-400" style={{ width: labelW, gap }}>
          {DOW.map((d, i) => (
            <span key={i} style={{ height: size, lineHeight: `${size}px` }}>
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-flow-col" style={{ gap, gridTemplateRows: `repeat(7, ${size}px)`, gridAutoColumns: `${size}px` }}>
          {cells.map((c, i) =>
            c ? (
              <span
                key={c.day}
                tabIndex={0}
                aria-label={`${c.title}: ${c.count} ulasan`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className={cx('rounded-[3px] outline-none', active === i && 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900')}
                style={{ background: `var(--heat-${heatLevel(c.count)})` }}
              />
            ) : (
              <span key={`pad-${i}`} />
            ),
          )}
        </div>
      </div>
      {act && (
        <div className="pointer-events-none absolute -top-11 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-white px-3 py-1.5 text-xs whitespace-nowrap shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <span className="font-bold text-slate-900 dark:text-white">{act.count} ulasan</span>
          <span className="ml-1.5 text-slate-500 dark:text-slate-400">{act.title}</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="mr-1">Sedikit</span>
        {HEAT_STEPS.map((s, i) => (
          <span key={s.label} title={s.label} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: `var(--heat-${i})` }} />
        ))}
        <span className="ml-1">Banyak</span>
      </div>
    </div>
  )
}
