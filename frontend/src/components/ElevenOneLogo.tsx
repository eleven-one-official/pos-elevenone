import { useState } from 'react'

/**
 * elevenone Kitchen brand logo.
 *
 * Artwork lives at `frontend/public/images/logo.png` (transparent PNG or SVG).
 * `tone="light"` targets dark headers — the logo sits on a white plate so the
 * dark wordmark stays legible; `tone="dark"` targets light headers and renders
 * the logo directly. If the image is missing it falls back to the text wordmark
 * so nothing looks broken before the asset is added.
 */
export default function ElevenOneLogo({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const [failed, setFailed] = useState(false)

  if (!failed) {
    const img = (
      <img
      
        src="/images/logo.png"
        alt="elevenone Kitchen"
        draggable={false}
        onError={() => setFailed(true)}
        className="h-9 w-auto select-none"
      />
    )
    return tone === 'light' ? (
      <div className="flex select-none items-center rounded-lg bg-white px-2.5 py-1 shadow-sm">{img}</div>
    ) : (
      <div className="flex select-none items-center">{img}</div>
    )
  }

  // Fallback wordmark — shown only until the logo image is dropped into place.
  return (
    <div className="flex select-none items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-black text-white shadow-sm">
        11
      </span>
      <span
        className={`text-2xl font-bold tracking-tight ${tone === 'dark' ? 'text-neutral-800' : 'text-white'}`}
      >
        eleven<span className="text-primary">one</span>
      </span>
    </div>
  )
}
