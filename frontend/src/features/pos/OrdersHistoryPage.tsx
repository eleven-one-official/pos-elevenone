import { useEffect, useState } from 'react'
import {
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronsLeft,
  LuDelete,
  LuFileText,
  LuPrinter,
  LuRefreshCw,
  LuSearch,
  LuShoppingCart,
  LuUser,
} from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import Toast from '../../components/ui/Toast'
import { useSettings } from '../../hooks/useSettings'
import {
  fetchOrdersPage,
  orderToLines,
  type ApiOrder,
  type OrdersPage,
} from '../../services/api/orders'
import { printBillDocket } from './printBill'
import type { PosTable } from './TableFloorPage'

// ---------------------------------------------------------------------------
// Orders — the cashier's invoice history, opened from the header's "Orders"
// button. Odoo-style split screen: the searchable order list on the left, the
// selected bill on the right with Invoice / Print Receipt on top of the
// familiar numpad block. Reprinting uses the same 80mm docket builder as the
// receipt screen, so a reprint is identical to the original.
// ---------------------------------------------------------------------------

/** The filter dropdown next to the search box (Odoo's "All active orders…"). */
const FILTERS = [
  { label: 'All orders', value: '' },
  { label: 'Ongoing', value: 'new,preparing,ready,served' },
  { label: 'Paid', value: 'completed' },
  { label: 'Refunded', value: 'refunded' },
  { label: 'Cancelled', value: 'cancelled' },
] as const

type Filter = (typeof FILTERS)[number]

/** Collapse the kitchen statuses — the cashier only cares if the bill is open. */
function statusLabel(status: ApiOrder['status']): string {
  if (status === 'completed') return 'Paid'
  if (status === 'refunded') return 'Refunded'
  if (status === 'cancelled') return 'Cancelled'
  return 'Ongoing'
}

const STATUS_TINT: Record<string, string> = {
  Paid: 'bg-emerald-100 text-emerald-700',
  Ongoing: 'bg-amber-100 text-amber-700',
  Refunded: 'bg-rose-100 text-rose-700',
  Cancelled: 'bg-neutral-200 text-neutral-600',
}

// "2026-07-23 04:07 PM" — the format on the reference screen.
function fmtDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  let hours = d.getHours()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(hours)}:${pad(
    d.getMinutes(),
  )} ${ampm}`
}

const money = (n: number) => `$ ${n.toFixed(2)}`

/**
 * "Eat In (E6)" / "VIP (V2)" / "Take Out (T1)" — the section comes from the
 * floor (the order's table relation only carries a name), so the list reads
 * like the table cards do.
 */
function sectionOf(order: ApiOrder, floor: PosTable[]): string {
  if (order.order_type === 'delivery') return 'Delivery'
  if (order.order_type === 'take_away') return 'Take Out'
  return floor.find((t) => t.backendId === order.table?.id)?.section === 'vip' ? 'VIP' : 'Eat In'
}

function tableCell(order: ApiOrder, floor: PosTable[]): string {
  const section = sectionOf(order, floor)
  const label =
    order.order_type === 'take_away' || order.order_type === 'delivery'
      ? order.takeaway_slot != null
        ? `${order.order_type === 'delivery' ? 'D' : 'T'}${order.takeaway_slot}`
        : null
      : order.table?.name ?? null
  return label ? `${section} (${label})` : section
}

// ---------------------------------------------------------------------------
// Numpad block — the Odoo order-screen pad. On the history screen it is
// display-only (there is nothing to key in on a saved bill), so every key is
// inert; the real actions are the buttons around it.
// ---------------------------------------------------------------------------

function PadKey({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={`flex h-12 cursor-default items-center justify-center rounded-lg border text-lg font-semibold ${
        dark
          ? 'border-[#2b2138] bg-[#2b2138] text-white'
          : 'border-neutral-200 bg-white text-neutral-700'
      }`}
    >
      {children}
    </button>
  )
}

function Numpad() {
  return (
    <div className="grid flex-1 grid-cols-4 gap-1.5">
      <PadKey>1</PadKey>
      <PadKey>2</PadKey>
      <PadKey>3</PadKey>
      <PadKey dark>Qty</PadKey>
      <PadKey>4</PadKey>
      <PadKey>5</PadKey>
      <PadKey>6</PadKey>
      <PadKey>Disc</PadKey>
      <PadKey>7</PadKey>
      <PadKey>8</PadKey>
      <PadKey>9</PadKey>
      <PadKey>Price</PadKey>
      <PadKey>+/-</PadKey>
      <PadKey>0</PadKey>
      <PadKey>.</PadKey>
      <PadKey>
        <LuDelete className="h-5 w-5" />
      </PadKey>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrdersHistoryPage({
  floor,
  onBack,
}: {
  /** The table floor — only used to name each order's section (Eat In / VIP). */
  floor: PosTable[]
  onBack: () => void
}) {
  const [filter, setFilter] = useState<Filter>(FILTERS[0])
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<OrdersPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selected, setSelected] = useState<ApiOrder | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  const { khrRate } = useSettings()
  const riel = (usd: number) => `៛ ${Math.round(usd * khrRate).toLocaleString('en-US')}`

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.tone === 'error' ? 3000 : 1500)
    return () => clearTimeout(t)
  }, [toast])

  // Type-to-search on the order number, debounced so each keystroke doesn't
  // fire a request from the till.
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      setSearch(searchInput.trim())
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchOrdersPage({ page, status: filter.value, search })
      .then((res) => {
        if (!cancelled) setResult(res)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the orders.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, filter, search, refreshKey])

  const rows = result?.data ?? []
  const lastPage = result?.last_page ?? 1

  // A settled bill reprints as the paid INVOICE docket; a running one prints
  // the proforma BILL (same as the order screen's "Bill" popup).
  const settled = selected != null && (selected.status === 'completed' || selected.status === 'refunded')

  function printDocket(kind: 'bill' | 'invoice') {
    if (!selected) {
      setToast({ message: 'Select an order first', tone: 'error' })
      return
    }
    const lines = orderToLines(selected)
    if (lines.length === 0) {
      setToast({ message: 'This order has no printable items.', tone: 'error' })
      return
    }
    const tenders = (selected.payments ?? [])
      .filter((p) => p.status === 'paid')
      .map((p) => ({
        label: p.payment_method?.label ?? p.method,
        amount: Number(p.amount),
        inKhr: p.currency === 'KHR',
      }))
    const label =
      selected.order_type === 'take_away'
        ? `Take Away/${selected.takeaway_slot != null ? `T${selected.takeaway_slot}` : '—'}`
        : selected.order_type === 'delivery'
          ? `Delivery/${selected.takeaway_slot != null ? `D${selected.takeaway_slot}` : '—'}`
          : `${sectionOf(selected, floor)}/${selected.table?.name ?? '—'}`
    printBillDocket({
      kind,
      tableLabel: label,
      orderRef: selected.order_number,
      lines,
      khrRate,
      payment: kind === 'invoice' && tenders.length ? { tenders } : undefined,
    })
    setToast({
      message: kind === 'invoice' ? 'Invoice sent to printer' : 'Bill sent to printer',
      tone: 'success',
    })
  }

  const detail = selected

  return (
    <main className="flex min-h-0 flex-1 overflow-hidden">
      {/* ----------------------------------------------------------------- */}
      {/* Left — searchable, paginated order list                           */}
      {/* ----------------------------------------------------------------- */}
      <section className="flex min-w-0 flex-1 flex-col border-r border-neutral-200 bg-white">
        {/* Toolbar: Back · search · filter · pagination */}
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 rounded-lg border border-neutral-300 px-3.5 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            <LuChevronsLeft className="h-4 w-4" />
            Back
          </button>

          <div className="relative min-w-0 flex-1">
            <LuSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search Orders..."
              className="h-10 w-full rounded-lg border border-neutral-300 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Status filter — Odoo's little dropdown beside the search box */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
            >
              {filter.label}
              <LuChevronDown className="h-4 w-4 text-neutral-400" />
            </button>
            {filterOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close filter"
                  onClick={() => setFilterOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                  {FILTERS.map((f) => (
                    <button
                      key={f.label}
                      type="button"
                      onClick={() => {
                        setFilterOpen(false)
                        setPage(1)
                        setFilter(f)
                      }}
                      className={`block w-full px-3.5 py-2 text-left text-sm transition hover:bg-neutral-100 ${
                        f.label === filter.label
                          ? 'font-semibold text-primary'
                          : 'text-neutral-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-neutral-300 p-2 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <LuChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-14 text-center text-sm tabular-nums text-neutral-600">
              {page}/{lastPage}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-neutral-300 p-2 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <LuChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Order rows */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !result ? (
            <div className="flex items-center justify-center p-16">
              <Loader />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm text-rose-500">{error}</p>
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                className="flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
              >
                <LuRefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white shadow-[0_1px_0_#e5e5e5]">
                  <tr className="text-left text-neutral-800">
                    <th className="px-4 py-2.5 font-bold">Date</th>
                    <th className="py-2.5 pr-4 font-bold">Receipt Number</th>
                    <th className="py-2.5 pr-4 font-bold">Customer</th>
                    <th className="py-2.5 pr-4 font-bold">Employee</th>
                    <th className="py-2.5 pr-4 text-right font-bold">Total</th>
                    <th className="py-2.5 pr-4 font-bold">Status</th>
                    <th className="py-2.5 pr-4 font-bold">Table</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const label = statusLabel(o.status)
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setSelected(o)}
                        className={`cursor-pointer border-b border-neutral-100 text-neutral-700 transition ${
                          selected?.id === o.id ? 'bg-sky-100/80' : 'hover:bg-neutral-50'
                        }`}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-neutral-600">
                          {fmtDate(o.created_at)}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-neutral-800">
                          {o.order_number}
                        </td>
                        <td className="py-2.5 pr-4">{o.customer?.name ?? ''}</td>
                        <td className="py-2.5 pr-4">{o.user?.name ?? ''}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-neutral-800">
                          {money(Number(o.total))}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS_TINT[label]}`}
                          >
                            {label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4">{tableCell(o, floor)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {rows.length === 0 && (
                <div className="p-10 text-center text-sm text-neutral-500">
                  No orders match the current filters.
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Right — the selected bill + actions                               */}
      {/* ----------------------------------------------------------------- */}
      <aside className="flex w-[42%] min-w-[400px] max-w-[560px] shrink-0 flex-col bg-[#f7f8fa]">
        {/* Bill preview / empty state */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!detail ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-neutral-300">
              <LuShoppingCart className="h-24 w-24" strokeWidth={1.25} />
              <p className="text-lg font-medium text-neutral-400">Select an order</p>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">{detail.order_number}</h2>
                  <p className="mt-0.5 text-sm text-neutral-500">{fmtDate(detail.created_at)}</p>
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold ${STATUS_TINT[statusLabel(detail.status)]}`}
                >
                  {statusLabel(detail.status)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-neutral-500">Table</span>
                <span className="text-right font-medium text-neutral-800">
                  {tableCell(detail, floor)}
                </span>
                <span className="text-neutral-500">Employee</span>
                <span className="text-right font-medium text-neutral-800">
                  {detail.user?.name ?? '—'}
                </span>
                <span className="text-neutral-500">Customer</span>
                <span className="text-right font-medium text-neutral-800">
                  {detail.customer?.name ?? '—'}
                </span>
              </div>

              <div className="my-4 border-t border-dashed border-neutral-300" />

              {/* Lines */}
              <div className="space-y-2 text-sm tabular-nums">
                {detail.items.map((line) => (
                  // A struck line ("kitchen couldn't make it") stays on the
                  // record but was never charged — struck through, not summed.
                  <div key={line.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className={
                          line.cancelled_at ? 'text-rose-400 line-through' : 'text-neutral-800'
                        }
                      >
                        {line.name}
                      </span>
                      <span className="ml-1.5 text-neutral-400">x{line.quantity}</span>
                      {line.cancelled_at ? (
                        <div className="text-xs italic text-rose-400">Kitchen: not available</div>
                      ) : (
                        line.note && (
                          <div className="text-xs italic text-neutral-400">{line.note}</div>
                        )
                      )}
                    </div>
                    <span
                      className={`shrink-0 font-medium ${
                        line.cancelled_at ? 'text-rose-400 line-through' : 'text-neutral-800'
                      }`}
                    >
                      {money(Number(line.price) * line.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="my-4 border-t border-dashed border-neutral-300" />

              {/* Totals */}
              <div className="space-y-1 text-sm tabular-nums">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal</span>
                  <span>{money(Number(detail.subtotal))}</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Discount</span>
                  <span>− {money(Number(detail.discount))}</span>
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-neutral-200 pt-2">
                  <span className="text-base font-bold text-neutral-900">Total</span>
                  <span className="text-right">
                    <span className="block text-lg font-bold text-neutral-900">
                      {money(Number(detail.total))}
                    </span>
                    <span className="text-xs font-semibold text-neutral-400">
                      {riel(Number(detail.total))}
                    </span>
                  </span>
                </div>
              </div>

              {/* Tenders */}
              {(detail.payments ?? []).filter((p) => p.status !== 'pending').length > 0 && (
                <div className="mt-4 space-y-1 rounded-lg bg-neutral-50 px-3 py-2.5 text-sm tabular-nums">
                  {(detail.payments ?? [])
                    .filter((p) => p.status !== 'pending')
                    .map((p) => (
                      <div key={p.id} className="flex justify-between">
                        <span className="text-neutral-500">
                          {p.payment_method?.label ?? p.method}
                          {p.status === 'refunded' && (
                            <span className="ml-1.5 text-xs font-semibold text-rose-500">
                              refunded
                            </span>
                          )}
                        </span>
                        <span className="font-medium text-neutral-800">
                          {p.currency === 'KHR'
                            ? riel(Number(p.amount))
                            : money(Number(p.amount))}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action bar — Invoice / Print Receipt over the Customer + numpad block */}
        <div className="shrink-0 space-y-3 border-t border-neutral-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                if (!detail) setToast({ message: 'Select an order first', tone: 'error' })
                else if (!settled)
                  setToast({ message: 'This order is not paid yet.', tone: 'error' })
                else printDocket('invoice')
              }}
              className="flex items-center justify-center gap-2 rounded-lg border border-neutral-300 py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 active:scale-[0.99]"
            >
              <LuFileText className="h-4.5 w-4.5" />
              Invoice
            </button>
            <button
              type="button"
              onClick={() => printDocket(settled ? 'invoice' : 'bill')}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#2b2138] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#37294a] active:scale-[0.99]"
            >
              <LuPrinter className="h-4.5 w-4.5" />
              Print Receipt
            </button>
          </div>

          <div className="flex gap-3">
            <div className="flex w-2/5 flex-col gap-3">
              <div className="flex h-12 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm font-semibold text-neutral-600">
                <LuUser className="h-4.5 w-4.5 shrink-0 text-neutral-400" />
                <span className="truncate">{detail?.customer?.name ?? 'Customer'}</span>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setToast({
                      message: 'Refunds are a manager action — use Back Office › Orders.',
                      tone: 'error',
                    })
                  }
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2b2138] text-white shadow-sm transition hover:bg-[#37294a] active:scale-95"
                >
                  <LuChevronRight className="h-6 w-6" strokeWidth={2.5} />
                </button>
                <span className="text-xs font-semibold text-neutral-500">Refund</span>
              </div>
            </div>
            <Numpad />
          </div>
        </div>
      </aside>

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </main>
  )
}
