import { useState } from 'react'
import {
  LuCheck,
  LuChevronRight,
  LuCirclePlus,
  LuFilter,
  LuMenu,
  LuStar,
} from 'react-icons/lu'

// ---------------------------------------------------------------------------
// Filters / Group By / Favorites — the Odoo search-panel button group with
// its dropdowns, shared by every admin list/report screen. Checked filters
// can be controlled by the page (Products syncs them with its facet chip);
// everything else is local UI state until search is wired to the backend.
// ---------------------------------------------------------------------------

type SearchMenu = 'filters' | 'groupby' | 'favorites' | null

export function toggleIn(set: Set<string>, value: string): Set<string> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export default function SearchMenus({
  filterSections,
  groupOptions,
  favoriteName,
  checkedFilters,
  onToggleFilter,
}: {
  filterSections: string[][]
  groupOptions: string[]
  /** Default name in the "Save current search" panel. */
  favoriteName: string
  /** Controlled checked-filter set — pass with onToggleFilter, or omit both. */
  checkedFilters?: Set<string>
  onToggleFilter?: (filter: string) => void
}) {
  // Dev builds can pre-open a menu with `?pp-menu=filters|groupby|favorites`
  // and its submenu with `?pp-sub`.
  const [openMenu, setOpenMenu] = useState<SearchMenu>(() => {
    if (!import.meta.env.DEV) return null
    const m = new URLSearchParams(window.location.search).get('pp-menu')
    return m === 'filters' || m === 'groupby' || m === 'favorites' ? m : null
  })
  const [subOpen, setSubOpen] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('pp-sub'),
  )
  const [localChecked, setLocalChecked] = useState<Set<string>>(new Set())
  const [checkedGroups, setCheckedGroups] = useState<Set<string>>(new Set())

  const checked = checkedFilters ?? localChecked
  const toggleFilter = (f: string) => {
    if (onToggleFilter) onToggleFilter(f)
    else setLocalChecked((s) => toggleIn(s, f))
  }
  const closeMenus = () => {
    setOpenMenu(null)
    setSubOpen(false)
  }
  const toggleMenu = (m: Exclude<SearchMenu, null>) => {
    setOpenMenu((v) => (v === m ? null : m))
    setSubOpen(false)
  }

  return (
    <div className="inline-flex rounded-[3px] border border-neutral-200 bg-white">
      {openMenu && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={closeMenus}
          className="fixed inset-0 z-10 cursor-default"
        />
      )}

      {/* Filters */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleMenu('filters')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50 ${
            openMenu === 'filters' ? 'bg-neutral-100' : ''
          }`}
        >
          <LuFilter className="h-3.5 w-3.5 text-neutral-500" />
          Filters
        </button>

        {openMenu === 'filters' && (
          <div className="absolute left-0 top-full z-20 mt-px w-48 border border-neutral-200/80 bg-white py-1 text-[13px] text-neutral-600 shadow-md">
            {filterSections.map((section) => (
              <div key={section[0]} className="border-b border-neutral-100 py-0.5 last:border-0">
                {section.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFilter(f)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-neutral-100"
                  >
                    <LuCheck
                      className={`h-3.5 w-3.5 shrink-0 ${
                        checked.has(f) ? 'text-neutral-700' : 'invisible'
                      }`}
                    />
                    <span className={checked.has(f) ? 'font-medium text-neutral-800' : ''}>
                      {f}
                    </span>
                  </button>
                ))}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setSubOpen((v) => !v)}
              className="mt-0.5 flex w-full items-center justify-between px-3 py-1.5 text-left transition hover:bg-neutral-100"
            >
              Add Custom Filter
              <LuChevronRight className="h-3.5 w-3.5 text-neutral-400" />
            </button>

            {subOpen && (
              <div className="absolute left-full top-[55%] z-30 ml-1 w-72 border border-neutral-200/80 bg-white p-3 shadow-lg">
                <select className="w-full rounded-[2px] border border-neutral-300 px-2 py-1.5 text-[13px] outline-none transition focus:border-sky-600">
                  <option>Account Tags</option>
                  <option>Name</option>
                  <option>Price</option>
                  <option>Product Category</option>
                </select>
                <select className="mt-2 w-full rounded-[2px] border border-neutral-300 px-2 py-1.5 text-[13px] outline-none transition focus:border-sky-600">
                  <option>contains</option>
                  <option>does not contain</option>
                  <option>is equal to</option>
                  <option>is not equal to</option>
                </select>
                <input className="mt-2 w-full rounded-[2px] border border-neutral-300 px-2 py-1.5 text-[13px] outline-none transition focus:border-sky-600" />
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeMenus}
                    className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-[13px] text-white transition hover:bg-[#4c6b8d]"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50"
                  >
                    <LuCirclePlus className="h-3.5 w-3.5" />
                    Add a condition
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Group By */}
      <div className="relative border-l border-neutral-200">
        <button
          type="button"
          onClick={() => toggleMenu('groupby')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50 ${
            openMenu === 'groupby' ? 'bg-neutral-100' : ''
          }`}
        >
          <LuMenu className="h-3.5 w-3.5 text-neutral-500" />
          Group By
        </button>

        {openMenu === 'groupby' && (
          <div className="absolute left-0 top-full z-20 mt-px w-52 border border-neutral-200/80 bg-white py-1 text-[13px] text-neutral-600 shadow-md">
            <div className="border-b border-neutral-100 py-0.5">
              {groupOptions.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setCheckedGroups((s) => toggleIn(s, g))}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-neutral-100"
                >
                  <LuCheck
                    className={`h-3.5 w-3.5 shrink-0 ${
                      checkedGroups.has(g) ? 'text-neutral-700' : 'invisible'
                    }`}
                  />
                  <span className={checkedGroups.has(g) ? 'font-medium text-neutral-800' : ''}>
                    {g}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSubOpen((v) => !v)}
              className="mt-0.5 flex w-full items-center justify-between px-3 py-1.5 text-left transition hover:bg-neutral-100"
            >
              Add Custom Group
              <LuChevronRight className="h-3.5 w-3.5 text-neutral-400" />
            </button>

            {subOpen && (
              <div className="absolute left-full top-[60%] z-30 ml-1 w-56 border border-neutral-200/80 bg-white p-3 shadow-lg">
                <select className="w-full rounded-[2px] border border-neutral-300 px-2 py-1.5 text-[13px] outline-none transition focus:border-sky-600">
                  <option>Account Tags</option>
                  <option>Product Type</option>
                  <option>Product Category</option>
                </select>
                <button
                  type="button"
                  onClick={closeMenus}
                  className="mt-2.5 w-full rounded-[3px] bg-[#57779a] px-4 py-1.5 text-[13px] text-white transition hover:bg-[#4c6b8d]"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Favorites */}
      <div className="relative border-l border-neutral-200">
        <button
          type="button"
          onClick={() => toggleMenu('favorites')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50 ${
            openMenu === 'favorites' ? 'bg-neutral-100' : ''
          }`}
        >
          <LuStar className="h-3.5 w-3.5 text-neutral-500" />
          Favorites
        </button>

        {openMenu === 'favorites' && (
          <div className="absolute left-0 top-full z-20 mt-px w-52 border border-neutral-200/80 bg-white py-1 text-[13px] text-neutral-600 shadow-md">
            <button
              type="button"
              onClick={() => setSubOpen((v) => !v)}
              className="flex w-full items-center justify-between border-b border-neutral-100 px-3 py-1.5 text-left transition hover:bg-neutral-100"
            >
              Save current search
              <LuChevronRight className="h-3.5 w-3.5 text-neutral-400" />
            </button>
            <button
              type="button"
              onClick={closeMenus}
              className="mt-0.5 block w-full px-3 py-1.5 text-left transition hover:bg-neutral-100"
            >
              Import records
            </button>

            {subOpen && (
              <div className="absolute left-full top-0 z-30 ml-1 w-60 border border-neutral-200/80 bg-white p-3 shadow-lg">
                <input
                  defaultValue={favoriteName}
                  className="w-full rounded-[2px] border border-neutral-300 px-2 py-1.5 text-[13px] outline-none transition focus:border-sky-600"
                />
                <label className="mt-2.5 flex items-center gap-1.5 text-[13px] text-neutral-700">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-teal-700" />
                  Use by default
                </label>
                <label className="mt-1.5 flex items-center gap-1.5 text-[13px] text-neutral-700">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-teal-700" />
                  Share with all users
                </label>
                <button
                  type="button"
                  onClick={closeMenus}
                  className="mt-3 rounded-[3px] bg-[#57779a] px-4 py-1.5 text-[13px] text-white transition hover:bg-[#4c6b8d]"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
