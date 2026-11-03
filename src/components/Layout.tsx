import type { ReactNode } from 'react'
import { Link, useLocation } from '../router'
import { useTheme } from '../hooks/useTheme'
import { applyUpdate, dismissPWA, usePWAStatus } from '../pwa'
import { IconChart, IconHome, IconMoon, IconSettings, IconSun, IconUpload } from './icons'
import { cx } from './ui'

const NAV = [
  { to: '/', label: 'Beranda', icon: IconHome, match: (p: string) => p === '/' || p.startsWith('/deck') || p.startsWith('/kartu') },
  { to: '/statistik', label: 'Statistik', icon: IconChart, match: (p: string) => p.startsWith('/statistik') },
  { to: '/impor', label: 'Impor', icon: IconUpload, match: (p: string) => p.startsWith('/impor') },
  { to: '/pengaturan', label: 'Pengaturan', icon: IconSettings, match: (p: string) => p.startsWith('/pengaturan') },
]

export function Layout({ children, focus = false }: { children: ReactNode; focus?: boolean }) {
  const { path } = useLocation()
  const { dark, setPref } = useTheme()
  const pwa = usePWAStatus()

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      {!focus && (
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-slate-50/85 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/85">
          <div className="flex h-14 items-center gap-2 px-4">
            <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7" />
              <span className="text-lg">
                Ingat<span className="text-indigo-600 dark:text-indigo-400">Terus</span>
              </span>
            </Link>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setPref(dark ? 'light' : 'dark')}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label={dark ? 'Gunakan mode terang' : 'Gunakan mode gelap'}
              title={dark ? 'Mode terang' : 'Mode gelap'}
            >
              {dark ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </header>
      )}

      {pwa.needRefresh && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-indigo-600 px-4 py-3 text-sm text-white shadow">
          <span className="flex-1">Versi baru IngatTerus tersedia.</span>
          <button type="button" className="rounded-lg bg-white/20 px-3 py-1 font-semibold" onClick={applyUpdate}>
            Perbarui
          </button>
          <button type="button" className="text-white/80" onClick={dismissPWA}>
            Nanti
          </button>
        </div>
      )}
      {pwa.offlineReady && !pwa.needRefresh && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-sm text-white shadow">
          <span className="flex-1">Siap dipakai offline ✓</span>
          <button type="button" className="text-white/90" onClick={dismissPWA}>
            Tutup
          </button>
        </div>
      )}

      <main className={cx('flex-1 px-4', focus ? 'pt-3 pb-6' : 'pt-4 pb-28')}>{children}</main>

      {!focus && (
        <nav
          aria-label="Navigasi utama"
          className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90"
        >
          <div className="mx-auto grid max-w-2xl grid-cols-4">
            {NAV.map(({ to, label, icon: Icon, match }) => {
              const active = match(path)
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition',
                    active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                  )}
                >
                  <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                  {label}
                </Link>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
