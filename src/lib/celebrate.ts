/** Efek perayaan ringan (konfeti CSS) & getar singkat — menghormati "kurangi gerakan". */

const COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#38bdf8']

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function confetti(pieces = 70) {
  if (typeof document === 'undefined' || reducedMotion()) return
  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:70'
  for (let i = 0; i < pieces; i++) {
    const p = document.createElement('span')
    const size = 6 + Math.random() * 6
    const x = Math.random() * 100
    const drift = (Math.random() - 0.5) * 220
    const rot = (Math.random() - 0.5) * 900
    const dur = 1600 + Math.random() * 1400
    p.style.cssText = `position:absolute;top:-16px;left:${x}vw;width:${size}px;height:${size * 0.45}px;border-radius:2px;background:${
      COLORS[i % COLORS.length]
    };opacity:.95`
    p.animate(
      [
        { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate3d(${drift}px,105vh,0) rotate(${rot}deg)`, opacity: 0.9 },
      ],
      { duration: dur, delay: Math.random() * 250, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' },
    )
    layer.appendChild(p)
  }
  document.body.appendChild(layer)
  window.setTimeout(() => layer.remove(), 3400)
}

/** Getar singkat di perangkat yang mendukung (Android). */
export function haptic(pattern: number | number[] = 10) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* tidak didukung */
  }
}
