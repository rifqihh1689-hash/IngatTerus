import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { optimizeAndApply, resetOptimizedParams } from '../db/repo'
import { useSettings } from '../hooks/useData'
import { MIN_TRAIN_REVIEWS, RECOMMENDED_TRAIN_REVIEWS, buildDataset, countTrainable } from '../lib/optimizer'
import { isValidWeights } from '../lib/fsrs'
import { formatDateTime } from '../lib/date'
import { Button, Panel, ProgressBar, confirmDialog, cx, toast } from './ui'
import { IconRefresh, IconTarget } from './icons'

export function AlgorithmSection() {
  const settings = useSettings()
  const trainable = useLiveQuery(async () => countTrainable(buildDataset(await db.reviewLogs.toArray())), [])
  const [progress, setProgress] = useState<number | null>(null)
  const personal = isValidWeights(settings.fsrsParams)
  const before = settings.optimizedLossBefore
  const after = settings.optimizedLossAfter
  const gain = personal && before && after ? Math.round(((before - after) / before) * 100) : null
  const enough = (trainable ?? 0) >= MIN_TRAIN_REVIEWS

  const run = async () => {
    setProgress(0)
    try {
      const res = await optimizeAndApply((p) => setProgress(p))
      if (res.improved) {
        const pct = Math.round(((res.lossBefore - res.lossAfter) / res.lossBefore) * 100)
        toast(`Algoritma dipersonalisasi: prediksi ${pct}% lebih akurat`, 'success', { duration: 5000 })
      } else {
        toast('Parameter saat ini sudah paling cocok untukmu — tidak ada perubahan', 'info', { duration: 5000 })
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Optimasi gagal', 'error')
    } finally {
      setProgress(null)
    }
  }

  const reset = async () => {
    const ok = await confirmDialog({
      title: 'Kembali ke parameter bawaan?',
      message: 'Parameter pribadi dihapus dan memori kartu dihitung ulang dengan parameter bawaan FSRS-6. Jadwal yang sudah ada tidak diubah.',
      confirmLabel: 'Kembalikan',
    })
    if (!ok) return
    await resetOptimizedParams()
    toast('Kembali ke parameter bawaan FSRS-6', 'success')
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Algoritma belajar</h2>
      <Panel className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            <IconTarget size={22} />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              FSRS-6{' '}
              <span
                className={cx(
                  'ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  personal ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                {personal ? 'dipersonalisasi' : 'parameter bawaan'}
              </span>
            </p>
            <p className="mt-0.5 text-slate-600 dark:text-slate-300">
              Algoritma pengulangan berjarak paling akurat saat ini. Ia memodelkan kapan kamu akan lupa setiap kartu, lalu
              menjadwalkannya tepat sebelum itu.
            </p>
          </div>
        </div>

        {personal && settings.optimizedAt && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            Dilatih dari {settings.optimizedReviews} ulasanmu pada {formatDateTime(settings.optimizedAt)}
            {gain != null && gain > 0 ? ` — prediksi ${gain}% lebih akurat dari bawaan.` : '.'}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Personalisasi dari riwayatmu</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Melatih 21 parameter FSRS dari pola lupa-ingatmu sendiri. Butuh minimal {MIN_TRAIN_REVIEWS} ulasan (lebih stabil
            setelah {RECOMMENDED_TRAIN_REVIEWS}+). Ulangi sebulan sekali. Saat ini: <b>{trainable ?? '…'}</b> ulasan bisa dipakai.
          </p>
          {!enough && trainable != null && (
            <ProgressBar value={trainable / MIN_TRAIN_REVIEWS} color="bg-indigo-400" />
          )}
          {progress != null && (
            <div className="space-y-1">
              <ProgressBar value={progress} />
              <p className="text-xs text-slate-500">Melatih… {Math.round(progress * 100)}%</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={!enough || progress != null} onClick={run}>
              <IconTarget size={16} /> {enough ? 'Optimalkan untukku' : `Butuh ${MIN_TRAIN_REVIEWS - (trainable ?? 0)} ulasan lagi`}
            </Button>
            {personal && (
              <Button size="sm" variant="ghost" disabled={progress != null} onClick={reset}>
                <IconRefresh size={16} /> Kembalikan bawaan
              </Button>
            )}
          </div>
        </div>
      </Panel>
    </section>
  )
}
