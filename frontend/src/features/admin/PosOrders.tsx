import { useEffect, useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuSearch, LuSettings, LuX } from 'react-icons/lu'
import { Loader, LoadingOverlay } from '../../components/ui/Loader'
import {
  deleteOrder,
  fetchOrder,
  fetchOrdersPage,
  updateOrder,
  type ApiOrder,
  type ApiOrderPayment,
  type OrdersPage,
} from '../../services/api/orders'
import { refundPayment } from '../../services/api/payments'
import { BLUE_SELECT, FieldGroup, LABEL } from './formKit'

// ---------------------------------------------------------------------------
// Orders — the back office's order history (Point of Sale › Orders). Server-
// side filters and pagination; clicking a row opens an Odoo-style read-only
// form where a manager can move the status or delete the order.
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = ['new', 'preparing', 'ready', 'served', 'completed', 'cancelled'] as const

// `refunded` is filterable but not in the mover — only refunding the money
// (via the Payments box below) puts an order there.
const STATUS_FILTERS = [...STATUS_OPTIONS, 'refunded'] as const

const STATUS_TINT: Record<string, string> = {
  new: 'bg-sky-100 text-sky-800',
  preparing: 'bg-amber-100 text-amber-800',
  ready: 'bg-teal-100 text-teal-800',
  served: 'bg-violet-100 text-violet-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-700',
  refunded: 'bg-rose-100 text-rose-700',
}

const TYPE_LABEL: Record<ApiOrder['order_type'], string> = {
  dine_in: 'Dine-in',
  take_away: 'Take-away',
  delivery: 'Delivery',
}

const money = (v: string) => `$ ${Number(v).toFixed(2)}`

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

export default function PosOrders() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [orderType, setOrderType] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<OrdersPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selected, setSelected] = useState<ApiOrder | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchOrdersPage({ page, status, order_type: orderType, search })
      .then((res) => {
        if (!cancelled) setResult(res)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorText(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, status, orderType, search, refreshKey])

  const refresh = () => setRefreshKey((k) => k + 1)

  const rows = result?.data ?? []

  if (selected) {
    return (
      <OrderDetail
        order={selected}
        onBack={() => {
          setSelected(null)
          refresh()
        }}
        onChangeStatus={async (next) => {
          const updated = await updateOrder(selected.id, { status: next })
          setSelected(updated)
        }}
        onDelete={async () => {
          await deleteOrder(selected.id)
          setSelected(null)
          refresh()
        }}
        onRefundPayment={async (paymentId, reason) => {
          await refundPayment(paymentId, reason)
          // Reload so the payment row and (possibly) the order status reflect it.
          setSelected(await fetchOrder(selected.id))
        }}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <div>
            <h1 className="text-xl text-neutral-700">Orders</h1>
            <p className="mt-1 text-[13px] text-neutral-500">
              Every order fired from the POS and waiter tablets.
            </p>
          </div>

          <div className="flex min-w-72 max-w-[880px] flex-1 flex-col gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setPage(1)
                setSearch(searchInput.trim())
              }}
              className="relative block"
            >
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search order number... (press Enter)"
                className="w-full rounded-[3px] border border-neutral-300 px-3 py-1.5 pr-9 text-sm outline-none transition focus:border-sky-600"
              />
              <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <select
                  value={status}
                  onChange={(e) => {
                    setPage(1)
                    setStatus(e.target.value)
                  }}
                  className="rounded-[3px] border border-neutral-300 bg-white px-2 py-1.5 text-[13px] text-neutral-700 outline-none focus:border-sky-600"
                >
                  <option value="">All statuses</option>
                  {STATUS_FILTERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={orderType}
                  onChange={(e) => {
                    setPage(1)
                    setOrderType(e.target.value)
                  }}
                  className="rounded-[3px] border border-neutral-300 bg-white px-2 py-1.5 text-[13px] text-neutral-700 outline-none focus:border-sky-600"
                >
                  <option value="">All types</option>
                  <option value="dine_in">Dine-in</option>
                  <option value="take_away">Take-away</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[13px] text-neutral-600">
                  {result && result.total > 0 ? `${result.from ?? 0}-${result.to ?? 0}` : '0-0'} /{' '}
                  {result?.total ?? 0}
                </span>
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <LuChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={!result || page >= result.last_page}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <LuChevronRight className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Order history */}
      <div className="overflow-y-auto">
        {loading && !result ? (
          <div className="flex items-center justify-center p-16">
            <Loader />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={refresh}
              className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-800">
                  <th className="px-4 py-2.5 font-bold">Order Ref</th>
                  <th className="py-2.5 pr-4 font-bold">Date</th>
                  <th className="py-2.5 pr-4 font-bold">Type</th>
                  <th className="py-2.5 pr-4 font-bold">Table</th>
                  <th className="py-2.5 pr-4 font-bold">Cashier</th>
                  <th className="py-2.5 pr-4 text-right font-bold">Guests</th>
                  <th className="py-2.5 pr-4 text-right font-bold">Total</th>
                  <th className="py-2.5 pr-4 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o)}
                    className="cursor-pointer border-b border-neutral-100 text-neutral-700 transition hover:bg-neutral-50"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-neutral-800">
                      {o.order_number}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 text-neutral-600">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">{TYPE_LABEL[o.order_type]}</td>
                    <td className="py-2 pr-4">{o.table?.name ?? '—'}</td>
                    <td className="py-2 pr-4">{o.user?.name ?? '—'}</td>
                    <td className="py-2 pr-4 text-right">{o.guest_count || '—'}</td>
                    <td className="py-2 pr-4 text-right text-neutral-800">{money(o.total)}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_TINT[o.status] ?? 'bg-neutral-200 text-neutral-600'}`}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Read-only order form with a status mover and Action › Delete.
// ---------------------------------------------------------------------------

function OrderDetail({
  order,
  onBack,
  onChangeStatus,
  onDelete,
  onRefundPayment,
}: {
  order: ApiOrder
  onBack: () => void
  onChangeStatus: (status: ApiOrder['status']) => Promise<void>
  onDelete: () => Promise<void>
  onRefundPayment: (paymentId: number, reason?: string) => Promise<void>
}) {
  const [actionOpen, setActionOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [refunding, setRefunding] = useState<ApiOrderPayment | null>(null)
  const [refundReason, setRefundReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e: unknown) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const payments = order.payments ?? []

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="truncate text-[15px] text-neutral-700">
              <button type="button" onClick={onBack} className="transition hover:underline">
                Orders
              </button>
              <span className="text-neutral-400"> / </span>
              <span>{order.order_number}</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={onBack}
                className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                Back
              </button>
            </div>
          </div>

          {/* Action menu, centered like Odoo */}
          <div className="relative flex flex-1 justify-center pt-8">
            <button
              type="button"
              onClick={() => setActionOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50"
            >
              <LuSettings className="h-3.5 w-3.5" />
              Action
            </button>
            {actionOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setActionOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute top-full z-20 mt-1 w-56 border border-neutral-200/70 bg-white py-1 text-neutral-600 shadow-md">
                  <button
                    type="button"
                    onClick={() => {
                      setActionOpen(false)
                      setConfirmDelete(true)
                    }}
                    className="block w-full px-4 py-1.5 text-left text-[13px] transition hover:bg-neutral-100"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sheet */}
      <div className="relative min-h-0 flex-1 overflow-y-auto bg-neutral-100/60 pb-6">
        {busy && <LoadingOverlay />}

        {error && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setError(null)}
              className="shrink-0 transition hover:opacity-70"
            >
              <LuX className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="mx-4 mt-4 rounded-[2px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="px-8 pt-6">
            <h1 className="text-[26px] font-semibold text-neutral-800">{order.order_number}</h1>

            <div className="mt-5 grid grid-cols-1 gap-x-16 gap-y-3 xl:grid-cols-2">
              <FieldGroup>
                <label className={LABEL}>Date</label>
                <span className="pt-1 text-[13px] text-neutral-800">
                  {new Date(order.created_at).toLocaleString()}
                </span>

                <label className={LABEL}>Order Type</label>
                <span className="pt-1 text-[13px] text-neutral-800">
                  {TYPE_LABEL[order.order_type]}
                </span>

                <label className={LABEL}>Table</label>
                <span className="pt-1 text-[13px] text-neutral-800">{order.table?.name ?? '—'}</span>

                <label className={LABEL}>Guests</label>
                <span className="pt-1 text-[13px] text-neutral-800">{order.guest_count || '—'}</span>
              </FieldGroup>

              <FieldGroup>
                <label className={LABEL}>Cashier</label>
                <span className="pt-1 text-[13px] text-neutral-800">{order.user?.name ?? '—'}</span>

                <label className={LABEL}>Customer</label>
                <span className="pt-1 text-[13px] text-neutral-800">
                  {order.customer?.name ?? '—'}
                </span>

                <label className={LABEL}>Status</label>
                {order.status === 'refunded' ? (
                  // Refunded is set by the money side, not the status mover.
                  <span className="pt-1">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_TINT.refunded}`}>
                      refunded
                    </span>
                  </span>
                ) : (
                  <select
                    value={order.status}
                    onChange={(e) =>
                      void runAction(() => onChangeStatus(e.target.value as ApiOrder['status']))
                    }
                    className={`${BLUE_SELECT} max-w-52`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}

                <label className={LABEL}>Note</label>
                <span className="whitespace-pre-wrap pt-1 text-[13px] text-neutral-800">
                  {order.note ?? '—'}
                </span>
              </FieldGroup>
            </div>
          </div>

          {/* Order lines */}
          <div className="px-8 py-6">
            <div className="border-b border-neutral-300 pb-1 text-[12.5px] font-semibold text-[#54717e]">
              Order Lines
            </div>
            <table className="mt-2 w-full text-[13px]">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-800">
                  <th className="py-2 pr-4 font-bold">Product</th>
                  <th className="py-2 pr-4 text-right font-bold">Unit Price</th>
                  <th className="py-2 pr-4 text-right font-bold">Quantity</th>
                  <th className="py-2 pr-4 font-bold">Note</th>
                  <th className="py-2 text-right font-bold">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((line) => (
                  <tr key={line.id} className="border-b border-neutral-100 text-neutral-700">
                    <td className="py-2 pr-4 text-neutral-800">{line.name}</td>
                    <td className="py-2 pr-4 text-right">{money(line.price)}</td>
                    <td className="py-2 pr-4 text-right">x{line.quantity}</td>
                    <td className="py-2 pr-4">{line.note ?? ''}</td>
                    <td className="py-2 text-right">{money(line.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="mt-4 flex justify-end">
              <div className="w-64 text-[13px]">
                <div className="flex justify-between py-0.5 text-neutral-700">
                  <span>Subtotal</span>
                  <span>{money(order.subtotal)}</span>
                </div>
                <div className="flex justify-between py-0.5 text-neutral-700">
                  <span>Discount</span>
                  <span>- {money(order.discount)}</span>
                </div>
                <div className="flex justify-between py-0.5 text-neutral-700">
                  <span>Tax</span>
                  <span>{money(order.tax)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-neutral-300 py-1.5 font-bold text-neutral-900">
                  <span>Total</span>
                  <span>{money(order.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payments */}
          <div className="px-8 pb-8">
            <div className="border-b border-neutral-300 pb-1 text-[12.5px] font-semibold text-[#54717e]">
              Payments
            </div>
            {payments.length === 0 ? (
              <p className="pt-2 text-[13px] italic text-neutral-500">No payments recorded.</p>
            ) : (
              <table className="mt-2 w-full text-[13px]">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-800">
                    <th className="py-2 pr-4 font-bold">Method</th>
                    <th className="py-2 pr-4 text-right font-bold">Amount</th>
                    <th className="py-2 pr-4 font-bold">Status</th>
                    <th className="py-2 pr-4 font-bold">Paid At</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-neutral-100 text-neutral-700">
                      <td className="py-2 pr-4 text-neutral-800">
                        {p.payment_method?.label ?? <span className="capitalize">{p.method}</span>}
                        {p.currency === 'KHR' && (
                          <span className="ml-1.5 text-[11px] text-neutral-500">
                            (paid in riel @ {Number(p.exchange_rate ?? 0).toLocaleString()})
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right">{money(p.amount)}</td>
                      <td className="py-2 pr-4 capitalize">{p.status}</td>
                      <td className="py-2 pr-4">
                        {p.paid_at ? new Date(p.paid_at).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 text-right">
                        {p.status === 'paid' && (
                          <button
                            type="button"
                            onClick={() => {
                              setRefundReason('')
                              setRefunding(p)
                            }}
                            className="rounded-[3px] border border-rose-200 bg-white px-2.5 py-1 text-xs text-rose-600 transition hover:bg-rose-50"
                          >
                            Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Refund confirmation */}
      {refunding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-3 text-[15px] font-semibold text-neutral-800">
              Refund Payment
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-neutral-700">
                Refund the <span className="capitalize">{refunding.method}</span> payment of{' '}
                <span className="font-semibold">{money(refunding.amount)}</span> on{' '}
                {order.order_number}? The row stays in the money trail as refunded; once no paid
                payment remains, the order leaves the sales reports.
              </p>
              <label className="mt-3 block text-[13px] text-neutral-600" htmlFor="refund-reason">
                Reason (optional)
              </label>
              <input
                id="refund-reason"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                maxLength={255}
                placeholder="e.g. wrong order, guest complaint"
                className="mt-1 w-full rounded-[3px] border border-neutral-300 px-3 py-1.5 text-sm outline-none transition focus:border-sky-600"
              />
            </div>
            <div className="flex gap-1.5 border-t border-neutral-200 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  const target = refunding
                  const reason = refundReason.trim()
                  setRefunding(null)
                  void runAction(() => onRefundPayment(target.id, reason || undefined))
                }}
                className="rounded-[3px] bg-rose-600 px-4 py-1.5 text-sm text-white transition hover:bg-rose-700"
              >
                Refund
              </button>
              <button
                type="button"
                onClick={() => setRefunding(null)}
                className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-3 text-[15px] font-semibold text-neutral-800">
              Confirmation
            </div>
            <p className="px-5 py-4 text-sm text-neutral-700">
              Are you sure you want to delete order {order.order_number}? Its table is freed and the
              order disappears from the history for good.
            </p>
            <div className="flex gap-1.5 border-t border-neutral-200 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false)
                  void runAction(onDelete)
                }}
                className="rounded-[3px] bg-red-600 px-4 py-1.5 text-sm text-white transition hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
