/** Router hash sederhana (#/jalur) — cocok untuk GitHub Pages & mode offline. */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

const getHash = () => window.location.hash.replace(/^#/, '') || '/'

export interface Location {
  path: string
  query: URLSearchParams
}

export function useLocation(): Location {
  const hash = useSyncExternalStore(subscribe, getHash, () => '/')
  const [path, qs = ''] = hash.split('?')
  return { path: path || '/', query: new URLSearchParams(qs) }
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = `#${to}`
  if (opts.replace) {
    window.history.replaceState(null, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = to
  }
  window.scrollTo({ top: 0 })
}

export function goBack(fallback = '/') {
  if (window.history.length > 1) window.history.back()
  else navigate(fallback, { replace: true })
}

/** Cocokkan pola seperti "/deck/:id" dengan path; kembalikan parameter atau null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const s = path.split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={`#${to}`}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e)
        if (!e.defaultPrevented) window.scrollTo({ top: 0 })
      }}
      {...rest}
    />
  )
}
