import { useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuSearch, LuX } from 'react-icons/lu'
import SearchMenus from './SearchMenus'

// ---------------------------------------------------------------------------
// "Search: <field>" — the record picker Odoo opens from a many2one's
// "Search More...". Pure UI over the option list passed in: live search and
// 80-row pages work; Create is a stub until the backend can add records.
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
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
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

        {/* Search panel — right-aligned, Odoo style */}
        <div className="flex justify-end px-6 pt-4">
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
        <div className="flex items-center gap-2 border-t border-neutral-200 px-6 py-4">
          <button
            type="button"
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
      </div>
    </div>
  )
}
