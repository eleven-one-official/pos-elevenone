import { useSyncExternalStore } from 'react'

// UI zoom — the whole app scales like a browser zoom, driven from the header of
// every side. The venue runs the POS on very different screens (a 24" cashier
// monitor, a 10" waiter tablet, a wall-mounted kitchen display); one fixed
// layout is either cramped or wasteful, so the staff nudge the scale themselves.
//
// The scale lives in a CSS variable on <html>; index.css turns it into a real
// `zoom` (and rewrites the h-screen utilities, since viewport units ignore
// zoom). Keeping it here — outside React — means the level is applied on the
// very first paint after a reload, before any component mounts, so a kiosk
// restart doesn't flash back to 100%.

const STORAGE_KEY = 'pos_ui_zoom'

/** Selectable levels, smallest first. Chrome-like steps, clamped to what stays usable. */
export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const

const DEFAULT_ZOOM = 1

function clampToStep(value: number): number {
  // Snap to the nearest offered step so a hand-edited / stale stored value can
  // never leave the buttons stuck between levels.
  return ZOOM_STEPS.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best,
  )
}

function readStored(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? clampToStep(parsed) : DEFAULT_ZOOM
  } catch {
    return DEFAULT_ZOOM
  }
}

let zoom = readStored()
const listeners = new Set<() => void>()

function paint(): void {
  document.documentElement.style.setProperty('--ui-zoom', String(zoom))
}

function setZoom(next: number): void {
  const value = clampToStep(next)
  if (value === zoom) return
  zoom = value
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // Private mode / full storage — the level still applies for this session.
  }
  paint()
  listeners.forEach((fn) => fn())
}

/** Apply the stored level to the document. Called once from main.tsx, pre-render. */
export function initZoom(): void {
  paint()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function getSnapshot(): number {
  return zoom
}

export type ZoomControls = {
  zoom: number
  /** 0.8 → "80%" — what the header shows between the two buttons. */
  label: string
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
  canZoomIn: boolean
  canZoomOut: boolean
}

export function useZoom(): ZoomControls {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const index = ZOOM_STEPS.indexOf(value as (typeof ZOOM_STEPS)[number])

  return {
    zoom: value,
    label: `${Math.round(value * 100)}%`,
    zoomIn: () => setZoom(ZOOM_STEPS[Math.min(index + 1, ZOOM_STEPS.length - 1)]),
    zoomOut: () => setZoom(ZOOM_STEPS[Math.max(index - 1, 0)]),
    reset: () => setZoom(DEFAULT_ZOOM),
    canZoomIn: index < ZOOM_STEPS.length - 1,
    canZoomOut: index > 0,
  }
}
