import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  LuChefHat,
  LuChevronDown,
  LuChevronRight,
  LuClock,
  LuDownload,
  LuGauge,
  LuLayers,
  LuSearch,
  LuTimer,
  LuUsers,
} from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import { fetchChefs, type Chef } from '../../services/api/chefs'
import {
  fetchChefPerformance,
  type AnalysisPeriod,
  type ChefPerformanceData,
  type ChefTicket,
  type Station,
} from '../../services/api/reports'
import { downloadTablePdf } from './exportPdf'

// ---------------------------------------------------------------------------
// Reporting › Chef Performance — a per-cook KPI over the real order history
// (via /reports/chef-performance). Every ticket a cook took at the kitchen or
// bar display (tapped Start, naming themselves) counts toward their orders,
// the item units they made, and their cook time (Start → Ready).
//
// Three views over the same filtered set of tickets: Overview (the headline
// numbers + the leaderboard), Analysis (how the work and the clock move over
// days, hours and people) and Details (the raw ticket list behind it all).
// The period, the cook and the station filter all three at once.
// ---------------------------------------------------------------------------

const PERIODS: { label: string; value: AnalysisPeriod }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
  { label: 'All Time', value: '' },
]

const TABS = ['Overview', 'Analysis', 'Details'] as const
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

/** Cook time in minutes, one decimal — the exported column. */
function prepMinutes(seconds: number | null): string {
  return seconds === null ? '' : (seconds / 60).toFixed(1)
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
  const [chefId, setChefId] = useState<number | null>(null)
  const [station, setStation] = useState<Station | ''>('')
  const [tab, setTab] = useState<Tab>('Overview')

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
    fetchChefPerformance({ period, chefId, station: station || null })
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
  }, [period, chefId, station, refreshKey])

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
          <div className="inline-flex divide-x divide-neutral-300 overflow-hidden rounded-[3px] border border-neutral-300">
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
          {tab === 'Details' && (
            <Details
              rows={details}
              total={data.details_total}
              shown={data.details.length}
              search={search}
              onSearch={setSearch}
              sort={sort}
              onSort={setSort}
              periodLabel={PERIODS.find((p) => p.value === period)?.label ?? 'All Time'}
            />
          )}

          <p className="mt-4 text-[12px] italic text-neutral-500">
            Cook time is the gap between a cook tapping Start and Ready on a display board. A
            ticket is one round fired to one station, so a table that ordered twice counts twice
            here but stays one order. Tickets still cooking, or from before this feature, carry no
            timing and show a dash.
          </p>
        </div>
      )}
    </div>
  )
}

// --- Overview ---------------------------------------------------------------

function Overview({ data }: { data: ChefPerformanceData }) {
  const { overview, chefs, by_station } = data
  const maxRounds = chefs.reduce((max, r) => Math.max(max, r.rounds), 0)
  const totalRounds = overview.rounds

  return (
    <>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<LuGauge className="h-4 w-4" />}
          label="Fastest ticket"
          value={fmtPrep(overview.fastest_seconds)}
          small
        />
        <StatCard
          icon={<LuTimer className="h-4 w-4" />}
          label="Slowest ticket"
          value={fmtPrep(overview.slowest_seconds)}
          small
        />
        <StatCard
          icon={<LuLayers className="h-4 w-4" />}
          label="Ticket split"
          value={
            by_station.map((s) => `${titleCase(s.station ?? '')} ${num(s.rounds)}`).join(' · ') || '—'
          }
          hint={by_station
            .map((s) => `${titleCase(s.station ?? '')} avg ${fmtPrep(s.avg_prep_seconds)}`)
            .join(' · ')}
          small
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
  const { by_day, by_hour, chefs } = data

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
  /** Named period, printed under the title on the exported PDF. */
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
            onClick={() => exportPdf(rows, periodLabel)}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            <LuDownload className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      }
    >
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-800">
            <th className="w-6 py-2.5" />
            <th className="py-2.5 pr-4 font-bold">Fired</th>
            <th className="py-2.5 pr-4 font-bold">Order</th>
            <th className="py-2.5 pr-4 font-bold">Table</th>
            <th className="py-2.5 pr-4 font-bold">Round</th>
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
              <td colSpan={13} className="py-4 text-[13px] italic text-neutral-500">
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
                  <td className="py-2.5 pr-4 tabular-nums">R{r.round_no}</td>
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
                    <td colSpan={12} className="py-3 pr-4">
                      <div className="text-[12px] font-semibold uppercase tracking-wide text-neutral-400">
                        Dishes on this ticket
                      </div>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {r.lines.length === 0 ? (
                          <li className="text-[13px] italic text-neutral-500">
                            No line survived on this ticket — the round was edited or voided.
                          </li>
                        ) : (
                          r.lines.map((l, i) => (
                            <li key={`${l.name}-${i}`} className="flex items-baseline gap-2">
                              <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-neutral-800">
                                {l.quantity}×
                              </span>
                              <span className="text-neutral-800">{l.name}</span>
                              {l.note && (
                                <span className="text-[12px] italic text-neutral-500">
                                  — {l.note}
                                </span>
                              )}
                            </li>
                          ))
                        )}
                      </ul>
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

/** "2× Fish Amok · 1× Lok Lak" — the ticket in one line. */
function dishList(r: ChefTicket): string {
  return r.lines.map((l) => `${l.quantity}× ${l.name}`).join(' · ')
}

/** The rows on screen, as a PDF — same order, same filtering. */
function exportPdf(rows: ChefTicket[], periodLabel: string) {
  void downloadTablePdf({
    fileName: 'chef-performance.pdf',
    title: 'Chef Performance',
    subtitle: `${periodLabel} — ${rows.length} ticket${rows.length === 1 ? '' : 's'}`,
    sectionTitle: 'Tickets',
    landscape: true,
    columns: [
      { header: 'Fired' },
      { header: 'Order' },
      { header: 'Table' },
      { header: 'Round' },
      { header: 'Station' },
      { header: 'Chef' },
      { header: 'Dishes' },
      { header: 'Kinds', align: 'right' },
      { header: 'Units', align: 'right' },
      { header: 'Start', align: 'right' },
      { header: 'Ready', align: 'right' },
      { header: 'Cook time (min)', align: 'right' },
    ],
    rows: rows.map((r) => [
      fmtStamp(r.created_at),
      r.order_number ?? `#${r.order_id}`,
      r.table ?? '',
      `R${r.round_no}`,
      titleCase(r.station ?? ''),
      r.chef,
      dishList(r),
      r.dishes,
      r.items,
      fmtClock(r.started_at),
      fmtClock(r.ready_at),
      prepMinutes(r.prep_seconds),
    ]),
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
