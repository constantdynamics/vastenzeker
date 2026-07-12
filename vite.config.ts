import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Gehost op GitHub Pages onder /vastenzeker/
export default defineConfig({
  base: '/vastenzeker/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Zip Your Lip',
        short_name: 'Zip Your Lip',
        description: 'Nuchtere hulp bij intermittent fasting. Zien of je nu mag eten, en waarom volhouden loont.',
        lang: 'nl',
        start_url: '/vastenzeker/',
        scope: '/vastenzeker/',
        display: 'standalone',
        background_color: '#0b0b10',
        theme_color: '#0b0b10',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/vastenzeker/index.html',
        cleanupOutdatedCaches: true,
        // Geen runtime-caching van Supabase-API-antwoorden: een gecachet leeg
        // antwoord (bijv. van vóór de seed of zonder geldige sessie) blijft
        // anders eindeloos hangen. Offline-fallback voor tips loopt via
        // localStorage in loadTips().
      },
    }),
  ],
})
