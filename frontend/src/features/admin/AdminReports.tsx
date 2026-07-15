import { useCallback, useEffect, useState } from 'react'
import { LuCalendarDays, LuTrophy, LuWallet } from 'react-icons/lu'
import {
  fetchDailySales,
  fetchTopItems,
  type DailySales,
  type TopItem,
} from '../../services/api/reports'
import { ApiError } from '../../services/api/client'
import { usd } from './format'
import { LoadingPanel, ErrorPanel } from './AdminStates'

/** Local YYYY-MM-DD for today, used as the default and the date picker's max. */
function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? 'text-primary' : 'text-neutral-900'}`}>
        {value}
      </div>
    </div>
  )
}

function PaymentBreakdown({ sales }: { sales: DailySales }) {
  const rows = sales.payment_summary
  const total = rows.reduce((sum, r) => sum + Number(r.total), 0)
  return (
    <div className="rounded-2xl bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
        <LuWallet className="h-5 w-5 text-neutral-400" />
        <h2 className="text-sm font-bold text-neutral-800">Payments by Method</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-neutral-400">No payments recorded on this day.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {rows.map((r) => {
            const share = total > 0 ? Math.round((Number(r.total) / total) * 100) : 0
            return (
              <li key={r.method} className="px-5 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold capitalize text-neutral-800">{r.method}</span>
                  <span className="text-sm font-bold text-neutral-900">{usd(r.total)}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs text-neutral-500">
                    {r.count} · {share}%
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function TopItems({ items }: { items: TopItem[] }) {
  return (
    <div className="rounded-2xl bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
        <LuTrophy className="h-5 w-5 text-amber-500" />
        <h2 className="text-sm font-bold text-neutral-800">Best Sellers</h2>
        <span className="ml-auto text-xs text-neutral-400">all time</span>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-neutral-400">No sales yet.</p>
      ) : (
        <ol className="divide-y divide-neutral-100">
          {items.map((item, i) => (
            <li key={item.menu_item_id} className="flex items-center gap-3 px-5 py-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  i < 3 ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
                {item.name}
              </span>
              <span className="shrink-0 text-sm text-neutral-500">×{Number(item.total_quantity)}</span>
              <span className="w-20 shrink-0 text-right text-sm font-semibold text-neutral-900">
                {usd(item.total_sales)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default function AdminReports() {
  const [date, setDate] = useState<string>(todayISO)
  const [sales, setSales] = useState<DailySales | null>(null)
  const [top, setTop] = useState<TopItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (forDate: string) => {
    setLoading(true)
    setError('')
    try {
      const [dailySales, topItems] = await Promise.all([fetchDailySales(forDate), fetchTopItems(10)])
      setSales(dailySales)
      setTop(topItems)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load reports.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(date)
  }, [load, date])

  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-700 shadow-sm">
          <LuCalendarDays className="h-4 w-4 text-neutral-400" />
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value || todayISO())}
            className="bg-transparent font-semibold text-neutral-800 outline-none"
          />
        </label>
      </div>

      {loading && (
        <div className="flex-1">
          <LoadingPanel label="Loading reports…" />
        </div>
      )}
      {!loading && (error || !sales) && (
        <div className="flex-1">
          <ErrorPanel message={error || 'No data.'} onRetry={() => void load(date)} />
        </div>
      )}

      {!loading && !error && sales && (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
            <SummaryTile label="Orders" value={String(sales.orders_count)} />
            <SummaryTile label="Gross Sales" value={usd(sales.gross_sales)} />
            <SummaryTile label="Discount" value={usd(sales.discount)} />
            <SummaryTile label="Tax" value={usd(sales.tax)} />
            <SummaryTile label="Net Sales" value={usd(sales.net_sales)} accent />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PaymentBreakdown sales={sales} />
            <TopItems items={top} />
          </div>
        </>
      )}
    </div>
  )
}
