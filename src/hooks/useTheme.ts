import { useEffect, useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'ingatterus-theme'
const listeners = new Set<() => void>()

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* penyimpanan tidak tersedia */
  }
  listeners.forEach((l) => l())
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1020' : '#4f46e5')
  return dark
}

export function useTheme(): { pref: ThemePref; dark: boolean; setPref: (p: ThemePref) => void } {
  const pref = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    read,
    () => 'system' as ThemePref,
  )
  const systemDark = useSyncExternalStore(
    (cb) => {
      const m = media()
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => media().matches,
    () => false,
  )
  useEffect(() => {
    applyTheme(pref)
  }, [pref, systemDark])
  return { pref, dark: pref === 'dark' || (pref === 'system' && systemDark), setPref: setThemePref }
}
