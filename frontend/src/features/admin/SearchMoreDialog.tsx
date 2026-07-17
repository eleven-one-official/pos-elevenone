import { useState } from 'react'
import {
  LuChevronLeft,
  LuChevronRight,
  LuExternalLink,
  LuList,
  LuSearch,
  LuX,
} from 'react-icons/lu'
import { BLUE_SELECT, DropdownStub, FIELD_BG, FieldGroup, LABEL } from './formKit'
import SearchMenus from './SearchMenus'

// ---------------------------------------------------------------------------
// "Search: <field>" — the record picker Odoo opens from a many2one's
// "Search More...". Pure UI over the option list passed in: live search and
// 80-row pages work, and Create swaps in the quick-create form (the record
// list waits disabled behind it). Saving the form commits the typed name.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 80

export default function SearchMoreDialog({
  title,
  options,
  onPick,
  onClose,
}: {
  /** Field label — renders as "Search: <title>" and the column header. */
  title: string
  options: string[]
  onPick: (value: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const matches = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const rows = matches.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 p-6 pt-20">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="fixed inset-0 cursor-default"
      />

      <div className="relative flex max-h-[85vh] w-[980px] max-w-full flex-col rounded-[3px] bg-white shadow-[0_6px_30px_rgba(0,0,0,0.3)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-800">Search: {title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <LuX className="h-4.5 w-4.5" />
          </button>
        </div>

        {creating ? (
          <>
            {/* Stat button — quick-create form header, Odoo style */}
            <div className="flex shrink-0 justify-end">
              <button
                type="button"
                className="flex items-center gap-2.5 border-b border-l border-neutral-200 px-4 py-2 text-left transition hover:bg-neutral-50"
              >
                <LuList className="h-4.5 w-4.5 text-neutral-500" />
                <span className="text-[12px] leading-tight text-neutral-700">
                  <span className="block font-semibold">0</span>
                  Products
                </span>
              </button>
            </div>

            {/* Quick-create form */}
            <div className="shrink-0 px-6 pb-6 pt-3">
              <div className="text-[13px] font-bold text-neutral-800">Category</div>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
                placeholder="e.g. Lamps"
                className={`mt-1.5 w-[72%] min-w-72 rounded-[2px] border border-neutral-300 ${FIELD_BG} px-3 py-1.5 text-[20px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-sky-600`}
              />

              <div className="mt-6 grid grid-cols-1 gap-x-16 gap-y-7 xl:grid-cols-2">
                <FieldGroup>
                  <label className={LABEL}>Parent Category</label>
                  <div className="max-w-44">
                    <DropdownStub />
                  </div>
                </FieldGroup>
                <div className="hidden xl:block" />

                <FieldGroup title="Logistics">
                  <label className={LABEL}>Force Removal Strategy</label>
                  <DropdownStub />
                </FieldGroup>

                <FieldGroup title="Inventory Valuation">
                  <label className={LABEL}>Costing Method</label>
                  <select className={BLUE_SELECT}>
                    <option>Standard Price</option>
                    <option>Average Cost (AVCO)</option>
                    <option>First In First Out (FIFO)</option>
                  </select>

                  <label className={LABEL}>Inventory Valuation</label>
                  <select className={BLUE_SELECT}>
                    <option>Manual</option>
                    <option>Automated</option>
                  </select>
                </FieldGroup>

                <FieldGroup title="Account Properties">
                  <label className={LABEL}>Income Account</label>
                  <span className="flex items-center gap-2">
                    <DropdownStub value="400000 Product Sales" />
                    <LuExternalLink className="h-4 w-4 shrink-0 text-neutral-500" />
                  </span>

                  <label className={LABEL}>Expense Account</label>
                  <span className="flex items-center gap-2">
                    <DropdownStub value="600000 Expenses" />
                    <LuExternalLink className="h-4 w-4 shrink-0 text-neutral-500" />
                  </span>
                </FieldGroup>
              </div>
            </div>

            {/* Save / Discard */}
            <div className="flex shrink-0 items-center gap-1.5 border-t border-neutral-200 px-6 py-3">
              <button
                type="button"
                onClick={() => {
                  const name = newName.trim()
                  if (name) onPick(name)
                  else setCreating(false)
                }}
                className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                Discard
              </button>
            </div>

            {/* The record list waits disabled behind the form */}
            <div className="relative min-h-16 flex-1 overflow-hidden">
              <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1 overflow-hidden">
                  {rows.map((o) => (
                    <div
                      key={o}
                      className="border-b border-neutral-100 px-4 py-[7px] text-[13px] text-neutral-700"
                    >
                      {o}
                    </div>
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-2 border-t border-neutral-200 px-6 py-4">
                  <span className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white">
                    Create
                  </span>
                  <span className="rounded-[3px] border border-neutral-300 bg-white px-4 py-1.5 text-sm text-neutral-700">
                    Cancel
                  </span>
                </div>
              </div>
              <div className="absolute inset-0 z-10 bg-neutral-500/20" />
            </div>
          </>
        ) : (
          <>
            {/* Search panel — right-aligned, Odoo style */}
            <div className="flex shrink-0 justify-end px-6 pt-4">
              <div className="flex w-[460px] max-w-full flex-col gap-2">
                <label className="relative block">
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setPage(0)
                    }}
                    onKeyDown={(e) => e.key === 'Escape' && onClose()}
                    placeholder="Search..."
                    className="w-full rounded-[3px] border border-neutral-300 px-3 py-1.5 pr-9 text-sm outline-none transition focus:border-sky-600"
                  />
                  <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SearchMenus
                    filterSections={[[]]}
                    groupOptions={['Parent Category']}
                    favoriteName={title}
                  />

                  <div className="flex items-center gap-2 text-[13px] text-neutral-700">
                    <span>
                      {current * PAGE_SIZE + (rows.length ? 1 : 0)}-
                      {current * PAGE_SIZE + rows.length} / {matches.length}
                    </span>
                    <span className="inline-flex divide-x divide-neutral-300 rounded-[3px] border border-neutral-300">
                      <button
                        type="button"
                        aria-label="Previous page"
                        onClick={() => setPage((current - 1 + pages) % pages)}
                        className="px-2 py-1 text-neutral-600 transition hover:bg-neutral-50"
                      >
                        <LuChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Next page"
                        onClick={() => setPage((current + 1) % pages)}
                        className="px-2 py-1 text-neutral-600 transition hover:bg-neutral-50"
                      >
                        <LuChevronRight className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Record list */}
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 z-10 border-b border-neutral-300 bg-white px-4 py-2 text-[13px] font-bold text-neutral-800">
                {title}
              </div>
              {rows.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => onPick(o)}
                  className="block w-full border-b border-neutral-100 px-4 py-[7px] text-left text-[13px] text-neutral-700 transition hover:bg-neutral-100/70"
                >
                  {o}
                </button>
              ))}
              {rows.length === 0 && (
                <div className="px-4 py-6 text-center text-[13px] italic text-neutral-500">
                  No records found.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center gap-2 border-t border-neutral-200 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setNewName(query)
                  setCreating(true)
                }}
                className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
              >
                Create
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-[3px] border border-neutral-300 bg-white px-4 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
