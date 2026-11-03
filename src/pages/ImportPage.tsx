import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addCards, createDeck } from '../db/repo'
import { Link, navigate } from '../router'
import { Button, Field, PageHeader, Panel, Segmented, Select, TextArea, TextInput, Toggle, cx, toast } from '../components/ui'
import { IconFile, IconUpload } from '../components/icons'
import { RichText } from '../components/RichText'
import { AiPromptHelper } from '../components/AiPromptHelper'
import { findDuplicates, parseCardText, type Delimiter } from '../lib/importText'

const EXAMPLE = `# Format: pertanyaan;jawaban  (baris diawali # diabaikan)
Ibu kota Jepang?;**Tokyo**
Rumus luas lingkaran?;L = π r²
apple;apel\\n*I eat an apple every day.*
"Pertanyaan dengan ; titik koma";"bungkus dengan tanda kutip"`

const NEW_DECK = '__baru__'

export function ImportPage({ initialDeckId, initialTab }: { initialDeckId?: string; initialTab?: string }) {
  const [tab, setTab] = useState<'ai' | 'tempel'>(initialTab === 'tempel' ? 'tempel' : 'ai')
  const decks = useLiveQuery(() => db.decks.orderBy('createdAt').toArray(), [])
  const [deckId, setDeckId] = useState(initialDeckId ?? '')
  const [newName, setNewName] = useState('')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [delimiter, setDelimiter] = useState<Delimiter | 'auto'>('auto')
  const [skipDupes, setSkipDupes] = useState(true)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (decks && !deckId) setDeckId(decks[0]?.id ?? NEW_DECK)
  }, [decks, deckId])

  const existingFronts = useLiveQuery(
    async () => (deckId && deckId !== NEW_DECK ? (await db.cards.where('deckId').equals(deckId).toArray()).map((c) => c.front) : []),
    [deckId],
    [] as string[],
  )

  const parsed = useMemo(() => parseCardText(text, { delimiter }), [text, delimiter])
  const dupes = useMemo(() => findDuplicates(parsed.cards, existingFronts), [parsed, existingFronts])
  const toImport = skipDupes ? parsed.cards.filter((_, i) => !dupes.has(i)) : parsed.cards

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 5_000_000) {
      toast('Berkas terlalu besar (maks. 5 MB)', 'error')
      return
    }
    setText(await file.text())
    setFileName(file.name)
    if (deckId === NEW_DECK && !newName) setNewName(file.name.replace(/\.[^.]+$/, ''))
    if (fileRef.current) fileRef.current.value = ''
  }

  const doImport = async () => {
    if (toImport.length === 0) return
    if (deckId === NEW_DECK && !newName.trim()) {
      toast('Beri nama deck baru terlebih dulu', 'error')
      return
    }
    setBusy(true)
    try {
      const target = deckId === NEW_DECK ? await createDeck({ name: newName }) : deckId
      const n = await addCards(target, toImport.map(({ front, back }) => ({ front, back })))
      toast(`${n} kartu berhasil diimpor`, 'success')
      navigate(`/deck/${target}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Impor gagal', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Tambah materi" subtitle="Buat kartu dengan AI, atau impor teks/CSV" back={initialDeckId ? `/deck/${initialDeckId}` : undefined} />

      <Segmented
        label="Cara menambah kartu"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'ai', label: '✨ Buat dengan AI' },
          { value: 'tempel', label: 'Sudah punya kartu' },
        ]}
      />

      {tab === 'ai' && (
        <Panel className="animate-fade-in">
          <AiPromptHelper />
        </Panel>
      )}

      <Panel className="space-y-4">
        <Field label="Masukkan ke deck">
          {(id) => (
            <Select id={id} value={deckId} onChange={(e) => setDeckId(e.target.value)}>
              {decks?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              <option value={NEW_DECK}>+ Deck baru…</option>
            </Select>
          )}
        </Field>
        {deckId === NEW_DECK && (
          <Field label="Nama deck baru">
            {(id) => <TextInput id={id} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="mis. Kosakata TOEFL" />}
          </Field>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="impor-teks" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Teks kartu
            </label>
            <button type="button" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400" onClick={() => setText(EXAMPLE)}>
              Isi contoh
            </button>
          </div>
          <TextArea
            id="impor-teks"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setFileName(null)
            }}
            placeholder={'pertanyaan;jawaban\nIbu kota Jepang?;Tokyo'}
            className="min-h-40 font-mono text-sm"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <IconFile size={16} /> Pilih berkas .csv / .txt
            </Button>
            {fileName && <span className="truncate text-xs text-slate-500">{fileName}</span>}
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Pemisah</span>
          <Segmented
            label="Pemisah"
            value={delimiter}
            onChange={setDelimiter}
            options={[
              { value: 'auto', label: 'Otomatis' },
              { value: ';', label: 'Titik koma' },
              { value: ',', label: 'Koma' },
              { value: '\t', label: 'Tab' },
            ]}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Lewati duplikat</p>
            <p className="text-xs text-slate-500">Kartu dengan pertanyaan yang sudah ada di deck</p>
          </div>
          <Toggle checked={skipDupes} onChange={setSkipDupes} label="Lewati duplikat" />
        </div>
      </Panel>

      {text.trim() && (
        <Panel className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{parsed.cards.length} kartu valid</span>
            {dupes.size > 0 && (
              <span className="rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                {dupes.size} duplikat{skipDupes ? ' (dilewati)' : ''}
              </span>
            )}
            {parsed.errors.length > 0 && (
              <span className="rounded-lg bg-rose-50 px-2 py-1 font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{parsed.errors.length} baris bermasalah</span>
            )}
            {parsed.headerSkipped && <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">header dilewati</span>}
            <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              pemisah: {parsed.delimiter === '\t' ? 'tab' : parsed.delimiter}
            </span>
          </div>

          {parsed.errors.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-rose-50/60 p-2 text-xs dark:bg-rose-950/30">
              {parsed.errors.slice(0, 50).map((e) => (
                <li key={e.line}>
                  <b>Baris {e.line}:</b> {e.message} — <code className="break-all">{e.raw.slice(0, 80)}</code>
                </li>
              ))}
            </ul>
          )}

          {parsed.cards.length > 0 && (
            <div className="overflow-hidden rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="w-1/2 px-3 py-2 font-medium">Pertanyaan</th>
                    <th className="px-3 py-2 font-medium">Jawaban</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {parsed.cards.slice(0, 8).map((c, i) => (
                    <tr key={c.line} className={cx(dupes.has(i) && skipDupes && 'opacity-40')}>
                      <td className="px-3 py-2 align-top">
                        <RichText text={c.front} />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <RichText text={c.back} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.cards.length > 8 && <p className="bg-slate-50 px-3 py-1.5 text-xs text-slate-500 dark:bg-slate-800/60">…dan {parsed.cards.length - 8} kartu lainnya</p>}
            </div>
          )}

          <Button size="lg" block disabled={busy || toImport.length === 0} onClick={doImport}>
            <IconUpload size={18} /> Impor {toImport.length} kartu
          </Button>
        </Panel>
      )}

      <Panel className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Panduan format</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Satu kartu per baris: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">pertanyaan;jawaban</code>
          </li>
          <li>Koma atau tab juga didukung (CSV/TSV dari Excel, Google Sheets, Quizlet).</li>
          <li>Bungkus teks dengan tanda kutip "…" bila berisi pemisah atau baris baru.</li>
          <li>
            Tulis <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">\n</code> untuk baris baru, dan gunakan <b>**tebal**</b> atau <i>*miring*</i>.
          </li>
          <li>Baris berawalan # dianggap komentar. Header “pertanyaan;jawaban” otomatis dilewati.</li>
        </ul>
        <p className="pt-1">
          Ingin memindahkan semua data (termasuk riwayat)? Gunakan{' '}
          <Link to="/pengaturan" className="font-semibold text-indigo-600 dark:text-indigo-400">
            cadangan JSON di Pengaturan
          </Link>
          .
        </p>
      </Panel>
    </div>
  )
}
