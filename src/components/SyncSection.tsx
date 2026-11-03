import { useEffect, useState } from 'react'
import { SYNC_CONFIGURED } from '../sync/config'
import { chooseConnectMode, prepareSignIn, signInWithGoogle, signOutSync, syncNow, useSyncStatus, type SyncStatus } from '../sync/manager'
import { Button, Modal, Panel, confirmDialog, cx } from './ui'
import { IconCloud, IconCloudOff, IconLogout, IconSync } from './icons'

const GUIDE_URL = 'https://github.com/rifqihh1689-hash/IngatTerus/blob/main/docs/SINKRON-FIREBASE.md'

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function relative(t: number | null, now: number): string {
  if (!t) return 'belum pernah'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return 'baru saja'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} mnt lalu`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} jam lalu`
  return `${Math.round(h / 24)} hari lalu`
}

export function syncLabel(st: SyncStatus, now = Date.now()): string {
  switch (st.phase) {
    case 'syncing':
      return 'Menyinkronkan…'
    case 'offline':
      return 'Offline — perubahan disimpan & dikirim saat online'
    case 'error':
      return st.error ?? 'Gagal sinkron'
    case 'choose':
      return 'Menunggu pilihanmu'
    default:
      return `Tersinkron ${relative(st.lastSyncAt, now)}`
  }
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

export function SyncSection() {
  const st = useSyncStatus()
  const now = useNow()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (st.phase === 'signed-out') prepareSignIn()
  }, [st.phase])

  const signIn = async () => {
    setBusy(true)
    await signInWithGoogle()
    setBusy(false)
  }

  const signOut = async () => {
    const ok = await confirmDialog({
      title: 'Keluar dari akun?',
      message: 'Sinkron di perangkat ini berhenti. Data di perangkat ini tetap ada, dan data di perangkat lain tidak terpengaruh.',
      confirmLabel: 'Keluar',
    })
    if (ok) await signOutSync()
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Sinkron antar perangkat</h2>
      <Panel className="space-y-4">
        {!SYNC_CONFIGURED ? (
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Pakai di laptop & HP dengan data yang sama</p>
            <p className="text-slate-600 dark:text-slate-300">
              Fitur sinkron butuh proyek Firebase gratis yang dipasang sekali oleh pemilik aplikasi. Setelah itu, cukup tekan
              <b> Masuk dengan Google</b> di setiap perangkat.
            </p>
            <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-indigo-600 dark:text-indigo-400">
              Lihat panduan pemasangan ↗
            </a>
          </div>
        ) : st.user ? (
          <>
            <div className="flex items-center gap-3">
              {st.user.photo ? (
                <img src={st.user.photo} alt="" referrerPolicy="no-referrer" className="h-11 w-11 rounded-full" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {(st.user.name ?? st.user.email ?? '?').charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-semibold">{st.user.name ?? 'Akun Google'}</p>
                <p className="truncate text-slate-500 dark:text-slate-400">{st.user.email}</p>
              </div>
            </div>
            <p
              className={cx(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-xs',
                st.phase === 'error'
                  ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                  : st.phase === 'offline'
                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
              )}
              role="status"
            >
              {st.phase === 'offline' ? <IconCloudOff size={16} /> : <IconCloud size={16} />}
              {syncLabel(st, now)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={st.phase === 'syncing'} onClick={() => void syncNow()}>
                <IconSync size={16} className={st.phase === 'syncing' ? 'animate-spin' : ''} /> Sinkronkan sekarang
              </Button>
              <Button size="sm" variant="ghost" onClick={signOut}>
                <IconLogout size={16} /> Keluar
              </Button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Masuk dengan akun Google yang sama di laptop & HP. Deck, kartu, riwayat, dan jadwal ulang otomatis sama di semua
              perangkat — tetap bisa belajar offline, disinkron saat online.
            </p>
          </>
        ) : (
          <>
            <div className="text-sm">
              <p className="font-semibold">Pakai di laptop & HP dengan data yang sama</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-slate-600 dark:text-slate-300">
                <li>Deck, kartu, riwayat belajar, dan jadwal ulang sama di semua perangkat</li>
                <li>Tetap bisa belajar offline; perubahan dikirim saat online</li>
                <li>Data tersimpan di akun Google-mu sendiri</li>
              </ul>
            </div>
            <button
              type="button"
              disabled={busy || st.phase === 'loading'}
              onClick={signIn}
              className="flex h-11 w-full items-center justify-center gap-3 rounded-xl bg-white text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60 dark:bg-white dark:text-slate-800"
            >
              <GoogleLogo /> {busy ? 'Membuka Google…' : 'Masuk dengan Google'}
            </button>
            {st.error && <p className="text-xs text-rose-600 dark:text-rose-400">{st.error}</p>}
          </>
        )}
      </Panel>
    </section>
  )
}

/** Dialog saat perangkat ini & akun cloud sama-sama berisi data. */
export function SyncChoiceDialog() {
  const st = useSyncStatus()
  const [busy, setBusy] = useState(false)
  const choose = async (mode: 'merge' | 'download') => {
    if (mode === 'download') {
      const ok = await confirmDialog({
        title: 'Pakai data cloud saja?',
        message: 'Deck, kartu, dan riwayat yang hanya ada di perangkat ini akan dihapus dan diganti data dari akunmu.',
        confirmLabel: 'Ganti dengan data cloud',
        danger: true,
      })
      if (!ok) return
    }
    setBusy(true)
    await chooseConnectMode(mode)
    setBusy(false)
  }
  return (
    <Modal open={st.phase === 'choose'} onClose={() => void signOutSync()} title="Gabungkan data?">
      <div className="space-y-4 text-sm">
        <p className="text-slate-600 dark:text-slate-300">
          Akun <b>{st.user?.email}</b> sudah berisi data dari perangkat lain, dan perangkat ini juga punya data sendiri.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose('merge')}
          className="w-full rounded-2xl bg-indigo-50 p-4 text-left ring-2 ring-indigo-500 transition hover:bg-indigo-100 disabled:opacity-60 dark:bg-indigo-950/60 dark:hover:bg-indigo-950"
        >
          <span className="block font-semibold">Gabungkan keduanya (disarankan)</span>
          <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-300">
            Semua deck, kartu, dan riwayat dari perangkat ini & akun disatukan. Jadwal dihitung ulang dari riwayat gabungan.
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose('download')}
          className="w-full rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 transition hover:ring-slate-300 disabled:opacity-60 dark:bg-slate-900 dark:ring-slate-700"
        >
          <span className="block font-semibold">Pakai data cloud saja</span>
          <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-300">Data di perangkat ini diganti dengan data dari akunmu.</span>
        </button>
        <Button variant="ghost" block disabled={busy} onClick={() => void signOutSync()}>
          Batal & keluar
        </Button>
      </div>
    </Modal>
  )
}

/** Ikon status sinkron kecil untuk header. */
export function SyncIndicator() {
  const st = useSyncStatus()
  if (!st.user) return null
  const cls =
    st.phase === 'error' ? 'text-rose-500' : st.phase === 'offline' ? 'text-slate-400' : st.phase === 'syncing' ? 'text-indigo-500' : 'text-emerald-500'
  return (
    <a
      href="#/pengaturan"
      className={cx('relative flex h-10 w-10 items-center justify-center rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800', cls)}
      aria-label={`Status sinkron: ${syncLabel(st)}`}
      title={syncLabel(st)}
    >
      {st.phase === 'offline' ? <IconCloudOff size={20} /> : st.phase === 'syncing' ? <IconSync size={19} className="animate-spin" /> : <IconCloud size={20} />}
      {st.phase === 'error' && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-500" />}
    </a>
  )
}
