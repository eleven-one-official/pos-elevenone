import { useCallback, useEffect, useState } from 'react'
import {
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
import PosPricelistForm from './PosPricelistForm'
import SearchMenus from './SearchMenus'

// ---------------------------------------------------------------------------
// Pricelists — Odoo-style list over the real pricelists table. Create and
// row-click open the form; checking rows surfaces a Delete button that
// removes the selection through the API (with confirmation).
// ---------------------------------------------------------------------------

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

export default function PosPricelists() {
  const [pricelists, setPricelists] = useState<Pricelist[] | null>(null)
  const [products, setProducts] = useState<{ id: number; name: string }[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
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

  const visible = (pricelists ?? []).filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-[3px] border border-neutral-300 px-3 py-1.5 pr-9 text-sm outline-none transition focus:border-sky-600"
              />
              <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <SearchMenus
                filterSections={[['Archived']]}
                groupOptions={['Currency', 'Company']}
                favoriteName="Pricelists"
              />

              <div className="flex items-center gap-2">
                <span className="text-[13px] text-neutral-600">
                  {visible.length === 0 ? '0-0' : `1-${visible.length}`} / {visible.length}
                </span>
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-label="Previous page"
                    className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100"
                  >
                    <LuChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100"
                  >
                    <LuChevronRight className="h-4.5 w-4.5" />
                  </button>
                </div>

                <div className="inline-flex overflow-hidden rounded-[3px] border border-neutral-300">
                  <button
                    type="button"
                    aria-label="List view"
                    className="bg-[#57779a] px-2.5 py-1.5 text-white"
                  >
                    <LuList className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Kanban view"
                    className="border-l border-neutral-300 bg-white px-2.5 py-1.5 text-neutral-500 transition hover:bg-neutral-50"
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

      {/* Editable-list style table */}
      <div className="overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-800">
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={visible.length > 0 && visible.every((p) => checked.has(p.id))}
                  onChange={(e) =>
                    setChecked(e.target.checked ? new Set(visible.map((p) => p.id)) : new Set())
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
          <tbody>
            {visible.map((p) => (
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
                <td className="py-2 pr-4" />
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="p-10 text-center text-sm text-neutral-500">
            {query.trim()
              ? `No pricelist matches "${query}".`
              : 'No pricelists yet — hit Create to add the first one.'}
          </div>
        )}
      </div>

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
