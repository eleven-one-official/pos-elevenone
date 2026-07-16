import { useState } from 'react'
import LoginPage from './features/auth/LoginPage'
import TableFloorPage, { type PosTable } from './features/pos/TableFloorPage'
import OrderPage from './features/pos/OrderPage'
import WaiterFloorPage from './features/waiter/WaiterFloorPage'
import WaiterOrderPage from './features/waiter/WaiterOrderPage'
import AdminApp from './features/admin/AdminApp'
import { logout as apiLogout } from './services/api/auth'
import { api, getToken, setToken } from './services/api/client'
import { SettingsProvider } from './hooks/useSettings'
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

  if (!session) {
    return (
      <LoginPage
        onLogin={(user) =>
          // The username/password form is shared by admins and cashiers; the
          // backend role decides which side they land on. The admin's token is
          // kept on the session so it can be restored after a register opened
          // from the dashboard closes.
          setSession(
            user.role?.toLowerCase() === 'admin'
              ? { role: 'admin', staff: user, token: getToken() }
              : { role: 'cashier', staff: user },
          )
        }
        onWaiterLogin={(waiter) => setSession({ role: 'waiter', staff: waiter })}
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
