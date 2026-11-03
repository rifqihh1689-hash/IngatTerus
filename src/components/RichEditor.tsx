import { useId, useRef, useState } from 'react'
import { fileToResizedDataUrl } from '../lib/image'
import { IconImage, IconTrash } from './icons'
import { CardFace } from './RichText'
import { cx, toast } from './ui'

const TOOLS = [
  { label: 'Tebal', mark: '**', display: <b>B</b> },
  { label: 'Miring', mark: '*', display: <i className="font-serif">I</i> },
  { label: 'Pangkat (x²)', mark: '^', display: <span>x<sup>2</sup></span> },
  { label: 'Indeks (x₂)', mark: '~', display: <span>x<sub>2</sub></span> },
] as const

export function RichEditor({
  label,
  value,
  onChange,
  image,
  onImageChange,
  placeholder,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  image?: string
  onImageChange: (v: string | undefined) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const id = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const wrap = (mark: string) => {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const selected = value.slice(s, e) || 'teks'
    const next = value.slice(0, s) + mark + selected + mark + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + mark.length, s + mark.length + selected.length)
    })
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      onImageChange(await fileToResizedDataUrl(file))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat gambar', 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
        <div className="flex items-center gap-1" role="toolbar" aria-label={`Format ${label}`}>
          {TOOLS.map((t) => (
            <button
              key={t.mark}
              type="button"
              title={t.label}
              aria-label={t.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => wrap(t.mark)}
              className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
            >
              {t.display}
            </button>
          ))}
          <button
            type="button"
            title="Tambah gambar"
            aria-label="Tambah gambar"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
          >
            <IconImage size={16} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      </div>
      <textarea
        id={id}
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'i')) {
            e.preventDefault()
            wrap(e.key === 'b' ? '**' : '*')
          }
        }}
        rows={3}
        className="w-full resize-y rounded-xl border-0 bg-white px-3 py-2.5 text-base ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:bg-slate-900 dark:ring-slate-700"
      />
      {image && (
        <div className="relative inline-block">
          <img src={image} alt={`Gambar ${label}`} className="max-h-40 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700" />
          <button
            type="button"
            onClick={() => onImageChange(undefined)}
            className="absolute top-1.5 right-1.5 rounded-lg bg-slate-900/70 p-1.5 text-white hover:bg-rose-600"
            aria-label="Hapus gambar"
            title="Hapus gambar"
          >
            <IconTrash size={14} />
          </button>
        </div>
      )}
      {(value.trim() || image) && /[*^~`]/.test(value) && (
        <div className={cx('rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60')}>
          <div className="mb-1 text-xs font-medium text-slate-400">Pratinjau</div>
          <CardFace text={value} className="items-start text-left" />
        </div>
      )}
    </div>
  )
}
