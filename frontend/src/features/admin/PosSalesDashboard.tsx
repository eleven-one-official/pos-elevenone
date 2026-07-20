import { useEffect, useState } from 'react'
import { Loader, LoadingState } from '../../components/ui/Loader'
import {
  fetchDailySales,
  fetchDashboard,
  fetchTopItems,
  type DailySales,
  type DashboardSummary,
  type TopItem,
} from '../../services/api/reports'

// ---------------------------------------------------------------------------
// Reporting › Sales Dashboard — the headline numbers the backend has served
// all along (/reports/dashboard, /reports/daily-sales, /reports/top-items).
// Refunded orders are excluded server-side; refunded payments never sum.
// ---------------------------------------------------------------------------

const usd = (v: string | number) => `$ ${Number(v).toFixed(2)}`

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[2px] border border-neutral-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-800">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-neutral-500">{hint}</p>}
    </div>
  )
}

export default function PosSalesDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [top, setTop] = useState<TopItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [date, setDate] = useState(todayStr)
  const [daily, setDaily] = useState<DailySales | null>(null)
  const [dailyLoading, setDailyLoading] = useState(true)
  const [dailyError, setDailyError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    Promise.all([fetchDashboard(), fetchTopItems(10)])
      .then(([s, t]) => {
        setSummary(s)
        setTop(t)
      })
      .catch((e: unknown) => setError(errorText(e)))
  }

  useEffect(load, [])

  useEffect(() => {
    let cancelled = false
    setDailyLoading(true)
    setDailyError(null)
    fetchDailySales(date)
      .then((d) => {
        if (!cancelled) setDaily(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setDailyError(errorText(e))
      })
      .finally(() => {
        if (!cancelled) setDailyLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date])

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={load}
          className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
        >
          Retry
        </button>
      </div>
    )
  }

  if (summary === null || top === null) {
    return <LoadingState label="Loading sales dashboard..." className="h-full" />
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <h1 className="text-xl text-neutral-700">Sales Dashboard</h1>
        <p className="mt-1 text-[13px] text-neutral-500">
          Completed sales only — refunded and cancelled orders don’t count.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-100/60 pb-8">
        {/* Headline tiles */}
        <div className="mx-4 mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Tile label="Sales Today" value={usd(summary.today_sales)} hint={`${summary.total_orders_today} orders`} />
          <Tile label="Sales This Month" value={usd(summary.monthly_sales)} />
          <Tile label="Open Orders" value={String(summary.pending_orders)} hint="new / preparing / ready" />
          <Tile
            label="Tables"
            value={`${summary.tables.occupied} / ${summary.tables.total}`}
            hint={`${summary.tables.available} free · ${summary.tables.reserved} reserved`}
          />
        </div>

        <div className="mx-4 mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Daily breakdown */}
          <div className="rounded-[2px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
              <h2 className="text-[15px] font-semibold text-neutral-800">Daily Sales</h2>
              <input
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="rounded-[3px] border border-neutral-300 px-2 py-1 text-[13px] text-neutral-700 outline-none focus:border-sky-600"
              />
            </div>
            <div className="px-5 py-4">
              {dailyLoading ? (
                <div className="flex justify-center py-8">
                  <Loader />
                </div>
              ) : dailyError ? (
                <p className="py-4 text-center text-sm text-red-600">{dailyError}</p>
              ) : daily ? (
                <>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[12px] uppercase tracking-wide text-neutral-500">Orders</p>
                      <p className="mt-0.5 text-xl font-semibold text-neutral-800">{daily.orders_count}</p>
                    </div>
                    <div>
                      <p className="text-[12px] uppercase tracking-wide text-neutral-500">Discount</p>
                      <p className="mt-0.5 text-xl font-semibold text-neutral-800">{usd(daily.discount)}</p>
                    </div>
                    <div>
                      <p className="text-[12px] uppercase tracking-wide text-neutral-500">Net Sales</p>
                      <p className="mt-0.5 text-xl font-semibold text-emerald-700">{usd(daily.net_sales)}</p>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-neutral-200 pt-3">
                    <p className="text-[12.5px] font-semibold text-[#54717e]">Payments</p>
                    {daily.payment_summary.length === 0 ? (
                      <p className="pt-2 text-[13px] italic text-neutral-500">No payments on this day.</p>
                    ) : (
                      <table className="mt-1.5 w-full text-[13px]">
                        <tbody>
                          {daily.payment_summary.map((p) => (
                            <tr key={p.method} className="border-b border-neutral-100 text-neutral-700">
                              <td className="py-1.5 capitalize">{p.method.replace('_', ' ')}</td>
                              <td className="py-1.5 text-right text-neutral-500">{p.count}×</td>
                              <td className="py-1.5 text-right text-neutral-800">{usd(p.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* Top sellers */}
          <div className="rounded-[2px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <div className="border-b border-neutral-200 px-5 py-3">
              <h2 className="text-[15px] font-semibold text-neutral-800">Top Sellers (all time)</h2>
            </div>
            <div className="px-5 py-2">
              {top.length === 0 ? (
                <p className="py-4 text-[13px] italic text-neutral-500">No sales recorded yet.</p>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-neutral-800">
                      <th className="py-2 pr-4 font-bold">Product</th>
                      <th className="py-2 pr-4 text-right font-bold">Qty</th>
                      <th className="py-2 text-right font-bold">Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((t) => (
                      <tr key={t.menu_item_id} className="border-b border-neutral-100 text-neutral-700">
                        <td className="py-2 pr-4 text-neutral-800">{t.name}</td>
                        <td className="py-2 pr-4 text-right">{Number(t.total_quantity)}</td>
                        <td className="py-2 text-right">{usd(t.total_sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Recent orders */}
        <div className="mx-4 mt-4 rounded-[2px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="border-b border-neutral-200 px-5 py-3">
            <h2 className="text-[15px] font-semibold text-neutral-800">Recent Orders</h2>
          </div>
          <div className="px-5 py-2">
            {summary.recent_orders.length === 0 ? (
              <p className="py-4 text-[13px] italic text-neutral-500">No orders yet.</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-800">
                    <th className="py-2 pr-4 font-bold">Order Ref</th>
                    <th className="py-2 pr-4 font-bold">Time</th>
                    <th className="py-2 pr-4 font-bold">Table</th>
                    <th className="py-2 pr-4 font-bold">Cashier</th>
                    <th className="py-2 pr-4 text-right font-bold">Total</th>
                    <th className="py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recent_orders.map((o) => (
                    <tr key={o.id} className="border-b border-neutral-100 text-neutral-700">
                      <td className="py-2 pr-4 text-neutral-800">{o.order_number ?? '—'}</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {new Date(o.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">{o.table?.name ?? '—'}</td>
                      <td className="py-2 pr-4">{o.user?.name ?? '—'}</td>
                      <td className="py-2 pr-4 text-right text-neutral-800">{usd(o.total)}</td>
                      <td className="py-2 capitalize">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
