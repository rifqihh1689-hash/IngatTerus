import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CARD_STYLES, buildMaterialPrompt, buildReviewPrompt, type CardStyle } from '../lib/aiPrompt'
import { Button, Field, Segmented, TextArea, TextInput, cx, toast } from './ui'
import { IconCheck, IconFile } from './icons'

const KEY = 'ingatterus-ai-prompt'
const LEVELS = ['SMA', 'UTBK/SNBT', 'kuliah S1', 'kuliah kedokteran', 'UKMPPD', 'CPNS/SKD', 'umum']

interface Saved {
  topic: string
  level: string
  count: number
  style: CardStyle
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { topic: '', level: '', count: 20, style: 'pemahaman', ...JSON.parse(raw) }
  } catch {
    /* abaikan */
  }
  return { topic: '', level: '', count: 20, style: 'pemahaman' }
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // cadangan untuk peramban lama
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <div className="relative flex gap-3">
      <div
        className={cx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          done ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white',
        )}
      >
        {done ? <IconCheck size={16} /> : n}
      </div>
      <div className="min-w-0 flex-1 space-y-3 pb-1">
        <h3 className="pt-1 font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function AiPromptHelper() {
  const [s, setS] = useState<Saved>(load)
  const [material, setMaterial] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* abaikan */
    }
  }, [s])

  const prompt = useMemo(() => buildMaterialPrompt({ ...s, material }), [s, material])
  const style = CARD_STYLES.find((x) => x.value === s.style)

  const doCopy = async () => {
    const ok = await copy(prompt)
    setCopied(ok)
    toast(ok ? 'Prompt disalin — tempel di ChatGPT, Gemini, atau Claude' : 'Gagal menyalin, salin manual dari kotak pratinjau', ok ? 'success' : 'error', {
      duration: 4000,
    })
  }

  return (
    <div className="space-y-5">
      <Step n={1} title="Atur & salin prompt" done={copied}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Topik / bab">
            {(id) => <TextInput id={id} value={s.topic} onChange={(e) => setS({ ...s, topic: e.target.value })} placeholder="mis. Metabolisme nukleotida" />}
          </Field>
          <Field label="Tingkat">
            {(id) => (
              <>
                <TextInput id={id} list="ai-levels" value={s.level} onChange={(e) => setS({ ...s, level: e.target.value })} placeholder="mis. kuliah kedokteran" />
                <datalist id="ai-levels">
                  {LEVELS.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Jumlah kartu</span>
          <Segmented
            label="Jumlah kartu"
            value={s.count}
            onChange={(count) => setS({ ...s, count })}
            options={[10, 20, 30, 50].map((n) => ({ value: n, label: String(n) }))}
          />
        </div>
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Jenis kartu</span>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Jenis kartu">
            {CARD_STYLES.map((st) => (
              <button
                key={st.value}
                type="button"
                role="radio"
                aria-checked={s.style === st.value}
                onClick={() => setS({ ...s, style: st.value })}
                className={cx(
                  'rounded-xl p-3 text-left text-sm ring-1 transition',
                  s.style === st.value
                    ? 'bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-950/60'
                    : 'bg-white ring-slate-200 hover:ring-slate-300 dark:bg-slate-900 dark:ring-slate-700',
                )}
              >
                <span className="block font-semibold">{st.label}</span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{st.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label="Materi (opsional)" hint="Boleh dikosongkan: lampirkan PDF/foto atau tempel materi langsung di aplikasi AI. Cicil 1–3 halaman per prompt agar kartunya teliti.">
          {(id) => (
            <TextArea id={id} value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Tempel catatan, ringkasan, atau teks buku di sini…" className="min-h-28" />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button onClick={doCopy}>
            {copied ? <IconCheck size={18} /> : <IconFile size={18} />} {copied ? 'Prompt tersalin' : 'Salin prompt'}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const ok = await copy(buildReviewPrompt())
              toast(ok ? 'Prompt cek ulang disalin' : 'Gagal menyalin', ok ? 'success' : 'error')
            }}
          >
            Salin prompt cek ulang
          </Button>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500 select-none dark:text-slate-400">Lihat isi prompt ({style?.label})</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-50 p-3 whitespace-pre-wrap text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">{prompt}</pre>
        </details>
      </Step>

      <Step n={2} title="Tempel di aplikasi AI">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Buka ChatGPT, Gemini, atau Claude, tempel prompt, lalu kirim. Kalau materi belum ditempel di langkah 1, lampirkan
          berkas/foto materinya atau tempel di bagian <b>MATERI</b>.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            ['ChatGPT', 'https://chatgpt.com/'],
            ['Gemini', 'https://gemini.google.com/'],
            ['Claude', 'https://claude.ai/new'],
          ].map(([name, url]) => (
            <a
              key={name}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {name} ↗
            </a>
          ))}
        </div>
      </Step>

      <Step n={3} title="Tempel jawaban AI di bawah">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Salin <b>seluruh</b> jawaban AI ke kotak <b>Teks kartu</b>. IngatTerus otomatis mengambil isi blok kodenya. Periksa
          pratinjau, lalu impor. Ulangi untuk bab berikutnya ke deck yang sama — kartu duplikat dilewati otomatis.
        </p>
      </Step>
    </div>
  )
}
