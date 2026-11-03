import { useEffect, type ReactNode } from 'react'
import { matchPath, useLocation } from './router'
import { Layout } from './components/Layout'
import { GlobalOverlays } from './components/ui'
import { HomePage } from './pages/HomePage'
import { DeckPage } from './pages/DeckPage'
import { CardEditorPage } from './pages/CardEditorPage'
import { StudyPage } from './pages/StudyPage'
import { QuizPage } from './pages/QuizPage'
import { ExamPage } from './pages/ExamPage'
import { StatsPage } from './pages/StatsPage'
import { ImportPage } from './pages/ImportPage'
import { SettingsPage } from './pages/SettingsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { db, getSettings } from './db/db'
import { seedSampleDecks } from './data/sampleDecks'
import { checkReminderNow } from './lib/notify'
import { initSync } from './sync/manager'
import { SyncChoiceDialog } from './components/SyncSection'

interface Route {
  pattern: string
  focus?: boolean
  render: (p: Record<string, string>, q: URLSearchParams) => ReactNode
}

const ROUTES: Route[] = [
  { pattern: '/', render: () => <HomePage /> },
  { pattern: '/deck/:id', render: (p) => <DeckPage deckId={p.id} /> },
  { pattern: '/deck/:id/kartu-baru', render: (p) => <CardEditorPage deckId={p.id} /> },
  { pattern: '/kartu/:id', render: (p) => <CardEditorPage cardId={p.id} /> },
  { pattern: '/belajar/:id', focus: true, render: (p, q) => <StudyPage deckId={p.id} extra={q.get('mode') === 'ekstra'} /> },
  { pattern: '/kuis/:id', focus: true, render: (p) => <QuizPage deckId={p.id} /> },
  { pattern: '/ujian/:id', focus: true, render: (p) => <ExamPage deckId={p.id} /> },
  { pattern: '/statistik', render: () => <StatsPage /> },
  { pattern: '/impor', render: (_p, q) => <ImportPage initialDeckId={q.get('deck') ?? undefined} initialTab={q.get('tab') ?? (q.get('deck') ? 'tempel' : undefined)} /> },
  { pattern: '/pengaturan', render: () => <SettingsPage /> },
]

let seeding: Promise<unknown> | null = null

/** Pada kunjungan pertama, isi deck contoh (sekali saja). */
function useFirstRunSeed() {
  useEffect(() => {
    seeding ??= (async () => {
      const s = await getSettings()
      if (!s.seeded && (await db.decks.count()) === 0) await seedSampleDecks()
    })().catch((err) => console.error('Gagal menyiapkan deck contoh', err))
  }, [])
}

/** Selama aplikasi terbuka, cek pengingat tiap menit & saat tab kembali aktif. */
function useReminderLoop() {
  useEffect(() => {
    const run = () => void checkReminderNow().catch(() => undefined)
    run()
    const id = window.setInterval(run, 60_000)
    document.addEventListener('visibilitychange', run)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', run)
    }
  }, [])
}

let syncStarted = false

export default function App() {
  const { path, query } = useLocation()
  useFirstRunSeed()
  useReminderLoop()
  useEffect(() => {
    if (syncStarted) return
    syncStarted = true
    void initSync()
  }, [])

  let content: ReactNode = <NotFoundPage />
  let focus = false
  for (const r of ROUTES) {
    const params = matchPath(r.pattern, path)
    if (params) {
      content = r.render(params, query)
      focus = !!r.focus
      break
    }
  }

  return (
    <>
      <Layout focus={focus} key={focus ? 'focus' : 'normal'}>
        <div key={path} className="animate-fade-in">
          {content}
        </div>
      </Layout>
      <SyncChoiceDialog />
      <GlobalOverlays />
    </>
  )
}
