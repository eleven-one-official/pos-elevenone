import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { LuChefHat, LuClock, LuTimer } from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import {
  fetchChefPerformance,
  type AnalysisPeriod,
  type ChefPerformanceRow,
} from '../../services/api/reports'

// ---------------------------------------------------------------------------
// Reporting › Chef Performance — a per-cook KPI over the real order history
// (via /reports/chef-performance). Every ticket a cook took at the kitchen
// display (tapped Start, naming themselves) counts toward their orders, the
// item units they cooked, and their average cook time (Start → Ready). The
// period filter windows the numbers; busiest cook leads.
// ---------------------------------------------------------------------------

const PERIODS: { label: string; value: AnalysisPeriod }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
  { label: 'All Time', value: '' },
]

/** Seconds → "7m 12s" / "48s" / "1h 3m"; a dash when there's no timing yet. */
function fmtPrep(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export default function PosChefPerformance() {
  const [period, setPeriod] = useState<AnalysisPeriod>('week')
  const [rows, setRows] = useState<ChefPerformanceRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchChefPerformance(period)
      .then((res) => {
        if (!cancelled) setRows(res)
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load the chef performance report.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, refreshKey])

  const data = rows ?? []
  const totalOrders = data.reduce((sum, r) => sum + r.orders, 0)
  const totalItems = data.reduce((sum, r) => sum + r.items, 0)
  const maxOrders = data.reduce((max, r) => Math.max(max, r.orders), 0)
  // Overall average cook time, weighted by the tickets that carry a timing.
  const timed = data.filter((r) => r.avg_prep_seconds !== null)

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-3">
          <h1 className="text-xl text-neutral-700">Chef Performance</h1>
          <div className="inline-flex overflow-hidden rounded-[3px] border border-neutral-300 divide-x divide-neutral-300">
            {PERIODS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-[13px] transition ${
                  period === p.value
                    ? 'bg-[#57779a] text-white'
                    : 'bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && rows === null ? (
        <div className="flex flex-1 items-center justify-center pb-16">
          <Loader />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-16 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
          >
            Retry
          </button>
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 pb-16 text-center text-neutral-500">
          <LuChefHat className="h-10 w-10 text-neutral-300" />
          <p className="text-sm">No cooked tickets in this period yet.</p>
          <p className="text-xs text-neutral-400">
            Numbers appear once cooks tap Start (naming themselves) on the kitchen display.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* Headline cards */}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard icon={<LuChefHat className="h-4 w-4" />} label="Orders cooked" value={totalOrders.toLocaleString('en-US')} />
            <StatCard icon={<LuTimer className="h-4 w-4" />} label="Item units" value={totalItems.toLocaleString('en-US')} />
            <StatCard
              icon={<LuClock className="h-4 w-4" />}
              label="Avg cook time"
              value={
                timed.length === 0
                  ? '—'
                  : fmtPrep(
                      Math.round(
                        timed.reduce((sum, r) => sum + (r.avg_prep_seconds ?? 0), 0) / timed.length,
                      ),
                    )
              }
            />
          </div>

          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-800">
                <th className="py-2.5 pr-4 font-bold">Chef</th>
                <th className="w-[34%] py-2.5 pr-4 font-bold">Orders</th>
                <th className="w-[14%] py-2.5 pr-4 text-right font-bold">Items</th>
                <th className="w-[16%] py-2.5 pr-4 text-right font-bold">Avg cook time</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.chef_id} className="border-b border-neutral-100 text-neutral-700">
                  <td className="py-2.5 pr-4 font-medium text-neutral-800">{r.chef}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full bg-[#57779a]"
                          style={{ width: `${maxOrders > 0 ? (r.orders / maxOrders) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right tabular-nums">{r.orders}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{r.items}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPrep(r.avg_prep_seconds)}</td>
                </tr>
              ))}
              <tr className="bg-neutral-50/70 font-bold text-neutral-800">
                <td className="py-2.5 pr-4">Total</td>
                <td className="py-2.5 pr-4 tabular-nums">{totalOrders}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{totalItems}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">
                  {timed.length === 0
                    ? '—'
                    : fmtPrep(
                        Math.round(
                          timed.reduce((sum, r) => sum + (r.avg_prep_seconds ?? 0), 0) / timed.length,
                        ),
                      )}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mt-4 text-[12px] italic text-neutral-500">
            Cook time is the gap between a cook tapping Start and Ready on the kitchen display.
            Tickets still cooking, or from before this feature, carry no timing and show a dash.
          </p>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[3px] border border-neutral-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-neutral-800">{value}</div>
    </div>
  )
}
