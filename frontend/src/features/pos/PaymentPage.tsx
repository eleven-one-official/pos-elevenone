import { useEffect, useRef, useState } from 'react'
import {
  LuArrowLeftRight,
  LuChevronLeft,
  LuChevronsLeft,
  LuChevronsRight,
  LuCircleX,
  LuClipboardList,
  LuDelete,
  LuFileText,
  LuLock,
  LuPower,
  LuRefreshCw,
  LuUser,
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

/** One method's tender as shown on the receipt. `amount` is always in USD;
 *  `inKhr` marks riel cash so the receipt prints it in the currency the
 *  customer actually handed over. */
export type PaidLine = { label: string; amount: number; isCash: boolean; inKhr: boolean }

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
  /** Per-method amounts for the receipt, in the order they appear on screen. */
  paid: PaidLine[]
}

const usd = (n: number) => `$ ${n.toFixed(2)}`
const khr = (n: number) => `${Math.round(n).toLocaleString('en-US')} ៛`

// A tender line the cashier has opened by tapping a method — Odoo-style: the
// bill can be split across several lines, each editable from the numpad.
type TenderLine = { uid: number; methodId: number; amount: number }

// ---------------------------------------------------------------------------
// Numpad
// ---------------------------------------------------------------------------

const NUMPAD: string[] = [
  '1', '2', '3', '+10',
  '4', '5', '6', '+20',
  '7', '8', '9', '+50',
  '+/-', '0', '.', 'del',
]

const QUICK_KEYS = new Set(['+10', '+20', '+50'])

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
  const [lines, setLines] = useState<TenderLine[]>([])
  const [selectedUid, setSelectedUid] = useState<number | null>(null)
  const [entry, setEntry] = useState<string | null>(null)
  const uidRef = useRef(1)
  const { khrRate } = useSettings()

  // Load the venue's active payment journals once, falling back to a built-in
  // set if the server can't be reached.
  useEffect(() => {
    let alive = true
    fetchActivePaymentMethods()
      .then((list) => (list.length ? list : DEFAULT_PAYMENT_METHODS))
      .catch(() => DEFAULT_PAYMENT_METHODS)
      .then((list) => {
        if (!alive) return
        setMethods(list)
      })
    return () => {
      alive = false
    }
  }, [total])

  if (!methods) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f3f4f6]">
        <LoadingState label="Loading payment methods…" />
      </div>
    )
  }

  const methodList = methods
  const tendered = lines.reduce((sum, l) => sum + l.amount, 0)
  const remaining = Math.max(0, total - tendered)
  const change = Math.max(0, tendered - total)
  const settled = remaining <= 0.001
  const initials = cashier.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  const orders = table.orders
  const methodLabel = (id: number) => methodList.find((m) => m.id === id)?.label ?? '—'

  // Tapping a method opens a tender line prefilled with what's still owed;
  // tapping one that's already open just re-selects its line for editing.
  function addMethod(method: PaymentMethodRow) {
    const existing = lines.find((l) => l.methodId === method.id)
    if (existing) {
      setSelectedUid(existing.uid)
      setEntry(null)
      return
    }
    const uid = uidRef.current++
    setLines((prev) => [...prev, { uid, methodId: method.id, amount: remaining }])
    setSelectedUid(uid)
    setEntry(null)
  }

  function selectLine(uid: number) {
    setSelectedUid(uid)
    setEntry(null)
  }

  function removeLine(uid: number) {
    setLines((prev) => prev.filter((l) => l.uid !== uid))
    if (selectedUid === uid) {
      setSelectedUid(null)
      setEntry(null)
    }
  }

  function commit(next: string) {
    setEntry(next)
    const parsed = Number(next)
    setLines((prev) =>
      prev.map((l) =>
        l.uid === selectedUid ? { ...l, amount: Number.isFinite(parsed) ? parsed : 0 } : l,
      ),
    )
  }

  function pressKey(key: string) {
    const line = lines.find((l) => l.uid === selectedUid)
    if (!line) return
    const current = entry ?? String(line.amount)

    if (QUICK_KEYS.has(key)) {
      const bumped = (Number(current) || 0) + Number(key.slice(1))
      return commit(String(Math.round(bumped * 100) / 100))
    }
    if (key === 'del') return commit(current.slice(0, -1) || '0')
    if (key === '+/-') return commit(current.startsWith('-') ? current.slice(1) : `-${current}`)
    if (key === '.') return commit(current.includes('.') ? current : `${current}.`)
    // Digit — the first press after opening/selecting a line replaces the prefill.
    return commit((entry === null ? '' : current) + key)
  }

  // Hand the settled bill to the order flow so it can print the receipt and
  // record the money on the backend.
  function validate() {
    // Merge split lines per method for the receipt and the method name.
    const byMethod = new Map<number, number>()
    for (const l of lines) byMethod.set(l.methodId, (byMethod.get(l.methodId) ?? 0) + l.amount)
    let used = methodList.filter((m) => (byMethod.get(m.id) ?? 0) !== 0)
    // A zero-total bill tenders nothing; still name a method for the record.
    if (used.length === 0) used = methodList.slice(0, 1)
    // Group the entered tenders by backend channel, then cap them to the bill so
    // recorded revenue equals the total due (any cash overpay is change, not sales).
    const grouped = new Map<PayMethodBackend, number>()
    for (const m of used) grouped.set(m.channel, (grouped.get(m.channel) ?? 0) + (byMethod.get(m.id) ?? 0))
    const tenders: Tender[] = []
    let left = total
    for (const [method, amount] of grouped) {
      const applied = Math.min(amount, left)
      if (applied > 0.001) tenders.push({ method, amount: Math.round(applied * 100) / 100 })
      left = Math.max(0, left - amount)
    }
    onValidate({
      methodName: used.map((m) => m.label).join(' + '),
      cashReceived: tendered,
      change,
      tenders,
      // Riel cash is recognised by its label so the receipt can print that
      // tender in riel instead of dollars.
      paid: used.map((m) => ({
        label: m.label,
        amount: byMethod.get(m.id) ?? 0,
        isCash: m.channel === 'cash',
        inKhr: m.channel === 'cash' && /khr|riel/i.test(m.label),
      })),
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
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'cursor-not-allowed bg-neutral-300 text-neutral-500'
          }`}
        >
          Validate
          <LuChevronsRight className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — open tender lines on top, then the method list */}
        <div className="flex w-[36%] min-w-[360px] flex-col overflow-y-auto border-r border-neutral-200 bg-neutral-100">
          {lines.length > 0 && (
            <div className="mb-2 bg-white shadow-sm">
              {lines.map((line) => {
                const isSelected = line.uid === selectedUid
                return (
                  <div
                    key={line.uid}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectLine(line.uid)}
                    onKeyDown={(e) => e.key === 'Enter' && selectLine(line.uid)}
                    className={`flex cursor-pointer items-center justify-between gap-3 border-b border-neutral-100 py-4 pl-4 pr-3 transition ${
                      isSelected
                        ? 'border-l-4 border-l-emerald-500 bg-emerald-50'
                        : 'border-l-4 border-l-transparent hover:bg-neutral-50'
                    }`}
                  >
                    <span className="text-lg font-semibold text-neutral-800">
                      {methodLabel(line.methodId)}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-lg font-semibold tabular-nums text-neutral-900">
                        {line.amount.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeLine(line.uid)
                        }}
                        className="rounded-full p-1 text-neutral-400 transition hover:bg-rose-50 hover:text-rose-500"
                      >
                        <LuCircleX className="h-6 w-6" />
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex-1 bg-white">
            {methodList.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => addMethod(method)}
                className="flex w-full items-center gap-4 border-b border-neutral-100 px-5 py-5 text-left transition hover:bg-neutral-50"
              >
                <span className="flex-1 text-lg font-medium text-neutral-800">{method.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right — totals, numpad and actions */}
        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          {/* Remaining / Total Due on the left, Change on the right */}
          <div className="flex items-start justify-between px-2 pb-6">
            <div>
              <p className={`text-4xl font-bold ${settled ? 'text-emerald-600' : 'text-neutral-900'}`}>
                Remaining {usd(remaining)}
              </p>
              <p className="mt-2 text-xl font-medium text-neutral-600">Total Due {usd(total)}</p>
              <p className="mt-1 text-lg text-neutral-500">Total Due (KHR): {khr(total * khrRate)}</p>
            </div>
            <div className="text-right">
              <p className={`text-4xl font-bold ${change > 0.001 ? 'text-amber-600' : 'text-neutral-900'}`}>
                Change {usd(change)}
              </p>
              <p className="mt-1 text-lg text-neutral-500">Change (KHR) {khr(change * khrRate)}</p>
            </div>
          </div>

          {/* Numpad + side actions */}
          <div className="mx-auto flex w-full max-w-4xl flex-1 items-start justify-center gap-6 pt-2">
            <div className="grid w-full max-w-xl grid-cols-4 gap-2">
              {NUMPAD.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => pressKey(key)}
                  className={`flex min-h-[64px] items-center justify-center rounded-xl border border-neutral-200 shadow-sm transition active:scale-[0.98] ${
                    QUICK_KEYS.has(key) || key === '+/-' || key === '.' || key === 'del'
                      ? 'bg-neutral-50 text-xl font-semibold text-neutral-600 hover:bg-neutral-100'
                      : 'bg-white text-2xl font-semibold text-neutral-800 hover:bg-neutral-50'
                  }`}
                >
                  {key === 'del' ? <LuDelete className="h-7 w-7" /> : key}
                </button>
              ))}
            </div>

            <div className="flex w-56 shrink-0 flex-col gap-3">
              <button
                type="button"
                className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-4 shadow-sm transition hover:bg-neutral-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                  <LuUser className="h-5 w-5" />
                </span>
                <span className="font-semibold text-neutral-700">Customer</span>
              </button>
              <button
                type="button"
                className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-4 shadow-sm transition hover:bg-neutral-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                  <LuFileText className="h-5 w-5" />
                </span>
                <span className="font-semibold text-neutral-700">Invoice</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
