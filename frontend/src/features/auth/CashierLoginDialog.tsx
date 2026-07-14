import { useEffect, useState } from 'react'
import { LuArrowLeft, LuArrowRight, LuEye, LuEyeOff, LuLock, LuX } from 'react-icons/lu'

export type Cashier = {
  id: string
  name: string
  role?: string
}

// Placeholder roster — replace with data fetched from the backend once the API is wired.
const CASHIERS: Cashier[] = [
  { id: '1', name: 'Sok Dara', role: 'Cashier' },
  { id: '2', name: 'Chan Sreymom', role: 'Cashier' },
  { id: '3', name: 'Kim Panha', role: 'Senior Cashier' },
]

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function CashierLoginDialog({
  onClose,
  onLoggedIn,
}: {
  onClose: () => void
  onLoggedIn?: (cashier: Cashier) => void
}) {
  const [selected, setSelected] = useState<Cashier | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  // Close on Escape (backs out of the password step first).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (selected) setSelected(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, onClose])

  function chooseCashier(cashier: Cashier) {
    setSelected(cashier)
    setPassword('')
    setError('')
    setShowPassword(false)
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    if (!password.trim()) {
      setError('Please enter your password')
      return
    }
    // TODO: verify the cashier's password against the backend once the API exists.
    setError('')
    onLoggedIn?.(selected)
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
                {selected ? 'Enter Password' : 'Cashier Login'}
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

        {/* Step 1: select cashier */}
        {!selected && (
          <>
            <div className="flex flex-col gap-2 overflow-y-auto px-6 py-5">
              {CASHIERS.map((cashier) => (
                <button
                  key={cashier.id}
                  type="button"
                  onClick={() => chooseCashier(cashier)}
                  className="group flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-primary hover:bg-primary/[0.03]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600 transition group-hover:bg-primary/10 group-hover:text-primary">
                    {initials(cashier.name)}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-neutral-900">{cashier.name}</span>
                    {cashier.role && <span className="block text-xs text-neutral-400">{cashier.role}</span>}
                  </span>
                  <LuArrowRight className="h-4.5 w-4.5 text-neutral-300 transition group-hover:text-primary" />
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2: enter password */}
        {selected && (
          <form onSubmit={handleLogin} className="px-6 py-7">
            <div className="flex flex-col items-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-xl font-semibold text-neutral-600">
                {initials(selected.name)}
              </span>
              <p className="mt-3 text-base font-semibold text-neutral-900">{selected.name}</p>
              {selected.role && <p className="text-sm text-neutral-500">{selected.role}</p>}
            </div>

            <div className="mt-7">
              <label htmlFor="cashier-password" className="mb-2 block text-sm font-semibold text-neutral-800">
                Password
              </label>
              <div className="relative">
                <LuLock className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-neutral-400" />
                <input
                  id="cashier-password"
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError('')
                  }}
                  placeholder="Enter your password"
                  className={`h-12 w-full rounded-lg border bg-neutral-50 pl-11 pr-11 text-sm text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:bg-white focus:ring-2 ${
                    error
                      ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-400/15'
                      : 'border-neutral-200 focus:border-primary focus:ring-primary/15'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 transition hover:text-neutral-600"
                >
                  {showPassword ? <LuEyeOff className="h-4.5 w-4.5" /> : <LuEye className="h-4.5 w-4.5" />}
                </button>
              </div>
              {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
            </div>

            <button
              type="submit"
              className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-white transition hover:bg-primary-dark active:scale-[0.99]"
            >
              Login
              <LuArrowRight className="h-4.5 w-4.5" />
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
