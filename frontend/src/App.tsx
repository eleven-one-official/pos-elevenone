import { useState } from 'react'
import LoginPage from './features/auth/LoginPage'
import TableFloorPage, { type PosTable } from './features/pos/TableFloorPage'
import OrderPage from './features/pos/OrderPage'
import type { Cashier } from './features/auth/CashierLoginDialog'

export default function App() {
  const [cashier, setCashier] = useState<Cashier | null>(null)
  const [table, setTable] = useState<PosTable | null>(null)

  if (!cashier) return <LoginPage onLogin={setCashier} />

  if (!table) {
    return (
      <TableFloorPage
        cashier={cashier}
        onSelectTable={setTable}
        onLogout={() => {
          setTable(null)
          setCashier(null)
        }}
      />
    )
  }

  return <OrderPage cashier={cashier} table={table} onBack={() => setTable(null)} />
}
