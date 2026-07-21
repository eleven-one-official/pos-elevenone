import { useEffect, useState } from 'react'
import {
  LuChevronLeft,
  LuChevronRight,
  LuEllipsisVertical,
  LuLayoutGrid,
  LuList,
  LuSearch,
} from 'react-icons/lu'
import { LoadingState } from '../../components/ui/Loader'
import { fetchPosConfigs, type PosConfigStats } from '../../services/api/reports'
import SearchMenus, { toggleIn } from './SearchMenus'

// ---------------------------------------------------------------------------
// Point of Sale dashboard — Odoo-style kanban of the venue's two registers
// (cashier POS and waiter tablets), each card showing real last-closing info
// from /reports/pos-configs and a "Continue selling" entry point.
// ---------------------------------------------------------------------------

type PosConfig = {
  id: string
  name: string
  /** Which staff role this register serves — drives the session login gate. */
  kind: 'cashier' | 'waiter' | 'kitchen' | 'bar'
  stats: PosConfigStats
}

/** A live station screen rather than a register — no cash, nothing to close. */
const isDisplay = (c: PosConfig) => c.kind === 'kitchen' || c.kind === 'bar'

const pad = (n: number) => String(n).padStart(2, '0')

/** Odoo-style date label, e.g. "17-Jul-2026". */
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${pad(d.getDate())}-${d.toLocaleString('en-GB', { month: 'short' })}-${d.getFullYear()}`
}

export default function PosDashboard({
  onContinueSelling,
}: {
  onContinueSelling: (config: { name: string; kind: 'cashier' | 'waiter' | 'kitchen' | 'bar' }) => void
}) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [checkedFilters, setCheckedFilters] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState<{ cashier: PosConfigStats; waiter: PosConfigStats } | null>(
    null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = () => {
    setLoadError(null)
    fetchPosConfigs()
      .then(setStats)
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : 'Failed to load the dashboard.'),
      )
  }

  useEffect(load, [])

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
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

  if (stats === null) {
    return <LoadingState label="Loading registers..." className="h-full" />
  }

  const configs: PosConfig[] = [
    { id: 'ttp', name: 'TTP', kind: 'cashier', stats: stats.cashier },
    { id: 'ttp-waiter', name: 'TTP Waiter', kind: 'waiter', stats: stats.waiter },
    // The station displays aren't registers (no cash, no closing) — they're
    // live screens, one per station: the kitchen takes the food half of every
    // send, the bar the drinks. Both reuse the same card + session-login gate
    // as an entry point.
    {
      id: 'ttp-kitchen',
      name: 'TTP Kitchen',
      kind: 'kitchen',
      stats: { open_orders: 0, last_closing_date: null, last_closing_cash: null },
    },
    {
      id: 'ttp-bar',
      name: 'TTP Bar',
      kind: 'bar',
      stats: { open_orders: 0, last_closing_date: null, last_closing_cash: null },
    },
  ]

  const toClose = (c: PosConfig) => c.stats.open_orders > 0

  const visible = configs.filter(
    (c) =>
      c.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (!checkedFilters.has('To Close') || toClose(c)),
  )

  return (
    <div className="flex h-full flex-col">
      {/* Control panel — breadcrumb, search, filters, pagination, view switch */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <h1 className="pt-0.5 text-xl text-neutral-700">Point of Sale</h1>

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
              {/* Filters / Group By / Favorites — shared Odoo search menus */}
              <SearchMenus
                filterSections={[['To Close']]}
                groupOptions={['Company']}
                favoriteName="Point of Sale"
                checkedFilters={checkedFilters}
                onToggleFilter={(f) => setCheckedFilters((s) => toggleIn(s, f))}
              />

              <div className="flex items-center gap-2">
                <span className="text-[13px] text-neutral-600">
                  {visible.length === 0 ? '0-0' : `1-${visible.length}`} / {visible.length}
                </span>
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled
                    className="rounded p-1 text-neutral-500 opacity-40"
                  >
                    <LuChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled
                    className="rounded p-1 text-neutral-500 opacity-40"
                  >
                    <LuChevronRight className="h-4.5 w-4.5" />
                  </button>
                </div>

                {/* Kanban / list switch — segmented, active filled steel blue */}
                <div className="inline-flex overflow-hidden rounded-[3px] border border-neutral-300">
                  <button
                    type="button"
                    aria-label="Kanban view"
                    onClick={() => setView('kanban')}
                    className={`px-2.5 py-1.5 transition ${
                      view === 'kanban'
                        ? 'bg-[#57779a] text-white'
                        : 'bg-white text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    <LuLayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="List view"
                    onClick={() => setView('list')}
                    className={`border-l border-neutral-300 px-2.5 py-1.5 transition ${
                      view === 'list'
                        ? 'bg-[#57779a] text-white'
                        : 'bg-white text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    <LuList className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Records */}
      {visible.length === 0 ? (
        <div className="p-10 text-center text-sm text-neutral-500">
          {query.trim()
            ? `No point of sale matches "${query}".`
            : 'No register matches the current filters.'}
        </div>
      ) : view === 'kanban' ? (
        <div className="grid content-start gap-5 p-4 [grid-template-columns:repeat(auto-fill,minmax(520px,1fr))]">
          {visible.map((c) => (
            <article
              key={c.id}
              className="flex min-h-44 flex-col rounded-[3px] border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[15px] text-neutral-800">{c.name}</h2>
                  {toClose(c) && (
                    <span className="mt-1.5 inline-block rounded-[2px] bg-[#dc3545] px-1.5 py-px text-[10px] font-bold text-white">
                      To Close
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`${c.name} options`}
                  className="-mr-1 rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
                >
                  <LuEllipsisVertical className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-1 items-center gap-6 py-4">
                <button
                  type="button"
                  onClick={() => onContinueSelling({ name: c.name, kind: c.kind })}
                  className="shrink-0 rounded-[3px] bg-[#57779a] px-3 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
                >
                  {isDisplay(c) ? 'Open display' : 'Continue selling'}
                </button>

                {isDisplay(c) ? (
                  <p className="ml-auto mr-4 max-w-64 text-[13px] leading-relaxed text-neutral-600">
                    {c.kind === 'bar'
                      ? "Live drinks screen — every item in the Drink category lands here; the bar marks each ready when it's poured."
                      : "Live order screen — tickets appear as they're fired; the kitchen marks each ready when it's cooked."}
                  </p>
                ) : (
                  /* Label / value columns, values left-aligned — Odoo kanban style */
                  <div className="ml-auto mr-4 grid min-w-0 grid-cols-[minmax(0,10rem)_auto] gap-x-8 gap-y-0.5 text-[13px]">
                    <span className="text-neutral-700">Last Closing Date</span>
                    <span className="whitespace-nowrap text-neutral-800">
                      {fmtDate(c.stats.last_closing_date)}
                    </span>
                    {c.stats.last_closing_cash !== null && (
                      <>
                        <span className="text-neutral-700">Last Closing Cash Balance</span>
                        <span className="whitespace-nowrap text-neutral-800">
                          $ {c.stats.last_closing_cash.toFixed(2)}
                        </span>
                      </>
                    )}
                    {c.stats.open_orders > 0 && (
                      <span className="col-span-2 mt-1 text-[13px] text-neutral-600">
                        {c.stats.open_orders === 1
                          ? 'There is 1 open order'
                          : `There are ${c.stats.open_orders} open orders`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end">
                <span className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-[#28a745] text-[10px] font-semibold text-white">
                  {c.name.charAt(0)}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="p-4">
          <div className="overflow-hidden rounded-[3px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-600">
                  <th className="px-4 py-2.5 font-medium">Point of Sale</th>
                  <th className="px-4 py-2.5 font-medium">Last Closing Date</th>
                  <th className="px-4 py-2.5 font-medium">Last Closing Cash Balance</th>
                  <th className="px-4 py-2.5 font-medium">Open Orders</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                  >
                    <td className="px-4 py-2.5 text-neutral-800">{c.name}</td>
                    <td className="px-4 py-2.5 text-neutral-700">
                      {fmtDate(c.stats.last_closing_date)}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-700">
                      {c.stats.last_closing_cash !== null
                        ? `$ ${c.stats.last_closing_cash.toFixed(2)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-700">{c.stats.open_orders}</td>
                    <td className="px-4 py-2.5">
                      {toClose(c) ? (
                        <span className="rounded-[2px] bg-[#dc3545] px-1.5 py-px text-[10px] font-bold text-white">
                          To Close
                        </span>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
