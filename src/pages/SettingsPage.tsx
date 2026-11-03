import { useRef, useState, type ReactNode } from 'react'
import { setSetting } from '../db/db'
import { exportAll, restoreBackup, wipeAll, type RestoreMode } from '../db/repo'
import { useSettings } from '../hooks/useData'
import { useTheme, type ThemePref } from '../hooks/useTheme'
import { seedSampleDecks } from '../data/sampleDecks'
import { backupFileName, BackupError, parseBackup, type BackupData } from '../lib/backup'
import { downloadText } from '../lib/image'
import {
  notificationPermission,
  requestNotificationPermission,
  setupBackgroundReminder,
  showNotification,
} from '../lib/notify'
import { isStandalone, promptInstall, useCanInstall } from '../pwa'
import { Button, Modal, PageHeader, Panel, Segmented, Select, TextInput, Toggle, confirmDialog, toast } from '../components/ui'
import { IconBell, IconDownload, IconLayers, IconMonitor, IconMoon, IconSun, IconTrash, IconUpload } from '../components/icons'

function Row({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{title}</h2>
      <Panel className="divide-y divide-slate-100 py-1 dark:divide-slate-800">{children}</Panel>
    </section>
  )
}

export function SettingsPage() {
  const settings = useSettings()
  const { pref, setPref } = useTheme()
  const canInstall = useCanInstall()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ data: BackupData; skipped: number; name: string } | null>(null)
  const [permission, setPermission] = useState(notificationPermission())
  const [bgSync, setBgSync] = useState<boolean | null>(null)

  const toggleReminder = async (on: boolean) => {
    if (on) {
      const p = await requestNotificationPermission()
      setPermission(p)
      if (p === 'unsupported') {
        toast('Peramban ini tidak mendukung notifikasi', 'error')
        return
      }
      if (p !== 'granted') {
        toast('Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di peramban.', 'error', { duration: 6000 })
        return
      }
    }
    await setSetting('reminderEnabled', on)
    // reset agar pengingat hari ini bisa terkirim setelah jam diubah/diaktifkan
    await setSetting('lastReminderDay', null)
    setBgSync(await setupBackgroundReminder(on))
    toast(on ? `Pengingat aktif setiap pukul ${settings.reminderTime}` : 'Pengingat dimatikan', 'success')
  }

  const changeTime = async (t: string) => {
    if (!/^\d{2}:\d{2}$/.test(t)) return
    await setSetting('reminderTime', t)
    await setSetting('lastReminderDay', null)
  }

  const testNotification = async () => {
    const p = await requestNotificationPermission()
    setPermission(p)
    if (p !== 'granted') {
      toast('Izinkan notifikasi terlebih dulu', 'error')
      return
    }
    const ok = await showNotification('IngatTerus 🔔', 'Notifikasi berfungsi! Kamu akan diingatkan untuk belajar setiap hari.')
    if (!ok) toast('Gagal menampilkan notifikasi', 'error')
  }

  const doExport = async () => {
    const data = await exportAll()
    downloadText(JSON.stringify(data, null, 2), backupFileName())
    toast(`Cadangan berisi ${data.decks.length} deck & ${data.cards.length} kartu diunduh`, 'success')
  }

  const onBackupFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    try {
      const { data, skipped } = parseBackup(await file.text())
      setPending({ data, skipped, name: file.name })
    } catch (err) {
      toast(err instanceof BackupError ? err.message : 'Gagal membaca berkas cadangan', 'error', { duration: 6000 })
    }
  }

  const doRestore = async (mode: RestoreMode) => {
    if (!pending) return
    if (mode === 'ganti') {
      const ok = await confirmDialog({
        title: 'Ganti semua data?',
        message: 'Semua deck, kartu, dan riwayat di perangkat ini akan dihapus lalu diganti isi cadangan.',
        confirmLabel: 'Ganti data',
        danger: true,
      })
      if (!ok) return
    }
    await restoreBackup(pending.data, mode)
    toast(`Cadangan dipulihkan: ${pending.data.decks.length} deck, ${pending.data.cards.length} kartu`, 'success')
    setPending(null)
  }

  const addSamples = async () => {
    const n = await seedSampleDecks()
    toast(n > 0 ? `${n} deck contoh ditambahkan` : 'Semua deck contoh sudah ada', n > 0 ? 'success' : 'info')
  }

  const wipe = async () => {
    const ok = await confirmDialog({
      title: 'Hapus semua data?',
      message: 'Semua deck, kartu, riwayat, dan hasil kuis akan dihapus permanen dari perangkat ini. Unduh cadangan dulu bila perlu.',
      confirmLabel: 'Hapus semua',
      danger: true,
    })
    if (!ok) return
    await wipeAll()
    toast('Semua data dihapus', 'success')
  }

  const themeIcon: Record<ThemePref, ReactNode> = {
    system: <IconMonitor size={16} />,
    light: <IconSun size={16} />,
    dark: <IconMoon size={16} />,
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Pengaturan" />

      {canInstall && !isStandalone() && (
        <Panel className="flex items-center gap-3 bg-indigo-50 ring-indigo-200 dark:bg-indigo-950/50 dark:ring-indigo-900">
          <img src={`${import.meta.env.BASE_URL}pwa-192x192.png`} alt="" className="h-12 w-12 rounded-xl" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Pasang IngatTerus</p>
            <p className="text-slate-600 dark:text-slate-300">Buka langsung dari layar utama & belajar offline.</p>
          </div>
          <Button size="sm" onClick={() => void promptInstall()}>
            Pasang
          </Button>
        </Panel>
      )}

      <Section title="Tampilan">
        <div className="py-3">
          <p className="mb-2 text-sm font-medium">Tema</p>
          <Segmented
            label="Tema"
            value={pref}
            onChange={setPref}
            options={(['system', 'light', 'dark'] as ThemePref[]).map((v) => ({
              value: v,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {themeIcon[v]} {v === 'system' ? 'Sistem' : v === 'light' ? 'Terang' : 'Gelap'}
                </span>
              ),
            }))}
          />
        </div>
      </Section>

      <Section title="Belajar">
        <Row title="Kartu baru per hari" desc="Batas kartu baru per deck setiap hari">
          <TextInput
            type="number"
            inputMode="numeric"
            min={0}
            max={500}
            value={settings.newPerDay}
            onChange={(e) => {
              const n = Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0)))
              void setSetting('newPerDay', n)
            }}
            className="w-20 text-center"
            aria-label="Kartu baru per hari"
          />
        </Row>
        <Row title="Target ingatan" desc="Lebih tinggi = lebih sering mengulang">
          <Select
            value={String(settings.desiredRetention)}
            onChange={(e) => void setSetting('desiredRetention', Number(e.target.value))}
            className="w-28"
            aria-label="Target ingatan"
          >
            {[0.8, 0.85, 0.9, 0.93, 0.95].map((r) => (
              <option key={r} value={r}>
                {Math.round(r * 100)}%{r === 0.9 ? ' (saran)' : ''}
              </option>
            ))}
          </Select>
        </Row>
        <p className="py-3 text-xs text-slate-500 dark:text-slate-400">
          Penjadwalan memakai algoritma <b>FSRS-5</b>: setiap jawaban (Lupa/Sulit/Bisa/Mudah) memperbarui stabilitas & kesulitan kartu, lalu kartu dijadwalkan tepat sebelum kamu diperkirakan lupa.
        </p>
      </Section>

      <Section title="Pengingat harian">
        <Row
          title="Notifikasi pengingat"
          desc={
            permission === 'denied'
              ? 'Izin notifikasi diblokir di peramban'
              : permission === 'unsupported'
                ? 'Tidak didukung peramban ini'
                : 'Diingatkan bila belum belajar hari ini'
          }
        >
          <Toggle
            checked={settings.reminderEnabled && permission === 'granted'}
            onChange={(v) => void toggleReminder(v)}
            label="Notifikasi pengingat"
            disabled={permission === 'unsupported'}
          />
        </Row>
        <Row title="Jam pengingat">
          <TextInput type="time" value={settings.reminderTime} onChange={(e) => void changeTime(e.target.value)} className="w-32" aria-label="Jam pengingat" />
        </Row>
        <div className="space-y-2 py-3">
          <Button variant="secondary" size="sm" onClick={testNotification}>
            <IconBell size={16} /> Uji notifikasi
          </Button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pengingat muncul saat aplikasi terbuka atau berjalan di latar.{' '}
            {bgSync === true
              ? 'Sinkronisasi latar aktif: pengingat juga bisa muncul saat aplikasi tertutup.'
              : 'Untuk pengingat saat aplikasi tertutup, pasang IngatTerus sebagai aplikasi (Chrome/Edge Android & desktop).'}
          </p>
        </div>
      </Section>

      <Section title="Data & cadangan">
        <Row title="Unduh cadangan" desc="Semua deck, kartu, riwayat (JSON)">
          <Button variant="secondary" size="sm" onClick={doExport}>
            <IconDownload size={16} /> Ekspor
          </Button>
        </Row>
        <Row title="Pulihkan cadangan" desc="Dari berkas JSON IngatTerus">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <IconUpload size={16} /> Impor
          </Button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onBackupFile(e.target.files?.[0])} />
        </Row>
        <Row title="Deck contoh" desc="Kosakata Inggris, TWK dasar, rumus matematika">
          <Button variant="secondary" size="sm" onClick={addSamples}>
            <IconLayers size={16} /> Tambah
          </Button>
        </Row>
        <Row title="Hapus semua data" desc="Tidak bisa dibatalkan">
          <Button variant="danger-ghost" size="sm" onClick={wipe}>
            <IconTrash size={16} /> Hapus
          </Button>
        </Row>
      </Section>

      <Section title="Tentang">
        <div className="space-y-1 py-3 text-sm text-slate-600 dark:text-slate-300">
          <p>
            <b>IngatTerus</b> v{__APP_VERSION__} — flashcard dengan pengulangan berjarak.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Semua data tersimpan lokal di peramban (IndexedDB) dan bisa dipakai tanpa internet. Tidak ada akun, tidak ada pelacakan.
          </p>
        </div>
      </Section>

      <Modal open={pending != null} onClose={() => setPending(null)} title="Pulihkan cadangan">
        {pending && (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <p className="truncate font-medium">{pending.name}</p>
              <p className="text-slate-500">
                {pending.data.decks.length} deck · {pending.data.cards.length} kartu · {pending.data.reviewLogs.length} riwayat ulasan
              </p>
              {pending.skipped > 0 && <p className="mt-1 text-amber-700 dark:text-amber-400">{pending.skipped} entri rusak akan dilewati.</p>}
            </div>
            <div className="space-y-2">
              <Button block onClick={() => void doRestore('gabung')}>
                Gabungkan dengan data sekarang
              </Button>
              <Button variant="danger" block onClick={() => void doRestore('ganti')}>
                Ganti semua data
              </Button>
            </div>
            <p className="text-xs text-slate-500">“Gabungkan” menambah deck/kartu dari cadangan dan memperbarui yang sama. “Ganti” menghapus data saat ini terlebih dulu.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
