import { useCallback, useEffect, useState } from 'react'
import {
  LuBuilding2,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronsUpDown,
  LuClock,
  LuEye,
  LuEyeOff,
  LuLayoutGrid,
  LuList,
  LuSearch,
  LuTrash2,
  LuX,
} from 'react-icons/lu'
import { Loader, LoadingState } from '../../components/ui/Loader'
import {
  createUser,
  deleteUser,
  fetchRoles,
  fetchUsers,
  updateUser,
  type AdminRole,
  type AdminUser,
  type UserInput,
} from '../../services/api/users'
import { deleteChef, fetchChefs, type Chef } from '../../services/api/chefs'
import { fetchBranches } from '../../services/api/branches'
import { ApiError, getBranchId } from '../../services/api/client'
import ChefForm from './ChefForm'
import FacetChip, { type Facet } from './FacetChip'
import { BLUE_SELECT, FIELD_BG, FieldGroup, LABEL, TEXT_INPUT } from './formKit'
import SearchMenus, { toggleIn, type CustomCondition } from './SearchMenus'

// ---------------------------------------------------------------------------
// Employees module — the staff directory. Real login accounts come from the
// admin-only /users CRUD; kitchen chefs come from the lighter /chefs roster and
// are folded into the same list (role "Chef"). Rebuilt as an Odoo-style
// employee kanban: colored-avatar cards by default, the same Filters / Group By
// / Favorites search panel the other back-office screens use, a COMPANY side
// panel, and the old editable table kept as the "list" view (that's where PINs
// get revealed and staff get bulk-deleted). This is where cashier PINs get
// set/reset; waiters tap in with no PIN, so their accounts simply leave PIN
// login off. Chefs have no login at all — they only name themselves on the KDS.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 80

// Chefs share the list with real employees but live in their own table with an
// independent id space. We display each chef as an employee-shaped row so the
// existing kanban/filter/group machinery works unchanged; the offset keeps
// selection ids from colliding with real user ids, and the carried `chef` marks
// which API a row edits/deletes through.
const CHEF_ID_OFFSET = 1_000_000
type StaffUser = AdminUser & { chef?: Chef }

function chefAsStaff(c: Chef): StaffUser {
  return {
    id: CHEF_ID_OFFSET + c.id,
    name: c.name,
    username: '',
    email: null,
    phone: null,
    is_active: c.is_active,
    role: { id: -1, name: 'Chef', slug: 'chef' },
    password: null,
    has_password: false,
    pin: null,
    has_pin: false,
    chef: c,
  }
}

// Search-panel menu contents, Odoo style. Filters render in divided sections;
// filters inside a section OR together, sections AND together.
const FILTER_SECTIONS = [['PIN Login', 'No PIN'], ['Archived']]
const GROUP_OPTIONS = ['Role', 'Status', 'PIN Login']
const CUSTOM_GROUP_FIELDS = GROUP_OPTIONS
const CUSTOM_FILTER_FIELDS = ['Name', 'Username', 'Email', 'Phone', 'Role']

const GROUP_VALUE: Record<string, (u: AdminUser) => string> = {
  Role: (u) => u.role?.name ?? 'None',
  Status: (u) => (u.is_active ? 'Active' : 'Archived'),
  'PIN Login': (u) => (u.has_pin ? 'PIN Login' : 'No PIN'),
}

const CUSTOM_FIELD_TEXT: Record<string, (u: AdminUser) => string> = {
  Name: (u) => u.name,
  Username: (u) => u.username,
  Email: (u) => u.email ?? '',
  Phone: (u) => u.phone ?? '',
  Role: (u) => u.role?.name ?? '',
}

function matchesCondition(u: AdminUser, c: CustomCondition): boolean {
  const text = (CUSTOM_FIELD_TEXT[c.field]?.(u) ?? '').toLowerCase()
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

type SavedSearch = {
  name: string
  isDefault: boolean
  shared: boolean
  query: string
  filters: string[]
  groups: string[]
  customFilters: CustomCondition[][]
}

const FAVORITES_KEY = 'pos-admin.employees.search-favorites'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

// Deterministic square-avatar tint from the name, so a card keeps its color.
const AVATAR_TINTS = [
  'bg-[#4a5bbf]',
  'bg-[#00838f]',
  'bg-[#00897b]',
  'bg-[#5c6bc0]',
  'bg-[#8e44ad]',
  'bg-[#c0392b]',
  'bg-[#546e7a]',
  'bg-[#6d4c41]',
]

function avatarTint(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_TINTS[h % AVATAR_TINTS.length]
}

function initial(name: string): string {
  return (name.trim().charAt(0) || 'A').toUpperCase()
}

function errorText(e: unknown): string {
  if (e instanceof ApiError && e.errors) {
    const first = Object.values(e.errors)[0]?.[0]
    if (first) return first
  }
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

export default function HrEmployees() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [chefs, setChefs] = useState<Chef[]>([])
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() =>
    loadJson<SavedSearch[]>(FAVORITES_KEY, []),
  )
  const defaultSearch = savedSearches.find((f) => f.isDefault)

  const [query, setQuery] = useState(defaultSearch?.query ?? '')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [checkedFilters, setCheckedFilters] = useState<Set<string>>(
    () => new Set(defaultSearch?.filters ?? []),
  )
  const [groups, setGroups] = useState<string[]>(defaultSearch?.groups ?? [])
  const [customFilters, setCustomFilters] = useState<CustomCondition[][]>(
    defaultSearch?.customFilters ?? [],
  )
  const [activeFavorite, setActiveFavorite] = useState<string | null>(defaultSearch?.name ?? null)
  const [page, setPage] = useState(0)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Side panel: "All" vs the current branch — the API already scopes the
  // staff list to the device's branch, so both list the same people; the
  // panel names which branch that is.
  const [company, setCompany] = useState<'all' | 'company'>('all')
  const [branchName, setBranchName] = useState('ElevenOne')

  useEffect(() => {
    let cancelled = false
    fetchBranches()
      .then((list) => {
        const current = list.find((b) => String(b.id) === getBranchId()) ?? list[0]
        if (!cancelled && current) setBranchName(current.name)
      })
      .catch(() => {
        // Offline — keep the generic label.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // What the Create dropdown opens next: a login employee or a kitchen chef.
  const [creating, setCreating] = useState<'employee' | 'chef' | null>(null)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [selected, setSelected] = useState<StaffUser | null>(null)
  // Row ids whose PIN is revealed — hidden again on reload for shoulder safety.
  const [shownPins, setShownPins] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    const [u, c, r] = await Promise.all([fetchUsers(), fetchChefs(), fetchRoles()])
    setUsers(u)
    setChefs(c)
    setRoles(r)
    setChecked(new Set())
  }, [])

  useEffect(() => {
    load().catch((e: unknown) => setLoadError(errorText(e)))
  }, [load])

  // --- Search / filter / group state ---------------------------------------

  const persistFavorites = (next: SavedSearch[]) => {
    setSavedSearches(next)
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
  }
  const toggleFilter = (f: string) => {
    setCheckedFilters((s) => toggleIn(s, f))
    setPage(0)
  }
  const removeFilters = (fs: string[]) => {
    setCheckedFilters((s) => {
      const next = new Set(s)
      fs.forEach((f) => next.delete(f))
      return next
    })
    setPage(0)
  }
  const toggleGroup = (g: string) => {
    setGroups((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]))
    setCollapsed(new Set())
    setPage(0)
  }
  const applyCustomFilter = (conditions: CustomCondition[]) => {
    setCustomFilters((cs) => [...cs, conditions])
    setPage(0)
  }
  const applyFavorite = (name: string) => {
    const fav = savedSearches.find((f) => f.name === name)
    if (!fav) return
    setQuery(fav.query)
    setCheckedFilters(new Set(fav.filters))
    setGroups(fav.groups)
    setCustomFilters(fav.customFilters)
    setActiveFavorite(name)
    setCollapsed(new Set())
    setPage(0)
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
    setPage(0)
  }
  const toggleCollapsed = (key: string) => setCollapsed((s) => toggleIn(s, key))

  const matchesFilter = (f: string, u: AdminUser): boolean => {
    switch (f) {
      case 'PIN Login':
        return u.has_pin
      case 'No PIN':
        return !u.has_pin
      default:
        return true
    }
  }

  // Real login accounts plus the kitchen chef roster, as one staff list.
  const allStaff: StaffUser[] = users === null ? [] : [...users, ...chefs.map(chefAsStaff)]

  // Odoo search semantics. Archived records stay hidden unless Archived is on.
  const q = query.trim().toLowerCase()
  const visible = allStaff.filter((u) => {
    const haystack = `${u.name} ${u.username} ${u.email ?? ''} ${u.phone ?? ''} ${
      u.role?.name ?? ''
    }`.toLowerCase()
    if (!haystack.includes(q)) return false
    if (checkedFilters.has('Archived') ? u.is_active : !u.is_active) return false
    for (const section of FILTER_SECTIONS) {
      if (section[0] === 'Archived') continue
      const active = section.filter((f) => checkedFilters.has(f))
      if (active.length > 0 && !active.some((f) => matchesFilter(f, u))) return false
    }
    return customFilters.every((group) => group.some((c) => matchesCondition(u, c)))
  })

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const pageIndex = Math.min(page, pageCount - 1)
  const pageItems = visible.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)

  const grouped: Array<[string, StaffUser[]]> | null =
    groups.length > 0
      ? (() => {
          const buckets = new Map<string, StaffUser[]>()
          for (const u of pageItems) {
            const key = groups.map((g) => GROUP_VALUE[g]?.(u) ?? 'None').join(' / ')
            const bucket = buckets.get(key)
            if (bucket) bucket.push(u)
            else buckets.set(key, [u])
          }
          return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        })()
      : null

  // Facet chips inside the search box — one per active filter section, one per
  // applied custom filter, one for the group-bys, one for the favorite.
  const facets: Facet[] = []
  for (const section of FILTER_SECTIONS) {
    const active = section.filter((f) => checkedFilters.has(f))
    if (active.length > 0)
      facets.push({
        key: `f-${section[0]}`,
        label: active.join(' or '),
        kind: 'filter',
        onRemove: () => removeFilters(section),
      })
  }
  customFilters.forEach((group, i) =>
    facets.push({
      key: `c-${i}`,
      label: group.map((c) => `${c.field} ${c.operator} "${c.value.trim()}"`).join(' or '),
      kind: 'filter',
      onRemove: () => {
        setCustomFilters((cs) => cs.filter((_, j) => j !== i))
        setPage(0)
      },
    }),
  )
  if (groups.length > 0)
    facets.push({
      key: 'g',
      label: groups.join(' > '),
      kind: 'group',
      onRemove: () => {
        setGroups([])
        setPage(0)
      },
    })
  if (activeFavorite)
    facets.push({ key: 'fav', label: activeFavorite, kind: 'favorite', onRemove: clearFavorite })

  // --- Selection / delete --------------------------------------------------

  const toggleChecked = (id: number) => setChecked((s) => toggleIn(s, id))

  const togglePageChecked = (on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev)
      pageItems.forEach((u) => (on ? next.add(u.id) : next.delete(u.id)))
      return next
    })

  const deleteChecked = async () => {
    setBusy(true)
    setActionError(null)
    try {
      for (const id of checked) {
        if (id >= CHEF_ID_OFFSET) await deleteChef(id - CHEF_ID_OFFSET)
        else await deleteUser(id)
      }
      await load()
    } catch (e: unknown) {
      setActionError(errorText(e))
      // A guard (own account / last admin) may have stopped mid-batch — the
      // list must reflect what actually got deleted.
      await load().catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  // --- Render pieces -------------------------------------------------------

  const employeeCard = (u: StaffUser) => (
    <article
      key={u.id}
      onClick={() => setSelected(u)}
      className="group relative flex cursor-pointer gap-3 rounded-[3px] border border-neutral-200 bg-white p-2.5 transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.12)]"
    >
      <input
        type="checkbox"
        aria-label={`Select ${u.name}`}
        checked={checked.has(u.id)}
        onClick={(e) => e.stopPropagation()}
        onChange={() => toggleChecked(u.id)}
        className={`absolute left-1.5 top-1.5 h-3.5 w-3.5 accent-[#2f6cad] transition ${
          checked.has(u.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      />
      <span
        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-[2px] text-2xl font-medium text-white ${avatarTint(
          u.name,
        )}`}
      >
        {initial(u.name)}
      </span>
      <div className="min-w-0 flex-1 pr-4">
        <h3 className="truncate text-[14px] font-medium text-[#374a63]">{u.name}</h3>
        {u.role?.name && <p className="truncate text-[12.5px] text-neutral-500">{u.role.name}</p>}
        <div className="mt-1.5 space-y-0.5 text-[12.5px] text-neutral-600">
          {u.email && <p className="truncate">{u.email}</p>}
          {u.phone && <p className="truncate">{u.phone}</p>}
        </div>
      </div>
      <span
        aria-label={u.is_active ? 'Active' : 'Archived'}
        className={`absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full ${
          u.is_active ? 'bg-emerald-500' : 'bg-neutral-300'
        }`}
      />
      {u.has_pin && (
        <span className="absolute bottom-2 right-2.5 flex items-center gap-1 text-[11px] text-neutral-400">
          <LuClock className="h-3.5 w-3.5" />
        </span>
      )}
    </article>
  )

  const employeeRow = (u: StaffUser) => (
    <tr
      key={u.id}
      onClick={() => setSelected(u)}
      className="cursor-pointer border-b border-neutral-100 text-neutral-700 transition hover:bg-neutral-50"
    >
      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Select ${u.name}`}
          checked={checked.has(u.id)}
          onChange={() => toggleChecked(u.id)}
          className="h-3.5 w-3.5 align-middle"
        />
      </td>
      <td className="py-2 text-neutral-400">
        <LuChevronsUpDown className="h-3.5 w-3.5" />
      </td>
      <td className="py-2 pr-4 text-neutral-800">{u.name}</td>
      <td className="py-2 pr-4">{u.username || '—'}</td>
      <td className="py-2 pr-4">{u.role?.name ?? '—'}</td>
      <td className="py-2 pr-4">{u.phone ?? '—'}</td>
      <td className="py-2 pr-4" onClick={(e) => e.stopPropagation()}>
        {u.has_pin ? (
          <span className="flex items-center gap-2">
            <span className="font-mono tracking-widest">
              {shownPins.has(u.id) ? u.pin : '••••'}
            </span>
            <button
              type="button"
              aria-label={shownPins.has(u.id) ? `Hide ${u.name}'s PIN` : `Show ${u.name}'s PIN`}
              onClick={() => setShownPins((s) => toggleIn(s, u.id))}
              className="text-neutral-400 transition hover:text-neutral-700"
            >
              {shownPins.has(u.id) ? (
                <LuEyeOff className="h-3.5 w-3.5" />
              ) : (
                <LuEye className="h-3.5 w-3.5" />
              )}
            </button>
          </span>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
      <td className="py-2 pr-4">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
            u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-600'
          }`}
        >
          {u.is_active ? 'Active' : 'Archived'}
        </span>
      </td>
    </tr>
  )

  const groupHeader = (label: string, count: number) => (
    <button
      type="button"
      onClick={() => toggleCollapsed(label)}
      className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-700 transition hover:text-neutral-900"
    >
      {collapsed.has(label) ? (
        <LuChevronRight className="h-3.5 w-3.5 text-neutral-400" />
      ) : (
        <LuChevronDown className="h-3.5 w-3.5 text-neutral-400" />
      )}
      {label}
      <span className="font-normal text-neutral-400">({count})</span>
    </button>
  )

  // --- Loading / error / form gates ----------------------------------------

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoadError(null)
            load().catch((e: unknown) => setLoadError(errorText(e)))
          }}
          className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
        >
          Retry
        </button>
      </div>
    )
  }

  if (users === null) {
    return <LoadingState label="Loading employees..." className="h-full" />
  }

  if (creating || selected) {
    const close = () => {
      setCreating(null)
      setSelected(null)
    }
    const saved = async () => {
      await load()
      close()
    }
    if (creating === 'chef' || selected?.chef) {
      return <ChefForm chef={selected?.chef} onBack={close} onSaved={saved} />
    }
    return <EmployeeForm user={selected ?? undefined} roles={roles} onBack={close} onSaved={saved} />
  }

  const allPageChecked = pageItems.length > 0 && pageItems.every((u) => checked.has(u.id))

  const listTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-800">
            <th className="w-10 px-4 py-2.5">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allPageChecked}
                onChange={(e) => togglePageChecked(e.target.checked)}
                className="h-3.5 w-3.5 align-middle"
              />
            </th>
            <th className="w-8" />
            <th className="py-2.5 pr-4 font-bold">Name</th>
            <th className="w-[16%] py-2.5 pr-4 font-bold">Username</th>
            <th className="w-[14%] py-2.5 pr-4 font-bold">Role</th>
            <th className="w-[16%] py-2.5 pr-4 font-bold">Phone</th>
            <th className="w-[12%] py-2.5 pr-4 font-bold">PIN</th>
            <th className="w-[12%] py-2.5 pr-4 font-bold">Status</th>
          </tr>
        </thead>
        {grouped ? (
          grouped.map(([label, rows]) => (
            <tbody key={label}>
              <tr className="border-b border-neutral-100 bg-neutral-50/80">
                <td colSpan={8} className="px-4 py-2">
                  {groupHeader(label, rows.length)}
                </td>
              </tr>
              {!collapsed.has(label) && rows.map(employeeRow)}
            </tbody>
          ))
        ) : (
          <tbody>{pageItems.map(employeeRow)}</tbody>
        )}
      </table>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <div>
            <h1 className="text-xl text-neutral-700">Employees</h1>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCreateMenuOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-[3px] bg-[#57779a] px-3 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
                >
                  Create
                  <LuChevronDown className="h-3.5 w-3.5" />
                </button>
                {createMenuOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Close menu"
                      onClick={() => setCreateMenuOpen(false)}
                      className="fixed inset-0 z-10 cursor-default"
                    />
                    <div className="absolute left-0 top-full z-20 mt-1 min-w-40 border border-neutral-200/70 bg-white py-1 text-neutral-700 shadow-md">
                      <button
                        type="button"
                        onClick={() => {
                          setCreating('employee')
                          setCreateMenuOpen(false)
                        }}
                        className="block w-full px-4 py-1.5 text-left text-[13px] transition hover:bg-neutral-100"
                      >
                        Employee
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCreating('chef')
                          setCreateMenuOpen(false)
                        }}
                        className="block w-full px-4 py-1.5 text-left text-[13px] transition hover:bg-neutral-100"
                      >
                        Chef
                      </button>
                    </div>
                  </>
                )}
              </div>
              {checked.size > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-[3px] border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                >
                  <LuTrash2 className="h-3.5 w-3.5" />
                  Delete ({checked.size})
                </button>
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
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(0)
                }}
                placeholder="Search..."
                className="min-w-24 flex-1 py-0.5 text-sm outline-none"
              />
              <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <SearchMenus
                filterSections={FILTER_SECTIONS}
                groupOptions={GROUP_OPTIONS}
                favoriteName="Employees"
                checkedFilters={checkedFilters}
                onToggleFilter={toggleFilter}
                checkedGroups={groups}
                onToggleGroup={toggleGroup}
                customGroupFields={CUSTOM_GROUP_FIELDS}
                customFilterFields={CUSTOM_FILTER_FIELDS}
                onApplyCustomFilter={applyCustomFilter}
                favorites={savedSearches.map((f) => ({ name: f.name, shared: f.shared }))}
                activeFavorite={activeFavorite}
                onSaveFavorite={saveFavorite}
                onSelectFavorite={applyFavorite}
                onDeleteFavorite={deleteFavorite}
              />

              <div className="flex items-center gap-2">
                <span className="text-[13px] text-neutral-600">
                  {visible.length === 0
                    ? '0-0'
                    : `${pageIndex * PAGE_SIZE + 1}-${pageIndex * PAGE_SIZE + pageItems.length}`}{' '}
                  / {visible.length}
                </span>
                <div className="inline-flex overflow-hidden rounded-[3px] border border-neutral-300">
                  <button
                    type="button"
                    aria-label="Previous page"
                    onClick={() => setPage((pageIndex - 1 + pageCount) % pageCount)}
                    className="px-2 py-1.5 text-neutral-500 transition hover:bg-neutral-50"
                  >
                    <LuChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    onClick={() => setPage((pageIndex + 1) % pageCount)}
                    className="border-l border-neutral-300 px-2 py-1.5 text-neutral-500 transition hover:bg-neutral-50"
                  >
                    <LuChevronRight className="h-4 w-4" />
                  </button>
                </div>

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

      {actionError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-700">
          {actionError}
        </div>
      )}

      {/* Body — company side panel + records */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-52 shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-50/60 px-2 py-3 text-[13px]">
          <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            <LuBuilding2 className="h-3.5 w-3.5" />
            Company
          </div>
          <button
            type="button"
            onClick={() => setCompany('all')}
            className={`flex w-full items-center rounded-[2px] px-2 py-1.5 text-left transition ${
              company === 'all'
                ? 'bg-[#e7ecf0] font-medium text-neutral-800'
                : 'text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setCompany('company')}
            className={`flex w-full items-center justify-between rounded-[2px] px-2 py-1.5 text-left transition ${
              company === 'company'
                ? 'bg-[#e7ecf0] font-medium text-neutral-800'
                : 'text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            <span className="truncate">{branchName}</span>
            <span className="ml-2 shrink-0 text-neutral-400">{allStaff.length}</span>
          </button>
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              {allStaff.length === 0
                ? 'No staff yet — hit Create to add the first one.'
                : query.trim()
                  ? `No employee matches "${query}".`
                  : 'No employee matches the current filters.'}
            </div>
          ) : view === 'kanban' ? (
            grouped ? (
              <div className="flex flex-col p-4">
                {grouped.map(([label, rows]) => (
                  <section key={label}>
                    <div className="px-1 py-2">{groupHeader(label, rows.length)}</div>
                    {!collapsed.has(label) && (
                      <div className="grid content-start gap-3.5 pb-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
                        {rows.map(employeeCard)}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid content-start gap-3.5 p-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
                {pageItems.map(employeeCard)}
              </div>
            )
          ) : (
            listTable
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-3 text-[15px] font-semibold text-neutral-800">
              Confirmation
            </div>
            <p className="px-5 py-4 text-sm text-neutral-700">
              Are you sure you want to delete{' '}
              {checked.size === 1 ? 'this staff member' : `these ${checked.size} staff members`}?
              Login accounts lose access immediately; chefs stop appearing in the kitchen display.
              Past orders and payments keep their history.
            </p>
            <div className="flex gap-1.5 border-t border-neutral-200 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false)
                  void deleteChecked()
                }}
                className="rounded-[3px] bg-red-600 px-4 py-1.5 text-sm text-white transition hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create/edit form — identity, role and the two credentials (password for the
// back office, PIN for the register PIN pad).
// ---------------------------------------------------------------------------

function EmployeeForm({
  user,
  roles,
  onBack,
  onSaved,
}: {
  user?: AdminUser
  roles: AdminRole[]
  onBack: () => void
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [roleId, setRoleId] = useState<string>(user?.role ? String(user.role.id) : '')
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  // Prefilled with the current password (admin-viewable copy); masked until the
  // eye toggle. Blank for accounts whose password predates the recoverable copy.
  const [password, setPassword] = useState(user?.password ?? '')
  const [showPassword, setShowPassword] = useState(false)
  const [pinEnabled, setPinEnabled] = useState(user?.has_pin ?? false)
  // Prefilled with the current PIN (admin-viewable); masked until the eye toggle.
  const [pin, setPin] = useState(user?.pin ?? '')
  const [showPin, setShowPin] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (saving) return
    if (!name.trim()) {
      setError('The employee name is required.')
      return
    }
    if (!username.trim()) {
      setError('The username is required.')
      return
    }
    if (!user && password.length < 8) {
      setError('A password of at least 8 characters is required.')
      return
    }
    if (user && password.length > 0 && password.length < 8) {
      setError('The new password must be at least 8 characters.')
      return
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      setError('The PIN must be 4 to 6 digits.')
      return
    }
    if (pinEnabled && !pin) {
      setError('Enter a PIN (4-6 digits) or turn PIN login off.')
      return
    }

    const input: UserInput = {
      name: name.trim(),
      username: username.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      role_id: roleId ? Number(roleId) : null,
      is_active: isActive,
    }
    // Send the password only when it actually changed (it's prefilled with the
    // current one on edit), so an untouched form keeps the existing password.
    if (!user && password) input.password = password
    else if (user && password && password !== user.password) input.password = password
    // PIN semantics on the API: a value sets it, '' clears it, absent keeps it.
    if (!pinEnabled && user?.has_pin) input.pin = ''
    else if (pinEnabled && pin && pin !== user?.pin) input.pin = pin

    setSaving(true)
    setError(null)
    try {
      if (user) await updateUser(user.id, input)
      else await createUser(input)
      await onSaved()
    } catch (e: unknown) {
      setError(errorText(e))
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel — breadcrumb + Save/Discard */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="truncate text-[15px] text-neutral-700">
          <button type="button" onClick={onBack} className="transition hover:underline">
            Employees
          </button>
          <span className="text-neutral-400"> / </span>
          <span>{user ? user.name : 'New'}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d] disabled:opacity-60"
          >
            {saving && <Loader size="sm" />}
            Save
          </button>
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
          >
            Discard
          </button>
        </div>
      </div>

      {/* Sheet */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-100/60 pb-6">
        {error && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setError(null)}
              className="shrink-0 transition hover:opacity-70"
            >
              <LuX className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="mx-4 mt-4 rounded-[2px] border border-neutral-200 bg-white px-8 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="text-[13px] font-bold text-neutral-800">Employee Name</div>
          <input
            placeholder="e.g. Sok Dara"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mt-1 w-[56%] min-w-72 rounded-[2px] border border-neutral-300 ${FIELD_BG} px-3 py-1.5 text-[22px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-sky-600`}
          />

          <div className="mt-6 grid grid-cols-1 gap-x-16 gap-y-3 xl:grid-cols-2">
            <FieldGroup title="Work Information">
              <label className={LABEL}>Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Sign-in name, no spaces"
                className={TEXT_INPUT}
              />

              <label className={LABEL}>Role</label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className={BLUE_SELECT}
              >
                <option value="">No role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              <label className={LABEL}>Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 012 345 678"
                className={TEXT_INPUT}
              />

              <label className={LABEL}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. dara@elevenone.com"
                className={TEXT_INPUT}
              />

              <label className={LABEL}>Active</label>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="mt-1.5 h-3.5 w-3.5 justify-self-start accent-teal-700"
              />
            </FieldGroup>

            <FieldGroup title="Security">
              <label className={LABEL}>Password</label>
              <span className="relative block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={user ? 'Leave blank to keep current' : 'At least 8 characters'}
                  autoComplete="new-password"
                  className={`${TEXT_INPUT} pr-8`}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 transition hover:text-neutral-700"
                >
                  {showPassword ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
                </button>
              </span>

              <label className={LABEL}>PIN Login</label>
              <input
                type="checkbox"
                checked={pinEnabled}
                onChange={(e) => setPinEnabled(e.target.checked)}
                className="mt-1.5 h-3.5 w-3.5 justify-self-start accent-teal-700"
              />

              {pinEnabled && (
                <>
                  <label className={LABEL}>PIN</label>
                  <span className="relative block max-w-40">
                    <input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="4-6 digits"
                      autoComplete="off"
                      className={`${TEXT_INPUT} pr-8 tracking-widest`}
                    />
                    <button
                      type="button"
                      aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                      onClick={() => setShowPin((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 transition hover:text-neutral-700"
                    >
                      {showPin ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
                    </button>
                  </span>
                </>
              )}
            </FieldGroup>
          </div>

          <p className="mt-8 border-t border-neutral-200 pt-4 text-[12.5px] italic text-neutral-500">
            The password signs in on the login page (admins and back-office). The PIN is for the
            register PIN pad — cashiers need one to open a session. Waiters tap their name with no
            PIN, so leave PIN login off for the shared Waiter account.
          </p>
        </div>
      </div>
    </div>
  )
}
