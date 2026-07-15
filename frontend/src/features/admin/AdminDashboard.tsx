import { useCallback, useEffect, useState } from 'react'
import {
  LuArmchair,
  LuBanknote,
  LuHourglass,
  LuReceipt,
  LuRefreshCw,
  LuTrendingUp,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { fetchDashboard, type DashboardOrder, type DashboardSummary } from '../../services/api/reports'
import { ApiError } from '../../services/api/client'
import { usd } from './format'
import { LoadingPanel, ErrorPanel } from './AdminStates'

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: IconType
  label: string
  value: string
  tint: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
        <div className="mt-0.5 truncate text-2xl font-bold text-neutral-900">{value}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recent orders
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-sky-100 text-sky-700',
  preparing: 'bg-amber-100 text-amber-700',
  ready: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] ?? 'bg-neutral-100 text-neutral-600'
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${cls}`}>
      {status}
    </span>
  )
}

function orderTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function RecentOrders({ orders }: { orders: DashboardOrder[] }) {
  return (
    <div className="rounded-2xl bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-5 py-4">
        <h2 className="text-sm font-bold text-neutral-800">Recent Orders</h2>
      </div>
      {orders.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-neutral-400">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-5 py-2.5 font-semibold">Order</th>
                <th className="px-5 py-2.5 font-semibold">Table</th>
                <th className="px-5 py-2.5 font-semibold">Staff</th>
                <th className="px-5 py-2.5 font-semibold">Time</th>
                <th className="px-5 py-2.5 font-semibold">Status</th>
                <th className="px-5 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {orders.map((o) => (
                <tr key={o.id} className="text-neutral-700">
                  <td className="px-5 py-3 font-semibold text-neutral-900">
                    {o.order_number ?? `#${o.id}`}
                  </td>
                  <td className="px-5 py-3">{o.table?.name ?? 'Take Away'}</td>
                  <td className="px-5 py-3">{o.user?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-neutral-500">{orderTime(o.created_at)}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">{usd(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tables status
// ---------------------------------------------------------------------------

function TableStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-neutral-600">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="text-sm font-bold text-neutral-900">{value}</span>
    </div>
  )
}

function TablesCard({ tables }: { tables: DashboardSummary['tables'] }) {
  const occupancy = tables.total > 0 ? Math.round((tables.occupied / tables.total) * 100) : 0
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <LuArmchair className="h-5 w-5 text-neutral-400" />
        <h2 className="text-sm font-bold text-neutral-800">Tables</h2>
      </div>

      <div className="mt-4 flex items-end gap-1">
        <span className="text-3xl font-bold text-neutral-900">{occupancy}%</span>
        <span className="pb-1 text-xs text-neutral-500">occupied</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-primary" style={{ width: `${occupancy}%` }} />
      </div>

      <div className="mt-4 space-y-2.5">
        <TableStat label="Occupied" value={tables.occupied} color="#f0a11e" />
        <TableStat label="Available" value={tables.available} color="#4caf50" />
        <TableStat label="Reserved" value={tables.reserved} color="#5c6bc0" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await fetchDashboard())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <LoadingPanel label="Loading dashboard…" />
  if (error || !data) return <ErrorPanel message={error || 'No data.'} onRetry={() => void load()} />

  return (
    <div className="p-8">
      <div className="mb-5 flex justify-end">
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-50"
        >
          <LuRefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={LuBanknote}
          label="Today's Sales"
          value={usd(data.today_sales)}
          tint="bg-emerald-100 text-emerald-600"
        />
        <StatCard
          icon={LuTrendingUp}
          label="This Month"
          value={usd(data.monthly_sales)}
          tint="bg-sky-100 text-sky-600"
        />
        <StatCard
          icon={LuReceipt}
          label="Orders Today"
          value={String(data.total_orders_today)}
          tint="bg-primary/10 text-primary"
        />
        <StatCard
          icon={LuHourglass}
          label="Pending Orders"
          value={String(data.pending_orders)}
          tint="bg-amber-100 text-amber-600"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <RecentOrders orders={data.recent_orders} />
        <TablesCard tables={data.tables} />
      </div>
    </div>
  )
}
