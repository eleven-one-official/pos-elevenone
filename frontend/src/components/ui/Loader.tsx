// The app's loading system. One branded three-dot animation (defined as the
// `.loader` class in index.css) drives every "waiting" state so they all look
// and behave the same. The dots inherit the current text colour, so the same
// component works on light panels, dark toolbars and coloured buttons — pick
// the colour with a text-* class on the element (or its parent).
//
//   <Loader />          bare animation — inline in buttons, chips, small labels
//   <LoadingState />    centered block + optional caption for a whole page or
//                       section while its data loads
//   <LoadingOverlay />  translucent scrim over the nearest positioned parent,
//                       for blocking a panel while an action finishes

type LoaderSize = 'sm' | 'md' | 'lg'

// Width drives the whole mark; the height follows from the CSS aspect ratio.
const SIZE: Record<LoaderSize, string> = {
  sm: 'w-7', // inline: buttons and labels
  md: 'w-12', // dialogs and medium panels
  lg: 'w-16', // full page / section
}

export function Loader({
  size = 'md',
  className = '',
}: {
  size?: LoaderSize
  className?: string
}) {
  return <span role="status" aria-label="Loading" className={`loader ${SIZE[size]} ${className}`} />
}

/** Centered loader with an optional caption — a page or section placeholder. */
export function LoadingState({
  label,
  size = 'lg',
  className = '',
}: {
  label?: string
  size?: LoaderSize
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-neutral-400 ${className}`}>
      <Loader size={size} />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

/** Covers its nearest positioned ancestor with a scrim while work completes. */
export function LoadingOverlay({ label }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
      <LoadingState label={label} />
    </div>
  )
}
