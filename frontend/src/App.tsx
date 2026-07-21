import { useEffect, useState } from 'react'
import LoginPage from './features/auth/LoginPage'
import TableFloorPage, { type PosTable } from './features/pos/TableFloorPage'
import OrderPage from './features/pos/OrderPage'
import WaiterFloorPage from './features/waiter/WaiterFloorPage'
import WaiterOrderPage from './features/waiter/WaiterOrderPage'
import KitchenDisplayPage from './features/kitchen/KitchenDisplayPage'
import BarDisplayPage from './features/bar/BarDisplayPage'
import AdminApp from './features/admin/AdminApp'
import { fetchMe, logout as apiLogout, type ApiUser } from './services/api/auth'
import { api, getToken, setOnUnauthorized, setToken } from './services/api/client'
import { SettingsProvider } from './hooks/useSettings'
import { LoadingState } from './components/ui/Loader'
import type { Cashier } from './features/auth/CashierLoginDialog'
import type { Waiter } from './features/waiter/WaiterLoginDialog'
import type { Kitchen } from './features/kitchen/KitchenLoginDialog'
import type { Bar } from './features/bar/BarLoginDialog'

/** The admin session to return to when a register opened from the dashboard exits. */
type AdminReturn = { staff: Cashier; token: string | null }

// The return ticket is kept in localStorage, not just React state: the kitchen
// display and the tablets stay open for a whole service and get reloaded (F5,
// kiosk restart, crash). Without this, a reload rebuilds the session from /me
// with no admin attached and signing out drops to the login screen instead of
// the dashboard the station was launched from.
const ADMIN_RETURN_KEY = 'pos_admin_return'

function readAdminReturn(): AdminReturn | undefined {
  try {
    const raw = localStorage.getItem(ADMIN_RETURN_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as AdminReturn
    return parsed?.staff?.id ? parsed : undefined
  } catch {
    // Corrupted entry — treat it as no return ticket.
    return undefined
  }
}

function writeAdminReturn(admin: AdminReturn | null): void {
  if (admin) localStorage.setItem(ADMIN_RETURN_KEY, JSON.stringify(admin))
  else localStorage.removeItem(ADMIN_RETURN_KEY)
}

// Who is signed in drives which "side" of the app renders: admins get the back
// office (dashboard / reports / menu management); cashiers get the full POS
// (order → payment → receipt); waiters get the tablet flow (order → send to
// kitchen); the kitchen and the bar each get a display screen (live tickets →
// mark ready), the kitchen taking the food half of every send and the bar the
// drinks. Cashiers and waiters both start from the same table floor.
type Session =
  | { role: 'admin'; staff: Cashier; token: string | null }
  | { role: 'cashier'; staff: Cashier; admin?: AdminReturn }
  | { role: 'waiter'; staff: Waiter; admin?: AdminReturn }
  | { role: 'kitchen'; staff: Kitchen; admin?: AdminReturn }
  | { role: 'bar'; staff: Bar; admin?: AdminReturn }

// Rebuild the session LoginPage/StaffLoginDialog would have produced from a
// /me response. Routing keys off the role *slug* — display names can change.
function sessionFromUser(user: ApiUser): Session {
  const staff = { id: String(user.id), name: user.name, role: user.role?.name }
  // An admin landing here is the dashboard itself — any stale return ticket is
  // theirs and would otherwise send a later sign-out back into a dead session.
  if (user.role?.slug === 'admin') {
    writeAdminReturn(null)
    return { role: 'admin', staff, token: getToken() }
  }
  const admin = readAdminReturn()
  if (user.role?.slug === 'waiter') return { role: 'waiter', staff, admin }
  if (user.role?.slug === 'kitchen') return { role: 'kitchen', staff, admin }
  if (user.role?.slug === 'bar') return { role: 'bar', staff, admin }
  return { role: 'cashier', staff, admin }
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
      writeAdminReturn(null)
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
    writeAdminReturn(null)
    setTable(null)
    setSession(null)
  }

  // Exiting a register that was opened from the admin dashboard: revoke the
  // staff token and restore the admin session instead of signing out. api()
  // snapshots the bearer token synchronously, so the revoke goes out with the
  // staff token even though we swap back right after.
  const returnToDashboard = (admin: AdminReturn) => {
    void api('/logout', { method: 'POST' }).catch(() => {})
    writeAdminReturn(null)
    setToken(admin.token)
    setTable(null)
    setSession({ role: 'admin', staff: admin.staff, token: admin.token })
  }

  // Once signed in, the store settings (KHR rate, receipt store info)
  // are loaded once and shared with every side below.
  function renderSide(active: Session) {
    if (active.role === 'admin') {
      const adminReturn: AdminReturn = { staff: active.staff, token: active.token }
      // Remember the ticket before handing the app over, so a reload on the
      // station still knows which dashboard to come back to.
      const launch = <T,>(handler: (staff: T) => void) => (staff: T) => {
        writeAdminReturn(adminReturn)
        handler(staff)
      }
      return (
        <AdminApp
          admin={active.staff}
          onLogout={logout}
          // PIN login on the POS session gate: staffLogin already swapped the
          // bearer token to the cashier, so the whole app follows them onto
          // the cashier side (table floor → order → payment). The launching
          // admin rides along so Reload/Lock/Close can land back on the
          // dashboard instead of the login screen.
          onCashierLogin={launch((cashier: Cashier) =>
            setSession({ role: 'cashier', staff: cashier, admin: adminReturn }),
          )}
          onWaiterLogin={launch((waiter: Waiter) =>
            setSession({ role: 'waiter', staff: waiter, admin: adminReturn }),
          )}
          onKitchenLogin={launch((kitchen: Kitchen) =>
            setSession({ role: 'kitchen', staff: kitchen, admin: adminReturn }),
          )}
          onBarLogin={launch((bar: Bar) =>
            setSession({ role: 'bar', staff: bar, admin: adminReturn }),
          )}
        />
      )
    }

    // Staff who signed in directly from the login page just log out as before;
    // sessions launched from the admin dashboard return there instead.
    const adminReturn = active.admin
    const exitRegister = adminReturn ? () => returnToDashboard(adminReturn) : logout

    if (active.role === 'kitchen') {
      return <KitchenDisplayPage staff={active.staff} onLogout={exitRegister} />
    }

    if (active.role === 'bar') {
      return <BarDisplayPage staff={active.staff} onLogout={exitRegister} />
    }

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
