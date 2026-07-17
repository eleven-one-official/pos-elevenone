import { useState } from 'react'
import {
  LuChevronLeft,
  LuChevronRight,
  LuChevronsUpDown,
  LuDownload,
  LuLayoutGrid,
  LuList,
  LuSearch,
} from 'react-icons/lu'
import PosPricelistForm from './PosPricelistForm'
import SearchMenus from './SearchMenus'

// ---------------------------------------------------------------------------
// Pricelists — Odoo-style editable list view. Pure UI with placeholder rows
// until pricelists exist on the backend.
// ---------------------------------------------------------------------------

const PLACEHOLDER_PRICELISTS: { id: string; name: string; currency: string; company: string }[] = [
  { id: 'public', name: 'Public Pricelist', currency: 'USD', company: '' },
  { id: 'salted-eggs', name: 'salted eggs &chiffon cupcake', currency: 'USD', company: '' },
]

export default function PosPricelists() {
  const [query, setQuery] = useState('')
  // Create swaps the whole screen for the pricelist form, Odoo style;
  // clicking a row opens the same form prefilled.
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<(typeof PLACEHOLDER_PRICELISTS)[number] | null>(null)

  const visible = PLACEHOLDER_PRICELISTS.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  if (creating || selected) {
    return (
      <PosPricelistForm
        pricelist={selected ?? undefined}
        onBack={() => {
          setCreating(false)
          setSelected(null)
        }}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <div>
            <h1 className="text-xl text-neutral-700">Pricelists</h1>
            <div className="mt-2 inline-flex items-stretch gap-px">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-l-[3px] bg-[#57779a] px-3 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
              >
                Create
              </button>
              <button
                type="button"
                aria-label="Export"
                className="rounded-r-[3px] border border-neutral-300 bg-white px-2.5 text-neutral-600 transition hover:bg-neutral-50"
              >
                <LuDownload className="h-4 w-4" />
              </button>
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
                filterSections={[['Archived']]}
                groupOptions={['Currency', 'Company']}
                favoriteName="Pricelists"
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

                <div className="inline-flex overflow-hidden rounded-[3px] border border-neutral-300">
                  <button
                    type="button"
                    aria-label="List view"
                    className="bg-[#57779a] px-2.5 py-1.5 text-white"
                  >
                    <LuList className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Kanban view"
                    className="border-l border-neutral-300 bg-white px-2.5 py-1.5 text-neutral-500 transition hover:bg-neutral-50"
                  >
                    <LuLayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Editable-list style table */}
      <div className="overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-800">
              <th className="w-10 px-4 py-2.5">
                <input type="checkbox" className="h-3.5 w-3.5 align-middle" />
              </th>
              <th className="w-8" />
              <th className="py-2.5 pr-4 font-bold">Pricelist Name</th>
              <th className="w-[30%] py-2.5 pr-4 font-bold">Currency</th>
              <th className="w-[20%] py-2.5 pr-4 font-bold">Company</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr
                key={p.id}
                onClick={() => setSelected(p)}
                className="cursor-pointer border-b border-neutral-100 text-neutral-700 transition hover:bg-neutral-50"
              >
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="h-3.5 w-3.5 align-middle" />
                </td>
                <td className="py-2 text-neutral-400">
                  <LuChevronsUpDown className="h-3.5 w-3.5" />
                </td>
                <td className="py-2 pr-4 text-neutral-800">{p.name}</td>
                <td className="py-2 pr-4">{p.currency}</td>
                <td className="py-2 pr-4">{p.company}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="p-10 text-center text-sm text-neutral-500">
            {`No pricelist matches "${query}".`}
          </div>
        )}
      </div>
    </div>
  )
}
