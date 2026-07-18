import { useState } from 'react'
import { LuArrowRight, LuChefHat, LuEye, LuEyeOff, LuLock, LuUser } from 'react-icons/lu'
import { type Cashier } from './CashierLoginDialog'
import { passwordLogin } from '../../services/api/auth'
import { ApiError } from '../../services/api/client'
import { Loader } from '../../components/ui/Loader'

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

export default function LoginPage({ onLogin }: { onLogin?: (cashier: Cashier) => void }) {
  const [showPassword, setShowPassword] = useState(false)
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
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-10">
            <img
              src="/images/logo.png"
              alt="elevenone Kitchen"
              draggable={false}
              className="mx-auto h-32 w-auto select-none"
            />

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
            </form>
          </div>

          <p className="pb-2 text-center text-sm text-neutral-400">
            © {new Date().getFullYear()} RestoPOS. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
