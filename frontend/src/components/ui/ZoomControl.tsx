import { LuZoomIn, LuZoomOut } from 'react-icons/lu'
import { useZoom } from '../../hooks/useZoom'

// The header's zoom pill: [ − ] 100% [ + ]. Tapping the percentage puts the
// screen back to 100%, so staff who zoomed themselves into a corner have one
// obvious way out. Two tones because the app's headers come in both flavours:
// dark bars (floor, payment, admin) and white bars (order, kitchen/bar display).

const TONE = {
  dark: {
    wrap: 'bg-white/10',
    button: 'text-white/85 hover:bg-white/15 hover:text-white disabled:text-white/30',
    label: 'text-white/90 hover:bg-white/15',
  },
  light: {
    wrap: 'bg-neutral-100',
    button: 'text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 disabled:text-neutral-300',
    label: 'text-neutral-700 hover:bg-neutral-200',
  },
} as const

const SIZE = {
  sm: { button: 'h-7 w-7', icon: 'h-4 w-4', label: 'min-w-11 text-[11px]' },
  md: { button: 'h-9 w-9', icon: 'h-[18px] w-[18px]', label: 'min-w-12 text-xs' },
} as const

export default function ZoomControl({
  tone = 'light',
  size = 'md',
  className = '',
}: {
  tone?: keyof typeof TONE
  size?: keyof typeof SIZE
  className?: string
}) {
  const { label, zoomIn, zoomOut, reset, canZoomIn, canZoomOut } = useZoom()
  const t = TONE[tone]
  const s = SIZE[size]

  return (
    <div className={`flex shrink-0 items-center gap-0.5 rounded-lg p-0.5 ${t.wrap} ${className}`}>
      <button
        type="button"
        onClick={zoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
        className={`flex items-center justify-center rounded-md transition disabled:cursor-default disabled:hover:bg-transparent ${s.button} ${t.button}`}
      >
        <LuZoomOut className={s.icon} />
      </button>

      <button
        type="button"
        onClick={reset}
        aria-label={`Zoom ${label} — reset to 100%`}
        title="Reset zoom"
        className={`rounded-md px-1 py-1 text-center font-semibold tabular-nums transition ${s.label} ${t.label}`}
      >
        {label}
      </button>

      <button
        type="button"
        onClick={zoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
        title="Zoom in"
        className={`flex items-center justify-center rounded-md transition disabled:cursor-default disabled:hover:bg-transparent ${s.button} ${t.button}`}
      >
        <LuZoomIn className={s.icon} />
      </button>
    </div>
  )
}
