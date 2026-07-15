import { useEffect, useMemo, useState } from 'react'
import {
  LuArrowLeftRight,
  LuChevronLeft,
  LuChevronsLeft,
  LuChevronsRight,
  LuClipboardList,
  LuDelete,
  LuLock,
  LuPower,
  LuRefreshCw,
  LuX,
} from 'react-icons/lu'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import { LoadingState } from '../../components/ui/Loader'
import { useSettings } from '../../hooks/useSettings'
import {
  DEFAULT_PAYMENT_METHODS,
  fetchActivePaymentMethods,
  type PaymentMethodRow,
} from '../../services/api/paymentMethods'
import type { Cashier } from '../auth/CashierLoginDialog'
import type { PosTable } from './TableFloorPage'
import type { PayMethodBackend } from '../../services/api/payments'

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

/** One tender to record on the backend, grouped by backend channel. */
export type Tender = { method: PayMethodBackend; amount: number }

// What the Validate button hands back to the order flow so the receipt can show
// how the bill was settled — and so the order flow can record it on the backend.
export type PaymentResult = {
  /** Method name(s) used — joined with " + " when the bill was split. */
  methodName: string
  /** Total amount tendered across every method. */
  cashReceived: number
  /** Amount handed back to the customer (0 when settled exactly). */
  change: number
  /** Amounts to record, grouped by backend channel and capped to the bill. */
  tenders: Tender[]
}

const usd = (n: number) => `$ ${n.toFixed(2)}`
const khr = (n: number) => `៛ ${Math.round(n).toLocaleString('en-US')}`

// ---------------------------------------------------------------------------
// Numpad
// ---------------------------------------------------------------------------

const NUMPAD: string[] = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  '+/-', '0', 'del',
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PaymentPage({
  cashier,
  table,
  total,
  onBack,
  onValidate,
}: {
  cashier: Cashier
  table: PosTable
  total: number
  onBack: () => void
  onValidate: (result: PaymentResult) => void
}) {
  const [methods, setMethods] = useState<PaymentMethodRow[] | null>(null)
  const [amounts, setAmounts] = useState<Record<number, number>>({})
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [entry, setEntry] = useState<string | null>(null)
  const { khrRate } = useSettings()

  // Load the venue's active payment journals once, falling back to a built-in
  // set if the server can't be reached. Odoo-style, the first journal is
  // pre-filled with the full amount due so the screen opens settled.
  useEffect(() => {
    let alive = true
    fetchActivePaymentMethods()
      .then((list) => (list.length ? list : DEFAULT_PAYMENT_METHODS))
      .catch(() => DEFAULT_PAYMENT_METHODS)
      .then((list) => {
        if (!alive) return
        setMethods(list)
        setSelectedId(list[0].id)
        setAmounts({ [list[0].id]: total })
      })
    return () => {
      alive = false
    }
  }, [total])

  const tendered = useMemo(
    () => Object.values(amounts).reduce((sum, n) => sum + n, 0),
    [amounts],
  )

  if (!methods || selectedId === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f3f4f6]">
        <LoadingState label="Loading payment methods…" />
      </div>
    )
  }

  const methodList = methods
  const selected = selectedId
  const remaining = Math.max(0, total - tendered)
  const change = Math.max(0, tendered - total)
  const settled = remaining <= 0.001

  const label = change > 0.001 ? 'Change' : 'Amount Due'
  const primary = change > 0.001 ? change : remaining
  const initials = cashier.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  const orders = table.orders

  function selectMethod(id: number) {
    setSelectedId(id)
    setEntry(null)
    // Auto-assign the outstanding balance to a freshly picked tender.
    setAmounts((prev) => {
      if (prev[id] != null) return prev
      const others = Object.values(prev).reduce((sum, n) => sum + n, 0)
      const due = Math.max(0, total - others)
      return due > 0 ? { ...prev, [id]: due } : prev
    })
  }

  function commit(next: string) {
    setEntry(next)
    const parsed = Number(next)
    setAmounts((prev) => ({ ...prev, [selected]: Number.isFinite(parsed) ? parsed : 0 }))
  }

  function pressKey(key: string) {
    const current = entry ?? String(amounts[selected] ?? 0)

    if (key === 'del') return commit(current.slice(0, -1) || '0')
    if (key === '+/-') return commit(current.startsWith('-') ? current.slice(1) : `-${current}`)
    if (key === '.') return commit(current.includes('.') ? current : `${current}.`)
    // Digit — the first press after selecting a method replaces the prefill.
    return commit((entry === null ? '' : current) + key)
  }

  // Clear every entered tender — Amount Due returns to the full order total.
  function cancel() {
    setAmounts({})
    setEntry(null)
  }

  // Hand the settled bill to the order flow so it can print the receipt and
  // record the money on the backend.
  function validate() {
    const used = methodList.filter((m) => amounts[m.id] != null && amounts[m.id] !== 0)
    // Group the entered tenders by backend channel, then cap them to the bill so
    // recorded revenue equals the total due (any cash overpay is change, not sales).
    const grouped = new Map<PayMethodBackend, number>()
    for (const m of used) grouped.set(m.channel, (grouped.get(m.channel) ?? 0) + amounts[m.id])
    const tenders: Tender[] = []
    let left = total
    for (const [method, amount] of grouped) {
      const applied = Math.min(amount, left)
      if (applied > 0.001) tenders.push({ method, amount: Math.round(applied * 100) / 100 })
      left = Math.max(0, left - amount)
    }
    onValidate({
      methodName: used.length ? used.map((m) => m.label).join(' + ') : methodList[0].label,
      cashReceived: tendered,
      change,
      tenders,
    })
  }

  return (
    <div className="flex h-screen flex-col bg-[#f3f4f6]">
      {/* Top toolbar */}
      <header className="flex h-16 shrink-0 items-center gap-1 bg-[#2b2138] px-4 text-white shadow-md">
        <ElevenOneLogo />
        <div className="mx-3 h-8 w-px bg-white/15" />

        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-white/90 transition hover:bg-white/10"
        >
          <LuArrowLeftRight className="h-5 w-5" />
          <span className="text-sm font-medium">Cash In/Out</span>
        </button>
        <button
          type="button"
          className="relative flex items-center gap-2 rounded-lg px-3 py-2 text-white/90 transition hover:bg-white/10"
        >
          <LuClipboardList className="h-5 w-5" />
          <span className="text-sm font-medium">Orders</span>
          {orders > 0 && (
            <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
              {orders}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="ml-2 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <LuChevronsLeft className="h-5 w-5" />
          {table.label}
        </button>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
              {initials}
            </span>
            <div className="leading-tight">
              <div className="text-[11px] uppercase tracking-wide text-white/55">Cashier</div>
              <div className="text-sm font-semibold">{cashier.name}</div>
            </div>
          </div>
          <div className="h-8 w-px bg-white/15" />
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex w-[68px] flex-col items-center gap-0.5 rounded-lg py-1.5 text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            <LuRefreshCw className="h-5 w-5" />
            <span className="text-[11px] font-medium">Reload</span>
          </button>
          <button
            type="button"
            onClick={onBack}
            className="flex w-[68px] flex-col items-center gap-0.5 rounded-lg py-1.5 text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            <LuLock className="h-5 w-5" />
            <span className="text-[11px] font-medium">Lock</span>
          </button>
          <button
            type="button"
            onClick={onBack}
            className="flex w-[68px] flex-col items-center gap-0.5 rounded-lg py-1.5 text-white/85 transition hover:bg-white/10 hover:text-rose-300"
          >
            <LuPower className="h-5 w-5" />
            <span className="text-[11px] font-medium">Close</span>
          </button>
        </div>
      </header>

      {/* Sub-toolbar: Back / title / Validate */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2.5 font-semibold text-neutral-700 transition hover:bg-neutral-100"
        >
          <LuChevronLeft className="h-5 w-5" />
          Back
        </button>
        <h1 className="text-xl font-bold text-neutral-900">Payment</h1>
        <button
          type="button"
          onClick={validate}
          disabled={!settled}
          className={`flex items-center gap-1.5 rounded-lg px-5 py-2.5 font-semibold text-white shadow-sm transition ${
            settled
              ? 'bg-[#2b2138] hover:bg-[#37294a]'
              : 'cursor-not-allowed bg-neutral-300 text-neutral-500'
          }`}
        >
          Validate
          <LuChevronsRight className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — payment methods */}
        <div className="w-[42%] min-w-[380px] overflow-y-auto border-r border-neutral-200 bg-white">
          {methodList.map((method) => {
            const amount = amounts[method.id]
            const isSelected = method.id === selected
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => selectMethod(method.id)}
                className={`flex w-full items-center gap-4 border-b border-neutral-100 px-5 py-5 text-left transition ${
                  isSelected
                    ? 'border-l-4 border-l-emerald-500 bg-emerald-50'
                    : 'border-l-4 border-l-transparent hover:bg-neutral-50'
                }`}
              >
                <span className="flex-1 text-lg font-medium text-neutral-800">{method.label}</span>
                {amount != null && amount !== 0 && (
                  <span className={`text-lg font-bold ${isSelected ? 'text-emerald-700' : 'text-neutral-500'}`}>
                    {usd(amount)}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Right — amount due + numpad */}
        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          {/* Amount due */}
          <div className="flex flex-col items-center justify-center py-6">
            <p className="text-lg font-semibold text-neutral-500">{label}</p>
            <p className={`mt-1 text-6xl font-bold ${settled ? 'text-emerald-600' : 'text-neutral-900'}`}>
              {usd(primary)}
            </p>
            <p className="my-2 text-lg text-neutral-400">Or</p>
            <p className={`text-5xl font-bold ${settled ? 'text-emerald-600/80' : 'text-neutral-700'}`}>
              {khr(primary * khrRate)}
            </p>
          </div>

          {/* Numpad */}
          <div className="mx-auto grid w-full max-w-2xl flex-1 grid-cols-3 gap-3 pt-4">
            {NUMPAD.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => pressKey(key)}
                className="flex min-h-[64px] items-center justify-center rounded-xl border border-neutral-200 bg-white text-2xl font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50 active:scale-[0.98]"
              >
                {key === 'del' ? <LuDelete className="h-7 w-7" /> : key}
              </button>
            ))}
          </div>

          {/* Cancel — clears every entered tender */}
          <div className="mx-auto w-full max-w-2xl pt-3">
            <button
              type="button"
              onClick={cancel}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-4 text-lg font-semibold text-rose-600 shadow-sm transition hover:bg-rose-100 active:scale-[0.99]"
            >
              <LuX className="h-6 w-6" />
              Cancel
            </button>
          </div>

          {/* Running tally */}
          <div className="mx-auto mt-4 flex w-full max-w-2xl items-center justify-between text-sm text-neutral-500">
            <span>Order Total {usd(total)}</span>
            <span>
              Paid <span className="font-semibold text-neutral-700">{usd(tendered)}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
