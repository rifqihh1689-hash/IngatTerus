import { useCallback, useEffect, useRef, useState } from 'react'
import { saveQuizResult } from '../db/repo'
import { navigate } from '../router'
import { Button, EmptyState, PageHeader, Panel, Segmented, confirmDialog, cx } from '../components/ui'
import { IconBack, IconChevronRight, IconClock, IconTimer } from '../components/icons'
import {
  DirectionPicker,
  OptionButton,
  QuestionPrompt,
  ReviewList,
  ScoreRing,
  SetupRow,
  useQuizDeck,
  verdict,
} from '../components/QuizCommon'
import { buildQuiz, distinctAnswerCount, quizEligible, scoreQuiz, type QuizDirection, type QuizQuestion } from '../lib/quiz'
import { formatClock } from '../lib/date'

type Phase = 'setup' | 'run' | 'done'

const DURATIONS = [5, 10, 15, 30]

export function ExamPage({ deckId }: { deckId: string }) {
  const { deck, cards } = useQuizDeck(deckId)
  const [phase, setPhase] = useState<Phase>('setup')
  const [count, setCount] = useState(20)
  const [minutes, setMinutes] = useState(10)
  const [direction, setDirection] = useState<QuizDirection>('depan')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [index, setIndex] = useState(0)
  const [deadline, setDeadline] = useState(0)
  const [now, setNow] = useState(Date.now())
  const startedAt = useRef(0)
  const [usedSec, setUsedSec] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const finishing = useRef(false)

  const start = () => {
    if (!cards) return
    const qs = buildQuiz(cards, { count: count === 0 ? cards.length : count, direction })
    if (qs.length === 0) return
    setQuestions(qs)
    setAnswers(qs.map(() => null))
    setIndex(0)
    startedAt.current = Date.now()
    setDeadline(Date.now() + minutes * 60_000)
    setNow(Date.now())
    setTimedOut(false)
    finishing.current = false
    setPhase('run')
  }

  const finish = useCallback(
    async (finalAnswers: (number | null)[], byTimeout = false) => {
      if (finishing.current) return
      finishing.current = true
      const sec = Math.min(Math.round((Date.now() - startedAt.current) / 1000), minutes * 60)
      setUsedSec(sec)
      setTimedOut(byTimeout)
      setPhase('done')
      const score = scoreQuiz(questions, finalAnswers)
      await saveQuizResult({ deckId, mode: 'ujian', total: score.total, correct: score.correct, durationSec: sec })
    },
    [deckId, minutes, questions],
  )

  // Hitung mundur; kumpulkan otomatis saat waktu habis.
  useEffect(() => {
    if (phase !== 'run') return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase === 'run' && now >= deadline) void finish(answers, true)
  }, [now, deadline, phase, finish, answers])

  // Cegah keluar tidak sengaja selama ujian.
  useEffect(() => {
    if (phase !== 'run') return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [phase])

  useEffect(() => {
    if (phase !== 'run') return
    const onKey = (e: KeyboardEvent) => {
      const q = questions[index]
      const n = Number(e.key)
      if (q && n >= 1 && n <= q.options.length) setAnswers((prev) => prev.map((a, k) => (k === index ? n - 1 : a)))
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, questions.length - 1))
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, questions, index])

  if (deck === undefined) return <EmptyState title="Deck tidak ditemukan" />
  if (deck === null || !cards) return <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />

  const enough = distinctAnswerCount(cards, direction) >= 2
  const available = quizEligible(cards, direction).length
  const effectiveCount = count === 0 || count >= available ? 0 : count

  if (phase === 'setup') {
    return (
      <div className="space-y-4">
        <PageHeader back={`/deck/${deckId}`} title="Mode ujian" subtitle={deck.name} />
        <Panel className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <IconTimer className="shrink-0" />
            <p>Simulasi ujian berwaktu. Jawaban baru dinilai setelah kamu mengumpulkan atau waktu habis.</p>
          </div>
          <SetupRow label="Jumlah soal">
            <Segmented
              label="Jumlah soal"
              value={effectiveCount}
              onChange={setCount}
              options={[10, 20, 30].filter((n) => n < available).map((n) => ({ value: n, label: String(n) })).concat([{ value: 0, label: `Semua (${available})` }])}
            />
          </SetupRow>
          <SetupRow label="Durasi">
            <Segmented label="Durasi" value={minutes} onChange={setMinutes} options={DURATIONS.map((m) => ({ value: m, label: `${m} mnt` }))} />
          </SetupRow>
          <SetupRow label="Arah soal">
            <DirectionPicker value={direction} onChange={setDirection} />
          </SetupRow>
          {!enough && <p className="text-sm text-rose-600">Butuh minimal 2 kartu dengan jawaban berbeda.</p>}
          <Button size="lg" block disabled={!enough} onClick={start}>
            Mulai ujian
          </Button>
        </Panel>
      </div>
    )
  }

  if (phase === 'done') {
    const score = scoreQuiz(questions, answers)
    return (
      <div className="space-y-4">
        <PageHeader back={`/deck/${deckId}`} title="Hasil ujian" subtitle={deck.name} />
        <Panel className="animate-pop space-y-3 text-center">
          {timedOut && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">⏰ Waktu habis — jawaban dikumpulkan otomatis.</p>}
          <ScoreRing percent={score.percent} />
          <p className="text-lg font-bold">{verdict(score.percent)}</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { n: score.correct, l: 'benar', c: 'text-emerald-600 dark:text-emerald-400' },
              { n: score.wrong, l: 'salah', c: 'text-rose-600 dark:text-rose-400' },
              { n: score.unanswered, l: 'kosong', c: 'text-slate-500' },
              { n: formatClock(usedSec), l: 'waktu', c: '' },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl bg-slate-50 p-2 dark:bg-slate-800/60">
                <div className={cx('text-lg font-bold tabular-nums', x.c)}>{x.n}</div>
                <div className="text-xs text-slate-500">{x.l}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" block onClick={() => navigate(`/deck/${deckId}`, { replace: true })}>
              Selesai
            </Button>
            <Button block onClick={start}>
              Ujian lagi
            </Button>
          </div>
        </Panel>
        <h2 className="font-bold">Pembahasan</h2>
        <ReviewList questions={questions} answers={answers} />
      </div>
    )
  }

  const remaining = Math.max(0, (deadline - now) / 1000)
  const q = questions[index]
  const answeredCount = answers.filter((a) => a != null).length
  const low = remaining <= 60

  const submit = async () => {
    const empty = questions.length - answeredCount
    const ok = await confirmDialog({
      title: 'Kumpulkan jawaban?',
      message: empty > 0 ? `Masih ada ${empty} soal yang belum dijawab.` : 'Semua soal sudah dijawab.',
      confirmLabel: 'Kumpulkan',
    })
    if (ok) void finish(answers)
  }

  const quit = async () => {
    const ok = await confirmDialog({ title: 'Keluar dari ujian?', message: 'Jawabanmu tidak akan disimpan.', confirmLabel: 'Keluar', danger: true })
    if (ok) navigate(`/deck/${deckId}`, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-slate-50/95 px-4 py-2 backdrop-blur dark:bg-slate-950/95">
        <Button variant="ghost" size="sm" onClick={quit} className="-ml-2">
          Keluar
        </Button>
        <div
          className={cx(
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 font-mono text-lg font-bold tabular-nums',
            low ? 'animate-pulse bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-slate-100 dark:bg-slate-800',
          )}
          role="timer"
          aria-label={`Sisa waktu ${formatClock(remaining)}`}
        >
          <IconClock size={18} /> {formatClock(remaining)}
        </div>
        <Button size="sm" onClick={submit}>
          Kumpulkan
        </Button>
      </div>

      <QuestionPrompt q={q} index={index} total={questions.length} />
      <div className="space-y-2">
        {q.options.map((opt, i) => (
          <OptionButton
            key={i}
            index={i}
            text={opt}
            state={answers[index] === i ? 'selected' : 'idle'}
            onClick={() => setAnswers((prev) => prev.map((a, k) => (k === index ? (a === i ? null : i) : a)))}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" block disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <IconBack size={18} /> Sebelumnya
        </Button>
        {index + 1 < questions.length ? (
          <Button variant="secondary" block onClick={() => setIndex(index + 1)}>
            Berikutnya <IconChevronRight size={18} />
          </Button>
        ) : (
          <Button block onClick={submit}>
            Kumpulkan
          </Button>
        )}
      </div>

      <Panel>
        <p className="mb-2 text-xs font-semibold text-slate-500">
          Terjawab {answeredCount}/{questions.length}
        </p>
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
          {questions.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Soal ${i + 1}${answers[i] != null ? ' (terjawab)' : ''}`}
              className={cx(
                'h-9 rounded-lg text-xs font-semibold tabular-nums transition',
                i === index && 'ring-2 ring-indigo-500',
                answers[i] != null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
}
