import { useEffect, useState } from 'react'
import {
  LuArrowDownWideNarrow,
  LuArrowUpNarrowWide,
  LuChartArea,
  LuChartColumn,
  LuChartPie,
  LuCheck,
  LuChevronDown,
  LuDownload,
  LuRepeat,
  LuSearch,
  LuTable,
} from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import {
  fetchOrdersAnalysis,
  type AnalysisGroupBy,
  type AnalysisPeriod,
  type OrdersAnalysisRow,
} from '../../services/api/reports'
import { downloadTablePdf } from './exportPdf'
import FacetChip, { type Facet } from './FacetChip'
import SearchMenus, { toggleIn, type CustomCondition } from './SearchMenus'

// ---------------------------------------------------------------------------
// Reporting › Orders — the "Orders Analysis" graph/pivot view over the real
// order history (via /reports/orders-analysis). The Ordered Today/Week/Month/
// Year filters and the Group By dimension query the backend; the search box
// and custom Product Category conditions then filter the returned axis
// client-side — all with facet chips in the search box, Odoo style.
// ---------------------------------------------------------------------------

const BAR_COLOR = '#3f7cb1'

const TIME_FILTERS = [
  'Ordered Today',
  'Ordered This Week',
  'Ordered This Month',
  'Ordered This Year',
]

// Checked periods OR together, and since they nest the widest one wins.
const TIME_PERIOD: Record<string, AnalysisPeriod> = {
  'Ordered Today': 'today',
  'Ordered This Week': 'week',
  'Ordered This Month': 'month',
  'Ordered This Year': 'year',
}
const PERIOD_WIDTH: Record<AnalysisPeriod, number> = {
  today: 1,
  week: 2,
  month: 3,
  year: 4,
  '': 5,
}

const GROUP_OPTIONS = ['Product Category', 'Product', 'Order Date', 'Order Type', 'Employee']

const GROUP_KEY: Record<string, AnalysisGroupBy> = {
  'Product Category': 'category',
  Product: 'product',
  'Order Date': 'order_date',
  'Order Type': 'order_type',
  Employee: 'employee',
}

// Saved searches (Favorites menu), persisted to localStorage like Products.
type SavedSearch = {
  name: string
  isDefault: boolean
  shared: boolean
  query: string
  filters: string[]
  groups: string[]
  customFilters: CustomCondition[][]
}

const FAVORITES_KEY = 'pos-admin.orders-analysis.search-favorites'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

// Custom-filter conditions evaluate against the bucket axis; fields that the
// aggregate rows don't carry (Account Tags, ...) match all.
function matchesCondition(label: string, c: CustomCondition): boolean {
  if (c.field !== 'Product Category') return true
  const text = label.toLowerCase()
  const value = c.value.trim().toLowerCase()
  switch (c.operator) {
    case 'contains':
      return text.includes(value)
    case 'does not contain':
      return !text.includes(value)
    case 'is equal to':
      return text === value
    case 'is not equal to':
      return text !== value
    default:
      return true
  }
}

// Toggleable measures in the Measures dropdown; Count sits below a divider.
// Each maps straight onto a column of the aggregate rows.
const MEASURES = [
  'Average Price',
  'Margin',
  'Product Quantity',
  'Sale Line Count',
  'Subtotal w/o discount',
  'Total Discount',
  'Total Price',
]

type MeasureKind = 'money' | 'int'

const MEASURE_DEFS: Record<
  string,
  { kind: MeasureKind; key: Exclude<keyof OrdersAnalysisRow, 'label'> }
> = {
  'Average Price': { kind: 'money', key: 'average_price' },
  Margin: { kind: 'money', key: 'margin' },
  'Product Quantity': { kind: 'int', key: 'product_quantity' },
  'Sale Line Count': { kind: 'int', key: 'sale_line_count' },
  'Subtotal w/o discount': { kind: 'money', key: 'subtotal_wo_discount' },
  'Total Discount': { kind: 'money', key: 'total_discount' },
  'Total Price': { kind: 'money', key: 'total_price' },
  Count: { kind: 'int', key: 'order_count' },
}

// Average-style measures aggregate as mean in the pivot Total row, not sum.
const AVG_MEASURES = new Set(['Average Price'])

const measureValue = (m: string, row: OrdersAnalysisRow) => row[MEASURE_DEFS[m].key]

// d3/Chart.js category palette, the one Odoo cycles through for pies.
const PIE_COLORS = [
  '#1f77b4', '#ff7f0e', '#aec7e8', '#ffbb78', '#2ca02c', '#98df8a', '#d62728',
  '#ff9896', '#9467bd', '#c5b0d5', '#8c564b', '#c49c94', '#e377c2', '#f7b6d2',
  '#7f7f7f', '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5',
]

const fmtNumber = (kind: MeasureKind, n: number) =>
  kind === 'int'
    ? Math.round(n).toLocaleString('en-US')
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtTooltip = (kind: MeasureKind, n: number) =>
  kind === 'money' ? `$ ${fmtNumber(kind, n)}` : fmtNumber(kind, n)

// Y-axis ticks: ~9 "nice" steps up past the series maximum, Odoo style.
function niceTicks(maxV: number): number[] {
  const rawStep = Math.max(maxV, 1e-6) / 9
  const mag = 10 ** Math.floor(Math.log10(rawStep))
  const norm = rawStep / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
  return Array.from({ length: Math.ceil(maxV / step) + 1 }, (_, i) => i * step)
}

const fmtTick = (t: number) =>
  t >= 1000
    ? `${(t / 1000).toLocaleString('en-US', { minimumFractionDigits: 2 })}k`
    : t.toLocaleString('en-US', { minimumFractionDigits: 2 })

/** Odoo-style hover tooltip — parent button needs `group relative`. */
function Tip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-[2px] border border-neutral-200 bg-white px-2 py-1 text-[11.5px] font-normal text-neutral-700 shadow-md group-hover:block">
      {label}
    </span>
  )
}

/** Pivot view — Total row plus one row per bucket, one value column per
 *  measure checked in the Measures dropdown. Flip axis transposes it:
 *  measures become the rows and buckets the columns. */
function PivotTable({
  measures,
  rows,
  flipped,
}: {
  measures: string[]
  rows: OrdersAnalysisRow[]
  flipped: boolean
}) {
  const totals = measures.map((m) => {
    const vals = rows.map((r) => measureValue(m, r))
    const sum = vals.reduce((a, b) => a + b, 0)
    return AVG_MEASURES.has(m) && vals.length > 0 ? sum / vals.length : sum
  })

  if (flipped) {
    return (
      <div className="overflow-auto p-4">
        <table className="border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="min-w-44 border border-neutral-200 bg-neutral-50 px-3 py-2" />
              <th className="min-w-28 border border-neutral-200 bg-neutral-50 px-3 py-2 text-right font-bold text-neutral-800">
                <span className="inline-flex items-center gap-1">
                  <LuChevronDown className="h-3 w-3 text-neutral-500" />
                  Total
                </span>
              </th>
              {rows.map((r) => (
                <th
                  key={r.label}
                  className="min-w-28 border border-neutral-200 bg-neutral-50 px-3 py-2 text-right font-medium text-neutral-700"
                >
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {measures.map((m, i) => (
              <tr key={m} className="transition hover:bg-neutral-50">
                <td className="border border-neutral-200 px-3 py-1.5 font-medium text-neutral-700">
                  {m}
                </td>
                <td className="border border-neutral-200 px-3 py-1.5 text-right font-bold text-neutral-800">
                  {fmtNumber(MEASURE_DEFS[m].kind, totals[i])}
                </td>
                {rows.map((r) => (
                  <td
                    key={r.label}
                    className="border border-neutral-200 px-3 py-1.5 text-right text-neutral-700"
                  >
                    {fmtNumber(MEASURE_DEFS[m].kind, measureValue(m, r))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-auto p-4">
      <table className="border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="w-96 border border-neutral-200 bg-neutral-50 px-3 py-2" />
            {measures.map((m) => (
              <th
                key={m}
                className="min-w-36 border border-neutral-200 bg-neutral-50 px-3 py-2 text-right font-medium text-neutral-700"
              >
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-neutral-50/70">
            <td className="border border-neutral-200 px-3 py-1.5 font-bold text-neutral-800">
              <span className="inline-flex items-center gap-1">
                <LuChevronDown className="h-3 w-3 text-neutral-500" />
                Total
              </span>
            </td>
            {measures.map((m, i) => (
              <td
                key={m}
                className="border border-neutral-200 px-3 py-1.5 text-right font-bold text-neutral-800"
              >
                {fmtNumber(MEASURE_DEFS[m].kind, totals[i])}
              </td>
            ))}
          </tr>
          {rows.map((r) => (
            <tr key={r.label} className="transition hover:bg-neutral-50">
              <td className="border border-neutral-200 py-1.5 pl-8 pr-3 text-neutral-700">
                {r.label}
              </td>
              {measures.map((m) => (
                <td
                  key={m}
                  className="border border-neutral-200 px-3 py-1.5 text-right text-neutral-700"
                >
                  {fmtNumber(MEASURE_DEFS[m].kind, measureValue(m, r))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PieChart({
  data,
  label,
  kind,
}: {
  data: { c: string; v: number }[]
  label: string
  kind: MeasureKind
}) {
  const total = data.reduce((sum, d) => sum + d.v, 0)
  const cx = 460
  const cy = 415
  const r = 400
  let angle = -Math.PI / 2

  return (
    <svg viewBox="0 0 920 830" className="mx-auto block max-h-[75vh] w-full">
      {data.map((d, i) => {
        const a0 = angle
        const a1 = a0 + (d.v / total) * Math.PI * 2
        angle = a1
        const large = a1 - a0 > Math.PI ? 1 : 0
        const path = `M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`
        return (
          <path
            key={d.c + i}
            d={path}
            fill={PIE_COLORS[i % PIE_COLORS.length]}
            stroke="#ffffff"
            strokeWidth="1"
          >
            <title>{`${d.c}\n${label}: ${fmtTooltip(kind, d.v)}`}</title>
          </path>
        )
      })}
    </svg>
  )
}

function OrdersChart({
  type,
  data,
  label,
  kind,
  xLabel,
}: {
  type: 'bar' | 'line'
  data: { c: string; v: number }[]
  label: string
  kind: MeasureKind
  xLabel: string
}) {
  const W = 1720
  const plotL = 68
  const plotR = 14
  const plotT = 14
  const plotH = 470
  const labelH = 250
  const H = plotT + plotH + labelH + 26
  const plotW = W - plotL - plotR
  const slot = plotW / data.length
  const barW = Math.min(slot * 0.62, 20)
  const ticks = niceTicks(Math.max(...data.map((d) => d.v)))
  const maxV = ticks[ticks.length - 1] || 1
  const y = (v: number) => plotT + plotH - (v / maxV) * plotH
  const points = data.map((d, i) => ({ x: plotL + i * slot + slot / 2, y: y(d.v) }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `M${points[0].x},${plotT + plotH} ${points
    .map((p) => `L${p.x},${p.y}`)
    .join(' ')} L${points[points.length - 1].x},${plotT + plotH} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* horizontal gridlines + y tick labels */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={plotL} x2={W - plotR} y1={y(t)} y2={y(t)} stroke="#e7e7e7" strokeWidth="1" />
          <text
            x={plotL - 8}
            y={y(t) + 3.5}
            textAnchor="end"
            fontSize="10.5"
            fill="#8a8a8a"
          >
            {fmtTick(t)}
          </text>
        </g>
      ))}

      {/* faint vertical gridlines */}
      {data.map((_, i) => (
        <line
          key={i}
          x1={plotL + i * slot}
          x2={plotL + i * slot}
          y1={plotT}
          y2={plotT + plotH}
          stroke="#f2f2f2"
          strokeWidth="1"
        />
      ))}

      {type === 'bar' ? (
        data.map((d, i) => {
          const x = plotL + i * slot + (slot - barW) / 2
          return (
            <rect
              key={d.c + i}
              x={x}
              y={y(d.v)}
              width={barW}
              height={plotT + plotH - y(d.v)}
              fill={BAR_COLOR}
            >
              <title>{`${d.c}\n${label}: ${fmtTooltip(kind, d.v)}`}</title>
            </rect>
          )
        })
      ) : (
        <>
          <path d={areaPath} fill={BAR_COLOR} opacity="0.35" />
          <path d={linePath} fill="none" stroke={BAR_COLOR} strokeWidth="2" />
          {data.map((d, i) => (
            <circle key={d.c + i} cx={points[i].x} cy={points[i].y} r="3.5" fill={BAR_COLOR}>
              <title>{`${d.c}\n${label}: ${fmtTooltip(kind, d.v)}`}</title>
            </circle>
          ))}
        </>
      )}

      {/* baseline */}
      <line x1={plotL} x2={W - plotR} y1={plotT + plotH} y2={plotT + plotH} stroke="#c9c9c9" strokeWidth="1" />

      {/* rotated category labels */}
      {data.map((d, i) => {
        const x = plotL + i * slot + slot / 2
        const ly = plotT + plotH + 12
        return (
          <text
            key={d.c + i}
            transform={`rotate(-40 ${x} ${ly})`}
            x={x}
            y={ly}
            textAnchor="end"
            fontSize="10"
            fill="#8a8a8a"
          >
            {d.c}
          </text>
        )
      })}

      {/* axis titles */}
      <text
        transform={`rotate(-90 14 ${plotT + plotH / 2})`}
        x={14}
        y={plotT + plotH / 2}
        textAnchor="middle"
        fontSize="11"
        fill="#6f6f6f"
      >
        {label}
      </text>
      <text x={plotL + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fill="#565656">
        {xLabel}
      </text>
    </svg>
  )
}

export default function PosOrdersAnalysis() {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() =>
    loadJson<SavedSearch[]>(FAVORITES_KEY, []),
  )
  const defaultSearch = savedSearches.find((f) => f.isDefault)

  const [query, setQuery] = useState(defaultSearch?.query ?? '')
  // Measures dropdown — dev builds can pre-open it with `?measures-open`.
  const [measuresOpen, setMeasuresOpen] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('measures-open'),
  )
  // Odoo semantics: the graph plots exactly one measure (picking another
  // switches the chart), while the pivot toggles measures as columns. Dev
  // builds can preselect the graph measure with `?measure=<name>`.
  const [graphMeasure, setGraphMeasure] = useState(() => {
    const m = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get('measure')
      : null
    return m && MEASURE_DEFS[m] ? m : 'Total Price'
  })
  const [pivotMeasures, setPivotMeasures] = useState<Set<string>>(new Set(['Total Price']))
  // Chart type — dev builds can preselect with `?chart=line|pie`.
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>(() => {
    const c = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get('chart')
      : null
    return c === 'line' || c === 'pie' ? c : 'bar'
  })
  // Sorting — clicking a sort button again returns to the natural order.
  // Dev builds can preselect with `?sort=desc|asc`.
  const [sortDir, setSortDir] = useState<'none' | 'desc' | 'asc'>(() => {
    const s = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('sort') : null
    return s === 'desc' || s === 'asc' ? s : 'none'
  })
  // Graph or pivot view — dev builds can preselect with `?oa-view=pivot`.
  const [oaView, setOaView] = useState<'graph' | 'pivot'>(() =>
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('oa-view') === 'pivot'
      ? 'pivot'
      : 'graph',
  )
  const measureChecked = (m: string) =>
    oaView === 'graph' ? graphMeasure === m : pivotMeasures.has(m)
  const pickMeasure = (m: string) =>
    oaView === 'graph' ? setGraphMeasure(m) : setPivotMeasures((s) => toggleIn(s, m))

  // Search state — time filters, applied custom-filter condition groups
  // (groups AND together, conditions inside a group OR together, like Odoo)
  // and the group-by list in nesting order. A default favorite pre-fills it.
  const [checkedFilters, setCheckedFilters] = useState<Set<string>>(
    () => new Set(defaultSearch?.filters ?? []),
  )
  const [customFilters, setCustomFilters] = useState<CustomCondition[][]>(
    defaultSearch?.customFilters ?? [],
  )
  const [groups, setGroups] = useState<string[]>(defaultSearch?.groups ?? [])
  const [activeFavorite, setActiveFavorite] = useState<string | null>(defaultSearch?.name ?? null)
  const toggleGroup = (g: string) =>
    setGroups((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]))

  const persistFavorites = (next: SavedSearch[]) => {
    setSavedSearches(next)
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
  }
  const saveFavorite = (name: string, useByDefault: boolean, shareAll: boolean) => {
    const entry: SavedSearch = {
      name,
      isDefault: useByDefault,
      shared: shareAll,
      query,
      filters: [...checkedFilters],
      groups,
      customFilters,
    }
    persistFavorites([
      ...savedSearches
        .filter((f) => f.name !== name)
        .map((f) => (useByDefault ? { ...f, isDefault: false } : f)),
      entry,
    ])
    setActiveFavorite(name)
  }
  const applyFavorite = (name: string) => {
    const fav = savedSearches.find((f) => f.name === name)
    if (!fav) return
    setQuery(fav.query)
    setCheckedFilters(new Set(fav.filters))
    setGroups(fav.groups)
    setCustomFilters(fav.customFilters)
    setActiveFavorite(name)
  }
  const deleteFavorite = (name: string) => {
    persistFavorites(savedSearches.filter((f) => f.name !== name))
    if (activeFavorite === name) setActiveFavorite(null)
  }
  // Removing the favorite facet clears the whole search, like Odoo.
  const clearFavorite = () => {
    setActiveFavorite(null)
    setQuery('')
    setCheckedFilters(new Set())
    setGroups([])
    setCustomFilters([])
  }

  // The chart plots the first group-by dimension (deeper levels only show in
  // the facet chip, like Odoo's graph view flattens them). The dimension and
  // the widest checked time filter query the backend.
  const groupDim = groups[0] ?? 'Product Category'
  const timeChecked = TIME_FILTERS.filter((f) => checkedFilters.has(f))
  const period: AnalysisPeriod =
    timeChecked.length === 0
      ? ''
      : timeChecked
          .map((f) => TIME_PERIOD[f])
          .reduce((a, b) => (PERIOD_WIDTH[a] >= PERIOD_WIDTH[b] ? a : b))

  const [rows, setRows] = useState<OrdersAnalysisRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  // Pivot-only: transpose rows/columns, Odoo's "Flip axis".
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchOrdersAnalysis(GROUP_KEY[groupDim] ?? 'category', period)
      .then((res) => {
        if (!cancelled) setRows(res)
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load the orders analysis.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [groupDim, period, refreshKey])

  const visibleRows = (rows ?? []).filter(
    (r) =>
      r.label.toLowerCase().includes(query.trim().toLowerCase()) &&
      customFilters.every((group) => group.some((c) => matchesCondition(r.label, c))),
  )

  // Facet chips inside the search box — one for the time-filter section, one
  // per applied custom filter.
  const facets: Facet[] = []
  if (timeChecked.length > 0)
    facets.push({
      key: 'f-time',
      label: timeChecked.join(' or '),
      kind: 'filter',
      onRemove: () =>
        setCheckedFilters((s) => {
          const next = new Set(s)
          TIME_FILTERS.forEach((f) => next.delete(f))
          return next
        }),
    })
  customFilters.forEach((group, i) =>
    facets.push({
      key: `c-${i}`,
      label: group.map((c) => `${c.field} ${c.operator} "${c.value.trim()}"`).join(' or '),
      kind: 'filter',
      onRemove: () => setCustomFilters((cs) => cs.filter((_, j) => j !== i)),
    }),
  )
  if (groups.length > 0)
    facets.push({
      key: 'g',
      label: groups.join(' > '),
      kind: 'group',
      onRemove: () => setGroups([]),
    })
  if (activeFavorite)
    facets.push({ key: 'fav', label: activeFavorite, kind: 'favorite', onRemove: clearFavorite })

  const graphKind = MEASURE_DEFS[graphMeasure].kind
  const graphData = visibleRows.map((r) => ({ c: r.label, v: measureValue(graphMeasure, r) }))
  const series =
    sortDir === 'none'
      ? graphData
      : [...graphData].sort((a, b) => (sortDir === 'desc' ? b.v - a.v : a.v - b.v))
  const pivotCols = [...MEASURES, 'Count'].filter((m) => pivotMeasures.has(m))

  // Download the pivot as PDF — one row per bucket, one column per measure.
  const downloadPdf = () => {
    void downloadTablePdf({
      fileName: 'orders-analysis.pdf',
      title: 'Orders Analysis',
      subtitle: `Grouped by ${groupDim} — ${visibleRows.length} row${
        visibleRows.length === 1 ? '' : 's'
      }`,
      columns: [
        { header: groupDim },
        ...pivotCols.map((m) => ({ header: m, align: 'right' as const })),
      ],
      rows: visibleRows.map((r) => [r.label, ...pivotCols.map((m) => measureValue(m, r))]),
    })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <div>
            <h1 className="text-xl text-neutral-700">Orders Analysis</h1>
            <div className="mt-2 flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMeasuresOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-[3px] bg-[#57779a] px-3 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
                >
                  Measures
                  <LuChevronDown className="h-3.5 w-3.5" />
                </button>

                {measuresOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Close menu"
                      onClick={() => setMeasuresOpen(false)}
                      className="fixed inset-0 z-10 cursor-default"
                    />
                    <div className="absolute left-0 top-full z-20 mt-px w-52 border border-neutral-200/80 bg-white py-1 text-[13px] text-neutral-600 shadow-md">
                      <div className="border-b border-neutral-100 pb-1">
                        {MEASURES.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => pickMeasure(m)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-neutral-100"
                          >
                            <LuCheck
                              className={`h-3.5 w-3.5 shrink-0 ${
                                measureChecked(m) ? 'text-neutral-700' : 'invisible'
                              }`}
                            />
                            <span
                              className={measureChecked(m) ? 'font-semibold text-neutral-800' : ''}
                            >
                              {m}
                            </span>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => pickMeasure('Count')}
                        className="mt-1 flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-neutral-100"
                      >
                        <LuCheck
                          className={`h-3.5 w-3.5 shrink-0 ${
                            measureChecked('Count') ? 'text-neutral-700' : 'invisible'
                          }`}
                        />
                        <span
                          className={measureChecked('Count') ? 'font-semibold text-neutral-800' : ''}
                        >
                          Count
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {oaView === 'graph' && (
                <div className="inline-flex overflow-hidden rounded-[3px] border border-neutral-300 divide-x divide-neutral-300">
                  {(
                    [
                      { key: 'bar', label: 'Bar chart', Icon: LuChartColumn },
                      { key: 'line', label: 'Line chart', Icon: LuChartArea },
                      { key: 'pie', label: 'Pie chart', Icon: LuChartPie },
                    ] as const
                  ).map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={label}
                      onClick={() => setChartType(key)}
                      className={`group relative px-2.5 py-1.5 transition ${
                        chartType === key
                          ? 'bg-neutral-100 text-neutral-700'
                          : 'bg-white text-neutral-500 hover:bg-neutral-50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <Tip label={label} />
                    </button>
                  ))}
                </div>
              )}

              {oaView === 'pivot' && (
                <div className="inline-flex divide-x divide-neutral-300 overflow-hidden rounded-[3px] border border-neutral-300">
                  <button
                    type="button"
                    aria-label="Flip axis"
                    onClick={() => setFlipped((v) => !v)}
                    className={`group relative px-2.5 py-1.5 transition ${
                      flipped
                        ? 'bg-neutral-100 text-neutral-700'
                        : 'bg-white text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    <LuRepeat className="h-4 w-4" />
                    <Tip label="Flip axis" />
                  </button>
                  <button
                    type="button"
                    aria-label="Download pdf"
                    onClick={downloadPdf}
                    className="group relative bg-white px-2.5 py-1.5 text-neutral-500 transition hover:bg-neutral-50"
                  >
                    <LuDownload className="h-4 w-4" />
                    <Tip label="Download pdf" />
                  </button>
                </div>
              )}

              {/* Sorting has no meaning on a pie */}
              {oaView === 'graph' && chartType !== 'pie' && (
                <div className="inline-flex divide-x divide-neutral-300 overflow-hidden rounded-[3px] border border-neutral-300">
                  <button
                    type="button"
                    aria-label="Descending"
                    onClick={() => setSortDir((s) => (s === 'desc' ? 'none' : 'desc'))}
                    className={`group relative px-2.5 py-1.5 transition ${
                      sortDir === 'desc'
                        ? 'bg-neutral-100 text-neutral-700'
                        : 'bg-white text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    <LuArrowDownWideNarrow className="h-4 w-4" />
                    <Tip label="Descending" />
                  </button>
                  <button
                    type="button"
                    aria-label="Ascending"
                    onClick={() => setSortDir((s) => (s === 'asc' ? 'none' : 'asc'))}
                    className={`group relative px-2.5 py-1.5 transition ${
                      sortDir === 'asc'
                        ? 'bg-neutral-100 text-neutral-700'
                        : 'bg-white text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    <LuArrowUpNarrowWide className="h-4 w-4" />
                    <Tip label="Ascending" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-72 max-w-[880px] flex-1 flex-col gap-2">
            {/* Search box with the active facet chips inside */}
            <div className="relative flex w-full flex-wrap items-center gap-1.5 rounded-[3px] border border-neutral-300 py-1 pl-1.5 pr-9 focus-within:border-sky-600">
              {facets.map((f) => (
                <FacetChip key={f.key} facet={f} />
              ))}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="min-w-24 flex-1 py-0.5 text-sm outline-none"
              />
              <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <SearchMenus
                filterSections={[TIME_FILTERS]}
                groupOptions={GROUP_OPTIONS}
                favoriteName="Orders Analysis"
                checkedFilters={checkedFilters}
                onToggleFilter={(f) => setCheckedFilters((s) => toggleIn(s, f))}
                onApplyCustomFilter={(conditions) =>
                  setCustomFilters((cs) => [...cs, conditions])
                }
                checkedGroups={groups}
                onToggleGroup={toggleGroup}
                favorites={savedSearches.map((f) => ({ name: f.name, shared: f.shared }))}
                activeFavorite={activeFavorite}
                onSaveFavorite={saveFavorite}
                onSelectFavorite={applyFavorite}
                onDeleteFavorite={deleteFavorite}
              />

              <div className="inline-flex rounded-[3px] border border-neutral-300">
                <button
                  type="button"
                  aria-label="Graph"
                  onClick={() => setOaView('graph')}
                  className={`group relative px-2.5 py-1.5 transition ${
                    oaView === 'graph'
                      ? 'bg-[#57779a] text-white'
                      : 'bg-white text-neutral-500 hover:bg-neutral-50'
                  }`}
                >
                  <LuChartColumn className="h-4 w-4" />
                  <Tip label="Graph" />
                </button>
                <button
                  type="button"
                  aria-label="Pivot"
                  onClick={() => setOaView('pivot')}
                  className={`group relative border-l border-neutral-300 px-2.5 py-1.5 transition ${
                    oaView === 'pivot'
                      ? 'bg-[#57779a] text-white'
                      : 'bg-white text-neutral-500 hover:bg-neutral-50'
                  }`}
                >
                  <LuTable className="h-4 w-4" />
                  <Tip label="Pivot" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Aggregates load per dimension/period */}
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
      ) : oaView === 'pivot' ? (
        <PivotTable measures={pivotCols} rows={visibleRows} flipped={flipped} />
      ) : series.length === 0 ? (
        <div className="flex flex-1 items-center justify-center pb-16 text-sm text-neutral-500">
          No data to display
        </div>
      ) : (
        <div className="overflow-y-auto px-4 pb-4 pt-2">
          {chartType !== 'pie' && (
            <div className="mb-1 flex items-center justify-center gap-2 text-[13px] text-neutral-600">
              <span className="h-3.5 w-8 rounded-[2px]" style={{ backgroundColor: BAR_COLOR }} />
              {graphMeasure}
            </div>
          )}
          {chartType === 'pie' ? (
            <PieChart data={series} label={graphMeasure} kind={graphKind} />
          ) : (
            <OrdersChart
              type={chartType}
              data={series}
              label={graphMeasure}
              kind={graphKind}
              xLabel={groupDim}
            />
          )}
        </div>
      )}
    </div>
  )
}
