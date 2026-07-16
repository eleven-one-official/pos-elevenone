import { useState } from 'react'
import {
  LuArrowDownWideNarrow,
  LuArrowUpNarrowWide,
  LuChartArea,
  LuChartColumn,
  LuChartPie,
  LuCheck,
  LuChevronDown,
  LuDatabase,
  LuDownload,
  LuExpand,
  LuRepeat,
  LuSearch,
  LuTable,
} from 'react-icons/lu'
import SearchMenus, { toggleIn } from './SearchMenus'

// ---------------------------------------------------------------------------
// Reporting › Orders — the "Orders Analysis" graph view: Total Price by
// product category as a single-series bar chart, Odoo style. Pure UI: the
// series below is placeholder data shaped like the venue's real categories.
// ---------------------------------------------------------------------------

// Values are Total Price in thousands of dollars.
const SERIES: { c: string; v: number }[] = [
  { c: 'Addition_', v: 24.5 },
  { c: 'Addition_ / ECO BOXES', v: 15.2 },
  { c: 'Alcoholic Drink_ / Beer_', v: 11.3 },
  { c: 'Alcoholic Drink_ / Cocktails_', v: 6.6 },
  { c: 'Alcoholic Drink_ / Cocktails_ / Monthly Special_', v: 0.8 },
  { c: 'All', v: 0.1 },
  { c: 'Bakery_', v: 3.9 },
  { c: 'Bakery_ / Cake_', v: 5.9 },
  { c: 'Bakery_ / Cake_ / Brownie_', v: 2.1 },
  { c: 'Bakery_ / Cake_ / Cake of the month_ / Cheese cake_', v: 0.5 },
  { c: 'Bakery_ / Cake_ / Bar_', v: 5.7 },
  { c: 'Bakery_ / Cake_ / Cookies_', v: 0.6 },
  { c: 'Bakery_ / Cake_ / Eclairs_', v: 0.2 },
  { c: 'Bakery_ / Cake_ / Macaron_', v: 1.0 },
  { c: 'Bakery_ / Cake_ / Muffin_', v: 1.0 },
  { c: 'Bakery_ / Cake_ / Tart_', v: 3.0 },
  { c: 'Breakfast_', v: 29.5 },
  { c: 'Brunch_', v: 12.0 },
  { c: 'Brunch_ / Bread_', v: 0.4 },
  { c: 'Brunch_ / Drink_ / Coffee_', v: 0.7 },
  { c: 'Brunch_ / Drink_ / Juice_', v: 0.6 },
  { c: 'Brunch_ / Drink_ / Other_', v: 0.3 },
  { c: 'Brunch_ / Drink_ / Smoothie Bowl_', v: 0.5 },
  { c: 'Brunch_ / Viennoiseries_', v: 0.4 },
  { c: 'COFFEE & TEA & Milk_ / COFFEE_', v: 13.7 },
  { c: 'COFFEE & TEA & Milk_ / Fresh Milk', v: 0.3 },
  { c: 'COFFEE & TEA & Milk_ / TEA', v: 2.4 },
  { c: 'Desserts_', v: 11.2 },
  { c: 'Desserts_ / Ice Cream_', v: 1.5 },
  { c: 'Desserts_ / Topping_', v: 0.2 },
  { c: 'Desserts_ / Special Homemade_', v: 0.9 },
  { c: 'Drink_ / Free Flow_', v: 0.2 },
  { c: 'Drinks', v: 2.1 },
  { c: 'HOME MADE_ / Syrup_', v: 0.3 },
  { c: 'Khmer Breakfast_', v: 21.0 },
  { c: 'Lunch SET_ / Set 1_', v: 2.1 },
  { c: 'Lunch SET_ / Set 2_', v: 1.1 },
  { c: 'Lunch SET_ / Set 3_', v: 1.3 },
  { c: 'Lunch SET_ / Set 4_', v: 1.3 },
  { c: 'Lunch SET_ / Set 5_', v: 1.4 },
  { c: 'Lunch SET_ / Set 6_', v: 1.5 },
  { c: 'Lunch SET_ / Set 7_', v: 1.5 },
  { c: 'Lunch SET_ / Set 9_', v: 1.4 },
  { c: 'Main Courses_ / Burgers_', v: 15.6 },
  { c: 'Main Courses_ / Khmer Cuisine / Popular_', v: 74.5 },
  { c: 'Main Courses_ / Khmer Cuisine_ / Signature_', v: 80.3 },
  { c: 'Main Courses_ / Regionals_ / Battambang_', v: 1.3 },
  { c: 'Main Courses_ / Regionals_ / Kampong Thom_', v: 3.9 },
  { c: 'Main Courses_ / Regionals_ / Prey Veng_', v: 3.2 },
  { c: 'Main Courses_ / Regionals_ / Siem Reap_', v: 13.6 },
  { c: 'Main Courses_ / Regionals_ / Svay Rieng_', v: 7.0 },
  { c: 'Main Courses_ / Special Menu_', v: 21.5 },
  { c: 'Main Courses_ / Special Menu 1_', v: 2.6 },
  { c: 'Main Courses_ / TAKE AWAY_', v: 0.1 },
  { c: 'Main Courses_ / Western Cuisine_', v: 20.0 },
  { c: 'NON Alcoholic_ / Drink CAN_', v: 10.6 },
  { c: 'NON Alcoholic_ / Fruit JUICE_', v: 20.7 },
  { c: 'NON Alcoholic_ / Fruit SHAKE_', v: 28.6 },
  { c: 'PIZZA_ / Pizza_', v: 17.5 },
  { c: 'SALAD_', v: 41.5 },
  { c: 'SOUP_ / Soup_', v: 25.3 },
  { c: 'SOUP_ / Vegetarian_', v: 13.0 },
  { c: 'Starter_', v: 56.5 },
  { c: 'Wines_ / Happy Hours Beer_', v: 5.4 },
  { c: 'Wines_ / Happy Hours Cocktail_', v: 3.0 },
  { c: 'Wines_ / Happy Hours Wine_', v: 2.9 },
  { c: 'Wines_ / House Wine_', v: 3.5 },
  { c: 'Wines_ / RED wine_', v: 1.1 },
  { c: 'Wines_ / ROSE_', v: 0.3 },
  { c: 'Wines_ / Sparkling_', v: 0.2 },
  { c: 'Wines_ / White wine_', v: 1.9 },
]

const BAR_COLOR = '#3f7cb1'

// Toggleable measures in the Measures dropdown; Count sits below a divider.
const MEASURES = [
  'Average Price',
  'Delay Validation',
  'Margin',
  'Product Quantity',
  'Sale Line Count',
  'Subtotal w/o discount',
  'Total Discount',
  'Total Price',
]

// d3/Chart.js category palette, the one Odoo cycles through for pies.
const PIE_COLORS = [
  '#1f77b4', '#ff7f0e', '#aec7e8', '#ffbb78', '#2ca02c', '#98df8a', '#d62728',
  '#ff9896', '#9467bd', '#c5b0d5', '#8c564b', '#c49c94', '#e377c2', '#f7b6d2',
  '#7f7f7f', '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5',
]

const tooltip = (d: { c: string; v: number }) =>
  `${d.c}\nTotal Price: $ ${(d.v * 1000).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

const money = (v: number) => (v * 1000).toLocaleString('en-US', { minimumFractionDigits: 2 })

/** Odoo-style hover tooltip — parent button needs `group relative`. */
function Tip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-[2px] border border-neutral-200 bg-white px-2 py-1 text-[11.5px] font-normal text-neutral-700 shadow-md group-hover:block">
      {label}
    </span>
  )
}

/** Pivot view — Total row plus one row per product category. */
function PivotTable() {
  const total = SERIES.reduce((sum, d) => sum + d.v, 0)
  return (
    <div className="overflow-y-auto p-4">
      <table className="border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="w-96 border border-neutral-200 bg-neutral-50 px-3 py-2" />
            <th className="w-40 border border-neutral-200 bg-neutral-50 px-3 py-2 text-right font-medium text-neutral-700">
              Total Price
            </th>
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
            <td className="border border-neutral-200 px-3 py-1.5 text-right font-bold text-neutral-800">
              {money(total)}
            </td>
          </tr>
          {SERIES.map((d, i) => (
            <tr key={d.c + i} className="transition hover:bg-neutral-50">
              <td className="border border-neutral-200 py-1.5 pl-8 pr-3 text-neutral-700">{d.c}</td>
              <td className="border border-neutral-200 px-3 py-1.5 text-right text-neutral-700">
                {money(d.v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PieChart() {
  const total = SERIES.reduce((sum, d) => sum + d.v, 0)
  const cx = 460
  const cy = 415
  const r = 400
  let angle = -Math.PI / 2

  return (
    <svg viewBox="0 0 920 830" className="mx-auto block max-h-[75vh] w-full">
      {SERIES.map((d, i) => {
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
            <title>{tooltip(d)}</title>
          </path>
        )
      })}
    </svg>
  )
}

function OrdersChart({ type, data }: { type: 'bar' | 'line'; data: typeof SERIES }) {
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
  const maxV = 90
  const y = (v: number) => plotT + plotH - (v / maxV) * plotH
  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]
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
            {t === 0 ? '0.00' : `${t}.00k`}
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
              <title>{tooltip(d)}</title>
            </rect>
          )
        })
      ) : (
        <>
          <path d={areaPath} fill={BAR_COLOR} opacity="0.35" />
          <path d={linePath} fill="none" stroke={BAR_COLOR} strokeWidth="2" />
          {data.map((d, i) => (
            <circle key={d.c + i} cx={points[i].x} cy={points[i].y} r="3.5" fill={BAR_COLOR}>
              <title>{tooltip(d)}</title>
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
        Total Price
      </text>
      <text x={plotL + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fill="#565656">
        Product Category
      </text>
    </svg>
  )
}

export default function PosOrdersAnalysis() {
  const [query, setQuery] = useState('')
  // Measures dropdown — dev builds can pre-open it with `?measures-open`.
  const [measuresOpen, setMeasuresOpen] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('measures-open'),
  )
  const [checkedMeasures, setCheckedMeasures] = useState<Set<string>>(new Set(['Total Price']))
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
  const series =
    sortDir === 'none'
      ? SERIES
      : [...SERIES].sort((a, b) => (sortDir === 'desc' ? b.v - a.v : a.v - b.v))

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
                            onClick={() => setCheckedMeasures((s) => toggleIn(s, m))}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-neutral-100"
                          >
                            <LuCheck
                              className={`h-3.5 w-3.5 shrink-0 ${
                                checkedMeasures.has(m) ? 'text-neutral-700' : 'invisible'
                              }`}
                            />
                            <span
                              className={
                                checkedMeasures.has(m) ? 'font-semibold text-neutral-800' : ''
                              }
                            >
                              {m}
                            </span>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setCheckedMeasures((s) => toggleIn(s, 'Count'))}
                        className="mt-1 flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-neutral-100"
                      >
                        <LuCheck
                          className={`h-3.5 w-3.5 shrink-0 ${
                            checkedMeasures.has('Count') ? 'text-neutral-700' : 'invisible'
                          }`}
                        />
                        <span
                          className={
                            checkedMeasures.has('Count') ? 'font-semibold text-neutral-800' : ''
                          }
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
                  {(
                    [
                      { label: 'Flip axis', Icon: LuRepeat },
                      { label: 'Expand all', Icon: LuExpand },
                      { label: 'Download xlsx', Icon: LuDownload },
                    ] as const
                  ).map(({ label, Icon }) => (
                    <button
                      key={label}
                      type="button"
                      aria-label={label}
                      className="group relative bg-white px-2.5 py-1.5 text-neutral-500 transition hover:bg-neutral-50"
                    >
                      <Icon className="h-4 w-4" />
                      <Tip label={label} />
                    </button>
                  ))}
                </div>
              )}

              {/* Stacked applies to bars only; sorting has no meaning on a pie */}
              {oaView === 'graph' && chartType !== 'pie' && (
                <div className="inline-flex divide-x divide-neutral-300 overflow-hidden rounded-[3px] border border-neutral-300">
                  {chartType === 'bar' && (
                    <button
                      type="button"
                      aria-label="Stacked"
                      className="bg-neutral-100 px-2.5 py-1.5 text-neutral-700"
                    >
                      <LuDatabase className="h-4 w-4" />
                    </button>
                  )}
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
                    <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-[2px] border border-neutral-200 bg-white px-2 py-1 text-[11.5px] text-neutral-700 shadow-md group-hover:block">
                      Descending
                    </span>
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
                    <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-[2px] border border-neutral-200 bg-white px-2 py-1 text-[11.5px] text-neutral-700 shadow-md group-hover:block">
                      Ascending
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-72 max-w-[880px] flex-1 flex-col gap-2">
            <label className="relative block">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-[3px] border border-neutral-300 px-3 py-1.5 pr-9 text-sm outline-none transition focus:border-sky-600"
              />
              <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <SearchMenus
                filterSections={[
                  ['Ordered Today', 'Ordered This Week', 'Ordered This Month', 'Ordered This Year'],
                ]}
                groupOptions={['Point of Sale', 'Product', 'Product Category', 'Order Date']}
                favoriteName="Orders Analysis"
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

      {/* Graph or pivot */}
      {oaView === 'pivot' ? (
        <PivotTable />
      ) : (
        <div className="overflow-y-auto px-4 pb-4 pt-2">
          {chartType !== 'pie' && (
            <div className="mb-1 flex items-center justify-center gap-2 text-[13px] text-neutral-600">
              <span className="h-3.5 w-8 rounded-[2px]" style={{ backgroundColor: BAR_COLOR }} />
              Total Price
            </div>
          )}
          {chartType === 'pie' ? <PieChart /> : <OrdersChart type={chartType} data={series} />}
        </div>
      )}
    </div>
  )
}
