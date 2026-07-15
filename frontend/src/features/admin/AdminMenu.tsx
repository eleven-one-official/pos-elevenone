import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuPencil, LuPlus, LuSearch, LuTrash2, LuUtensils } from 'react-icons/lu'
import {
  deleteCategory,
  deleteMenuItem,
  fetchAdminCategories,
  fetchAdminMenuItems,
  updateMenuItem,
  type AdminCategory,
  type AdminMenuItem,
} from '../../services/api/adminMenu'
import { ApiError, assetUrl } from '../../services/api/client'
import { usd } from './format'
import { LoadingPanel, ErrorPanel } from './AdminStates'
import MenuItemDialog from './MenuItemDialog'
import CategoryDialog from './CategoryDialog'
import ConfirmDialog from './ConfirmDialog'

type Tab = 'items' | 'categories'

// Dialog state — `item`/`category` undefined = "create", set = "edit".
type ItemDialogState = { item?: AdminMenuItem } | null
type CategoryDialogState = { category?: AdminCategory } | null
type ConfirmState =
  | { kind: 'item'; item: AdminMenuItem }
  | { kind: 'category'; category: AdminCategory }
  | null

const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100'

export default function AdminMenu() {
  const [items, setItems] = useState<AdminMenuItem[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banner, setBanner] = useState('')

  const [tab, setTab] = useState<Tab>('items')
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<number | 'all'>('all')

  const [itemDialog, setItemDialog] = useState<ItemDialogState>(null)
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [cats, menu] = await Promise.all([fetchAdminCategories(), fetchAdminMenuItems()])
      setCategories(cats)
      setItems(menu)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the menu.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(
      (it) =>
        (filterCat === 'all' || it.category_id === filterCat) &&
        (!q || it.name.toLowerCase().includes(q)),
    )
  }, [items, search, filterCat])

  const countByCategory = useMemo(() => {
    const map = new Map<number, number>()
    for (const it of items) {
      if (it.category_id != null) map.set(it.category_id, (map.get(it.category_id) ?? 0) + 1)
    }
    return map
  }, [items])

  // Upsert a saved item / category back into local state (no refetch needed).
  function upsertItem(saved: AdminMenuItem) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === saved.id)
      if (i === -1) return [...prev, saved]
      const next = [...prev]
      next[i] = saved
      return next
    })
  }

  function upsertCategory(saved: AdminCategory) {
    setCategories((prev) => {
      const i = prev.findIndex((x) => x.id === saved.id)
      if (i === -1) return [...prev, saved]
      const next = [...prev]
      next[i] = saved
      return next
    })
  }

  // Optimistic availability toggle with rollback on failure.
  async function toggleAvailable(item: AdminMenuItem) {
    const next = !item.is_available
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, is_available: next } : x)))
    setBanner('')
    try {
      await updateMenuItem(item.id, { is_available: next })
    } catch (err) {
      setItems((prev) =>
        prev.map((x) => (x.id === item.id ? { ...x, is_available: item.is_available } : x)),
      )
      setBanner(err instanceof ApiError ? err.message : 'Could not update availability.')
    }
  }

  async function handleDelete() {
    if (!confirm) return
    if (confirm.kind === 'item') {
      await deleteMenuItem(confirm.item.id)
      setItems((prev) => prev.filter((x) => x.id !== confirm.item.id))
    } else {
      await deleteCategory(confirm.category.id)
      setCategories((prev) => prev.filter((x) => x.id !== confirm.category.id))
    }
    setConfirm(null)
  }

  if (loading) return <LoadingPanel label="Loading menu…" />
  if (error) return <ErrorPanel message={error} onRetry={() => void load()} />

  return (
    <div className="p-8">
      {/* Tabs + primary action */}
      <div className="mb-5 flex items-center justify-between">
        <div className="inline-flex rounded-xl bg-neutral-200/70 p-1">
          {(['items', 'categories'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition ${
                tab === t ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'items' ? (
          <button
            type="button"
            onClick={() => setItemDialog({})}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark"
          >
            <LuPlus className="h-4 w-4" />
            Add Item
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCategoryDialog({})}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark"
          >
            <LuPlus className="h-4 w-4" />
            Add Category
          </button>
        )}
      </div>

      {banner && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{banner}</p>
      )}

      {tab === 'items' && (
        <>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative">
              <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items…"
                className="h-10 w-64 rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={filterCat === 'all'} onClick={() => setFilterCat('all')}>
                All
              </FilterChip>
              {categories.map((c) => (
                <FilterChip key={c.id} active={filterCat === c.id} onClick={() => setFilterCat(c.id)}>
                  {c.name}
                </FilterChip>
              ))}
            </div>
          </div>

          {/* Items table */}
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {visibleItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-neutral-400">
                <LuUtensils className="h-8 w-8" />
                <p className="text-sm">No items match.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Category</th>
                    <th className="px-5 py-3 text-right font-semibold">Price</th>
                    <th className="px-5 py-3 text-center font-semibold">Available</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {visibleItems.map((it) => (
                    <tr key={it.id} className="text-neutral-700">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-300">
                            {it.image ? (
                              <img
                                src={assetUrl(it.image) ?? undefined}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <LuUtensils className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-neutral-900">{it.name}</div>
                            {it.description && (
                              <div className="truncate text-xs text-neutral-400">{it.description}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-neutral-500">{it.category?.name ?? '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold">{usd(it.price)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={it.is_available}
                            aria-label="Toggle availability"
                            onClick={() => void toggleAvailable(it)}
                            className={`relative h-6 w-11 rounded-full transition ${
                              it.is_available ? 'bg-primary' : 'bg-neutral-300'
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                                it.is_available ? 'left-[22px]' : 'left-0.5'
                              }`}
                            />
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            aria-label="Edit item"
                            onClick={() => setItemDialog({ item: it })}
                            className={iconBtn}
                          >
                            <LuPencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete item"
                            onClick={() => setConfirm({ kind: 'item', item: it })}
                            className={`${iconBtn} hover:text-rose-600`}
                          >
                            <LuTrash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'categories' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((c) => (
            <div key={c.id} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-neutral-900">{c.name}</h3>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {countByCategory.get(c.id) ?? 0} item{(countByCategory.get(c.id) ?? 0) === 1 ? '' : 's'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {c.is_active ? 'Active' : 'Hidden'}
                </span>
              </div>
              {c.description && <p className="mt-2 text-sm text-neutral-500">{c.description}</p>}
              <div className="mt-4 flex justify-end gap-1 border-t border-neutral-100 pt-3">
                <button
                  type="button"
                  aria-label="Edit category"
                  onClick={() => setCategoryDialog({ category: c })}
                  className={iconBtn}
                >
                  <LuPencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Delete category"
                  onClick={() => setConfirm({ kind: 'category', category: c })}
                  className={`${iconBtn} hover:text-rose-600`}
                >
                  <LuTrash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      {itemDialog && (
        <MenuItemDialog
          item={itemDialog.item}
          categories={categories}
          onClose={() => setItemDialog(null)}
          onSaved={(saved) => {
            upsertItem(saved)
            setItemDialog(null)
          }}
        />
      )}

      {categoryDialog && (
        <CategoryDialog
          category={categoryDialog.category}
          onClose={() => setCategoryDialog(null)}
          onSaved={(saved) => {
            upsertCategory(saved)
            setCategoryDialog(null)
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'item' ? 'Delete item' : 'Delete category'}
          message={
            confirm.kind === 'item'
              ? `Delete "${confirm.item.name}"? This can't be undone.`
              : `Delete "${confirm.category.name}"? Items in it will lose their category.`
          }
          onConfirm={handleDelete}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active ? 'bg-primary text-white' : 'bg-white text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      {children}
    </button>
  )
}
