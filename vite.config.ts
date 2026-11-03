import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Di GitHub Pages aplikasi berjalan di sub-path (mis. /IngatTerus/).
// Workflow deploy mengisi BASE_PATH; saat pengembangan lokal memakai "/".
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      manifest: {
        name: 'IngatTerus — Flashcard Pintar',
        short_name: 'IngatTerus',
        description:
          'Belajar dengan flashcard dan pengulangan berjarak (FSRS). Bisa dipakai offline.',
        lang: 'id',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b1020',
        theme_color: '#4f46e5',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
})
