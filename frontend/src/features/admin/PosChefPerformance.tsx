import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  LuChefHat,
  LuChevronDown,
  LuChevronRight,
  LuClock,
  LuFileSpreadsheet,
  LuLayers,
  LuSearch,
  LuUsers,
} from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import { fetchChefs, type Chef } from '../../services/api/chefs'
import {
  fetchChefPerformance,
  type AnalysisPeriod,
  type ChefDishDetailRow,
  type ChefDishRow,
  type ChefPerformanceData,
  type ChefTicket,
  type Station,
} from '../../services/api/reports'
import { downloadReportExcel } from './exportExcel'

// ---------------------------------------------------------------------------
// Reporting › Chef Performance — a per-cook KPI over the real order history
// (via /reports/chef-performance). Every ticket a cook took at the kitchen or
// bar display (tapped Start, naming themselves) counts toward their orders,
// the item units they made, and their cook time (Start → Ready).
//
// Four views over the same filtered set of tickets: Overview (the headline
// numbers + the leaderboard), Analysis (how the work and the clock move over
// days, hours and people), Dishes (each dish's plates and how long its tickets
// ran) and Details (the raw ticket list behind it all). The period, the cook
// and the station filter all four at once, and the whole report exports to
// Excel from the header.
// ---------------------------------------------------------------------------

const PERIODS: { label: string; value: AnalysisPeriod }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
  { label: 'All Time', value: '' },
]

const TABS = ['Overview', 'Analysis', 'Dishes', 'By Chef', 'Details'] as const
type Tab = (typeof TABS)[number]

const STATIONS: { label: string; value: Station | '' }[] = [
  { label: 'All stations', value: '' },
  { label: 'Kitchen', value: 'kitchen' },
  { label: 'Bar', value: 'bar' },
]

const SORTS = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Slowest first', value: 'slowest' },
  { label: 'Fastest first', value: 'fastest' },
  { label: 'Most items', value: 'items' },
] as const
type SortKey = (typeof SORTS)[number]['value']

// Volume and duration are different measures, so they never share an axis —
// one hue, two plots. Matches the Orders Analysis graph.
const MARK = '#3f7cb1'

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

const num = (n: number) => n.toLocaleString('en-US')

/** "Jul 21, 18:42" — the browser's clock, which is the venue's. */
function fmtStamp(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function fmtClock(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** "2026-07-21" → "Jul 21" for an axis tick. */
function fmtDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** "2026-07-21" → "Tue, Jul 21, 2026" for the day ledger, where an All-Time
 *  window can span years and a bare "Jul 21" would be ambiguous. */
function fmtDayLong(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** A custom window, spelled out where a pill label would go — on screen
 *  states and on the export subtitle. Handles a single bound too. */
function rangeLabel(from: string, to: string): string {
  const day = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  if (from && to) return from === to ? day(from) : `${day(from)} – ${day(to)}`
  return from ? `From ${day(from)}` : `Until ${day(to)}`
}

/** Round axis maximum, so ticks land on 1/2/5×10ⁿ. The top tick always clears
 *  the data — an axis that stops short would plot the peak off the chart. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(Number(t.toFixed(6)))
  return ticks
}

export default function PosChefPerformance() {
  const [period, setPeriod] = useState<AnalysisPeriod>('week')
  // A picked From/To window (local YYYY-MM-DD) overrides the preset pills;
  // either bound may stand alone.
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [chefId, setChefId] = useState<number | null>(null)
  const [station, setStation] = useState<Station | ''>('')
  const [tab, setTab] = useState<Tab>('Overview')

  const customRange = from !== '' || to !== ''

  const [data, setData] = useState<ChefPerformanceData | null>(null)
  const [roster, setRoster] = useState<Chef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Details-only controls.
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchChefPerformance({
      period: customRange ? '' : period,
      chefId,
      station: station || null,
      from: from || null,
      to: to || null,
    })
      .then((res) => {
        if (!cancelled) setData(res)
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
  }, [period, customRange, from, to, chefId, station, refreshKey])

  // The filter lists everyone on the roster, not just whoever cooked in the
  // window — picking a quiet cook and seeing zero is an answer too.
  useEffect(() => {
    let cancelled = false
    fetchChefs()
      .then((res) => {
        if (!cancelled) setRoster(res)
      })
      .catch(() => {
        /* the report still works without the picker */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const details = useMemo(() => {
    const rows = data?.details ?? []
    const q = search.trim().toLowerCase()
    const matched = q
      ? rows.filter((r) =>
          [r.chef, r.order_number, r.table, r.station, ...r.lines.map((l) => l.name)].some((v) =>
            (v ?? '').toLowerCase().includes(q),
          ),
        )
      : rows
    const sorted = [...matched]
    // Untimed tickets have no cook time to rank, so they sink to the bottom.
    if (sort === 'slowest') sorted.sort((a, b) => (b.prep_seconds ?? -1) - (a.prep_seconds ?? -1))
    else if (sort === 'fastest')
      sorted.sort((a, b) => (a.prep_seconds ?? Infinity) - (b.prep_seconds ?? Infinity))
    else if (sort === 'items') sorted.sort((a, b) => b.items - a.items)
    return sorted
  }, [data, search, sort])

  const overview = data?.overview
  const empty = !!data && data.overview.rounds === 0

  const periodLabel = customRange
    ? rangeLabel(from, to)
    : (PERIODS.find((p) => p.value === period)?.label ?? 'All Time')
  // "This Week — Bopha — Kitchen": the filters, spelled out on the export.
  const chefName = chefId === null ? null : (roster.find((c) => c.id === chefId)?.name ?? null)
  const exportSubtitle = [periodLabel, chefName, station ? titleCase(station) : null]
    .filter(Boolean)
    .join(' — ')
  const canExport = !!data && data.overview.rounds > 0

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <div>
            <h1 className="text-xl text-neutral-700">Chef Performance</h1>
            <p className="mt-1 text-[13px] text-neutral-500">
              Every ticket a cook started on a display board — how many, how much, how fast.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="inline-flex divide-x divide-neutral-300 overflow-hidden rounded-[3px] border border-neutral-300">
              {PERIODS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setPeriod(p.value)
                    setFrom('')
                    setTo('')
                  }}
                  className={`px-3 py-1.5 text-[13px] transition ${
                    !customRange && period === p.value
                      ? 'bg-[#57779a] text-white'
                      : 'bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Or an exact window — picking a date takes over from the pills. */}
            <div className="flex items-center gap-1.5 text-[13px] text-neutral-500">
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-[3px] border border-neutral-300 bg-white px-2 py-1 text-[13px] text-neutral-700 outline-none transition focus:border-sky-600"
              />
              <span>to</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-[3px] border border-neutral-300 bg-white px-2 py-1 text-[13px] text-neutral-700 outline-none transition focus:border-sky-600"
              />
              {customRange && (
                <button
                  type="button"
                  onClick={() => {
                    setFrom('')
                    setTo('')
                  }}
                  className="text-[13px] text-neutral-500 underline-offset-2 transition hover:text-neutral-700 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {/* Views */}
          <div className="flex gap-5">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`-mb-[11px] border-b-2 pb-2 text-[13px] transition ${
                  tab === t
                    ? 'border-[#57779a] font-semibold text-[#57779a]'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Filters — they narrow all three views at once */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={chefId ?? ''}
              onChange={(e) => setChefId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-[3px] border border-neutral-300 bg-white px-2 py-1.5 text-[13px] text-neutral-700 outline-none focus:border-sky-600"
            >
              <option value="">All chefs</option>
              {roster.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.is_active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
            <select
              value={station}
              onChange={(e) => setStation(e.target.value as Station | '')}
              className="rounded-[3px] border border-neutral-300 bg-white px-2 py-1.5 text-[13px] text-neutral-700 outline-none focus:border-sky-600"
            >
              {STATIONS.map((s) => (
                <option key={s.label} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {(chefId !== null || station !== '') && (
              <button
                type="button"
                onClick={() => {
                  setChefId(null)
                  setStation('')
                }}
                className="text-[13px] text-neutral-500 underline-offset-2 transition hover:text-neutral-700 hover:underline"
              >
                Clear
              </button>
            )}

            {/* The whole report — every view, current filters — as a file. */}
            <span className="mx-1 h-5 w-px bg-neutral-200" />
            <button
              type="button"
              onClick={() => data && exportReport(data, exportSubtitle)}
              disabled={!canExport}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
            >
              <LuFileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </button>
          </div>
        </div>
      </div>

      {loading && data === null ? (
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
      ) : empty || !overview || !data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 pb-16 text-center text-neutral-500">
          <LuChefHat className="h-10 w-10 text-neutral-300" />
          <p className="text-sm">No cooked tickets match these filters.</p>
          <p className="text-xs text-neutral-400">
            Numbers appear once cooks tap Start (naming themselves) on a display board.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'Overview' && <Overview data={data} />}
          {tab === 'Analysis' && <Analysis data={data} />}
          {tab === 'Dishes' && <Dishes rows={data.by_item} />}
          {tab === 'By Chef' && (
            <ByChef
              rows={
                chefId === null
                  ? (data.by_chef_item ?? [])
                  : (data.by_chef_item ?? []).filter((r) => r.chef_id === chefId)
              }
            />
          )}
          {tab === 'Details' && (
            <Details
              rows={details}
              total={data.details_total}
              shown={data.details.length}
              search={search}
              onSearch={setSearch}
              sort={sort}
              onSort={setSort}
              periodLabel={exportSubtitle}
            />
          )}

          <p className="mt-4 text-[12px] italic text-neutral-500">
            Cook time is the gap between a cook tapping Start and Ready on a display board — since
            per-dish tracking, on each dish itself, so a dish&apos;s time is its own clock and a
            cook&apos;s time covers exactly the dishes they made. A ticket is one round fired to
            one station, so a table that ordered twice counts twice here but stays one order.
            Tickets from before per-dish tracking are timed as a whole card; ones still cooking,
            or never started, carry no timing and show a dash.
          </p>
        </div>
      )}
    </div>
  )
}

// --- Overview ---------------------------------------------------------------

function Overview({ data }: { data: ChefPerformanceData }) {
  const { overview, chefs } = data
  const maxRounds = chefs.reduce((max, r) => Math.max(max, r.rounds), 0)
  const totalRounds = overview.rounds

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<LuChefHat className="h-4 w-4" />}
          label="Orders cooked"
          value={num(overview.orders)}
          hint={`${num(overview.rounds)} tickets fired`}
        />
        <StatCard
          icon={<LuLayers className="h-4 w-4" />}
          label="Item units"
          value={num(overview.items)}
          hint={
            overview.rounds > 0
              ? `${(overview.items / overview.rounds).toFixed(1)} per ticket`
              : undefined
          }
        />
        <StatCard
          icon={<LuClock className="h-4 w-4" />}
          label="Avg cook time"
          value={fmtPrep(overview.avg_prep_seconds)}
          hint={`over ${num(overview.timed_rounds)} timed ticket${
            overview.timed_rounds === 1 ? '' : 's'
          }`}
        />
        <StatCard
          icon={<LuUsers className="h-4 w-4" />}
          label="Cooks working"
          value={num(overview.chefs)}
          hint={overview.busiest_chef ? `${overview.busiest_chef} led` : undefined}
        />
      </div>

      <Panel title="Leaderboard" subtitle="Busiest cook first">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-800">
              <th className="py-2.5 pr-4 font-bold">Chef</th>
              <th className="w-[30%] py-2.5 pr-4 font-bold">Tickets</th>
              <th className="w-[10%] py-2.5 pr-4 text-right font-bold">Share</th>
              <th className="w-[10%] py-2.5 pr-4 text-right font-bold">Orders</th>
              <th className="w-[10%] py-2.5 pr-4 text-right font-bold">Items</th>
              <th className="w-[14%] py-2.5 pr-4 text-right font-bold">Avg cook time</th>
            </tr>
          </thead>
          <tbody>
            {chefs.map((r) => (
              <tr key={r.chef_id} className="border-b border-neutral-100 text-neutral-700">
                <td className="py-2.5 pr-4 font-medium text-neutral-800">{r.chef}</td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full bg-[#57779a]"
                        style={{ width: `${maxRounds > 0 ? (r.rounds / maxRounds) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right tabular-nums">{r.rounds}</span>
                  </div>
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums">
                  {totalRounds > 0 ? `${Math.round((r.rounds / totalRounds) * 100)}%` : '—'}
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{r.orders}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{r.items}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">
                  {fmtPrep(r.avg_prep_seconds)}
                </td>
              </tr>
            ))}
            <tr className="bg-neutral-50/70 font-bold text-neutral-800">
              <td className="py-2.5 pr-4">Total</td>
              <td className="py-2.5 pr-4 tabular-nums">{num(overview.rounds)}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">100%</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{num(overview.orders)}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{num(overview.items)}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">
                {fmtPrep(overview.avg_prep_seconds)}
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>
    </>
  )
}

// --- Analysis ---------------------------------------------------------------

function Analysis({ data }: { data: ChefPerformanceData }) {
  const { overview, by_day, by_hour, chefs } = data

  const dayVolume = by_day.map((b) => ({ c: fmtDay(b.date ?? ''), v: b.rounds }))
  const dayTimed = by_day.filter((b) => b.avg_prep_seconds !== null)
  const daySpeed = dayTimed.map((b) => ({ c: fmtDay(b.date ?? ''), v: b.avg_prep_seconds ?? 0 }))
  const hourVolume = by_hour.map((b) => ({ c: `${String(b.hour).padStart(2, '0')}:00`, v: b.rounds }))
  const chefSpeed = chefs
    .filter((r) => r.avg_prep_seconds !== null)
    .map((r) => ({ label: r.chef, value: r.avg_prep_seconds ?? 0, hint: `${r.timed_rounds} timed` }))
    .sort((a, b) => a.value - b.value)

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <Panel title="Tickets per day" subtitle="How much work went through the boards">
        <Chart type="bar" data={dayVolume} yLabel="Tickets" xLabel="Day" fmt={num} />
      </Panel>

      <Panel title="Average cook time per day" subtitle="Start → Ready, timed tickets only">
        {daySpeed.length === 0 ? (
          <Blank>No ticket in this window carries both a Start and a Ready stamp yet.</Blank>
        ) : (
          <Chart type="line" data={daySpeed} yLabel="Cook time" xLabel="Day" fmt={fmtPrep} />
        )}
      </Panel>

      <Panel title="Tickets by hour of day" subtitle="When the rush actually lands">
        <Chart type="bar" data={hourVolume} yLabel="Tickets" xLabel="Hour" fmt={num} flat />
      </Panel>

      <Panel title="Average cook time by cook" subtitle="Fastest first — read it with the ticket count">
        {chefSpeed.length === 0 ? (
          <Blank>No timed tickets to compare yet.</Blank>
        ) : (
          <RankedBars rows={chefSpeed} fmt={fmtPrep} />
        )}
      </Panel>

      {/* The charts above as a ledger — with the cook filter on, this is one
          person's day-by-day output: how many plates, and how fast. */}
      <div className="xl:col-span-2">
        <Panel title="Day by day" subtitle="One line per service day, newest first — plates included">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-800">
                <th className="py-2.5 pr-4 font-bold">Date</th>
                <th className="py-2.5 pr-4 text-right font-bold">Tickets</th>
                <th className="py-2.5 pr-4 text-right font-bold" title="Total plates — quantities added up">
                  Plates
                </th>
                <th className="py-2.5 pr-4 text-right font-bold">Avg cook time</th>
              </tr>
            </thead>
            <tbody>
              {[...by_day].reverse().map((b) => (
                <tr key={b.date} className="border-b border-neutral-100 text-neutral-700">
                  <td className="py-2.5 pr-4 text-neutral-800">{fmtDayLong(b.date ?? '')}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{num(b.rounds)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{num(b.items)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPrep(b.avg_prep_seconds)}</td>
                </tr>
              ))}
              <tr className="bg-neutral-50/70 font-bold text-neutral-800">
                <td className="py-2.5 pr-4">Total</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{num(overview.rounds)}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{num(overview.items)}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPrep(overview.avg_prep_seconds)}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  )
}

/** Horizontal bars for a small, named set — the axis is the names. */
function RankedBars({
  rows,
  fmt,
}: {
  rows: { label: string; value: number; hint?: string }[]
  fmt: (v: number) => string
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  return (
    <div className="flex flex-col gap-2.5 py-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-[13px]">
          <span className="w-28 shrink-0 truncate text-neutral-700" title={r.label}>
            {r.label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-[2px] bg-neutral-100">
            <div
              className="h-full rounded-[2px]"
              style={{
                width: `${max > 0 ? Math.max((r.value / max) * 100, 1.5) : 0}%`,
                backgroundColor: MARK,
              }}
            />
          </div>
          <span className="w-20 shrink-0 text-right tabular-nums text-neutral-800">
            {fmt(r.value)}
          </span>
          <span className="w-20 shrink-0 text-right text-[12px] text-neutral-400">{r.hint}</span>
        </div>
      ))}
    </div>
  )
}

/** One measure, one axis — bars for counts, a line for a duration trend. */
function Chart({
  type,
  data,
  yLabel,
  xLabel,
  fmt,
  flat,
}: {
  type: 'bar' | 'line'
  data: { c: string; v: number }[]
  yLabel: string
  xLabel: string
  fmt: (v: number) => string
  /** Horizontal category labels — for short ones like "14:00". */
  flat?: boolean
}) {
  if (data.length === 0) return <Blank>Nothing to plot in this window.</Blank>

  const W = 1000
  const plotR = 12
  const plotT = 12
  const plotH = 240
  const labelH = flat ? 30 : 78
  const H = plotT + plotH + labelH + 26
  const ticks = niceTicks(Math.max(...data.map((d) => d.v)))
  const maxV = ticks[ticks.length - 1] || 1
  // Duration ticks ("16m 40s") are far wider than counts — give the gutter the
  // room the longest one actually needs, plus the rotated axis title.
  const tickChars = Math.max(...ticks.map((t) => fmt(t).length))
  const plotL = 30 + tickChars * 6
  const plotW = W - plotL - plotR
  const slot = plotW / data.length
  const barW = Math.min(slot * 0.62, 26)
  const y = (v: number) => plotT + plotH - (v / maxV) * plotH
  const points = data.map((d, i) => ({ x: plotL + i * slot + slot / 2, y: y(d.v) }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `M${points[0].x},${plotT + plotH} ${points
    .map((p) => `L${p.x},${p.y}`)
    .join(' ')} L${points[points.length - 1].x},${plotT + plotH} Z`
  // Crowded axes get every other label rather than a pile of overlaps.
  const labelEvery = Math.ceil(data.length / (flat ? 24 : 30))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={plotL} x2={W - plotR} y1={y(t)} y2={y(t)} stroke="#e7e7e7" strokeWidth="1" />
          <text x={plotL - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill="#8a8a8a">
            {fmt(t)}
          </text>
        </g>
      ))}

      {type === 'bar' ? (
        data.map((d, i) => {
          const barH = plotT + plotH - y(d.v)
          return (
            <rect
              key={d.c + i}
              x={plotL + i * slot + (slot - barW) / 2}
              y={y(d.v)}
              width={barW}
              height={Math.max(barH, d.v > 0 ? 1 : 0)}
              rx={Math.min(4, barW / 2)}
              fill={MARK}
            >
              <title>{`${d.c}\n${yLabel}: ${fmt(d.v)}`}</title>
            </rect>
          )
        })
      ) : (
        <>
          <path d={areaPath} fill={MARK} opacity="0.18" />
          <path d={linePath} fill="none" stroke={MARK} strokeWidth="2" />
          {data.map((d, i) => (
            <circle key={d.c + i} cx={points[i].x} cy={points[i].y} r="4" fill={MARK} stroke="#fff" strokeWidth="2">
              <title>{`${d.c}\n${yLabel}: ${fmt(d.v)}`}</title>
            </circle>
          ))}
        </>
      )}

      <line
        x1={plotL}
        x2={W - plotR}
        y1={plotT + plotH}
        y2={plotT + plotH}
        stroke="#c9c9c9"
        strokeWidth="1"
      />

      {data.map((d, i) => {
        if (i % labelEvery !== 0) return null
        const x = plotL + i * slot + slot / 2
        const ly = plotT + plotH + (flat ? 16 : 12)
        return (
          <text
            key={d.c + i}
            transform={flat ? undefined : `rotate(-40 ${x} ${ly})`}
            x={x}
            y={ly}
            textAnchor={flat ? 'middle' : 'end'}
            fontSize="10.5"
            fill="#8a8a8a"
          >
            {d.c}
          </text>
        )
      })}

      <text
        transform={`rotate(-90 14 ${plotT + plotH / 2})`}
        x={14}
        y={plotT + plotH / 2}
        textAnchor="middle"
        fontSize="11"
        fill="#6f6f6f"
      >
        {yLabel}
      </text>
      <text x={plotL + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fill="#565656">
        {xLabel}
      </text>
    </svg>
  )
}

// --- Dishes -----------------------------------------------------------------

/** Per-dish output over the filtered tickets: how many plates of each dish
 *  went out, and how long the tickets carrying it took. With the cook filter
 *  on, this is one person's menu — their plates, their clock. */
function Dishes({ rows }: { rows: ChefDishRow[] }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows
  const maxUnits = rows.reduce((max, r) => Math.max(max, r.units), 0)
  const totalUnits = rows.reduce((sum, r) => sum + r.units, 0)

  return (
    <Panel
      title="Dishes"
      subtitle={`${num(rows.length)} dish${rows.length === 1 ? '' : 'es'} cooked in this window — most plates first`}
      action={
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a dish…"
            className="w-56 rounded-[3px] border border-neutral-300 px-3 py-1.5 pr-9 text-sm outline-none transition focus:border-sky-600"
          />
          <LuSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        </div>
      }
    >
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-800">
            <th className="py-2.5 pr-4 font-bold">Dish</th>
            <th className="w-[28%] py-2.5 pr-4 font-bold" title="Total plates — quantities added up">
              Plates
            </th>
            <th className="w-[9%] py-2.5 pr-4 text-right font-bold">Share</th>
            <th className="w-[10%] py-2.5 pr-4 text-right font-bold" title="Tickets the dish appeared on">
              Tickets
            </th>
            <th className="w-[10%] py-2.5 pr-4 text-right font-bold" title="Tickets carrying both a Start and a Ready stamp">
              Timed
            </th>
            <th className="w-[14%] py-2.5 pr-4 text-right font-bold" title="Average clock of the tickets the dish rode on">
              Avg cook time
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-4 text-[13px] italic text-neutral-500">
                No dish matches this search.
              </td>
            </tr>
          ) : (
            shown.map((r) => (
              <tr key={r.name} className="border-b border-neutral-100 text-neutral-700">
                <td className="py-2.5 pr-4 font-medium text-neutral-800">{r.name}</td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full bg-[#57779a]"
                        style={{ width: `${maxUnits > 0 ? (r.units / maxUnits) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right tabular-nums">{num(r.units)}</span>
                  </div>
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums">
                  {totalUnits > 0 ? `${Math.round((r.units / totalUnits) * 100)}%` : '—'}
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{num(r.rounds)}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{num(r.timed_rounds)}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPrep(r.avg_prep_seconds)}</td>
              </tr>
            ))
          )}
          {!q && rows.length > 0 && (
            <tr className="bg-neutral-50/70 font-bold text-neutral-800">
              <td className="py-2.5 pr-4">Total</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{num(totalUnits)}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">100%</td>
              {/* A ticket with two dishes sits on two rows, so ticket columns
                  don't add up to anything honest — leave them out. */}
              <td className="py-2.5 pr-4" />
              <td className="py-2.5 pr-4" />
              <td className="py-2.5 pr-4" />
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  )
}

// --- By Chef ----------------------------------------------------------------

/** Each cook's own menu, one card per person: every dish they made in the
 *  window, how many plates of it, and their own clock on it. Lines the board
 *  tracked credit only their real maker; whole-card-era lines credit the
 *  ticket's whole crew, so old shared cards still show under both cooks. */
function ByChef({ rows }: { rows: ChefDishDetailRow[] }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()

  // Rows arrive grouped — leaderboard order, biggest dish first — so one pass
  // cuts them back into a block per cook.
  const groups = useMemo(() => {
    const out: { chef_id: number; chef: string; dishes: ChefDishDetailRow[] }[] = []
    for (const r of rows) {
      const last = out[out.length - 1]
      if (last && last.chef_id === r.chef_id) last.dishes.push(r)
      else out.push({ chef_id: r.chef_id, chef: r.chef, dishes: [r] })
    }
    return out
  }, [rows])

  // A cook's name keeps their whole card; a dish name trims every card down
  // to the cooks who actually made it.
  const shown = q
    ? groups
        .map((g) =>
          g.chef.toLowerCase().includes(q)
            ? g
            : { ...g, dishes: g.dishes.filter((d) => d.name.toLowerCase().includes(q)) },
        )
        .filter((g) => g.dishes.length > 0)
    : groups

  if (rows.length === 0) {
    return <Blank>No cooked dish carries a cook&apos;s name in this window yet.</Blank>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a cook or a dish…"
            className="w-64 rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 pr-9 text-sm outline-none transition focus:border-sky-600"
          />
          <LuSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        </div>
      </div>

      {shown.length === 0 ? (
        <Blank>No cook or dish matches this search.</Blank>
      ) : (
        shown.map((g) => <ChefCard key={g.chef_id} chef={g.chef} dishes={g.dishes} />)
      )}
    </div>
  )
}

/** One cook's card: their headline numbers and their dish-by-dish table. */
function ChefCard({ chef, dishes }: { chef: string; dishes: ChefDishDetailRow[] }) {
  const plates = dishes.reduce((sum, d) => sum + d.units, 0)
  const maxUnits = dishes.reduce((max, d) => Math.max(max, d.units), 0)
  // The cook's overall pace, rebuilt from the same rows the table shows —
  // each dish's clock weighted by how many timed tickets stand behind it.
  const timed = dishes.reduce((sum, d) => sum + d.timed_rounds, 0)
  const avg =
    timed > 0
      ? Math.round(
          dishes.reduce((sum, d) => sum + (d.avg_prep_seconds ?? 0) * d.timed_rounds, 0) / timed,
        )
      : null

  return (
    <Panel
      title={chef}
      subtitle={`${num(plates)} plate${plates === 1 ? '' : 's'} across ${num(dishes.length)} dish${
        dishes.length === 1 ? '' : 'es'
      }${avg !== null ? ` — ${fmtPrep(avg)} per dish on average` : ''}`}
    >
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-800">
            <th className="py-2.5 pr-4 font-bold">Dish</th>
            <th className="w-[28%] py-2.5 pr-4 font-bold" title="Plates of this dish the cook made">
              Plates
            </th>
            <th className="w-[9%] py-2.5 pr-4 text-right font-bold" title="Of the cook's own plates">
              Share
            </th>
            <th className="w-[10%] py-2.5 pr-4 text-right font-bold" title="Tickets where the cook made this dish">
              Tickets
            </th>
            <th className="w-[10%] py-2.5 pr-4 text-right font-bold" title="Tickets carrying both a Start and a Ready stamp">
              Timed
            </th>
            <th className="w-[14%] py-2.5 pr-4 text-right font-bold" title="The cook's own average clock on this dish">
              Avg cook time
            </th>
          </tr>
        </thead>
        <tbody>
          {dishes.map((d) => (
            <tr key={d.name} className="border-b border-neutral-100 text-neutral-700">
              <td className="py-2.5 pr-4 font-medium text-neutral-800">{d.name}</td>
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full bg-[#57779a]"
                      style={{ width: `${maxUnits > 0 ? (d.units / maxUnits) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right tabular-nums">{num(d.units)}</span>
                </div>
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">
                {plates > 0 ? `${Math.round((d.units / plates) * 100)}%` : '—'}
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{num(d.rounds)}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{num(d.timed_rounds)}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPrep(d.avg_prep_seconds)}</td>
            </tr>
          ))}
          <tr className="bg-neutral-50/70 font-bold text-neutral-800">
            <td className="py-2.5 pr-4">Total</td>
            <td className="py-2.5 pr-4 text-right tabular-nums">{num(plates)}</td>
            <td className="py-2.5 pr-4 text-right tabular-nums">100%</td>
            {/* A ticket with two of the cook's dishes sits on two rows, so the
                ticket columns don't add up to anything honest — left out. */}
            <td className="py-2.5 pr-4" />
            <td className="py-2.5 pr-4" />
            <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPrep(avg)}</td>
          </tr>
        </tbody>
      </table>
    </Panel>
  )
}

// --- Details ----------------------------------------------------------------

function Details({
  rows,
  total,
  shown,
  search,
  onSearch,
  sort,
  onSort,
  periodLabel,
}: {
  rows: ChefTicket[]
  total: number
  shown: number
  search: string
  onSearch: (v: string) => void
  sort: SortKey
  onSort: (v: SortKey) => void
  /** The active filters spelled out — printed under the title on exports. */
  periodLabel: string
}) {
  // Which tickets have their dish list unfolded.
  const [open, setOpen] = useState<Set<number>>(new Set())
  const allOpen = rows.length > 0 && rows.every((r) => open.has(r.id))

  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Panel
      title="Tickets"
      subtitle={
        shown < total
          ? `Newest ${num(shown)} of ${num(total)} tickets`
          : `${num(rows.length)} ticket${rows.length === 1 ? '' : 's'}`
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Chef, order, table…"
              className="w-56 rounded-[3px] border border-neutral-300 px-3 py-1.5 pr-9 text-sm outline-none transition focus:border-sky-600"
            />
            <LuSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          </div>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as SortKey)}
            className="rounded-[3px] border border-neutral-300 bg-white px-2 py-1.5 text-[13px] text-neutral-700 outline-none focus:border-sky-600"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((r) => r.id)))}
            disabled={rows.length === 0}
            className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
          <button
            type="button"
            onClick={() => exportDetails(rows, periodLabel)}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            <LuFileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </button>
        </div>
      }
    >
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-800">
            <th className="w-6 py-2.5" />
            <th className="py-2.5 pr-4 font-bold">Date and time</th>
            <th className="py-2.5 pr-4 font-bold">Order</th>
            <th className="py-2.5 pr-4 font-bold">Table</th>
            <th className="py-2.5 pr-4 font-bold">Station</th>
            <th className="py-2.5 pr-4 font-bold">Chef</th>
            <th className="py-2.5 pr-4 font-bold">Dishes</th>
            <th className="py-2.5 pr-4 text-right font-bold" title="Distinct dishes on the ticket">
              Kinds
            </th>
            <th className="py-2.5 pr-4 text-right font-bold" title="Total plates — quantities added up">
              Units
            </th>
            <th className="py-2.5 pr-4 text-right font-bold">Start</th>
            <th className="py-2.5 pr-4 text-right font-bold">Ready</th>
            <th className="py-2.5 pr-4 text-right font-bold">Cook time</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={12} className="py-4 text-[13px] italic text-neutral-500">
                No ticket matches this search.
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const expanded = open.has(r.id)
              return [
                <tr
                  key={r.id}
                  onClick={() => toggle(r.id)}
                  className={`cursor-pointer border-b border-neutral-100 text-neutral-700 hover:bg-neutral-50 ${
                    expanded ? 'bg-neutral-50' : ''
                  }`}
                >
                  <td className="py-2.5 pl-1 text-neutral-400">
                    {expanded ? (
                      <LuChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <LuChevronRight className="h-3.5 w-3.5" />
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4">{fmtStamp(r.created_at)}</td>
                  <td className="py-2.5 pr-4 text-neutral-800">
                    {r.order_number ?? `#${r.order_id}`}
                  </td>
                  <td className="py-2.5 pr-4">{r.table ?? '—'}</td>
                  <td className="py-2.5 pr-4">{titleCase(r.station ?? '')}</td>
                  <td className="py-2.5 pr-4 font-medium text-neutral-800">{r.chef}</td>
                  <td className="max-w-[22rem] truncate py-2.5 pr-4" title={dishList(r)}>
                    {dishList(r) || '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{r.dishes}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{r.items}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtClock(r.started_at)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtClock(r.ready_at)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPrep(r.prep_seconds)}</td>
                </tr>,
                expanded && (
                  <tr key={`${r.id}-lines`} className="border-b border-neutral-100 bg-neutral-50">
                    <td />
                    <td colSpan={11} className="py-3 pr-4">
                      <div className="text-[12px] font-semibold uppercase tracking-wide text-neutral-400">
                        Dishes on this ticket
                      </div>
                      {r.lines.length === 0 ? (
                        <p className="mt-1.5 text-[13px] italic text-neutral-500">
                          No line survived on this ticket — the round was edited or voided.
                        </p>
                      ) : (
                        /* Each dish's own paper trail: who made it, its two
                           stamps, its clock. Whole-card-era lines carry no
                           stamps of their own and dash out — the ticket row
                           above still holds the card's clock. */
                        <table className="mt-1.5 w-full max-w-3xl text-[13px]">
                          <thead>
                            <tr className="text-left text-[12px] text-neutral-400">
                              <th className="w-8 py-1 pr-2 text-right font-semibold">Qty</th>
                              <th className="py-1 pr-4 font-semibold">Dish</th>
                              <th className="w-[18%] py-1 pr-4 font-semibold">Chef</th>
                              <th className="w-[11%] py-1 pr-4 text-right font-semibold">Start</th>
                              <th className="w-[11%] py-1 pr-4 text-right font-semibold">Ready</th>
                              <th className="w-[14%] py-1 text-right font-semibold">Cook time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.lines.map((l, i) => (
                              <tr key={`${l.name}-${i}`} className="text-neutral-700">
                                <td className="py-1 pr-2 text-right font-semibold tabular-nums text-neutral-800">
                                  x{l.quantity}
                                </td>
                                <td className="py-1 pr-4">
                                  <span className="text-neutral-800">{l.name}</span>
                                  {l.note && (
                                    <span className="text-[12px] italic text-neutral-500">
                                      {' '}
                                      — {l.note}
                                    </span>
                                  )}
                                </td>
                                <td className="py-1 pr-4">{l.chef ?? '—'}</td>
                                <td className="py-1 pr-4 text-right tabular-nums">
                                  {fmtClock(l.started_at ?? null)}
                                </td>
                                <td className="py-1 pr-4 text-right tabular-nums">
                                  {fmtClock(l.ready_at ?? null)}
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {l.prep_seconds != null ? (
                                    fmtPrep(l.prep_seconds)
                                  ) : l.started_at ? (
                                    <span className="italic text-neutral-400">cooking…</span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                ),
              ]
            })
          )}
        </tbody>
      </table>
    </Panel>
  )
}

/** "x2 Fish Amok · x1 Lok Lak" — the ticket in one line. Exports ask for the
 *  timed version, "x2 Fish Amok (7m 12s) · …", since the file has no expand. */
function dishList(r: ChefTicket, withTimes = false): string {
  return r.lines
    .map((l) => {
      const time = withTimes && l.prep_seconds != null ? ` (${fmtPrep(l.prep_seconds)})` : ''
      return `x${l.quantity} ${l.name}${time}`
    })
    .join(' · ')
}

// --- Export — the same rows, as an Excel workbook ---------------------------

type Cell = string | number | null | undefined
type Column = { header: string; align?: 'left' | 'right' }

/** Minutes with one decimal as a real number, so Excel can sum and average
 *  the column without retyping it; blank while a ticket is untimed. */
const excelMinutes = (seconds: number | null): Cell =>
  seconds === null ? '' : Number((seconds / 60).toFixed(1))

const ticketColumns: Column[] = [
  { header: 'Date and time' },
  { header: 'Order' },
  { header: 'Table' },
  { header: 'Station' },
  { header: 'Chef' },
  { header: 'Dishes' },
  { header: 'Kinds', align: 'right' },
  { header: 'Units', align: 'right' },
  { header: 'Start', align: 'right' },
  { header: 'Ready', align: 'right' },
  { header: 'Cook time (min)', align: 'right' },
]

function ticketRow(r: ChefTicket): Cell[] {
  return [
    fmtStamp(r.created_at),
    r.order_number ?? `#${r.order_id}`,
    r.table ?? '',
    titleCase(r.station ?? ''),
    r.chef,
    dishList(r, true),
    r.dishes,
    r.items,
    fmtClock(r.started_at),
    fmtClock(r.ready_at),
    excelMinutes(r.prep_seconds),
  ]
}

/** The whole report as one workbook: Summary, Per cook, Per day, Per dish and
 *  the ticket list, one sheet each. Durations are plain minutes the reader can
 *  sum and average, so the headers carry the unit. */
function exportReport(data: ChefPerformanceData, subtitle: string) {
  const time = excelMinutes
  const timeHeader = 'Avg cook (min)'
  const o = data.overview

  const summaryRows: Cell[][] = [
    ['Orders cooked', num(o.orders)],
    ['Tickets fired', num(o.rounds)],
    ['Plates cooked', num(o.items)],
    ['Cooks working', num(o.chefs)],
    ['Timed tickets', num(o.timed_rounds)],
    ['Avg cook time', fmtPrep(o.avg_prep_seconds)],
  ]

  const chefColumns: Column[] = [
    { header: 'Chef' },
    { header: 'Orders', align: 'right' },
    { header: 'Tickets', align: 'right' },
    { header: 'Plates', align: 'right' },
    { header: 'Timed', align: 'right' },
    { header: timeHeader, align: 'right' },
  ]
  const chefRows = data.chefs.map((r): Cell[] => [
    r.chef, r.orders, r.rounds, r.items, r.timed_rounds, time(r.avg_prep_seconds),
  ])

  const dayColumns: Column[] = [
    { header: 'Date' },
    { header: 'Tickets', align: 'right' },
    { header: 'Plates', align: 'right' },
    { header: timeHeader, align: 'right' },
  ]
  const dayRows = data.by_day.map((b): Cell[] => [
    b.date ?? '', b.rounds, b.items, time(b.avg_prep_seconds),
  ])

  const dishColumns: Column[] = [
    { header: 'Dish' },
    { header: 'Plates', align: 'right' },
    { header: 'Tickets', align: 'right' },
    { header: 'Timed', align: 'right' },
    { header: timeHeader, align: 'right' },
  ]
  const dishRows = data.by_item.map((r): Cell[] => [
    r.name, r.units, r.rounds, r.timed_rounds, time(r.avg_prep_seconds),
  ])

  // Each cook's own menu — the By Chef view, flattened to one row per pairing.
  const chefDishColumns: Column[] = [
    { header: 'Chef' },
    { header: 'Dish' },
    { header: 'Plates', align: 'right' },
    { header: 'Tickets', align: 'right' },
    { header: 'Timed', align: 'right' },
    { header: timeHeader, align: 'right' },
  ]
  const chefDishRows = (data.by_chef_item ?? []).map((r): Cell[] => [
    r.chef, r.name, r.units, r.rounds, r.timed_rounds, time(r.avg_prep_seconds),
  ])

  void downloadReportExcel({
    fileName: 'chef-performance.xlsx',
    title: 'Chef Performance',
    subtitle,
    sheets: [
      { name: 'Summary', columns: [{ header: 'Measure' }, { header: 'Value', align: 'right' }], rows: summaryRows },
      { name: 'Per Cook', columns: chefColumns, rows: chefRows },
      { name: 'Per Day', columns: dayColumns, rows: dayRows },
      { name: 'Per Dish', columns: dishColumns, rows: dishRows },
      { name: 'Per Cook Per Dish', columns: chefDishColumns, rows: chefDishRows },
      { name: 'Tickets', columns: ticketColumns, rows: data.details.map(ticketRow) },
    ],
  })
}

/** Just the ticket list as it stands on screen — same search, same order. */
function exportDetails(rows: ChefTicket[], subtitleBase: string) {
  const subtitle = `${subtitleBase} — ${rows.length} ticket${rows.length === 1 ? '' : 's'}`
  void downloadReportExcel({
    fileName: 'chef-performance-tickets.xlsx',
    title: 'Chef Performance',
    subtitle,
    sheets: [{ name: 'Tickets', columns: ticketColumns, rows: rows.map(ticketRow) }],
  })
}

// --- Shared bits ------------------------------------------------------------

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-[2px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-neutral-200 px-5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-neutral-800">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-neutral-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function Blank({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-[13px] italic text-neutral-500">{children}</p>
}

function StatCard({
  icon,
  label,
  value,
  hint,
  small,
}: {
  icon: ReactNode
  label: string
  value: string
  hint?: string
  small?: boolean
}) {
  return (
    <div className="rounded-[3px] border border-neutral-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 font-bold tabular-nums text-neutral-800 ${small ? 'text-lg' : 'text-2xl'}`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[12px] text-neutral-500">{hint}</div>}
    </div>
  )
}
