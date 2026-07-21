import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { initZoom } from './hooks/useZoom'

// Apply the saved zoom level before the first paint, so a reloaded kiosk comes
// back at the size the staff left it at instead of flashing through 100%.
initZoom()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
