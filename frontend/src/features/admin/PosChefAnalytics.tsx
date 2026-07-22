import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  LuActivity,
  LuCalendarDays,
  LuChefHat,
  LuClock,
  LuGauge,
  LuLayers,
  LuTimer,
  LuUsers,
} from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import { fetchChefs, type Chef } from '../../services/api/chefs'
import {
  fetchChefPerformance,
  type AnalysisPeriod,
  type ChefPerformanceData,
  type Station,
} from '../../services/api/reports'

// ---------------------------------------------------------------------------
// Reporting › Chef Analytics — the chef-performance data cut for ONE person
// at a time. The rail on the left lists every cook with their ticket count in
// the window; picking one fills the screen with that cook's story: headline
// numbers, their day-by-day workload and speed as area charts, when in the
// day they cook, what they cook most, and where they stand against the team.
//
// Same source as Chef Performance (/reports/chef-performance) — two calls per
// window: the whole team's numbers (the rail and the comparisons) and the
// picked cook's own buckets (everything else).
// ---------------------------------------------------------------------------

const PERIODS: { label: string; value: AnalysisPeriod }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
  { label: 'All Time', value: '' },
]

const STATIONS: { label: string; value: Station | '' }[] = [
  { label: 'All stations', value: '' },
  { label: 'Kitchen', value: 'kitchen' },
  { label: 'Bar', value: 'bar' },
]

// One person = one series, so the whole screen keeps the single reporting hue
// used by Chef Performance and Orders Analysis. The muted step is the "other
// cooks" bar in the standings — context, not identity.
const MARK = '#3f7cb1'
const MARK_MUTED = '#c3d2e0'

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

/** Monotone cubic (Fritsch–Carlson) through the points — the smooth curve of
 *  an area chart that never overshoots the data it passes through. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  const n = pts.length
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x)
    slope.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1))
  }
  const tan: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++)
    tan.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2)
  tan.push(slope[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tan[i] = 0
      tan[i + 1] = 0
      continue
    }
    const a = tan[i] / slope[i]
    const b = tan[i + 1] / slope[i]
    const s = a * a + b * b
    if (s > 9) {
      const f = 3 / Math.sqrt(s)
      tan[i] = f * a * slope[i]
      tan[i + 1] = f * b * slope[i]
    }
  }
  const r = (v: number) => Number(v.toFixed(2))
  let d = `M${r(pts[0].x)},${r(pts[0].y)}`
  for (let i = 0; i < n - 1; i++) {
    d += ` C${r(pts[i].x + dx[i] / 3)},${r(pts[i].y + (tan[i] * dx[i]) / 3)} ${r(
      pts[i + 1].x - dx[i] / 3,
    )},${r(pts[i + 1].y - (tan[i + 1] * dx[i]) / 3)} ${r(pts[i + 1].x)},${r(pts[i + 1].y)}`
  }
  return d
}

export default function PosChefAnalytics() {
  const [period, setPeriod] = useState<AnalysisPeriod>('week')
  const [station, setStation] = useState<Station | ''>('')
  const [chefId, setChefId] = useState<number | null>(null)

  const [team, setTeam] = useState<ChefPerformanceData | null>(null)
  const [person, setPerson] = useState<ChefPerformanceData | null>(null)
  const [roster, setRoster] = useState<Chef[]>([])
  const [loading, setLoading] = useState(true)
  const [personLoading, setPersonLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchChefPerformance({ period, chefId: null, station: station || null })
      .then((res) => {
        if (!cancelled) setTeam(res)
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load the chef analytics.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, station, refreshKey])

  // Every cook on the roster shows in the rail, even with zero tickets in the
  // window — a quiet week is part of the story too.
  useEffect(() => {
    let cancelled = false
    fetchChefs()
      .then((res) => {
        if (!cancelled) setRoster(res)
      })
      .catch(() => {
        /* the rail still works from whoever cooked */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The rail: cooks who worked the window first (busiest on top), the rest of
  // the roster after with zero counts.
  const rail = useMemo(() => {
    const worked = (team?.chefs ?? []).map((r) => ({
      id: r.chef_id,
      name: r.chef,
      rounds: r.rounds,
      inactive: roster.some((c) => c.id === r.chef_id && !c.is_active),
    }))
    const idle = roster
      .filter((c) => !worked.some((w) => w.id === c.id))
      .map((c) => ({ id: c.id, name: c.name, rounds: 0, inactive: !c.is_active }))
    return [...worked, ...idle]
  }, [team, roster])

  // Keep the picked cook across window changes; fall back to the busiest one
  // when nothing is picked yet or the pick vanished from the roster.
  useEffect(() => {
    if (rail.length === 0) return
    if (chefId === null || !rail.some((r) => r.id === chefId)) setChefId(rail[0].id)
  }, [rail, chefId])

  useEffect(() => {
    if (chefId === null) return
    let cancelled = false
    setPersonLoading(true)
    fetchChefPerformance({ period, chefId, station: station || null })
      .then((res) => {
        if (!cancelled) setPerson(res)
      })
      .catch(() => {
        if (!cancelled) setPerson(null)
      })
      .finally(() => {
        if (!cancelled) setPersonLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, station, chefId, refreshKey])

  const selected = rail.find((r) => r.id === chefId) ?? null

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <div>
            <h1 className="text-xl text-neutral-700">Chef Analytics</h1>
            <p className="mt-1 text-[13px] text-neutral-500">
              One cook at a time — their workload, their speed, their dishes, their standing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      {loading && team === null ? (
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
      ) : rail.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 pb-16 text-center text-neutral-500">
          <LuChefHat className="h-10 w-10 text-neutral-300" />
          <p className="text-sm">No cooks yet.</p>
          <p className="text-xs text-neutral-400">
            Cooks appear once they are on the roster or have started a ticket on a display board.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Roster rail — pick the person */}
          <aside className="w-60 shrink-0 overflow-y-auto border-r border-neutral-200/80 py-2">
            <div className="px-4 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Cooks · {PERIODS.find((p) => p.value === period)?.label}
            </div>
            {rail.map((r) => {
              const isSel = r.id === chefId
              const maxRounds = rail[0]?.rounds ?? 0
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setChefId(r.id)}
                  className={`flex w-full items-center gap-2.5 px-4 py-2 text-left transition ${
                    isSel ? 'bg-[#eef2f6]' : 'hover:bg-neutral-50'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${
                      isSel ? 'bg-[#57779a]' : 'bg-neutral-300'
                    }`}
                  >
                    {r.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[13px] ${
                        isSel ? 'font-semibold text-[#3f5a77]' : 'text-neutral-700'
                      } ${r.inactive ? 'italic text-neutral-400' : ''}`}
                    >
                      {r.name}
                      {r.inactive ? ' (inactive)' : ''}
                    </span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-neutral-100">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${maxRounds > 0 ? (r.rounds / maxRounds) * 100 : 0}%`,
                          backgroundColor: isSel ? MARK : MARK_MUTED,
                        }}
                      />
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-neutral-500">
                    {num(r.rounds)}
                  </span>
                </button>
              )
            })}
          </aside>

          {/* The picked cook's story */}
          <main className="min-w-0 flex-1 overflow-y-auto p-4">
            {personLoading || !selected || person === null ? (
              <div className="flex h-full items-center justify-center pb-16">
                <Loader />
              </div>
            ) : person.overview.rounds === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 pb-16 text-center text-neutral-500">
                <LuChefHat className="h-10 w-10 text-neutral-300" />
                <p className="text-sm">
                  {selected.name} has no tickets in this window
                  {station ? ` at the ${station}` : ''}.
                </p>
                <p className="text-xs text-neutral-400">
                  Numbers appear once they tap Start (naming themselves) on a display board.
                </p>
              </div>
            ) : (
              <PersonStory
                name={selected.name}
                person={person}
                team={team}
                selectedId={selected.id}
                onPick={setChefId}
              />
            )}
          </main>
        </div>
      )}
    </div>
  )
}

// --- The one-person report --------------------------------------------------

function PersonStory({
  name,
  person,
  team,
  selectedId,
  onPick,
}: {
  name: string
  person: ChefPerformanceData
  team: ChefPerformanceData | null
  selectedId: number
  onPick: (id: number) => void
}) {
  const o = person.overview

  // Standing against the whole team — the rail's window, everyone included.
  const teamRounds = team?.overview.rounds ?? 0
  const share = teamRounds > 0 ? Math.round((o.rounds / teamRounds) * 100) : null
  const rank = team ? team.chefs.findIndex((r) => r.chef_id === selectedId) + 1 : 0
  const teamAvg = team?.overview.avg_prep_seconds ?? null
  const speedHint =
    o.avg_prep_seconds !== null && teamAvg !== null
      ? o.avg_prep_seconds === teamAvg
        ? 'right on the team avg'
        : o.avg_prep_seconds < teamAvg
          ? `${fmtPrep(teamAvg - o.avg_prep_seconds)} faster than the team avg`
          : `${fmtPrep(o.avg_prep_seconds - teamAvg)} slower than the team avg`
      : undefined

  const busiestDay = person.by_day.reduce(
    (best: { date: string; rounds: number } | null, b) =>
      b.rounds > (best?.rounds ?? 0) ? { date: b.date ?? '', rounds: b.rounds } : best,
    null,
  )
  const peakHour = person.by_hour.reduce(
    (best: { hour: number; rounds: number } | null, b) =>
      b.rounds > (best?.rounds ?? 0) ? { hour: b.hour ?? 0, rounds: b.rounds } : best,
    null,
  )

  const dayVolume = person.by_day.map((b) => ({ c: fmtDay(b.date ?? ''), v: b.rounds }))
  const daySpeed = person.by_day
    .filter((b) => b.avg_prep_seconds !== null)
    .map((b) => ({ c: fmtDay(b.date ?? ''), v: b.avg_prep_seconds ?? 0 }))
  const hourVolume = person.by_hour.map((b) => ({
    c: `${String(b.hour).padStart(2, '0')}:00`,
    v: b.rounds,
  }))
  const dishes = person.by_item.slice(0, 10)
  const maxUnits = dishes.reduce((m, d) => Math.max(m, d.units), 0)

  return (
    <>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<LuChefHat className="h-4 w-4" />}
          label="Tickets"
          value={num(o.rounds)}
          hint={`${num(o.orders)} order${o.orders === 1 ? '' : 's'}`}
        />
        <StatCard
          icon={<LuLayers className="h-4 w-4" />}
          label="Plates"
          value={num(o.items)}
          hint={o.rounds > 0 ? `${(o.items / o.rounds).toFixed(1)} per ticket` : undefined}
        />
        <StatCard
          icon={<LuClock className="h-4 w-4" />}
          label="Avg cook time"
          value={fmtPrep(o.avg_prep_seconds)}
          hint={speedHint ?? `over ${num(o.timed_rounds)} timed ticket${o.timed_rounds === 1 ? '' : 's'}`}
        />
        <StatCard
          icon={<LuUsers className="h-4 w-4" />}
          label="Share of team"
          value={share === null ? '—' : `${share}%`}
          hint={rank > 0 && team ? `#${rank} of ${team.chefs.length} cooks` : undefined}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<LuCalendarDays className="h-4 w-4" />}
          label="Busiest day"
          value={busiestDay ? fmtDay(busiestDay.date) : '—'}
          hint={busiestDay ? `${num(busiestDay.rounds)} tickets` : undefined}
          small
        />
        <StatCard
          icon={<LuActivity className="h-4 w-4" />}
          label="Peak hour"
          value={peakHour ? `${String(peakHour.hour).padStart(2, '0')}:00` : '—'}
          hint={peakHour ? `${num(peakHour.rounds)} tickets` : undefined}
          small
        />
        <StatCard
          icon={<LuGauge className="h-4 w-4" />}
          label="Fastest ticket"
          value={fmtPrep(o.fastest_seconds)}
          small
        />
        <StatCard
          icon={<LuTimer className="h-4 w-4" />}
          label="Slowest ticket"
          value={fmtPrep(o.slowest_seconds)}
          small
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel title="Tickets per day" subtitle={`How much of the board ${name} carried, day by day`}>
          <AreaChart data={dayVolume} yLabel="Tickets" xLabel="Day" fmt={num} />
        </Panel>

        <Panel title="Average cook time per day" subtitle="Start → Ready, timed tickets only">
          {daySpeed.length === 0 ? (
            <Blank>No ticket in this window carries both a Start and a Ready stamp yet.</Blank>
          ) : (
            <AreaChart data={daySpeed} yLabel="Cook time" xLabel="Day" fmt={fmtPrep} />
          )}
        </Panel>

        <Panel title="Tickets by hour of day" subtitle={`When ${name}'s rush lands`}>
          <BarChart data={hourVolume} yLabel="Tickets" xLabel="Hour" fmt={num} />
        </Panel>

        <Panel
          title="Top dishes"
          subtitle={`What ${name} cooked most — plates, with the ticket clock beside`}
        >
          {dishes.length === 0 ? (
            <Blank>No dishes in this window.</Blank>
          ) : (
            <div className="flex flex-col gap-2.5 py-1">
              {dishes.map((d) => (
                <div key={d.name} className="flex items-center gap-3 text-[13px]">
                  <span className="w-40 shrink-0 truncate text-neutral-700" title={d.name}>
                    {d.name}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-[2px] bg-neutral-100">
                    <div
                      className="h-full rounded-[2px]"
                      style={{
                        width: `${maxUnits > 0 ? Math.max((d.units / maxUnits) * 100, 1.5) : 0}%`,
                        backgroundColor: MARK,
                      }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right tabular-nums text-neutral-800">
                    {num(d.units)}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[12px] text-neutral-400">
                    {fmtPrep(d.avg_prep_seconds)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {team && team.chefs.length > 1 && (
          <div className="xl:col-span-2">
            <Panel
              title={`Where ${name} stands`}
              subtitle="Tickets in this window, whole team — click a bar to switch cook"
            >
              <div className="flex flex-col gap-2.5 py-1">
                {team.chefs.map((r) => {
                  const isSel = r.chef_id === selectedId
                  const maxR = team.chefs[0]?.rounds ?? 0
                  return (
                    <button
                      key={r.chef_id}
                      type="button"
                      onClick={() => onPick(r.chef_id)}
                      className="group flex w-full items-center gap-3 text-left text-[13px]"
                    >
                      <span
                        className={`w-28 shrink-0 truncate ${
                          isSel ? 'font-semibold text-[#3f5a77]' : 'text-neutral-700'
                        }`}
                        title={r.chef}
                      >
                        {r.chef}
                      </span>
                      <span className="h-3 flex-1 overflow-hidden rounded-[2px] bg-neutral-100">
                        <span
                          className="block h-full rounded-[2px] transition group-hover:opacity-80"
                          style={{
                            width: `${maxR > 0 ? Math.max((r.rounds / maxR) * 100, 1.5) : 0}%`,
                            backgroundColor: isSel ? MARK : MARK_MUTED,
                          }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right tabular-nums text-neutral-800">
                        {num(r.rounds)}
                      </span>
                      <span className="w-24 shrink-0 text-right text-[12px] text-neutral-400">
                        avg {fmtPrep(r.avg_prep_seconds)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Panel>
          </div>
        )}
      </div>

      <p className="mt-4 text-[12px] italic text-neutral-500">
        Same numbers as the Chef Performance report, cut for one cook. Cook time is the gap
        between tapping Start and Ready on a display board; a ticket is one round fired to one
        station. Tickets still cooking, or from before timing existed, carry no clock.
      </p>
    </>
  )
}

// --- Charts — one measure, one axis, the single reporting hue ---------------

const CHART = {
  W: 1000,
  plotR: 12,
  plotT: 12,
  plotH: 240,
}

/** Smooth line + filled area over category points — the day-by-day trend. */
function AreaChart({
  data,
  yLabel,
  xLabel,
  fmt,
}: {
  data: { c: string; v: number }[]
  yLabel: string
  xLabel: string
  fmt: (v: number) => string
}) {
  if (data.length === 0) return <Blank>Nothing to plot in this window.</Blank>

  const { W, plotR, plotT, plotH } = CHART
  const labelH = 78
  const H = plotT + plotH + labelH + 26
  const ticks = niceTicks(Math.max(...data.map((d) => d.v)))
  const maxV = ticks[ticks.length - 1] || 1
  const tickChars = Math.max(...ticks.map((t) => fmt(t).length))
  const plotL = 30 + tickChars * 6
  const plotW = W - plotL - plotR
  const slot = plotW / data.length
  const y = (v: number) => plotT + plotH - (v / maxV) * plotH
  const points = data.map((d, i) => ({ x: plotL + i * slot + slot / 2, y: y(d.v) }))
  const line = smoothPath(points)
  const area = line
    ? `${line} L${points[points.length - 1].x},${plotT + plotH} L${points[0].x},${plotT + plotH} Z`
    : ''
  const labelEvery = Math.ceil(data.length / 30)

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

      {area && <path d={area} fill={MARK} opacity="0.18" />}
      {line && <path d={line} fill="none" stroke={MARK} strokeWidth="2" />}
      {data.map((d, i) => (
        <g key={d.c + i}>
          <title>{`${d.c}\n${yLabel}: ${fmt(d.v)}`}</title>
          {/* the hit target is wider than the dot it reveals */}
          <circle cx={points[i].x} cy={points[i].y} r="10" fill="transparent" />
          <circle cx={points[i].x} cy={points[i].y} r="4" fill={MARK} stroke="#fff" strokeWidth="2" />
        </g>
      ))}

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
        const ly = plotT + plotH + 12
        return (
          <text
            key={d.c + i}
            transform={`rotate(-40 ${x} ${ly})`}
            x={x}
            y={ly}
            textAnchor="end"
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

/** Rounded-top bars over short categories — the hour-of-day profile. */
function BarChart({
  data,
  yLabel,
  xLabel,
  fmt,
}: {
  data: { c: string; v: number }[]
  yLabel: string
  xLabel: string
  fmt: (v: number) => string
}) {
  if (data.length === 0) return <Blank>Nothing to plot in this window.</Blank>

  const { W, plotR, plotT, plotH } = CHART
  const labelH = 30
  const H = plotT + plotH + labelH + 26
  const ticks = niceTicks(Math.max(...data.map((d) => d.v)))
  const maxV = ticks[ticks.length - 1] || 1
  const tickChars = Math.max(...ticks.map((t) => fmt(t).length))
  const plotL = 30 + tickChars * 6
  const plotW = W - plotL - plotR
  const slot = plotW / data.length
  const barW = Math.min(slot * 0.62, 26)
  const y = (v: number) => plotT + plotH - (v / maxV) * plotH
  const labelEvery = Math.ceil(data.length / 24)

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

      {data.map((d, i) => {
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
      })}

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
        return (
          <text
            key={d.c + i}
            x={plotL + i * slot + slot / 2}
            y={plotT + plotH + 16}
            textAnchor="middle"
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

// --- Shared bits ------------------------------------------------------------

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[2px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="border-b border-neutral-200 px-5 py-3">
        <h2 className="text-[15px] font-semibold text-neutral-800">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-neutral-500">{subtitle}</p>}
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
