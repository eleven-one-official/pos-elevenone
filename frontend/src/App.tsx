import { useState } from 'react'
import LoginPage from './features/auth/LoginPage'
import TableFloorPage, { type PosTable } from './features/pos/TableFloorPage'
import OrderPage from './features/pos/OrderPage'
import WaiterFloorPage from './features/waiter/WaiterFloorPage'
import WaiterOrderPage from './features/waiter/WaiterOrderPage'
import AdminApp from './features/admin/AdminApp'
import { logout as apiLogout } from './services/api/auth'
import { SettingsProvider } from './hooks/useSettings'
import type { Cashier } from './features/auth/CashierLoginDialog'
import type { Waiter } from './features/waiter/WaiterLoginDialog'

// Who is signed in drives which "side" of the app renders: admins get the back
// office (dashboard / reports / menu management); cashiers get the full POS
// (order → payment → receipt); waiters get the tablet flow (order → send to
// kitchen). Cashiers and waiters both start from the same table floor.
type Session =
  | { role: 'admin'; staff: Cashier }
  | { role: 'cashier'; staff: Cashier }
  | { role: 'waiter'; staff: Waiter }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [table, setTable] = useState<PosTable | null>(null)

  if (!session) {
    return (
      <LoginPage
        onLogin={(user) =>
          // The username/password form is shared by admins and cashiers; the
          // backend role decides which side they land on.
          setSession(
            user.role?.toLowerCase() === 'admin'
              ? { role: 'admin', staff: user }
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

  // Once signed in, the store settings (KHR rate, receipt store info)
  // are loaded once and shared with every side below.
  function renderSide(active: Session) {
    if (active.role === 'admin') {
      return <AdminApp admin={active.staff} onLogout={logout} />
    }

    if (active.role === 'waiter') {
      if (!table) {
        return <WaiterFloorPage waiter={active.staff} onSelectTable={setTable} onLogout={logout} />
      }
      return <WaiterOrderPage waiter={active.staff} table={table} onBack={() => setTable(null)} />
    }

    if (!table) {
      return <TableFloorPage cashier={active.staff} onSelectTable={setTable} onLogout={logout} />
    }

    return <OrderPage cashier={active.staff} table={table} onBack={() => setTable(null)} />
  }

  return <SettingsProvider>{renderSide(session)}</SettingsProvider>
}
