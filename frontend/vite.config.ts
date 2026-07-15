import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
