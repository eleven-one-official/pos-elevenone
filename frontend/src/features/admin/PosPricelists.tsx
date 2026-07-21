import { useCallback, useEffect, useState } from 'react'
import {
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronsUpDown,
  LuDownload,
  LuLayoutGrid,
  LuList,
  LuSearch,
  LuTrash2,
} from 'react-icons/lu'
import { LoadingState } from '../../components/ui/Loader'
import { fetchAdminMenuItems } from '../../services/api/adminMenu'
import { deletePricelist, fetchPricelists, type Pricelist } from '../../services/api/pricelists'
import { downloadTablePdf } from './exportPdf'
import PosPricelistForm from './PosPricelistForm'
import SearchMenus, { toggleIn } from './SearchMenus'

// ---------------------------------------------------------------------------
// Pricelists — Odoo-style list/kanban over the real pricelists table. Create
// and row-click open the form; checking rows surfaces a Delete button; Export
// downloads the visible pricelists as a PDF (one row per price rule). Currency
// filters and the Currency/Company group-bys work client-side.
// ---------------------------------------------------------------------------

const CURRENCY_FILTERS = ['USD', 'KHR']
const GROUP_OPTIONS = ['Currency', 'Company']
const COMPANY = 'ElevenOne TTP'
const PAGE_SIZE = 40

const GROUP_VALUE: Record<string, (p: Pricelist) => string> = {
  Currency: (p) => p.currency,
  Company: () => COMPANY,
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

export default function PosPricelists() {
  const [pricelists, setPricelists] = useState<Pricelist[] | null>(null)
  const [products, setProducts] = useState<{ id: number; name: string }[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [page, setPage] = useState(0)
  const [checkedFilters, setCheckedFilters] = useState<Set<string>>(new Set())
  const [groups, setGroups] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // Create swaps the whole screen for the pricelist form, Odoo style;
  // clicking a row opens the same form prefilled.
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Pricelist | null>(null)

  const load = useCallback(async () => {
    const [lists, items] = await Promise.all([fetchPricelists(), fetchAdminMenuItems()])
    setPricelists(lists)
    setProducts(items.map((i) => ({ id: i.id, name: i.name })))
    setChecked(new Set())
  }, [])

  useEffect(() => {
    load().catch((e: unknown) => setLoadError(errorText(e)))
  }, [load])

  const activeCurrencies = CURRENCY_FILTERS.filter((c) => checkedFilters.has(c))
  const visible = (pricelists ?? []).filter(
    (p) =>
      p.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (activeCurrencies.length === 0 || activeCurrencies.includes(p.currency)),
  )

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const pageIndex = Math.min(page, pageCount - 1)
  const pageItems = visible.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)

  const grouped: Array<[string, Pricelist[]]> | null =
    groups.length > 0
      ? (() => {
          const buckets = new Map<string, Pricelist[]>()
          for (const p of pageItems) {
            const key = groups.map((g) => GROUP_VALUE[g]?.(p) ?? 'None').join(' / ')
            const bucket = buckets.get(key)
            if (bucket) bucket.push(p)
            else buckets.set(key, [p])
          }
          return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        })()
      : null

  const toggleChecked = (id: number) =>
    setChecked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const deleteChecked = async () => {
    setBusy(true)
    setActionError(null)
    try {
      for (const id of checked) await deletePricelist(id)
      await load()
    } catch (e: unknown) {
      setActionError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  // Export — the visible pricelists flattened to one PDF row per price rule.
  const exportPdf = () => {
    const rows = visible.flatMap((p) => {
      const base = [p.name, p.currency, p.discount_policy]
      if (p.rules.length === 0) return [[...base, '', '', '', '', '']]
      return p.rules.map((r) => [
        ...base,
        r.menu_item?.name ?? 'All Products',
        r.min_quantity,
        r.fixed_price,
        r.date_start ?? '',
        r.date_end ?? '',
      ])
    })
    void downloadTablePdf({
      fileName: 'pricelists.pdf',
      title: 'Pricelists',
      subtitle: `${visible.length} pricelist${visible.length === 1 ? '' : 's'} — ${rows.length} price rule${
        rows.length === 1 ? '' : 's'
      }`,
      landscape: true,
      columns: [
        { header: 'Pricelist' },
        { header: 'Currency' },
        { header: 'Discount policy' },
        { header: 'Applied on' },
        { header: 'Min quantity', align: 'right' },
        { header: 'Fixed price', align: 'right' },
        { header: 'Date start' },
        { header: 'Date end' },
      ],
      rows,
    })
  }

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

  if (pricelists === null) {
    return <LoadingState label="Loading pricelists..." className="h-full" />
  }

  if (creating || selected) {
    return (
      <PosPricelistForm
        pricelist={selected ?? undefined}
        products={products}
        onBack={() => {
          setCreating(false)
          setSelected(null)
        }}
        onSaved={async () => {
          await load()
          setCreating(false)
          setSelected(null)
        }}
      />
    )
  }

  const groupHeader = (label: string, count: number) => (
    <button
      type="button"
      onClick={() => setCollapsed((s) => toggleIn(s, label))}
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

  const pricelistCard = (p: Pricelist) => (
    <article
      key={p.id}
      onClick={() => setSelected(p)}
      className="cursor-pointer rounded-[3px] border border-neutral-200 bg-white p-3.5 transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[14px] text-[#374a63]">{p.name}</h3>
        <span className="shrink-0 rounded-[2px] bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-600">
          {p.currency}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] text-neutral-600">
        {p.rules.length === 1 ? '1 price rule' : `${p.rules.length} price rules`}
      </p>
    </article>
  )

  const pricelistRow = (p: Pricelist) => (
    <tr
      key={p.id}
      onClick={() => setSelected(p)}
      className="cursor-pointer border-b border-neutral-100 text-neutral-700 transition hover:bg-neutral-50"
    >
      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Select ${p.name}`}
          checked={checked.has(p.id)}
          onChange={() => toggleChecked(p.id)}
          className="h-3.5 w-3.5 align-middle"
        />
      </td>
      <td className="py-2 text-neutral-400">
        <LuChevronsUpDown className="h-3.5 w-3.5" />
      </td>
      <td className="py-2 pr-4 text-neutral-800">{p.name}</td>
      <td className="py-2 pr-4">{p.currency}</td>
      <td className="py-2 pr-4">{p.rules.length}</td>
      <td className="py-2 pr-4">{COMPANY}</td>
    </tr>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <div>
            <h1 className="text-xl text-neutral-700">Pricelists</h1>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="inline-flex items-stretch gap-px">
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
                  onClick={exportPdf}
                  className="rounded-r-[3px] border border-neutral-300 bg-white px-2.5 text-neutral-600 transition hover:bg-neutral-50"
                >
                  <LuDownload className="h-4 w-4" />
                </button>
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
            <label className="relative block">
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(0)
                }}
                placeholder="Search..."
                className="w-full rounded-[3px] border border-neutral-300 px-3 py-1.5 pr-9 text-sm outline-none transition focus:border-sky-600"
              />
              <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <SearchMenus
                filterSections={[CURRENCY_FILTERS]}
                groupOptions={GROUP_OPTIONS}
                favoriteName="Pricelists"
                checkedFilters={checkedFilters}
                onToggleFilter={(f) => {
                  setCheckedFilters((s) => toggleIn(s, f))
                  setPage(0)
                }}
                checkedGroups={groups}
                onToggleGroup={(g) => {
                  setGroups((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]))
                  setCollapsed(new Set())
                }}
              />

              <div className="flex items-center gap-2">
                <span className="text-[13px] text-neutral-600">
                  {visible.length === 0
                    ? '0-0'
                    : `${pageIndex * PAGE_SIZE + 1}-${pageIndex * PAGE_SIZE + pageItems.length}`}{' '}
                  / {visible.length}
                </span>
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-label="Previous page"
                    onClick={() => setPage((pageIndex - 1 + pageCount) % pageCount)}
                    className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100"
                  >
                    <LuChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    onClick={() => setPage((pageIndex + 1) % pageCount)}
                    className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100"
                  >
                    <LuChevronRight className="h-4.5 w-4.5" />
                  </button>
                </div>

                <div className="inline-flex overflow-hidden rounded-[3px] border border-neutral-300">
                  <button
                    type="button"
                    aria-label="List view"
                    onClick={() => setView('list')}
                    className={`px-2.5 py-1.5 transition ${
                      view === 'list'
                        ? 'bg-[#57779a] text-white'
                        : 'bg-white text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    <LuList className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Kanban view"
                    onClick={() => setView('kanban')}
                    className={`border-l border-neutral-300 px-2.5 py-1.5 transition ${
                      view === 'kanban'
                        ? 'bg-[#57779a] text-white'
                        : 'bg-white text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    <LuLayoutGrid className="h-4 w-4" />
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

      {/* Records */}
      {visible.length === 0 ? (
        <div className="p-10 text-center text-sm text-neutral-500">
          {query.trim()
            ? `No pricelist matches "${query}".`
            : pricelists.length === 0
              ? 'No pricelists yet — hit Create to add the first one.'
              : 'No pricelist matches the current filters.'}
        </div>
      ) : view === 'kanban' ? (
        grouped ? (
          <div className="flex flex-col overflow-y-auto p-4">
            {grouped.map(([label, items]) => (
              <section key={label}>
                <div className="px-1 py-2">{groupHeader(label, items.length)}</div>
                {!collapsed.has(label) && (
                  <div className="grid content-start gap-3.5 pb-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                    {items.map(pricelistCard)}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="grid content-start gap-3.5 overflow-y-auto p-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {pageItems.map(pricelistCard)}
          </div>
        )
      ) : (
        <div className="overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-800">
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={pageItems.length > 0 && pageItems.every((p) => checked.has(p.id))}
                    onChange={(e) =>
                      setChecked(e.target.checked ? new Set(pageItems.map((p) => p.id)) : new Set())
                    }
                    className="h-3.5 w-3.5 align-middle"
                  />
                </th>
                <th className="w-8" />
                <th className="py-2.5 pr-4 font-bold">Pricelist Name</th>
                <th className="w-[20%] py-2.5 pr-4 font-bold">Currency</th>
                <th className="w-[15%] py-2.5 pr-4 font-bold">Price Rules</th>
                <th className="w-[20%] py-2.5 pr-4 font-bold">Company</th>
              </tr>
            </thead>
            {grouped ? (
              grouped.map(([label, items]) => (
                <tbody key={label}>
                  <tr className="border-b border-neutral-100 bg-neutral-50/80">
                    <td colSpan={6} className="px-4 py-2">
                      {groupHeader(label, items.length)}
                    </td>
                  </tr>
                  {!collapsed.has(label) && items.map(pricelistRow)}
                </tbody>
              ))
            ) : (
              <tbody>{pageItems.map(pricelistRow)}</tbody>
            )}
          </table>
        </div>
      )}

      {/* Delete confirmation, Odoo style */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-3 text-[15px] font-semibold text-neutral-800">
              Confirmation
            </div>
            <p className="px-5 py-4 text-sm text-neutral-700">
              Are you sure you want to delete{' '}
              {checked.size === 1 ? 'this pricelist' : `these ${checked.size} pricelists`}? Their
              price rules are removed too.
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
