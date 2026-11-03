import { useState } from 'react'
import { setSetting } from '../db/db'
import { navigate } from '../router'
import { Button, Modal, cx } from './ui'
import { IconChart, IconPlay, IconUpload } from './icons'

const STEPS = [
  {
    icon: IconUpload,
    title: 'Masukkan materimu',
    text: 'Impor kartu dari teks/CSV, atau salin prompt AI siap pakai untuk mengubah catatan & buku menjadi flashcard.',
  },
  {
    icon: IconPlay,
    title: 'Belajar 10 menit sehari',
    text: 'Jawab dalam hati, buka jawaban, lalu nilai dengan jujur: Lupa, Sulit, Bisa, atau Mudah.',
  },
  {
    icon: IconChart,
    title: 'Biarkan algoritma bekerja',
    text: 'FSRS-6 menjadwalkan setiap kartu tepat sebelum kamu lupa, dan makin akurat seiring riwayat belajarmu.',
  },
]

export function Onboarding({ open }: { open: boolean }) {
  const [i, setI] = useState(0)
  const finish = async (to?: string) => {
    await setSetting('onboarded', true)
    if (to) navigate(to)
  }
  const step = STEPS[i]
  const Icon = step.icon
  return (
    <Modal open={open} onClose={() => void finish()} title="Selamat datang di IngatTerus 👋">
      <div className="space-y-5">
        <div key={i} className="flex animate-pop flex-col items-center px-2 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <Icon size={30} />
          </div>
          <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
            Langkah {i + 1} dari {STEPS.length}
          </p>
          <h3 className="mt-1 text-lg font-bold">{step.title}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{step.text}</p>
        </div>
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, k) => (
            <span key={k} className={cx('h-1.5 rounded-full transition-all', k === i ? 'w-6 bg-indigo-600' : 'w-1.5 bg-slate-300 dark:bg-slate-700')} />
          ))}
        </div>
        {i < STEPS.length - 1 ? (
          <div className="flex gap-2">
            <Button variant="ghost" block onClick={() => void finish()}>
              Lewati
            </Button>
            <Button block onClick={() => setI(i + 1)}>
              Lanjut
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" block onClick={() => void finish('/impor?tab=ai')}>
              Masukkan materi
            </Button>
            <Button block onClick={() => void finish()}>
              Coba deck contoh
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
