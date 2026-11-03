import type { ReactNode } from 'react'

/** Cincin kemajuan (0–1) dengan isi di tengah. */
export function ProgressRing({
  value,
  size = 96,
  stroke = 9,
  children,
  trackClass = 'stroke-white/20',
  barClass = 'stroke-white',
  label,
}: {
  value: number
  size?: number
  stroke?: number
  children?: ReactNode
  trackClass?: string
  barClass?: string
  label: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.min(1, Math.max(0, value))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClass} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className={`${barClass} transition-[stroke-dashoffset] duration-700 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}
