import { useEffect, useState } from 'react'
import LoginPage from './features/auth/LoginPage'
import TableFloorPage, { type PosTable } from './features/pos/TableFloorPage'
import OrderPage from './features/pos/OrderPage'
import WaiterFloorPage from './features/waiter/WaiterFloorPage'
import WaiterOrderPage from './features/waiter/WaiterOrderPage'
import AdminApp from './features/admin/AdminApp'
import { fetchMe, logout as apiLogout, type ApiUser } from './services/api/auth'
import { api, getToken, setOnUnauthorized, setToken } from './services/api/client'
import { SettingsProvider } from './hooks/useSettings'
import { LoadingState } from './components/ui/Loader'
import type { Cashier } from './features/auth/CashierLoginDialog'
import type { Waiter } from './features/waiter/WaiterLoginDialog'

/** The admin session to return to when a register opened from the dashboard exits. */
type AdminReturn = { staff: Cashier; token: string | null }

// Who is signed in drives which "side" of the app renders: admins get the back
// office (dashboard / reports / menu management); cashiers get the full POS
// (order → payment → receipt); waiters get the tablet flow (order → send to
// kitchen). Cashiers and waiters both start from the same table floor.
type Session =
  | { role: 'admin'; staff: Cashier; token: string | null }
  | { role: 'cashier'; staff: Cashier; admin?: AdminReturn }
  | { role: 'waiter'; staff: Waiter; admin?: AdminReturn }

// Rebuild the session LoginPage/StaffLoginDialog would have produced from a
// /me response. Routing keys off the role *slug* — display names can change.
function sessionFromUser(user: ApiUser): Session {
  const staff = { id: String(user.id), name: user.name, role: user.role?.name }
  if (user.role?.slug === 'admin') return { role: 'admin', staff, token: getToken() }
  if (user.role?.slug === 'waiter') return { role: 'waiter', staff }
  return { role: 'cashier', staff }
}

export default function App() {
  // Dev-only: `?admin-preview` boots straight into the admin side with a fake
  // session so the back-office UI can be iterated on (and screenshotted)
  // without credentials. Compiled out of production builds.
  const [session, setSession] = useState<Session | null>(() =>
    import.meta.env.DEV && new URLSearchParams(window.location.search).has('admin-preview')
      ? { role: 'admin', staff: { id: 'preview', name: 'Srun Soklim', role: 'Admin' }, token: getToken() }
      : null,
  )
  const [table, setTable] = useState<PosTable | null>(null)
  // A message shown on the login screen after a forced sign-out (expired token).
  const [notice, setNotice] = useState<string | null>(null)
  // A stored token survives a browser refresh even though React state doesn't —
  // rebuild the session from /me instead of dumping staff on the login screen.
  const [restoring, setRestoring] = useState(() => session == null && getToken() != null)

  useEffect(() => {
    if (!restoring) return
    let cancelled = false
    fetchMe()
      .then((user) => {
        if (!cancelled) setSession(sessionFromUser(user))
      })
      .catch(() => {
        // Dead token (a 401 already cleared it) or server unreachable — the
        // login screen is the right place either way.
      })
      .finally(() => {
        if (!cancelled) setRestoring(false)
      })
    return () => {
      cancelled = true
    }
  }, [restoring])

  // Any 401 means the token expired or was revoked server-side: end the
  // session cleanly rather than leaving every screen stuck on failing retries.
  useEffect(() => {
    setOnUnauthorized(() => {
      setTable(null)
      setSession(null)
      setNotice('Your session expired — please sign in again.')
    })
    return () => setOnUnauthorized(null)
  }, [])

  if (restoring) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f3f4f6] text-primary">
        <LoadingState label="Signing back in…" />
      </div>
    )
  }

  if (!session) {
    return (
      <LoginPage
        notice={notice}
        onLogin={(user) => {
          setNotice(null)
          // The username/password form is shared by admins and cashiers; the
          // backend role decides which side they land on — keyed on the role
          // slug (stable), not the display name (renamable). The admin's token
          // is kept on the session so it can be restored after a register
          // opened from the dashboard closes.
          setSession(
            user.slug === 'admin'
              ? { role: 'admin', staff: user, token: getToken() }
              : { role: 'cashier', staff: user },
          )
        }}
      />
    )
  }

  const logout = () => {
    // Revoke the token server-side; the local session ends regardless.
    void apiLogout().catch(() => {})
    setTable(null)
    setSession(null)
  }

  // Exiting a register that was opened from the admin dashboard: revoke the
  // staff token and restore the admin session instead of signing out. api()
  // snapshots the bearer token synchronously, so the revoke goes out with the
  // staff token even though we swap back right after.
  const returnToDashboard = (admin: AdminReturn) => {
    void api('/logout', { method: 'POST' }).catch(() => {})
    setToken(admin.token)
    setTable(null)
    setSession({ role: 'admin', staff: admin.staff, token: admin.token })
  }

  // Once signed in, the store settings (KHR rate, receipt store info)
  // are loaded once and shared with every side below.
  function renderSide(active: Session) {
    if (active.role === 'admin') {
      const adminReturn: AdminReturn = { staff: active.staff, token: active.token }
      return (
        <AdminApp
          admin={active.staff}
          onLogout={logout}
          // PIN login on the POS session gate: staffLogin already swapped the
          // bearer token to the cashier, so the whole app follows them onto
          // the cashier side (table floor → order → payment). The launching
          // admin rides along so Reload/Lock/Close can land back on the
          // dashboard instead of the login screen.
          onCashierLogin={(cashier) =>
            setSession({ role: 'cashier', staff: cashier, admin: adminReturn })
          }
          onWaiterLogin={(waiter) =>
            setSession({ role: 'waiter', staff: waiter, admin: adminReturn })
          }
        />
      )
    }

    // Staff who signed in directly from the login page just log out as before;
    // sessions launched from the admin dashboard return there instead.
    const adminReturn = active.admin
    const exitRegister = adminReturn ? () => returnToDashboard(adminReturn) : logout

    if (active.role === 'waiter') {
      if (!table) {
        return (
          <WaiterFloorPage waiter={active.staff} onSelectTable={setTable} onLogout={exitRegister} />
        )
      }
      return <WaiterOrderPage waiter={active.staff} table={table} onBack={() => setTable(null)} />
    }

    if (!table) {
      return <TableFloorPage cashier={active.staff} onSelectTable={setTable} onLogout={exitRegister} />
    }

    return <OrderPage cashier={active.staff} table={table} onBack={() => setTable(null)} />
  }

  return <SettingsProvider>{renderSide(session)}</SettingsProvider>
}
