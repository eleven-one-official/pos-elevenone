import { LuCheck } from 'react-icons/lu'

// Centre-screen confirmation popup. A waiter holding the tablet at arm's length
// looks at the middle of the screen, not a pill tucked into a corner, so the
// "sent to the kitchen" acknowledgement lands where their eyes already are.
//
// It never takes pointer events: the toast auto-dismisses and the next order
// can be started the instant it appears, so it must not swallow a tap.
export default function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-6"
    >
      <div className="toast-pop flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-white/95 px-8 py-8 text-center shadow-[0_24px_60px_-12px_rgba(24,16,40,0.35)] ring-1 ring-black/5 backdrop-blur-sm">
        <span className="toast-badge flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_0_10px_rgba(16,185,129,0.14)]">
          <LuCheck className="h-9 w-9" strokeWidth={3} />
        </span>
        <p className="text-lg font-bold leading-snug text-neutral-900">{message}</p>
      </div>
    </div>
  )
}
