import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { IconBack, IconX } from './icons'
import { goBack } from '../router'

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'success'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 shadow-sm shadow-indigo-600/20',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700',
  'danger-ghost': 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  block,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; block?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-9 px-3 text-sm',
        size === 'md' && 'h-11 px-4 text-sm',
        size === 'lg' && 'h-13 px-5 text-base',
        block && 'w-full',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100',
        'focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800',
        'disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cx(
        'rounded-2xl bg-white p-4 ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: string | boolean
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {back && (
        <IconButton label="Kembali" onClick={() => goBack(typeof back === 'string' ? back : '/')} className="-ml-2">
          <IconBack />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}

const fieldClass =
  'w-full rounded-xl border-0 bg-white px-3 py-2.5 text-base ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:bg-slate-900 dark:ring-slate-700 sm:text-sm'

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldClass, props.className)} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldClass, 'min-h-24 resize-y', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldClass, 'pr-8', props.className)} />
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50',
        checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700',
      )}
    >
      <span
        className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transition', checked ? 'translate-x-6' : 'translate-x-1')}
      />
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition',
            o.value === value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ProgressBar({ value, className, color = 'bg-indigo-500' }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}>
      <div className={cx('h-full rounded-full transition-all duration-300', color)} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 rounded-2xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">{icon}</div>}
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{children}</div>}
    </div>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])')?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        className="pb-safe relative max-h-[90dvh] w-full max-w-lg animate-slide-up overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <IconButton label="Tutup" data-close onClick={onClose} className="-mr-2">
            <IconX />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ---------- Toast & dialog konfirmasi global ---------- */

interface Toast {
  id: number
  message: string
  tone: 'info' | 'success' | 'error'
  action?: { label: string; run: () => void }
}

interface ConfirmRequest {
  title: string
  message: ReactNode
  confirmLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

let toasts: Toast[] = []
let confirmReq: ConfirmRequest | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const sub = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
let nextId = 1

export function toast(message: string, tone: Toast['tone'] = 'info', opts: { action?: Toast['action']; duration?: number } = {}) {
  const t: Toast = { id: nextId++, message, tone, action: opts.action }
  toasts = [...toasts.slice(-2), t]
  emit()
  window.setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id)
    emit()
  }, opts.duration ?? (opts.action ? 8000 : 3200))
}

export function confirmDialog(opts: { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq = {
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Ya, lanjutkan',
      danger: opts.danger ?? false,
      resolve,
    }
    emit()
  })
}

function closeConfirm(ok: boolean) {
  confirmReq?.resolve(ok)
  confirmReq = null
  emit()
}

export function GlobalOverlays() {
  const state = useSyncExternalStore(sub, () => toasts)
  const req = useSyncExternalStore(sub, () => confirmReq)
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {state.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex max-w-md animate-slide-up items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg',
              t.tone === 'success' && 'bg-emerald-600',
              t.tone === 'error' && 'bg-rose-600',
              t.tone === 'info' && 'bg-slate-800 dark:bg-slate-700',
            )}
          >
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="rounded-lg bg-white/20 px-2.5 py-1 font-semibold hover:bg-white/30"
                onClick={() => {
                  t.action?.run()
                  toasts = toasts.filter((x) => x.id !== t.id)
                  emit()
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      <Modal open={req != null} title={req?.title ?? ''} onClose={() => closeConfirm(false)}>
        <div className="text-sm text-slate-600 dark:text-slate-300">{req?.message}</div>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" block onClick={() => closeConfirm(false)}>
            Batal
          </Button>
          <Button variant={req?.danger ? 'danger' : 'primary'} block onClick={() => closeConfirm(true)}>
            {req?.confirmLabel}
          </Button>
        </div>
      </Modal>
    </>
  )
}
