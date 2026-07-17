import { useRef, useState } from 'react'
import {
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuClock,
  LuFilter,
  LuImage,
  LuLayoutGrid,
  LuList,
  LuMenu,
  LuSearch,
  LuStar,
  LuX,
} from 'react-icons/lu'
import PosProductDetail from './PosProductDetail'
import PosProductForm from './PosProductForm'
import SearchMenus, { toggleIn, type CustomCondition } from './SearchMenus'

// ---------------------------------------------------------------------------
// Products — Odoo-style product kanban. The catalog is placeholder data
// lifted from the real venue's Odoo, but the whole search panel works
// client-side: filters (Odoo semantics — OR inside a section, AND across
// sections), custom filter conditions, group-by with collapsible sections,
// pagination, starred products and saved favorites (persisted to
// localStorage) all apply to the records below.
// ---------------------------------------------------------------------------

export type Product = {
  name: string
  price: string
  onHand?: string
  type: 'Goods' | 'Service'
  category: string
  posCategory: string
  availableInPos: boolean
  canBeSold: boolean
  canBePurchased: boolean
  archived: boolean
}

const DRINK = { category: 'Beverages', posCategory: 'Drinks' } as const
const BAKERY = { category: 'Bakery', posCategory: 'Pastry' } as const
const SIDE = { category: 'Sides', posCategory: 'Sides' } as const

function product(name: string, price: string, extra: Partial<Product> = {}): Product {
  return {
    name,
    price,
    type: 'Goods',
    category: 'Food',
    posCategory: 'Meals',
    availableInPos: true,
    canBeSold: true,
    canBePurchased: false,
    archived: false,
    ...extra,
  }
}

const PLACEHOLDER_PRODUCTS: Product[] = [
  product('Brown rice', '$ 1.00', SIDE),
  product('Brown rice (copy)', '$ 1.00', { ...SIDE, archived: true }),
  product('Cheese', '$ 1.00', { ...SIDE, canBePurchased: true }),
  product('Egg', '$ 0.50', { ...SIDE, canBePurchased: true }),
  product('French fries-b', '$ 3.00', SIDE),
  product('French fries-s', '$ 1.00', SIDE),
  product('Garlic bread', '$ 2.50', BAKERY),
  product('Steamed Rice', '$ 0.50', SIDE),
  product('Sweet potato fries-b', '$ 3.00', SIDE),
  product('Sweet potato fries-s', '$ 1.00', SIDE),
  product('Vegetable', '$ 0.50', { ...SIDE, canBePurchased: true }),
  product('4 cheese pizza', '$ 11.00'),
  product('Add cashew nut milk', '$ 0.50', {
    type: 'Service',
    category: 'Add-ons',
    posCategory: 'Extras',
  }),
  product('Ahi Tuna Nicoise Salad with Orange Mashed Sauce', '$ 8.75'),
  product('Ahi Tuna Nicoise Salad with Orange Mashed Sauce (copy)', '$ 8.75', { archived: true }),
  product('Ahi Tuna Nicoise Salad with Orange Mustard Sauce', '$ 8.75'),
  product('Ahi Tuna, beetroot salad with Orange mustart sauce', '$ 8.75'),
  product('Almond cream tart with blueberry', '$ 4.00', BAKERY),
  product('Almond cream tart with dry cranberry', '$ 4.00', BAKERY),
  product('Almond pain au chocolate', '$ 1.50', BAKERY),
  product('Almond raisin cream tart', '$ 4.00', BAKERY),
  product('Aloe Vera (Original, Classic, Sweet & Sour, Roselle, and Longan life)', '$ 2.75', {
    ...DRINK,
    canBePurchased: true,
  }),
  product('American breakfast', '$ 6.75'),
  product('American breakfast', '$ 5.50', { availableInPos: false, canBeSold: false }),
  product('Americano', '$ 2.75', { ...DRINK, onHand: '-996.00 kg' }),
  product('Americano hot', '$ 2.50', DRINK),
  product('Angkor Beer (bottle)', '$ 1.75', {
    ...DRINK,
    canBePurchased: true,
    onHand: '-1,225.00 Bottles',
  }),
  product('Apple juice', '$ 3.25', { ...DRINK, canBePurchased: true }),
  product('Apple juice (copy)', '$ 3.25', { ...DRINK, canBePurchased: true, archived: true }),
  product('Apple turnover', '$ 1.50', BAKERY),
  product('Apricot croissant', '$ 1.50', BAKERY),
  product('Avocado on toast', '$ 4.50'),
  product('Avocado shake', '$ 3.50', DRINK),
  product('Banana Muffin', '$ 1.50', BAKERY),
  product('Banana cashew nut shake', '$ 3.50', DRINK),
  product('Banana chocolate pan cake with vanilla ice cream', '$ 5.75'),
  product('Banana danish with blueburry jam', '$ 1.50', BAKERY),
  product('Banana date molasse', '$ 3.50', DRINK),
  product('Banana flower and beef salad', '$ 6.25'),
  product('Banana peanut', '$ 1.60', BAKERY),
  product('Banchev with chicken', '$ 6.25'),
  product('Banchev with shrimp and pork belly', '$ 6.75'),
  product('Bansung with sauce', '$ 5.75'),
  product('Bbq chicken panini', '$ 6.25'),
  product('Beef BBQ Rice', '$ 5.75'),
]

// Search-panel menu contents, Odoo style. Filters render in divided sections.
const FILTER_SECTIONS = [
  ['Services', 'Products'],
  ['Available in POS', 'Can be Sold', 'Can be Purchased'],
  ['Favorites'],
  ['Warnings'],
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
  'POS Product Category': (p) => (p.availableInPos ? p.posCategory : 'None'),
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
const STARRED_KEY = 'pos-admin.products.starred'
const IMPORTED_KEY = 'pos-admin.products.imported'

// Minimal CSV parser — handles quoted fields with commas/escaped quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const fields: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"'
            i++
          } else inQuotes = false
        } else cur += ch
      } else if (ch === '"') inQuotes = true
      else if (ch === ',') {
        fields.push(cur)
        cur = ''
      } else cur += ch
    }
    fields.push(cur)
    rows.push(fields.map((f) => f.trim()))
  }
  return rows
}

// Category → POS category used when importing (mirrors the placeholder data).
const IMPORT_POS_CATEGORY: Record<string, string> = {
  Food: 'Meals',
  Beverages: 'Drinks',
  Bakery: 'Pastry',
  Sides: 'Sides',
  'Add-ons': 'Extras',
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

type Facet = {
  key: string
  label: string
  kind: 'filter' | 'group' | 'favorite'
  onRemove: () => void
}

export default function PosProducts() {
  // Catalog = placeholder data + rows imported through Favorites > Import
  // records (persisted separately so the placeholder list stays pristine).
  const [catalog, setCatalog] = useState<Product[]>(() => [
    ...PLACEHOLDER_PRODUCTS,
    ...loadJson<Product[]>(IMPORTED_KEY, []),
  ])
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
  const importInputRef = useRef<HTMLInputElement>(null)
  // Create swaps the whole screen for the product form, Odoo style; clicking
  // a product opens its read-only detail, and Edit from there opens the form
  // prefilled. Dev builds can jump straight in with `?product-new` or
  // `?product-view=<index>`.
  const [creating, setCreating] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('product-new'),
  )
  const [selected, setSelected] = useState<number | null>(() => {
    if (!import.meta.env.DEV) return null
    const v = new URLSearchParams(window.location.search).get('product-view')
    return v === null ? null : Number(v) || 0
  })
  const [editing, setEditing] = useState(false)

  const toggleStar = (idx: number) =>
    setStarred((s) => {
      const next = toggleIn(s, idx)
      localStorage.setItem(STARRED_KEY, JSON.stringify([...next]))
      return next
    })

  const persistFavorites = (next: SavedSearch[]) => {
    setSavedSearches(next)
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
  }

  // Favorites > Import records — CSV with columns: name, price[, category].
  // A "name" header row is skipped; imported rows persist across reloads.
  const importFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ''))
      const dataRows = rows[0]?.[0]?.toLowerCase() === 'name' ? rows.slice(1) : rows
      const added: Product[] = []
      let skipped = 0
      for (const cells of dataRows) {
        const name = cells[0] ?? ''
        const price = Number.parseFloat((cells[1] ?? '').replace(/[^0-9.]/g, ''))
        if (!name || Number.isNaN(price)) {
          skipped++
          continue
        }
        const category = cells[2] || 'Food'
        added.push(
          product(name, `$ ${price.toFixed(2)}`, {
            category,
            posCategory: IMPORT_POS_CATEGORY[category] ?? category,
          }),
        )
      }
      if (added.length === 0) {
        setImportStatus({
          ok: false,
          text: `No products imported from "${file.name}" — expected CSV columns: name, price[, category].`,
        })
        return
      }
      setCatalog((prev) => {
        const next = [...prev, ...added]
        localStorage.setItem(
          IMPORTED_KEY,
          JSON.stringify(next.slice(PLACEHOLDER_PRODUCTS.length)),
        )
        return next
      })
      setImportStatus({
        ok: true,
        text:
          `Imported ${added.length} product${added.length === 1 ? '' : 's'} from "${file.name}"` +
          (skipped > 0 ? ` (${skipped} row${skipped === 1 ? '' : 's'} skipped)` : '') +
          '.',
      })
    }
    reader.readAsText(file)
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
        return starred.has(catalog.indexOf(p))
      case 'Warnings':
        return (p.onHand ?? '').startsWith('-')
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

  const facetChip = (facet: Facet) => {
    const style =
      facet.kind === 'group'
        ? { badge: 'bg-[#00888a]', body: 'bg-[#e0f1f1]', border: 'border-[#8fc7c7]/70' }
        : facet.kind === 'favorite'
          ? { badge: 'bg-[#b88414]', body: 'bg-[#fdf2d9]', border: 'border-[#e2c078]/80' }
          : { badge: 'bg-[#4b6e8c]', body: 'bg-[#eaf1f6]', border: 'border-[#9db4c0]/70' }
    const Icon = facet.kind === 'group' ? LuMenu : facet.kind === 'favorite' ? LuStar : LuFilter
    return (
      <span
        key={facet.key}
        className={`flex shrink-0 items-stretch overflow-hidden rounded-[2px] border text-[12px] ${style.border}`}
      >
        <span className={`flex items-center px-1 ${style.badge}`}>
          <Icon className="h-3 w-3 text-white" />
        </span>
        <span className={`flex items-center gap-1 px-1.5 text-neutral-700 ${style.body}`}>
          {facet.label}
          <button
            type="button"
            aria-label={`Remove ${facet.label}`}
            onClick={facet.onRemove}
            className="text-neutral-500 transition hover:text-neutral-800"
          >
            <LuX className="h-3 w-3" />
          </button>
        </span>
      </span>
    )
  }

  const productCard = (p: Product) => {
    const idx = catalog.indexOf(p)
    return (
      <article
        key={`${p.name}-${idx}`}
        onClick={() => setSelected(idx)}
        className="relative flex cursor-pointer gap-3 rounded-[3px] border border-neutral-200 bg-white p-2.5 transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[2px] bg-neutral-100">
          <LuImage className="h-6 w-6 text-neutral-300" />
        </span>
        <div className="min-w-0 flex-1 pr-6 text-[13px]">
          <h3 className="leading-snug text-[#374a63]">{p.name}</h3>
          <p className="mt-1 text-neutral-600">Price: {p.price}</p>
          {p.onHand && <p className="text-neutral-600">On hand: {p.onHand}</p>}
        </div>
        <button
          type="button"
          aria-label={`Favorite ${p.name}`}
          onClick={(e) => {
            e.stopPropagation()
            toggleStar(idx)
          }}
          className={`absolute right-2.5 top-2.5 transition ${
            starred.has(idx) ? 'text-amber-500' : 'text-neutral-400 hover:text-amber-500'
          }`}
        >
          <LuStar className={`h-4 w-4 ${starred.has(idx) ? 'fill-amber-500' : ''}`} />
        </button>
      </article>
    )
  }

  const productRow = (p: Product) => {
    const idx = catalog.indexOf(p)
    return (
      <tr
        key={`${p.name}-${idx}`}
        onClick={() => setSelected(idx)}
        className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
      >
        <td className="px-4 py-2.5 text-neutral-800">{p.name}</td>
        <td className="px-4 py-2.5 text-neutral-700">{p.price}</td>
        <td className="px-4 py-2.5 text-neutral-700">{p.onHand ?? '—'}</td>
      </tr>
    )
  }

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

  if (creating) {
    return <PosProductForm onBack={() => setCreating(false)} />
  }

  if (selected !== null) {
    const current = catalog[selected]
    if (editing) {
      return (
        <PosProductForm
          product={{ name: current.name, price: current.price }}
          // Discard (and the Products breadcrumb) leave straight back to the
          // full product list; Save returns to this record's detail view.
          onBack={() => {
            setEditing(false)
            setSelected(null)
          }}
          onSave={() => setEditing(false)}
        />
      )
    }
    return (
      <PosProductDetail
        product={current}
        index={selected}
        total={catalog.length}
        onBack={() => setSelected(null)}
        onCreate={() => setCreating(true)}
        onEdit={() => setEditing(true)}
        onPrev={() => setSelected((s) => Math.max(0, (s ?? 0) - 1))}
        onNext={() => setSelected((s) => Math.min(catalog.length - 1, (s ?? 0) + 1))}
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
          if (file) importFile(file)
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
              {facets.map(facetChip)}
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
                  <button
                    type="button"
                    aria-label="Activity view"
                    className="border-l border-neutral-300 bg-white px-2.5 py-1.5 text-neutral-500 transition hover:bg-neutral-50"
                  >
                    <LuClock className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Import result banner */}
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
          {query.trim()
            ? `No product matches "${query}".`
            : 'No product matches the current filters.'}
        </div>
      ) : view === 'kanban' ? (
        grouped ? (
          <div className="flex flex-col overflow-y-auto p-4">
            {grouped.map(([label, items]) => (
              <section key={label}>
                <div className="px-1 py-2">{groupHeader(label, items.length)}</div>
                {!collapsed.has(label) && (
                  <div className="grid content-start gap-3.5 pb-3 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
                    {items.map(productCard)}
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
                  <th className="px-4 py-2.5 font-medium">On Hand</th>
                </tr>
              </thead>
              {grouped ? (
                grouped.map(([label, items]) => (
                  <tbody key={label}>
                    <tr className="border-b border-neutral-100 bg-neutral-50/80">
                      <td colSpan={3} className="px-4 py-2">
                        {groupHeader(label, items.length)}
                      </td>
                    </tr>
                    {!collapsed.has(label) && items.map(productRow)}
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
