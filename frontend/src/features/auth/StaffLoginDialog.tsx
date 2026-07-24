import { useEffect, useState } from 'react'
import {
  LuArrowLeft,
  LuArrowRight,
  LuDelete,
  LuEye,
  LuEyeOff,
  LuLock,
  LuRefreshCw,
  LuX,
} from 'react-icons/lu'
import { fetchStaffRoster, loginErrorMessage, staffLogin, type StaffMember } from '../../services/api/auth'
import { Loader, LoadingState } from '../../components/ui/Loader'

// Tap-a-name login used by both the cashier station and the waiter tablets.
// The roster comes from GET /staff?role=…; members with a PIN get a keypad
// step, while PIN-less members (waiters) sign in the moment they're tapped.
// POST /staff-login verifies and stores the bearer token for later API calls.

/** What the caller receives once the PIN checks out. */
export type StaffSession = {
  id: string
  name: string
  role?: string
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function StaffLoginDialog({
  role,
  heading,
  onClose,
  onLoggedIn,
}: {
  role: 'waiter' | 'cashier' | 'kitchen' | 'bar'
  heading: string
  onClose: () => void
  onLoggedIn?: (staff: StaffSession) => void
}) {
  const [roster, setRoster] = useState<StaffMember[] | null>(null)
  const [rosterError, setRosterError] = useState('')
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const [tappingId, setTappingId] = useState<number | null>(null)
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Load the tappable roster for this role.
  async function loadRoster() {
    setRosterError('')
    setRoster(null)
    try {
      setRoster(await fetchStaffRoster(role))
    } catch (e) {
      setRosterError(e instanceof Error ? e.message : 'Failed to load staff.')
    }
  }

  useEffect(() => {
    void loadRoster()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  // Close on Escape (backs out of the PIN step first).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (selected) setSelected(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, onClose])

  async function chooseStaff(member: StaffMember) {
    // PIN-less members (waiters) sign in the moment they're tapped.
    if (!member.requires_pin) {
      if (submitting) return
      setTappingId(member.id)
      setSubmitting(true)
      setError('')
      try {
        const user = await staffLogin(member.id)
        onLoggedIn?.({
          id: String(user.id),
          name: user.name,
          role: user.role?.name ?? member.role_name ?? undefined,
        })
      } catch (err) {
        setError(loginErrorMessage(err))
        setSubmitting(false)
        setTappingId(null)
      }
      return
    }
    setSelected(member)
    setPin('')
    setError('')
    setShowPin(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || submitting) return
    if (!pin.trim()) {
      setError('Please enter your PIN')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const user = await staffLogin(selected.id, pin)
      onLoggedIn?.({
        id: String(user.id),
        name: user.name,
        role: user.role?.name ?? selected.role_name ?? undefined,
      })
    } catch (err) {
      setError(loginErrorMessage(err))
      setSubmitting(false)
    }
  }

  // On-screen keypad — staff tap digits on the touchscreen rather than using a
  // physical keyboard.
  function pressDigit(digit: string) {
    setPin((prev) => prev + digit)
    if (error) setError('')
  }

  function backspace() {
    setPin((prev) => prev.slice(0, -1))
    if (error) setError('')
  }

  function clearPin() {
    setPin('')
    if (error) setError('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
          <div className="flex items-center gap-3">
            {selected && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Back"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
              >
                <LuArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <h3 className="text-lg font-semibold text-neutral-900">
                {selected ? 'Enter PIN' : heading}
              </h3>
              <p className="text-sm text-neutral-500">
                {selected ? `Signing in as ${selected.name}` : 'Select your name to continue'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        {/* Step 1: select staff */}
        {!selected && (
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-6 py-5">
            {roster === null && !rosterError && (
              <LoadingState label="Loading staff…" size="md" className="py-8" />
            )}

            {rosterError && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm text-rose-500">{rosterError}</p>
                <button
                  type="button"
                  onClick={() => void loadRoster()}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
                >
                  <LuRefreshCw className="h-4 w-4" />
                  Retry
                </button>
              </div>
            )}

            {roster?.length === 0 && (
              <p className="py-8 text-center text-sm text-neutral-400">
                No {role} accounts with a PIN yet.
              </p>
            )}

            {roster?.map((member) => (
              <button
                key={member.id}
                type="button"
                disabled={submitting}
                onClick={() => void chooseStaff(member)}
                className="group flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-primary hover:bg-primary/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600 transition group-hover:bg-primary/10 group-hover:text-primary">
                  {initials(member.name)}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-neutral-900">{member.name}</span>
                  {member.role_name && (
                    <span className="block text-xs text-neutral-400">{member.role_name}</span>
                  )}
                </span>
                {submitting && tappingId === member.id ? (
                  <Loader size="sm" />
                ) : (
                  <LuArrowRight className="h-4.5 w-4.5 text-neutral-300 transition group-hover:text-primary" />
                )}
              </button>
            ))}

            {error && <p className="text-center text-sm text-rose-500">{error}</p>}
          </div>
        )}

        {/* Step 2: enter PIN */}
        {selected && (
          <form onSubmit={handleLogin} className="min-h-0 overflow-y-auto px-6 py-7">
            <div className="flex flex-col items-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-base font-semibold text-neutral-600">
                {initials(selected.name)}
              </span>
              <p className="mt-2 text-sm font-semibold text-neutral-900">{selected.name}</p>
              {selected.role_name && <p className="text-xs text-neutral-500">{selected.role_name}</p>}
            </div>

            <div className="mt-7">
              <label htmlFor="staff-pin" className="mb-2 block text-sm font-semibold text-neutral-800">
                PIN
              </label>
              <div className="relative">
                <LuLock className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-neutral-400" />
                <input
                  id="staff-pin"
                  type={showPin ? 'text' : 'password'}
                  autoFocus
                  inputMode="none"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value)
                    if (error) setError('')
                  }}
                  placeholder="Enter your PIN"
                  className={`h-12 w-full rounded-lg border bg-neutral-50 pl-11 pr-11 text-sm text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:bg-white focus:ring-2 ${
                    error
                      ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-400/15'
                      : 'border-neutral-200 focus:border-primary focus:ring-primary/15'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 transition hover:text-neutral-600"
                >
                  {showPin ? <LuEyeOff className="h-4.5 w-4.5" /> : <LuEye className="h-4.5 w-4.5" />}
                </button>
              </div>
              {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
            </div>

            {/* On-screen numeric keypad for touchscreen use */}
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => pressDigit(digit)}
                  className="flex h-14 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-xl font-semibold text-neutral-800 transition hover:border-primary hover:bg-primary/[0.04] active:scale-95"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={clearPin}
                className="flex h-14 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-sm font-semibold text-neutral-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-500 active:scale-95"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => pressDigit('0')}
                className="flex h-14 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-xl font-semibold text-neutral-800 transition hover:border-primary hover:bg-primary/[0.04] active:scale-95"
              >
                0
              </button>
              <button
                type="button"
                onClick={backspace}
                aria-label="Backspace"
                className="flex h-14 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-600 transition hover:border-primary hover:bg-primary/[0.04] active:scale-95"
              >
                <LuDelete className="h-6 w-6" />
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-white transition hover:bg-primary-dark active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader size="sm" />
                  Signing in…
                </>
              ) : (
                <>
                  Login
                  <LuArrowRight className="h-4.5 w-4.5" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
