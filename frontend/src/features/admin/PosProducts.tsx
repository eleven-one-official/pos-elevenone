import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuImage,
  LuLayoutGrid,
  LuList,
  LuSearch,
  LuStar,
  LuX,
} from 'react-icons/lu'
import { Loader, LoadingState } from '../../components/ui/Loader'
import {
  createCategory,
  createMenuItem,
  deleteMenuItem,
  fetchAdminCategories,
  fetchAdminMenuItems,
  updateMenuItem,
  type AdminCategory,
  type AdminMenuItem,
} from '../../services/api/adminMenu'
import { assetUrl } from '../../services/api/client'
import FacetChip, { type Facet } from './FacetChip'
import { parseCsv } from './parseCsv'
import PosProductDetail from './PosProductDetail'
import PosProductForm from './PosProductForm'
import SearchMenus, { toggleIn, type CustomCondition } from './SearchMenus'

// ---------------------------------------------------------------------------
// Products — Odoo-style product kanban over the real catalog (menu_items).
// Records load from the backend; Create/Edit/Archive/Duplicate/Delete all
// write through the API. The search panel stays client-side: filters (Odoo
// semantics — OR inside a section, AND across sections), custom filter
// conditions, group-by with collapsible sections, pagination, starred
// products and saved favorites (persisted to localStorage).
// ---------------------------------------------------------------------------

/** View-model the search panel filters/groups over; `raw` is the API row. */
export type Product = {
  id: number
  name: string
  price: string // display string, e.g. "$ 6.50"
  type: 'Goods' | 'Service'
  category: string
  availableInPos: boolean
  canBeSold: boolean
  canBePurchased: boolean
  archived: boolean
  image: string | null
  raw: AdminMenuItem
}

function toProduct(item: AdminMenuItem): Product {
  return {
    id: item.id,
    name: item.name,
    price: `$ ${Number(item.price).toFixed(2)}`,
    type: item.product_type === 'service' ? 'Service' : 'Goods',
    category: item.category?.name ?? 'None',
    availableInPos: item.is_available,
    canBeSold: item.can_be_sold,
    canBePurchased: item.can_be_purchased,
    archived: item.is_archived,
    image: assetUrl(item.image),
    raw: item,
  }
}

// Search-panel menu contents, Odoo style. Filters render in divided sections.
const FILTER_SECTIONS = [
  ['Services', 'Products'],
  ['Available in POS', 'Can be Sold', 'Can be Purchased'],
  ['Favorites'],
  ['Archived'],
]
const GROUP_OPTIONS = ['Product Type', 'Product Category', 'POS Product Category']
// Extra fields only reachable through "Add Custom Group", like Odoo.
const CUSTOM_GROUP_FIELDS = [
  ...GROUP_OPTIONS,
  'Available in POS',
  'Can be Sold',
  'Can be Purchased',
]
const CUSTOM_FILTER_FIELDS = ['Name', 'Price', 'Product Category', 'Product Type']
const POS_FILTER = 'Available in POS'
const PAGE_SIZE = 40

const GROUP_VALUE: Record<string, (p: Product) => string> = {
  'Product Type': (p) => p.type,
  'Product Category': (p) => p.category,
  'POS Product Category': (p) => (p.availableInPos ? p.category : 'None'),
  'Available in POS': (p) => (p.availableInPos ? 'Available in POS' : 'Not in POS'),
  'Can be Sold': (p) => (p.canBeSold ? 'Can be Sold' : 'Not for Sale'),
  'Can be Purchased': (p) => (p.canBePurchased ? 'Can be Purchased' : 'Not Purchasable'),
}

const CUSTOM_FIELD_TEXT: Record<string, (p: Product) => string> = {
  Name: (p) => p.name,
  Price: (p) => p.price,
  'Product Category': (p) => p.category,
  'Product Type': (p) => p.type,
}

function matchesCondition(p: Product, c: CustomCondition): boolean {
  const text = (CUSTOM_FIELD_TEXT[c.field]?.(p) ?? '').toLowerCase()
  const value = c.value.trim().toLowerCase()
  // Price equality compares numerically so "1" matches "$ 1.00".
  const equal =
    c.field === 'Price' && value !== '' && !Number.isNaN(Number(value))
      ? Number.parseFloat(text.replace(/[^0-9.]/g, '')) === Number(value)
      : text === value
  switch (c.operator) {
    case 'contains':
      return text.includes(value)
    case 'does not contain':
      return !text.includes(value)
    case 'is equal to':
      return equal
    case 'is not equal to':
      return !equal
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

const FAVORITES_KEY = 'pos-admin.products.search-favorites'
// Ids now that records live in the database (the old key stored list indexes).
const STARRED_KEY = 'pos-admin.products.starred-ids'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

export default function PosProducts() {
  const [items, setItems] = useState<AdminMenuItem[] | null>(null)
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() =>
    loadJson<SavedSearch[]>(FAVORITES_KEY, []),
  )
  const defaultSearch = savedSearches.find((f) => f.isDefault)

  const [query, setQuery] = useState(defaultSearch?.query ?? '')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  // Checked search filters — shared between the Filters menu and the facet
  // chips inside the search box.
  const [checkedFilters, setCheckedFilters] = useState<Set<string>>(
    () => new Set(defaultSearch?.filters ?? [POS_FILTER]),
  )
  const [groups, setGroups] = useState<string[]>(defaultSearch?.groups ?? [])
  const [customFilters, setCustomFilters] = useState<CustomCondition[][]>(
    defaultSearch?.customFilters ?? [],
  )
  const [activeFavorite, setActiveFavorite] = useState<string | null>(defaultSearch?.name ?? null)
  const [starred, setStarred] = useState<Set<number>>(
    () => new Set(loadJson<number[]>(STARRED_KEY, [])),
  )
  const [page, setPage] = useState(0)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [importStatus, setImportStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  // Create swaps the whole screen for the product form, Odoo style; clicking
  // a product opens its read-only detail, and Edit from there opens the form
  // prefilled. Dev builds can jump straight in with `?product-new` or
  // `?product-view=<index>`.
  const [creating, setCreating] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('product-new'),
  )
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const devInitRef = useRef(true)

  const load = useCallback(async () => {
    const [rows, cats] = await Promise.all([fetchAdminMenuItems(), fetchAdminCategories()])
    setItems(rows)
    setCategories(cats)
    if (devInitRef.current) {
      devInitRef.current = false
      if (import.meta.env.DEV) {
        const v = new URLSearchParams(window.location.search).get('product-view')
        if (v !== null) setSelectedId(rows[Number(v) || 0]?.id ?? null)
      }
    }
    return rows
  }, [])

  useEffect(() => {
    load().catch((e: unknown) => setLoadError(errorText(e)))
  }, [load])

  const catalog: Product[] = (items ?? []).map(toProduct)

  const toggleStar = (id: number) =>
    setStarred((s) => {
      const next = toggleIn(s, id)
      localStorage.setItem(STARRED_KEY, JSON.stringify([...next]))
      return next
    })

  const persistFavorites = (next: SavedSearch[]) => {
    setSavedSearches(next)
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
  }

  // Favorites > Import records — CSV with columns: name, price[, category].
  // A "name" header row is skipped; rows are created through the API, adding
  // missing categories on the fly.
  const importFile = async (file: File) => {
    setImporting(true)
    setImportStatus(null)
    try {
      const rows = parseCsv(await file.text())
      const dataRows = rows[0]?.[0]?.toLowerCase() === 'name' ? rows.slice(1) : rows
      const categoryIdByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
      let added = 0
      let skipped = 0
      for (const cells of dataRows) {
        const name = cells[0] ?? ''
        const price = Number.parseFloat((cells[1] ?? '').replace(/[^0-9.]/g, ''))
        if (!name || Number.isNaN(price)) {
          skipped++
          continue
        }
        const categoryName = cells[2] || 'Food'
        let categoryId = categoryIdByName.get(categoryName.toLowerCase())
        if (categoryId === undefined) {
          const created = await createCategory({ name: categoryName })
          categoryIdByName.set(categoryName.toLowerCase(), created.id)
          categoryId = created.id
        }
        await createMenuItem({ category_id: categoryId, name, price })
        added++
      }
      if (added === 0) {
        setImportStatus({
          ok: false,
          text: `No products imported from "${file.name}" — expected CSV columns: name, price[, category].`,
        })
        return
      }
      await load()
      setImportStatus({
        ok: true,
        text:
          `Imported ${added} product${added === 1 ? '' : 's'} from "${file.name}"` +
          (skipped > 0 ? ` (${skipped} row${skipped === 1 ? '' : 's'} skipped)` : '') +
          '.',
      })
    } catch (e: unknown) {
      setImportStatus({ ok: false, text: `Import failed: ${errorText(e)}` })
    } finally {
      setImporting(false)
    }
  }

  // --- Record actions (detail screen) --------------------------------------

  const toggleArchive = async (p: Product) => {
    await updateMenuItem(p.id, { is_archived: !p.archived })
    await load()
  }

  const duplicateProduct = async (p: Product) => {
    const r = p.raw
    const copy = await createMenuItem({
      category_id: r.category_id ?? categories[0]?.id ?? 0,
      product_type: r.product_type,
      name: `${r.name} (copy)`,
      price: Number(r.price),
      cost: Number(r.cost),
      description: r.description,
      // The barcode is not copied — it identifies one product.
      internal_reference: r.internal_reference,
      internal_notes: r.internal_notes,
      is_available: r.is_available,
      can_be_sold: r.can_be_sold,
      can_be_purchased: r.can_be_purchased,
    })
    await load()
    setSelectedId(copy.id)
  }

  const removeProduct = async (p: Product) => {
    await deleteMenuItem(p.id)
    setSelectedId(null)
    await load()
  }

  // --- Search panel state --------------------------------------------------

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

  const matchesFilter = (f: string, p: Product): boolean => {
    switch (f) {
      case 'Services':
        return p.type === 'Service'
      case 'Products':
        return p.type === 'Goods'
      case 'Available in POS':
        return p.availableInPos
      case 'Can be Sold':
        return p.canBeSold
      case 'Can be Purchased':
        return p.canBePurchased
      case 'Favorites':
        return starred.has(p.id)
      default:
        return true
    }
  }

  // Odoo search semantics: filters inside a section OR together, sections AND
  // together. Archived records stay hidden unless the Archived filter is on.
  const visible = catalog.filter((p) => {
    if (!p.name.toLowerCase().includes(query.trim().toLowerCase())) return false
    if (checkedFilters.has('Archived') ? !p.archived : p.archived) return false
    for (const section of FILTER_SECTIONS) {
      if (section[0] === 'Archived') continue
      const active = section.filter((f) => checkedFilters.has(f))
      if (active.length > 0 && !active.some((f) => matchesFilter(f, p))) return false
    }
    return customFilters.every((group) => group.some((c) => matchesCondition(p, c)))
  })

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const pageIndex = Math.min(page, pageCount - 1)
  const pageItems = visible.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)

  const grouped: Array<[string, Product[]]> | null =
    groups.length > 0
      ? (() => {
          const buckets = new Map<string, Product[]>()
          for (const p of pageItems) {
            const key = groups.map((g) => GROUP_VALUE[g]?.(p) ?? 'None').join(' / ')
            const bucket = buckets.get(key)
            if (bucket) bucket.push(p)
            else buckets.set(key, [p])
          }
          return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        })()
      : null

  // Facet chips inside the search box — one per active filter section, one
  // per applied custom filter, one for the group-bys, one for the favorite.
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

  const productCard = (p: Product) => (
    <article
      key={p.id}
      onClick={() => setSelectedId(p.id)}
      className="relative flex cursor-pointer gap-3 rounded-[3px] border border-neutral-200 bg-white p-2.5 transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
    >
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[2px] bg-neutral-100">
        {p.image ? (
          <img src={p.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <LuImage className="h-6 w-6 text-neutral-300" />
        )}
      </span>
      <div className="min-w-0 flex-1 pr-6 text-[13px]">
        <h3 className="leading-snug text-[#374a63]">{p.name}</h3>
        <p className="mt-1 text-neutral-600">Price: {p.price}</p>
      </div>
      <button
        type="button"
        aria-label={`Favorite ${p.name}`}
        onClick={(e) => {
          e.stopPropagation()
          toggleStar(p.id)
        }}
        className={`absolute right-2.5 top-2.5 transition ${
          starred.has(p.id) ? 'text-amber-500' : 'text-neutral-400 hover:text-amber-500'
        }`}
      >
        <LuStar className={`h-4 w-4 ${starred.has(p.id) ? 'fill-amber-500' : ''}`} />
      </button>
    </article>
  )

  const productRow = (p: Product) => (
    <tr
      key={p.id}
      onClick={() => setSelectedId(p.id)}
      className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
    >
      <td className="px-4 py-2.5 text-neutral-800">{p.name}</td>
      <td className="px-4 py-2.5 text-neutral-700">{p.price}</td>
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

  // --- Loading / error gates -----------------------------------------------

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

  if (items === null) {
    return <LoadingState label="Loading products..." className="h-full" />
  }

  if (creating) {
    return (
      <PosProductForm
        categories={categories}
        onBack={() => setCreating(false)}
        onSaved={async (item) => {
          await load()
          setCreating(false)
          setSelectedId(item.id)
        }}
      />
    )
  }

  const selectedIdx = selectedId === null ? -1 : catalog.findIndex((p) => p.id === selectedId)
  if (selectedIdx !== -1) {
    const current = catalog[selectedIdx]
    if (editing) {
      return (
        <PosProductForm
          product={current.raw}
          categories={categories}
          // Discard (and the Products breadcrumb) leave straight back to the
          // full product list; Save returns to this record's detail view.
          onBack={() => {
            setEditing(false)
            setSelectedId(null)
          }}
          onSaved={async (item) => {
            await load()
            setEditing(false)
            setSelectedId(item.id)
          }}
        />
      )
    }
    return (
      <PosProductDetail
        product={current}
        index={selectedIdx}
        total={catalog.length}
        starred={starred.has(current.id)}
        onToggleStar={() => toggleStar(current.id)}
        onBack={() => setSelectedId(null)}
        onCreate={() => setCreating(true)}
        onEdit={() => setEditing(true)}
        onPrev={() => setSelectedId(catalog[Math.max(0, selectedIdx - 1)].id)}
        onNext={() => setSelectedId(catalog[Math.min(catalog.length - 1, selectedIdx + 1)].id)}
        onToggleArchive={() => toggleArchive(current)}
        onDuplicate={() => duplicateProduct(current)}
        onDelete={() => removeProduct(current)}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Hidden picker for Favorites > Import records */}
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void importFile(file)
          e.target.value = ''
        }}
      />

      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <div>
            <h1 className="text-xl text-neutral-700">Products</h1>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-2 rounded-[3px] bg-[#57779a] px-3 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
            >
              Create
            </button>
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
                favoriteName="Products"
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
                onImportRecords={() => importInputRef.current?.click()}
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

      {/* Import progress / result banner */}
      {importing && (
        <div className="flex items-center gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-[13px] text-sky-800">
          <Loader size="sm" />
          Importing records...
        </div>
      )}
      {importStatus && (
        <div
          className={`flex items-center justify-between gap-3 border-b px-4 py-2 text-[13px] ${
            importStatus.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {importStatus.text}
          <button
            type="button"
            aria-label="Dismiss import message"
            onClick={() => setImportStatus(null)}
            className="shrink-0 text-current transition hover:opacity-70"
          >
            <LuX className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Records */}
      {visible.length === 0 ? (
        <div className="p-10 text-center text-sm text-neutral-500">
          {catalog.length === 0
            ? 'No products yet — hit Create to add the first one.'
            : query.trim()
              ? `No product matches "${query}".`
              : 'No product matches the current filters.'}
        </div>
      ) : view === 'kanban' ? (
        grouped ? (
          <div className="flex flex-col overflow-y-auto p-4">
            {grouped.map(([label, items2]) => (
              <section key={label}>
                <div className="px-1 py-2">{groupHeader(label, items2.length)}</div>
                {!collapsed.has(label) && (
                  <div className="grid content-start gap-3.5 pb-3 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
                    {items2.map(productCard)}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="grid content-start gap-3.5 overflow-y-auto p-4 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
            {pageItems.map(productCard)}
          </div>
        )
      ) : (
        <div className="overflow-y-auto p-4">
          <div className="overflow-hidden rounded-[3px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-600">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Price</th>
                </tr>
              </thead>
              {grouped ? (
                grouped.map(([label, items2]) => (
                  <tbody key={label}>
                    <tr className="border-b border-neutral-100 bg-neutral-50/80">
                      <td colSpan={2} className="px-4 py-2">
                        {groupHeader(label, items2.length)}
                      </td>
                    </tr>
                    {!collapsed.has(label) && items2.map(productRow)}
                  </tbody>
                ))
              ) : (
                <tbody>{pageItems.map(productRow)}</tbody>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
