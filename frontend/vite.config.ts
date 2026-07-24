import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable PWA: staff tablets/tills add the app to their home screen and
    // it opens full-screen (no browser chrome). The service worker only
    // precaches the built shell (js/css/html/icons) and auto-updates on deploy;
    // API calls live on another origin and are never cached — a POS must always
    // show live data. Disabled in dev (devOptions off) so Vite HMR stays
    // untouched and no stale-SW bundle can shadow a rebuild.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ElevenOne POS',
        short_name: 'ElevenOne',
        description: 'Point of sale for ElevenOne Kitchen',
        start_url: '/',
        display: 'standalone',
        theme_color: '#f97316',
        background_color: '#ffffff',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The main bundle (exceljs/jspdf inside) can pass workbox's 2 MiB
        // default; raise the cap so the shell still precaches whole.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  // Pin a dedicated port so the URL is deterministic: the kiosk-printing
  // launcher (pos-print-kiosk.bat) and the tablets always hit the same address.
  // strictPort makes Vite fail loudly on a conflict instead of silently drifting
  // to 5174+ (the sibling BYD project tends to take 5173).
  server: {
    port: 5180,
    strictPort: true,
    host: true, // also reachable from the waiter tablets on the LAN
  },
})
