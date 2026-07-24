import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import InstallPrompt from './components/InstallPrompt'
import { initZoom } from './hooks/useZoom'

// Apply the saved zoom level before the first paint, so a reloaded kiosk comes
// back at the size the staff left it at instead of flashing through 100%.
initZoom()

// PWA service worker (production builds only). `immediate` claims the page on
// first load; registerType 'autoUpdate' then swaps new deploys in on reload
// without asking — a kiosk must never sit on a "refresh to update" banner.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <InstallPrompt />
    </ErrorBoundary>
  </StrictMode>,
)
