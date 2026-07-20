import { useCallback, useEffect, useState } from 'react'
import { LuChevronsUpDown, LuSearch, LuTrash2, LuX } from 'react-icons/lu'
import { Loader, LoadingState } from '../../components/ui/Loader'
import {
  createChef,
  deleteChef,
  fetchChefs,
  updateChef,
  type Chef,
  type ChefInput,
} from '../../services/api/chefs'
import { ApiError } from '../../services/api/client'
import { FIELD_BG, FieldGroup, LABEL, TEXT_INPUT } from './formKit'

// ---------------------------------------------------------------------------
// Configuration › Chefs — the roster of kitchen cooks. The Kitchen Display
// signs in on one shared station account, so a cook names themselves when they
// take a ticket (tap "Start"); that attribution powers the Chef Performance
// KPI. Odoo-style list + form over the real /chefs API; deleting is
// selection-based like the payment methods list. Writes are back-office only
// server-side.
// ---------------------------------------------------------------------------

function errorText(e: unknown): string {
  if (e instanceof ApiError && e.errors) {
    const first = Object.values(e.errors)[0]?.[0]
    if (first) return first
  }
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

export default function PosChefs() {
  const [chefs, setChefs] = useState<Chef[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Chef | null>(null)

  const load = useCallback(async () => {
    setChefs(await fetchChefs())
    setChecked(new Set())
  }, [])

  useEffect(() => {
    load().catch((e: unknown) => setLoadError(errorText(e)))
  }, [load])

  const visible = (chefs ?? []).filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
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
      for (const id of checked) await deleteChef(id)
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

  if (chefs === null) {
    return <LoadingState label="Loading chefs..." className="h-full" />
  }

  if (creating || selected) {
    return (
      <ChefForm
        chef={selected ?? undefined}
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
            <h1 className="text-xl text-neutral-700">Chefs</h1>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-[3px] bg-[#57779a] px-3 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
              >
                Create
              </button>
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
            <span className="self-end text-[13px] text-neutral-600">
              {visible.length === 0 ? '0-0' : `1-${visible.length}`} / {visible.length}
            </span>
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
                  checked={visible.length > 0 && visible.every((c) => checked.has(c.id))}
                  onChange={(e) =>
                    setChecked(e.target.checked ? new Set(visible.map((c) => c.id)) : new Set())
                  }
                  className="h-3.5 w-3.5 align-middle"
                />
              </th>
              <th className="w-8" />
              <th className="py-2.5 pr-4 font-bold">Chef</th>
              <th className="w-[15%] py-2.5 pr-4 text-right font-bold">Sequence</th>
              <th className="w-[15%] py-2.5 pr-4 font-bold">Active</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelected(c)}
                className="cursor-pointer border-b border-neutral-100 text-neutral-700 transition hover:bg-neutral-50"
              >
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.name}`}
                    checked={checked.has(c.id)}
                    onChange={() => toggleChecked(c.id)}
                    className="h-3.5 w-3.5 align-middle"
                  />
                </td>
                <td className="py-2 text-neutral-400">
                  <LuChevronsUpDown className="h-3.5 w-3.5" />
                </td>
                <td className="py-2 pr-4 text-neutral-800">{c.name}</td>
                <td className="py-2 pr-4 text-right">{c.sort_order}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                      c.is_active
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-neutral-200 text-neutral-600'
                    }`}
                  >
                    {c.is_active ? 'Active' : 'Archived'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="p-10 text-center text-sm text-neutral-500">
            {query.trim()
              ? `No chef matches "${query}".`
              : 'No chefs yet — hit Create to add the first one.'}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-3 text-[15px] font-semibold text-neutral-800">
              Confirmation
            </div>
            <p className="px-5 py-4 text-sm text-neutral-700">
              Are you sure you want to delete {checked.size === 1 ? 'this chef' : `these ${checked.size} chefs`}?
              Past orders keep their history, but the kitchen display stops offering{' '}
              {checked.size === 1 ? 'this name' : 'these names'} immediately.
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
// Create/edit form — name, sequence and the active toggle.
// ---------------------------------------------------------------------------

function ChefForm({
  chef,
  onBack,
  onSaved,
}: {
  chef?: Chef
  onBack: () => void
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState(chef?.name ?? '')
  const [isActive, setIsActive] = useState(chef?.is_active ?? true)
  const [sortOrder, setSortOrder] = useState(chef ? String(chef.sort_order) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (saving) return
    if (!name.trim()) {
      setError('The chef name is required.')
      return
    }
    const input: ChefInput = {
      name: name.trim(),
      is_active: isActive,
      sort_order: sortOrder.trim() === '' ? null : Number.parseInt(sortOrder, 10) || 0,
    }
    setSaving(true)
    setError(null)
    try {
      if (chef) await updateChef(chef.id, input)
      else await createChef(input)
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
            Chefs
          </button>
          <span className="text-neutral-400"> / </span>
          <span>{chef ? chef.name : 'New'}</span>
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
          <div className="text-[13px] font-bold text-neutral-800">Chef name</div>
          <input
            placeholder="e.g. Bopha"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mt-1 w-[56%] min-w-72 rounded-[2px] border border-neutral-300 ${FIELD_BG} px-3 py-1.5 text-[22px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-sky-600`}
          />

          <div className="mt-6 grid grid-cols-1 gap-x-16 gap-y-3 xl:grid-cols-2">
            <FieldGroup>
              <label className={LABEL}>Sequence</label>
              <input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="Position in the display picker"
                className={`${TEXT_INPUT} max-w-40`}
              />
            </FieldGroup>

            <FieldGroup>
              <label className={LABEL}>Active</label>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="mt-1.5 h-3.5 w-3.5 justify-self-start accent-teal-700"
              />
            </FieldGroup>
          </div>

          <p className="mt-8 border-t border-neutral-200 pt-4 text-[12.5px] italic text-neutral-500">
            Active chefs appear in the kitchen display’s “who’s cooking?” picker, in sequence order.
            A cook picks their name when they tap Start on a ticket — that attribution drives the
            Chef Performance report.
          </p>
        </div>
      </div>
    </div>
  )
}
