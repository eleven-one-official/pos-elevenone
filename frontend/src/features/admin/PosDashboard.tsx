import { useState } from 'react'
import {
  LuChevronLeft,
  LuChevronRight,
  LuEllipsisVertical,
  LuLayoutGrid,
  LuList,
  LuSearch,
} from 'react-icons/lu'
import SearchMenus from './SearchMenus'

// ---------------------------------------------------------------------------
// Point of Sale dashboard — Odoo-style kanban of POS configurations, each card
// showing the last closing info and a "Continue selling" entry point. Pure UI
// for now: the cards below are placeholder data until the backend exposes real
// session summaries.
// ---------------------------------------------------------------------------

type PosConfig = {
  id: string
  name: string
  /** Which staff role this register serves — drives the session login gate. */
  kind: 'cashier' | 'waiter'
  toClose?: boolean
  lastClosingDate: string
  lastClosingCash?: string
  openSessions?: number
  ownerInitial: string
  ownerColor: string
}

const PLACEHOLDER_CONFIGS: PosConfig[] = [
  {
    id: 'ttp',
    name: 'TTP',
    kind: 'cashier',
    lastClosingDate: '15-Jul-2026',
    lastClosingCash: '$ 318.34',
    openSessions: 2,
    ownerInitial: 'K',
    ownerColor: 'bg-[#28a745]',
  },
  {
    id: 'ttp-waiter',
    name: 'TTP Waiter',
    kind: 'waiter',
    toClose: true,
    lastClosingDate: '16-Dec-2024',
    lastClosingCash: '$ 0.00',
    ownerInitial: 'K',
    ownerColor: 'bg-[#28a745]',
  },
]

export default function PosDashboard({
  onContinueSelling,
}: {
  onContinueSelling: (config: { name: string; kind: 'cashier' | 'waiter' }) => void
}) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')

  const visible = PLACEHOLDER_CONFIGS.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
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
                filterSections={[['To Close'], ['Archived']]}
                groupOptions={['Company']}
                favoriteName="Point of Sale"
              />

              <div className="flex items-center gap-2">
                <span className="text-[13px] text-neutral-600">
                  {visible.length === 0 ? '0-0' : `1-${visible.length}`} / {visible.length}
                </span>
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-label="Previous page"
                    className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100"
                  >
                    <LuChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100"
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
          {`No point of sale matches "${query}".`}
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
                  {c.toClose && (
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
                  Continue selling
                </button>

                {/* Label / value columns, values left-aligned — Odoo kanban style */}
                <div className="ml-auto mr-4 grid min-w-0 grid-cols-[minmax(0,10rem)_auto] gap-x-8 gap-y-0.5 text-[13px]">
                  <span className="text-neutral-700">Last Closing Date</span>
                  <span className="whitespace-nowrap text-neutral-800">{c.lastClosingDate}</span>
                  {c.lastClosingCash && (
                    <>
                      <span className="text-neutral-700">Last Closing Cash Balance</span>
                      <span className="whitespace-nowrap text-neutral-800">{c.lastClosingCash}</span>
                    </>
                  )}
                  {c.openSessions != null && (
                    <button
                      type="button"
                      className="col-span-2 mt-1 justify-self-start text-[13px] text-neutral-600 underline transition hover:text-sky-800"
                    >
                      There are {c.openSessions} open sessions
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end">
                <span
                  className={`flex h-5.5 w-5.5 items-center justify-center rounded-full text-[10px] font-semibold text-white ${c.ownerColor}`}
                >
                  {c.ownerInitial}
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
                    <td className="px-4 py-2.5 text-neutral-700">{c.lastClosingDate}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{c.lastClosingCash ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {c.toClose ? (
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
