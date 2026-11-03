// Membuat ikon PNG PWA dari public/favicon.svg memakai Chromium (Playwright).
// Jalankan: node scripts/generate-icons.mjs  (butuh paket "playwright" terpasang)
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

// Playwright di-require agar bisa memakai instalasi global (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright')

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const targets = [
  { file: 'pwa-192x192.png', size: 192, maskable: false },
  { file: 'pwa-512x512.png', size: 512, maskable: false },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
  { file: 'maskable-512x512.png', size: 512, maskable: true },
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size })
  // Ikon maskable: latar penuh tanpa sudut membulat, isi di zona aman ±80%.
  const inner = t.maskable ? Math.round(t.size * 0.82) : t.size
  const offset = Math.round((t.size - inner) / 2)
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${
    t.maskable ? 'linear-gradient(135deg,#6366f1,#7c3aed)' : 'transparent'
  };width:${t.size}px;height:${t.size}px;overflow:hidden">
    <img src="${dataUrl}" style="position:absolute;left:${offset}px;top:${offset}px;width:${inner}px;height:${inner}px" />
  </body></html>`)
  await page.waitForTimeout(50)
  const buf = await page.screenshot({ omitBackground: !t.maskable, type: 'png' })
  await writeFile(new URL(`../public/${t.file}`, import.meta.url), buf)
  console.log('✓', t.file)
}
await browser.close()
