import { LuLoaderCircle, LuRefreshCw } from 'react-icons/lu'

/** Centered spinner used while an admin section loads. */
export function LoadingPanel({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-neutral-400">
      <LuLoaderCircle className="h-6 w-6 animate-spin" />
      {label}
    </div>
  )
}

/** Error state with a retry button. */
export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <p className="text-sm text-rose-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
      >
        <LuRefreshCw className="h-4 w-4" />
        Retry
      </button>
    </div>
  )
}
