/** Perkecil gambar sebelum disimpan agar database tetap ringan. */
export async function fileToResizedDataUrl(file: File, maxSize = 1024, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Berkas bukan gambar.')
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    if (file.size > 1_500_000) throw new Error('Gambar terlalu besar (maks. 1,5 MB untuk SVG/GIF).')
    return readAsDataUrl(file)
  }
  const bitmap = await loadImage(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Peramban tidak mendukung pengolahan gambar.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  // WebP mendukung transparansi; peramban yang tidak mendukung akan memberi PNG.
  let url = canvas.toDataURL('image/webp', quality)
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality)
  return url
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Gagal membaca berkas.'))
    reader.readAsDataURL(file)
  })
}

async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      /* lanjut ke cara lama */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Unduh teks/JSON sebagai berkas. */
export function downloadText(content: string, filename: string, type = 'application/json') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
