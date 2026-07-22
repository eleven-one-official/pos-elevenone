import { useEffect, useRef, useState } from 'react'
import {
  LuCalendar,
  LuCheck,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronUp,
} from 'react-icons/lu'

// ---------------------------------------------------------------------------
// Odoo-style datetime field. The native <input type="datetime-local"> renders
// differently per browser, hides seconds, and breaks the Odoo look the admin
// deliberately mimics. This is a read-only text field showing
// "22-Jul-2026 15:32:36" that opens a popover with a calendar view and an
// HH:MM:SS time spinner — matching Odoo's tempus-dominus picker.
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** Odoo header label, e.g. "22-Jul-2026 15:32:36". */
export function formatDateTime(d: Date): string {
  const month = d.toLocaleString('en-GB', { month: 'short' })
  return `${pad(d.getDate())}-${month}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Immutable copy of `d` with one field replaced. */
function withField(d: Date, field: 'y' | 'm' | 'd' | 'h' | 'min' | 's', value: number): Date {
  const next = new Date(d)
  if (field === 'y') next.setFullYear(value)
  else if (field === 'm') next.setMonth(value)
  else if (field === 'd') next.setDate(value)
  else if (field === 'h') next.setHours(value)
  else if (field === 'min') next.setMinutes(value)
  else next.setSeconds(value)
  return next
}

/** Wrap `value` into [0, max) — spinners roll over like Odoo's. */
const wrap = (value: number, max: number) => ((value % max) + max) % max

function Spinner({
  value,
  max,
  onChange,
}: {
  value: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label="Increment"
        onClick={() => onChange(wrap(value + 1, max))}
        className="text-neutral-400 transition hover:text-neutral-700"
      >
        <LuChevronUp className="h-5 w-5" />
      </button>
      <span className="w-9 text-center text-xl font-semibold text-neutral-800 tabular-nums">
        {pad(value)}
      </span>
      <button
        type="button"
        aria-label="Decrement"
        onClick={() => onChange(wrap(value - 1, max))}
        className="text-neutral-400 transition hover:text-neutral-700"
      >
        <LuChevronDown className="h-5 w-5" />
      </button>
    </div>
  )
}

export function DateTimeField({
  id,
  value,
  onChange,
  className = '',
}: {
  id?: string
  value: Date
  onChange: (d: Date) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'date' | 'time'>('date')
  // The calendar can be paged month-to-month without touching the selection.
  const [viewYear, setViewYear] = useState(value.getFullYear())
  const [viewMonth, setViewMonth] = useState(value.getMonth())
  const rootRef = useRef<HTMLSpanElement>(null)

  // Fresh popover each open: start on the calendar, focused on the current month.
  useEffect(() => {
    if (!open) return
    setMode('date')
    setViewYear(value.getFullYear())
    setViewMonth(value.getMonth())
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const shiftMonth = (delta: number) => {
    const m = viewMonth + delta
    setViewYear(viewYear + Math.floor(m / 12))
    setViewMonth(wrap(m, 12))
  }

  // 6×7 grid: the selected month plus leading/trailing spillover days.
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const cells = Array.from(
    { length: 42 },
    (_, i) => new Date(viewYear, viewMonth, 1 - firstWeekday + i),
  )
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  const pickDay = (day: Date) => {
    onChange(withField(withField(withField(value, 'y', day.getFullYear()), 'm', day.getMonth()), 'd', day.getDate()))
    setMode('time')
  }

  return (
    <span ref={rootRef} className="relative block">
      <input
        id={id}
        type="text"
        readOnly
        value={formatDateTime(value)}
        onClick={() => setOpen((o) => !o)}
        className={`cursor-pointer ${className}`}
      />

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[260px] rounded-[3px] border border-neutral-200 bg-white p-2 shadow-[0_6px_24px_rgba(0,0,0,0.18)]">
          {/* Header — switch between calendar and time, then confirm. */}
          <div className="mb-2 flex items-center justify-around border-b border-neutral-100 pb-2">
            <button
              type="button"
              aria-label="Pick date"
              onClick={() => setMode('date')}
              className={`rounded p-1.5 transition hover:bg-neutral-100 ${
                mode === 'date' ? 'text-sky-700' : 'text-neutral-500'
              }`}
            >
              <LuCalendar className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Confirm"
              onClick={() => (mode === 'date' ? setMode('time') : setOpen(false))}
              className="rounded p-1.5 text-sky-700 transition hover:bg-neutral-100"
            >
              <LuCheck className="h-5 w-5" />
            </button>
          </div>

          {mode === 'date' ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => shiftMonth(-1)}
                  className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
                >
                  <LuChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[13px] font-semibold text-neutral-800">{monthLabel}</span>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => shiftMonth(1)}
                  className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
                >
                  <LuChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-neutral-400">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="py-1">
                    {w}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 text-center text-[13px]">
                {cells.map((day) => {
                  const inMonth = day.getMonth() === viewMonth
                  const selected =
                    day.getFullYear() === value.getFullYear() &&
                    day.getMonth() === value.getMonth() &&
                    day.getDate() === value.getDate()
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => pickDay(day)}
                      className={`aspect-square rounded-full transition ${
                        selected
                          ? 'bg-sky-600 font-semibold text-white'
                          : inMonth
                            ? 'text-neutral-800 hover:bg-neutral-100'
                            : 'text-neutral-300 hover:bg-neutral-100'
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1 py-3">
              <Spinner
                value={value.getHours()}
                max={24}
                onChange={(h) => onChange(withField(value, 'h', h))}
              />
              <span className="pb-0.5 text-xl font-semibold text-neutral-400">:</span>
              <Spinner
                value={value.getMinutes()}
                max={60}
                onChange={(m) => onChange(withField(value, 'min', m))}
              />
              <span className="pb-0.5 text-xl font-semibold text-neutral-400">:</span>
              <Spinner
                value={value.getSeconds()}
                max={60}
                onChange={(s) => onChange(withField(value, 's', s))}
              />
            </div>
          )}
        </div>
      )}
    </span>
  )
}
