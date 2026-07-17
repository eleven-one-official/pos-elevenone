import { useState } from 'react'
import {
  LuCheck,
  LuChevronRight,
  LuCirclePlus,
  LuFilter,
  LuMenu,
  LuStar,
  LuTrash2,
  LuUsers,
} from 'react-icons/lu'

// ---------------------------------------------------------------------------
// Filters / Group By / Favorites — the Odoo search-panel button group with
// its dropdowns, shared by every admin list/report screen. Filters, group-bys,
// custom filter conditions and saved favorites can all be controlled by the
// page (Products wires every one of them); screens that only pass the base
// props keep the previous local-UI behaviour.
// ---------------------------------------------------------------------------

type SearchMenu = 'filters' | 'groupby' | 'favorites' | null

export type CustomCondition = { field: string; operator: string; value: string }

export const CUSTOM_OPERATORS = ['contains', 'does not contain', 'is equal to', 'is not equal to']

const FIELD_INPUT =
  'w-full rounded-[2px] border border-neutral-300 px-2 py-1.5 text-[13px] outline-none transition focus:border-sky-600'

export function toggleIn<T>(set: Set<T>, value: T): Set<T> {
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
  checkedGroups,
  onToggleGroup,
  customGroupFields,
  customFilterFields,
  onApplyCustomFilter,
  favorites,
  activeFavorite,
  onSaveFavorite,
  onSelectFavorite,
  onDeleteFavorite,
  onImportRecords,
}: {
  filterSections: string[][]
  groupOptions: string[]
  /** Default name in the "Save current search" panel. */
  favoriteName: string
  /** Controlled checked-filter set — pass with onToggleFilter, or omit both. */
  checkedFilters?: Set<string>
  onToggleFilter?: (filter: string) => void
  /** Controlled group-by list (in nesting order) — pass with onToggleGroup. */
  checkedGroups?: string[]
  onToggleGroup?: (group: string) => void
  /** Fields offered in "Add Custom Group"; defaults to groupOptions. */
  customGroupFields?: string[]
  /** Fields offered in "Add Custom Filter"; defaults to the Odoo-look list. */
  customFilterFields?: string[]
  /** Called with the non-empty conditions when Apply is clicked. */
  onApplyCustomFilter?: (conditions: CustomCondition[]) => void
  /** Saved searches listed at the top of the Favorites menu. */
  favorites?: { name: string; shared?: boolean }[]
  activeFavorite?: string | null
  onSaveFavorite?: (name: string, useByDefault: boolean, shareAll: boolean) => void
  onSelectFavorite?: (name: string) => void
  onDeleteFavorite?: (name: string) => void
  /** Called when "Import records" is clicked (before the menu closes). */
  onImportRecords?: () => void
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
  const [localGroups, setLocalGroups] = useState<Set<string>>(new Set())

  const checked = checkedFilters ?? localChecked
  const toggleFilter = (f: string) => {
    if (onToggleFilter) onToggleFilter(f)
    else setLocalChecked((s) => toggleIn(s, f))
  }
  const groupChecked = (g: string) =>
    checkedGroups ? checkedGroups.includes(g) : localGroups.has(g)
  const toggleGroup = (g: string) => {
    if (onToggleGroup) onToggleGroup(g)
    else setLocalGroups((s) => toggleIn(s, g))
  }
  const closeMenus = () => {
    setOpenMenu(null)
    setSubOpen(false)
  }
  const toggleMenu = (m: Exclude<SearchMenu, null>) => {
    setOpenMenu((v) => (v === m ? null : m))
    setSubOpen(false)
  }

  // Add Custom Filter — condition rows, OR'd together when applied.
  const fields = customFilterFields ?? ['Account Tags', 'Name', 'Price', 'Product Category']
  const emptyCondition = (): CustomCondition => ({
    field: fields[0],
    operator: CUSTOM_OPERATORS[0],
    value: '',
  })
  const [conditions, setConditions] = useState<CustomCondition[]>(() => [emptyCondition()])
  const patchCondition = (i: number, patch: Partial<CustomCondition>) =>
    setConditions((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const applyCustomFilter = () => {
    const filled = conditions.filter((c) => c.value.trim() !== '')
    if (filled.length > 0) onApplyCustomFilter?.(filled)
    setConditions([emptyCondition()])
    closeMenus()
  }

  // Add Custom Group — apply the selected field as a group-by.
  const groupFields = customGroupFields ?? groupOptions
  const [customGroup, setCustomGroup] = useState(groupFields[0] ?? '')
  const applyCustomGroup = () => {
    if (customGroup && !groupChecked(customGroup)) toggleGroup(customGroup)
    closeMenus()
  }

  // Save current search.
  const [saveName, setSaveName] = useState(favoriteName)
  const [saveDefault, setSaveDefault] = useState(false)
  const [saveShared, setSaveShared] = useState(false)
  const saveFavorite = () => {
    onSaveFavorite?.(saveName.trim() || favoriteName, saveDefault, saveShared)
    setSaveDefault(false)
    setSaveShared(false)
    closeMenus()
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
                {conditions.map((c, i) => (
                  <div key={i} className={i > 0 ? 'mt-3 border-t border-neutral-100 pt-2' : ''}>
                    {i > 0 && (
                      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-400">
                        or
                      </p>
                    )}
                    <select
                      value={c.field}
                      onChange={(e) => patchCondition(i, { field: e.target.value })}
                      className={FIELD_INPUT}
                    >
                      {fields.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                    <select
                      value={c.operator}
                      onChange={(e) => patchCondition(i, { operator: e.target.value })}
                      className={`mt-2 ${FIELD_INPUT}`}
                    >
                      {CUSTOM_OPERATORS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                    <input
                      value={c.value}
                      onChange={(e) => patchCondition(i, { value: e.target.value })}
                      className={`mt-2 ${FIELD_INPUT}`}
                    />
                  </div>
                ))}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={applyCustomFilter}
                    className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-[13px] text-white transition hover:bg-[#4c6b8d]"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setConditions((cs) => [...cs, emptyCondition()])}
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
                  onClick={() => toggleGroup(g)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-neutral-100"
                >
                  <LuCheck
                    className={`h-3.5 w-3.5 shrink-0 ${
                      groupChecked(g) ? 'text-neutral-700' : 'invisible'
                    }`}
                  />
                  <span className={groupChecked(g) ? 'font-medium text-neutral-800' : ''}>
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
                <select
                  value={customGroup}
                  onChange={(e) => setCustomGroup(e.target.value)}
                  className={FIELD_INPUT}
                >
                  {groupFields.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applyCustomGroup}
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
            {favorites && favorites.length > 0 && (
              <div className="border-b border-neutral-100 py-0.5">
                {favorites.map((f) => (
                  <div key={f.name} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectFavorite?.(f.name)
                        closeMenus()
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left transition hover:bg-neutral-100"
                    >
                      <LuCheck
                        className={`h-3.5 w-3.5 shrink-0 ${
                          activeFavorite === f.name ? 'text-neutral-700' : 'invisible'
                        }`}
                      />
                      <span
                        className={`truncate ${
                          activeFavorite === f.name ? 'font-medium text-neutral-800' : ''
                        }`}
                      >
                        {f.name}
                      </span>
                      {f.shared && (
                        <LuUsers
                          aria-label={`${f.name} is shared with all users`}
                          className="h-3 w-3 shrink-0 text-neutral-400"
                        />
                      )}
                    </button>
                    {onDeleteFavorite && (
                      <button
                        type="button"
                        aria-label={`Delete favorite ${f.name}`}
                        onClick={() => onDeleteFavorite(f.name)}
                        className="px-2 py-1.5 text-neutral-300 transition hover:text-red-600"
                      >
                        <LuTrash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

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
              onClick={() => {
                onImportRecords?.()
                closeMenus()
              }}
              className="mt-0.5 block w-full px-3 py-1.5 text-left transition hover:bg-neutral-100"
            >
              Import records
            </button>

            {subOpen && (
              <div className="absolute left-full top-0 z-30 ml-1 w-60 border border-neutral-200/80 bg-white p-3 shadow-lg">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className={FIELD_INPUT}
                />
                <label className="mt-2.5 flex items-center gap-1.5 text-[13px] text-neutral-700">
                  <input
                    type="checkbox"
                    checked={saveDefault}
                    onChange={(e) => setSaveDefault(e.target.checked)}
                    className="h-3.5 w-3.5 accent-teal-700"
                  />
                  Use by default
                </label>
                <label className="mt-1.5 flex items-center gap-1.5 text-[13px] text-neutral-700">
                  <input
                    type="checkbox"
                    checked={saveShared}
                    onChange={(e) => setSaveShared(e.target.checked)}
                    className="h-3.5 w-3.5 accent-teal-700"
                  />
                  Share with all users
                </label>
                <button
                  type="button"
                  onClick={saveFavorite}
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
