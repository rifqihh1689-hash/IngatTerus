import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { RichText, CardFace } from './RichText'
import { Panel, Segmented, cx } from './ui'
import { IconCheck, IconX } from './icons'
import type { QuizDirection, QuizQuestion } from '../lib/quiz'
import type { Card, Deck } from '../types'

export function useQuizDeck(deckId: string): { deck: Deck | null | undefined; cards: Card[] | undefined } {
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId], null)
  const cards = useLiveQuery(() => db.cards.where('deckId').equals(deckId).toArray(), [deckId])
  return { deck, cards }
}

export function DirectionPicker({ value, onChange }: { value: QuizDirection; onChange: (v: QuizDirection) => void }) {
  return (
    <Segmented
      label="Arah soal"
      value={value}
      onChange={onChange}
      options={[
        { value: 'depan', label: 'Depan → Belakang' },
        { value: 'belakang', label: 'Belakang → Depan' },
      ]}
    />
  )
}

export function SetupRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
    </div>
  )
}

export function QuestionPrompt({ q, index, total }: { q: QuizQuestion; index: number; total: number }) {
  return (
    <Panel className="animate-pop text-center">
      <p className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
        Soal {index + 1} dari {total}
      </p>
      <CardFace text={q.prompt} image={q.promptImage} className="text-lg leading-relaxed font-medium" />
    </Panel>
  )
}

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dim'

export function OptionButton({
  index,
  text,
  state,
  onClick,
  disabled,
}: {
  index: number
  text: string
  state: OptionState
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex w-full items-start gap-3 rounded-2xl p-3.5 text-left text-sm ring-1 transition',
        state === 'idle' && 'bg-white ring-slate-200 hover:ring-indigo-400 dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-indigo-500',
        state === 'selected' && 'bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-950/60',
        state === 'correct' && 'bg-emerald-50 ring-2 ring-emerald-500 dark:bg-emerald-950/50',
        state === 'wrong' && 'bg-rose-50 ring-2 ring-rose-500 dark:bg-rose-950/50',
        state === 'dim' && 'bg-white opacity-60 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800',
      )}
    >
      <span
        className={cx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
          state === 'correct'
            ? 'bg-emerald-500 text-white'
            : state === 'wrong'
              ? 'bg-rose-500 text-white'
              : state === 'selected'
                ? 'bg-indigo-500 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        )}
      >
        {state === 'correct' ? <IconCheck size={16} /> : state === 'wrong' ? <IconX size={16} /> : String.fromCharCode(65 + index)}
      </span>
      <span className="min-w-0 flex-1 pt-0.5 leading-relaxed">
        <RichText text={text} />
      </span>
    </button>
  )
}

export function ScoreRing({ percent }: { percent: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const color = percent >= 80 ? 'text-emerald-500' : percent >= 60 ? 'text-amber-500' : 'text-rose-500'
  return (
    <div className="relative mx-auto h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-800" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke="currentColor"
          className={cx(color, 'transition-all duration-700')}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - percent / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums">{percent}</span>
        <span className="text-xs text-slate-500">nilai</span>
      </div>
    </div>
  )
}

export function verdict(percent: number) {
  if (percent >= 90) return 'Luar biasa! 🏆'
  if (percent >= 80) return 'Hebat! 🎯'
  if (percent >= 60) return 'Lumayan, terus berlatih 💪'
  return 'Ayo ulangi lagi, kamu pasti bisa 📚'
}

export function ReviewList({
  questions,
  answers,
  onlyWrong,
}: {
  questions: QuizQuestion[]
  answers: (number | null)[]
  onlyWrong?: boolean
}) {
  const rows = questions.map((q, i) => ({ q, i, a: answers[i] })).filter((r) => !onlyWrong || r.a !== r.q.correctIndex)
  if (rows.length === 0) return null
  return (
    <ul className="space-y-2">
      {rows.map(({ q, i, a }) => {
        const ok = a === q.correctIndex
        return (
          <li key={i} className="rounded-2xl bg-white p-3.5 text-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
            <div className="flex items-start gap-2">
              <span
                className={cx(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white',
                  ok ? 'bg-emerald-500' : 'bg-rose-500',
                )}
              >
                {ok ? <IconCheck size={12} /> : <IconX size={12} />}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">
                  {i + 1}. <RichText text={q.prompt || '(gambar)'} />
                </p>
                {!ok && (
                  <p className="text-rose-600 dark:text-rose-400">
                    Jawabanmu: {a == null ? <i>tidak dijawab</i> : <RichText text={q.options[a]} />}
                  </p>
                )}
                <p className="text-emerald-700 dark:text-emerald-400">
                  Benar: <RichText text={q.options[q.correctIndex]} />
                </p>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
