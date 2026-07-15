import { useState } from 'react'
import {
  LuArrowRight,
  LuCheck,
  LuChefHat,
  LuChevronDown,
  LuEye,
  LuEyeOff,
  LuLock,
  LuUser,
  LuUsers,
  LuUtensils,
} from 'react-icons/lu'
import CashierLoginDialog, { type Cashier } from './CashierLoginDialog'
import WaiterLoginDialog, { type Waiter } from '../waiter/WaiterLoginDialog'
import { passwordLogin } from '../../services/api/auth'
import { ApiError } from '../../services/api/client'
import { Loader } from '../../components/ui/Loader'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'km', label: 'ខ្មែរ' },
] as const

type LanguageCode = (typeof LANGUAGES)[number]['code']

function FlagIcon({ code }: { code: LanguageCode }) {
  if (code === 'km') {
    return (
      <svg viewBox="0 0 24 16" className="h-4 w-6 shrink-0 rounded-[3px]" aria-hidden>
        <rect width="24" height="16" fill="#032ea1" />
        <rect y="4" width="24" height="8" fill="#e00025" />
        <g fill="#fff">
          <path d="M12 5.2l1.1 2.3h-2.2z" />
          <path d="M9.6 6.6l.9 1.6H8.7z" />
          <path d="M14.4 6.6l.9 1.6h-1.8z" />
          <rect x="8.4" y="8.2" width="7.2" height="2.6" rx="0.4" />
        </g>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6 shrink-0 rounded-[3px]" aria-hidden>
      <rect width="24" height="16" fill="#b22234" />
      <g fill="#fff">
        {[1, 3, 5, 7, 9, 11].map((i) => (
          <rect key={i} y={i * 1.2308} width="24" height="1.2308" />
        ))}
      </g>
      <rect width="9.6" height="8.6" fill="#3c3b6e" />
    </svg>
  )
}

function LanguageSelect() {
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState<(typeof LANGUAGES)[number]>(LANGUAGES[0])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50"
      >
        <FlagIcon code={lang.code} />
        {lang.label}
        <LuChevronDown className={`h-4 w-4 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLang(l)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition hover:bg-neutral-50 ${
                l.code === lang.code ? 'text-primary' : 'text-neutral-700'
              }`}
            >
              <FlagIcon code={l.code} />
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BrandPanel() {
  return (
    <div className="relative hidden w-[46%] shrink-0 overflow-hidden bg-neutral-900 lg:block">
      {/* Fallback backdrop shown until the photo loads */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#4a3320] via-[#2a1c0f] to-[#100a04]" />
      <picture>
        <source srcSet="/images/login-bg.webp" type="image/webp" />
        <img
          src="/images/login-bg.jpg"
          alt=""
          onError={(e) => (e.currentTarget.style.display = 'none')}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/70" />

      <div className="relative z-10 flex h-full flex-col items-center px-10 pt-24 text-center">
        <div>
          <LuChefHat className="mx-auto h-14 w-14 text-white" />
          <div className="mx-auto -mt-1 flex h-10 w-[76px] items-center rounded-xl border-[3px] border-white bg-black/20 px-2.5">
            <div className="h-1.5 w-6 rounded-full bg-white/90" />
            <div className="ml-auto h-2.5 w-2.5 rounded-full bg-white/90" />
          </div>
        </div>

        <h1 className="mt-6 text-5xl font-bold tracking-tight text-white">
          Resto<span className="text-primary">POS</span>
        </h1>
        <p className="mt-4 text-lg text-white/90">Restaurant Management System</p>
        <div className="mt-7 h-1 w-16 rounded-full bg-primary" />
        <p className="mt-7 text-lg text-white/85">Smart POS for Your Restaurant</p>
      </div>
    </div>
  )
}

export default function LoginPage({
  onLogin,
  onWaiterLogin,
}: {
  onLogin?: (cashier: Cashier) => void
  onWaiterLogin?: (waiter: Waiter) => void
}) {
  const [showPassword, setShowPassword] = useState(false)
  const [cashierDialogOpen, setCashierDialogOpen] = useState(false)
  const [waiterDialogOpen, setWaiterDialogOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!username.trim() || !password) {
      setError('Please enter your username and password')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const user = await passwordLogin(username.trim(), password)
      onLogin?.({ id: String(user.id), name: user.name, role: user.role?.name })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#e9ebee] p-4 lg:p-6">
      <div className="flex min-h-[760px] w-full max-w-[1400px] overflow-hidden rounded-3xl bg-white shadow-2xl">
        <BrandPanel />

        <div className="flex flex-1 flex-col px-6 py-6 sm:px-12 lg:px-20">
          <div className="flex justify-end">
            <LanguageSelect />
          </div>

          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-10">
            <h2 className="text-center text-4xl font-bold text-neutral-900">Welcome Back!</h2>
            <p className="mt-3 text-center text-lg text-neutral-500">Please sign in to continue</p>

            <form className="mt-11 space-y-6" onSubmit={handleSignIn}>
              <div>
                <label htmlFor="username" className="mb-2.5 block font-semibold text-neutral-800">
                  Username
                </label>
                <div className="relative">
                  <LuUser className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="Enter your username"
                    className="h-14 w-full rounded-xl border border-neutral-200 bg-white pl-12 pr-4 text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary/25"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2.5 block font-semibold text-neutral-800">
                  Password
                </label>
                <div className="relative">
                  <LuLock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (error) setError('')
                    }}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="h-14 w-full rounded-xl border border-neutral-200 bg-white pl-12 pr-12 text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary/25"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 transition hover:text-neutral-600"
                  >
                    {showPassword ? <LuEyeOff className="h-5 w-5" /> : <LuEye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer select-none items-center gap-3 text-neutral-700">
                  <input type="checkbox" defaultChecked className="peer sr-only" />
                  <span className="flex h-5 w-5 items-center justify-center rounded-md border border-neutral-300 bg-white text-transparent transition peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40">
                    <LuCheck className="h-3.5 w-3.5" strokeWidth={3.5} />
                  </span>
                  Remember me
                </label>
                <a href="#" className="font-medium text-primary transition hover:text-primary-dark">
                  Forgot password?
                </a>
              </div>

              {error && (
                <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-primary text-lg font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader size="sm" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In
                    <LuArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>

              <div className="flex items-center gap-4 pt-1 text-sm text-neutral-500">
                <div className="h-px flex-1 bg-neutral-200" />
                or continue with
                <div className="h-px flex-1 bg-neutral-200" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setCashierDialogOpen(true)}
                  className="flex h-14 items-center justify-center gap-2.5 rounded-xl border border-neutral-200 bg-white font-semibold text-neutral-800 transition hover:bg-neutral-50"
                >
                  <LuUsers className="h-5 w-5" />
                  Cashier Login
                </button>
                <button
                  type="button"
                  onClick={() => setWaiterDialogOpen(true)}
                  className="flex h-14 items-center justify-center gap-2.5 rounded-xl border border-neutral-200 bg-white font-semibold text-neutral-800 transition hover:bg-neutral-50"
                >
                  <LuUtensils className="h-5 w-5" />
                  Waiter Login
                </button>
              </div>
            </form>
          </div>

          <p className="pb-2 text-center text-sm text-neutral-400">
            © {new Date().getFullYear()} RestoPOS. All rights reserved.
          </p>
        </div>
      </div>

      {cashierDialogOpen && (
        <CashierLoginDialog onClose={() => setCashierDialogOpen(false)} onLoggedIn={onLogin} />
      )}

      {waiterDialogOpen && (
        <WaiterLoginDialog onClose={() => setWaiterDialogOpen(false)} onLoggedIn={onWaiterLogin} />
      )}
    </div>
  )
}
