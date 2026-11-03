import { useCallback, useEffect, useRef, useState } from 'react'
import { saveQuizResult } from '../db/repo'
import { goBack, navigate } from '../router'
import { Button, EmptyState, IconButton, PageHeader, Panel, ProgressBar, Segmented } from '../components/ui'
import { IconQuiz, IconX } from '../components/icons'
import {
  DirectionPicker,
  OptionButton,
  QuestionPrompt,
  ReviewList,
  ScoreRing,
  SetupRow,
  useQuizDeck,
  verdict,
  type OptionState,
} from '../components/QuizCommon'
import { buildQuiz, distinctAnswerCount, quizEligible, scoreQuiz, type QuizDirection, type QuizQuestion } from '../lib/quiz'
import { formatClock } from '../lib/date'
import { confetti } from '../lib/celebrate'

type Phase = 'setup' | 'run' | 'done'

export function QuizPage({ deckId }: { deckId: string }) {
  const { deck, cards } = useQuizDeck(deckId)
  const [phase, setPhase] = useState<Phase>('setup')
  const [count, setCount] = useState(10)
  const [direction, setDirection] = useState<QuizDirection>('depan')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [index, setIndex] = useState(0)
  const startedAt = useRef(0)
  const [duration, setDuration] = useState(0)

  const start = () => {
    if (!cards) return
    const qs = buildQuiz(cards, { count: count === 0 ? cards.length : count, direction })
    if (qs.length === 0) return
    setQuestions(qs)
    setAnswers(qs.map(() => null))
    setIndex(0)
    startedAt.current = Date.now()
    setPhase('run')
  }

  const finish = useCallback(
    async (finalAnswers: (number | null)[]) => {
      const sec = Math.round((Date.now() - startedAt.current) / 1000)
      setDuration(sec)
      setPhase('done')
      const score = scoreQuiz(questions, finalAnswers)
      if (score.percent >= 80) confetti()
      await saveQuizResult({ deckId, mode: 'kuis', total: score.total, correct: score.correct, durationSec: sec })
    },
    [deckId, questions],
  )

  const q = questions[index]
  const chosen = answers[index]
  const answered = chosen != null

  const choose = useCallback(
    (i: number) => {
      if (answered) return
      setAnswers((prev) => prev.map((a, k) => (k === index ? i : a)))
    },
    [answered, index],
  )

  const next = useCallback(() => {
    if (index + 1 < questions.length) setIndex(index + 1)
    else void finish(answers)
  }, [index, questions.length, finish, answers])

  useEffect(() => {
    if (phase !== 'run' || !q) return
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (!answered && n >= 1 && n <= q.options.length) choose(n - 1)
      else if (answered && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, q, answered, choose, next])

  if (deck === undefined) return <EmptyState title="Deck tidak ditemukan" />
  if (deck === null || !cards) return <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />

  const enough = distinctAnswerCount(cards, direction) >= 2
  const available = quizEligible(cards, direction).length
  const effectiveCount = count === 0 || count >= available ? 0 : count

  if (phase === 'setup') {
    return (
      <div className="space-y-4">
        <PageHeader back={`/deck/${deckId}`} title="Kuis pilihan ganda" subtitle={deck.name} />
        <Panel className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl bg-indigo-50 p-3 text-sm text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200">
            <IconQuiz className="shrink-0" />
            <p>Jawab soal pilihan ganda dari kartu di deck ini. Jawaban langsung dinilai. Kuis tidak mengubah jadwal belajarmu.</p>
          </div>
          <SetupRow label="Jumlah soal">
            <Segmented
              label="Jumlah soal"
              value={effectiveCount}
              onChange={setCount}
              options={[5, 10, 20].filter((n) => n < available).map((n) => ({ value: n, label: String(n) })).concat([{ value: 0, label: `Semua (${available})` }])}
            />
          </SetupRow>
          <SetupRow label="Arah soal">
            <DirectionPicker value={direction} onChange={setDirection} />
          </SetupRow>
          {!enough && <p className="text-sm text-rose-600">Butuh minimal 2 kartu dengan jawaban berbeda.</p>}
          <Button size="lg" block disabled={!enough} onClick={start}>
            Mulai kuis
          </Button>
        </Panel>
      </div>
    )
  }

  if (phase === 'done') {
    const score = scoreQuiz(questions, answers)
    return (
      <div className="space-y-4">
        <PageHeader back={`/deck/${deckId}`} title="Hasil kuis" subtitle={deck.name} />
        <Panel className="animate-pop space-y-3 text-center">
          <ScoreRing percent={score.percent} />
          <p className="text-lg font-bold">{verdict(score.percent)}</p>
          <p className="text-sm text-slate-500">
            {score.correct} dari {score.total} benar · {formatClock(duration)}
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" block onClick={() => navigate(`/deck/${deckId}`, { replace: true })}>
              Selesai
            </Button>
            <Button block onClick={start}>
              Ulangi
            </Button>
          </div>
        </Panel>
        {score.correct < score.total && (
          <>
            <h2 className="font-bold">Perlu dipelajari lagi</h2>
            <ReviewList questions={questions} answers={answers} onlyWrong />
          </>
        )}
      </div>
    )
  }

  const correctSoFar = answers.filter((a, i) => a != null && a === questions[i].correctIndex).length
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Keluar dari kuis" onClick={() => goBack(`/deck/${deckId}`)} className="-ml-2">
          <IconX />
        </IconButton>
        <ProgressBar value={(index + (answered ? 1 : 0)) / questions.length} className="flex-1" />
        <span className="text-sm font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">✓ {correctSoFar}</span>
      </div>
      <QuestionPrompt q={q} index={index} total={questions.length} />
      <div className="space-y-2">
        {q.options.map((opt, i) => {
          let state: OptionState = 'idle'
          if (answered) state = i === q.correctIndex ? 'correct' : i === chosen ? 'wrong' : 'dim'
          return <OptionButton key={i} index={i} text={opt} state={state} onClick={() => choose(i)} disabled={answered} />
        })}
      </div>
      {answered && (
        <div className="pb-safe sticky bottom-0 animate-slide-up bg-slate-50 pt-2 pb-2 dark:bg-slate-950">
          <p className="mb-2 text-center text-sm font-semibold">
            {chosen === q.correctIndex ? (
              <span className="text-emerald-600 dark:text-emerald-400">Benar! 🎉</span>
            ) : (
              <span className="text-rose-600 dark:text-rose-400">Kurang tepat</span>
            )}
          </p>
          <Button size="lg" block onClick={next} autoFocus>
            {index + 1 < questions.length ? 'Soal berikutnya' : 'Lihat hasil'}
          </Button>
        </div>
      )}
    </div>
  )
}
