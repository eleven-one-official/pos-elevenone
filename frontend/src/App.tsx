import { useState } from 'react'
import LoginPage from './features/auth/LoginPage'
import TableFloorPage, { type PosTable } from './features/pos/TableFloorPage'
import OrderPage from './features/pos/OrderPage'
import WaiterFloorPage from './features/waiter/WaiterFloorPage'
import WaiterOrderPage from './features/waiter/WaiterOrderPage'
import type { Cashier } from './features/auth/CashierLoginDialog'
import type { Waiter } from './features/waiter/WaiterLoginDialog'

// Who is signed in drives which "side" of the app renders: cashiers get the full
// POS (order → payment → receipt); waiters get the tablet flow (order → send to
// kitchen). Both start from the same table floor.
type Session =
  | { role: 'cashier'; staff: Cashier }
  | { role: 'waiter'; staff: Waiter }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [table, setTable] = useState<PosTable | null>(null)

  if (!session) {
    return (
      <LoginPage
        onLogin={(cashier) => setSession({ role: 'cashier', staff: cashier })}
        onWaiterLogin={(waiter) => setSession({ role: 'waiter', staff: waiter })}
      />
    )
  }

  const logout = () => {
    setTable(null)
    setSession(null)
  }

  if (session.role === 'waiter') {
    if (!table) {
      return <WaiterFloorPage waiter={session.staff} onSelectTable={setTable} onLogout={logout} />
    }
    return <WaiterOrderPage waiter={session.staff} table={table} onBack={() => setTable(null)} />
  }

  if (!table) {
    return <TableFloorPage cashier={session.staff} onSelectTable={setTable} onLogout={logout} />
  }

  return <OrderPage cashier={session.staff} table={table} onBack={() => setTable(null)} />
}
