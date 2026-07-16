import { useState } from 'react'
import {
  LuChevronLeft,
  LuChevronRight,
  LuClock,
  LuFilter,
  LuImage,
  LuLayoutGrid,
  LuList,
  LuSearch,
  LuStar,
  LuX,
} from 'react-icons/lu'
import PosProductDetail from './PosProductDetail'
import PosProductForm from './PosProductForm'
import SearchMenus, { toggleIn } from './SearchMenus'

// ---------------------------------------------------------------------------
// Products — Odoo-style product kanban with the "Available in POS" search
// facet. Pure UI: the catalog below is placeholder data lifted from the real
// venue's Odoo until this screen is wired to the backend menu API.
// ---------------------------------------------------------------------------

export type Product = { name: string; price: string; onHand?: string }

const PLACEHOLDER_PRODUCTS: Product[] = [
  { name: 'Brown rice', price: '$ 1.00' },
  { name: 'Brown rice (copy)', price: '$ 1.00' },
  { name: 'Cheese', price: '$ 1.00' },
  { name: 'Egg', price: '$ 0.50' },
  { name: 'French fries-b', price: '$ 3.00' },
  { name: 'French fries-s', price: '$ 1.00' },
  { name: 'Garlic bread', price: '$ 2.50' },
  { name: 'Steamed Rice', price: '$ 0.50' },
  { name: 'Sweet potato fries-b', price: '$ 3.00' },
  { name: 'Sweet potato fries-s', price: '$ 1.00' },
  { name: 'Vegetable', price: '$ 0.50' },
  { name: '4 cheese pizza', price: '$ 11.00' },
  { name: 'Add cashew nut milk', price: '$ 0.50' },
  { name: 'Ahi Tuna Nicoise Salad with Orange Mashed Sauce', price: '$ 8.75' },
  { name: 'Ahi Tuna Nicoise Salad with Orange Mashed Sauce (copy)', price: '$ 8.75' },
  { name: 'Ahi Tuna Nicoise Salad with Orange Mustard Sauce', price: '$ 8.75' },
  { name: 'Ahi Tuna, beetroot salad with Orange mustart sauce', price: '$ 8.75' },
  { name: 'Almond cream tart with blueberry', price: '$ 4.00' },
  { name: 'Almond cream tart with dry cranberry', price: '$ 4.00' },
  { name: 'Almond pain au chocolate', price: '$ 1.50' },
  { name: 'Almond raisin cream tart', price: '$ 4.00' },
  { name: 'Aloe Vera (Original, Classic, Sweet & Sour, Roselle, and Longan life)', price: '$ 2.75' },
  { name: 'American breakfast', price: '$ 6.75' },
  { name: 'American breakfast', price: '$ 5.50' },
  { name: 'Americano', price: '$ 2.75', onHand: '-996.00 kg' },
  { name: 'Americano hot', price: '$ 2.50' },
  { name: 'Angkor Beer (bottle)', price: '$ 1.75', onHand: '-1,225.00 Bottles' },
  { name: 'Apple juice', price: '$ 3.25' },
  { name: 'Apple juice (copy)', price: '$ 3.25' },
  { name: 'Apple turnover', price: '$ 1.50' },
  { name: 'Apricot croissant', price: '$ 1.50' },
  { name: 'Avocado on toast', price: '$ 4.50' },
  { name: 'Avocado shake', price: '$ 3.50' },
  { name: 'Banana Muffin', price: '$ 1.50' },
  { name: 'Banana cashew nut shake', price: '$ 3.50' },
  { name: 'Banana chocolate pan cake with vanilla ice cream', price: '$ 5.75' },
  { name: 'Banana danish with blueburry jam', price: '$ 1.50' },
  { name: 'Banana date molasse', price: '$ 3.50' },
  { name: 'Banana flower and beef salad', price: '$ 6.25' },
  { name: 'Banana peanut', price: '$ 1.60' },
  { name: 'Banchev with chicken', price: '$ 6.25' },
  { name: 'Banchev with shrimp and pork belly', price: '$ 6.75' },
  { name: 'Bansung with sauce', price: '$ 5.75' },
  { name: 'Bbq chicken panini', price: '$ 6.25' },
  { name: 'Beef BBQ Rice', price: '$ 5.75' },
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
const POS_FILTER = 'Available in POS'

export default function PosProducts() {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  // Checked search filters — shared between the Filters menu and the facet
  // chip inside the search box.
  const [checkedFilters, setCheckedFilters] = useState<Set<string>>(new Set([POS_FILTER]))
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

  const visible = PLACEHOLDER_PRODUCTS.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  if (creating) {
    return <PosProductForm onBack={() => setCreating(false)} />
  }

  if (selected !== null) {
    const current = PLACEHOLDER_PRODUCTS[selected]
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
        total={PLACEHOLDER_PRODUCTS.length}
        onBack={() => setSelected(null)}
        onCreate={() => setCreating(true)}
        onEdit={() => setEditing(true)}
        onPrev={() => setSelected((s) => Math.max(0, (s ?? 0) - 1))}
        onNext={() => setSelected((s) => Math.min(PLACEHOLDER_PRODUCTS.length - 1, (s ?? 0) + 1))}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
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
            {/* Search box with the "Available in POS" facet chip inside */}
            <div className="relative flex w-full flex-wrap items-center gap-1.5 rounded-[3px] border border-neutral-300 py-1 pl-1.5 pr-9 focus-within:border-sky-600">
              {checkedFilters.has(POS_FILTER) && (
                <span className="flex shrink-0 items-stretch overflow-hidden rounded-[2px] border border-[#9db4c0]/70 text-[12px]">
                  <span className="flex items-center bg-[#4b6e8c] px-1">
                    <LuFilter className="h-3 w-3 text-white" />
                  </span>
                  <span className="flex items-center gap-1 bg-[#eaf1f6] px-1.5 text-neutral-700">
                    {POS_FILTER}
                    <button
                      type="button"
                      aria-label="Remove filter"
                      onClick={() => setCheckedFilters((s) => toggleIn(s, POS_FILTER))}
                      className="text-neutral-500 transition hover:text-neutral-800"
                    >
                      <LuX className="h-3 w-3" />
                    </button>
                  </span>
                </span>
              )}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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
                onToggleFilter={(f) => setCheckedFilters((s) => toggleIn(s, f))}
              />

              <div className="flex items-center gap-2">
                <span className="text-[13px] text-neutral-600">
                  {visible.length === 0 ? '0-0' : `1-${visible.length}`} / {visible.length}
                </span>
                <div className="inline-flex overflow-hidden rounded-[3px] border border-neutral-300">
                  <button
                    type="button"
                    aria-label="Previous page"
                    className="px-2 py-1.5 text-neutral-500 transition hover:bg-neutral-50"
                  >
                    <LuChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
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

      {/* Records */}
      {visible.length === 0 ? (
        <div className="p-10 text-center text-sm text-neutral-500">
          {`No product matches "${query}".`}
        </div>
      ) : view === 'kanban' ? (
        <div className="grid content-start gap-3.5 overflow-y-auto p-4 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
          {visible.map((p, i) => (
            <article
              key={`${p.name}-${i}`}
              onClick={() => setSelected(PLACEHOLDER_PRODUCTS.indexOf(p))}
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
                onClick={(e) => e.stopPropagation()}
                className="absolute right-2.5 top-2.5 text-neutral-400 transition hover:text-amber-500"
              >
                <LuStar className="h-4 w-4" />
              </button>
            </article>
          ))}
        </div>
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
              <tbody>
                {visible.map((p, i) => (
                  <tr
                    key={`${p.name}-${i}`}
                    onClick={() => setSelected(PLACEHOLDER_PRODUCTS.indexOf(p))}
                    className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                  >
                    <td className="px-4 py-2.5 text-neutral-800">{p.name}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{p.price}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{p.onHand ?? '—'}</td>
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
