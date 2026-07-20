import { useEffect, useState } from 'react'
import { LuX } from 'react-icons/lu'
import { Loader, LoadingOverlay } from '../../components/ui/Loader'
import {
  createCategory,
  deleteCategory,
  fetchAdminCategories,
  updateCategory,
  type AdminCategory,
} from '../../services/api/adminMenu'
import { FieldGroup, LABEL, TEXT_INPUT } from './formKit'

// ---------------------------------------------------------------------------
// Products › Categories — the missing CRUD for menu categories. Until now
// categories could only appear via product CSV import; this screen lets a
// manager rename, reorder, hide or delete them.
// ---------------------------------------------------------------------------

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

type Draft = {
  id: number | null // null = creating
  name: string
  description: string
  sortOrder: string
  isActive: boolean
}

const EMPTY: Draft = { id: null, name: '', description: '', sortOrder: '', isActive: true }

export default function PosCategories() {
  const [rows, setRows] = useState<AdminCategory[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminCategory | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    fetchAdminCategories()
      .then(setRows)
      .catch((e: unknown) => setError(errorText(e)))
  }

  useEffect(load, [])

  const openEdit = (c: AdminCategory) =>
    setDraft({
      id: c.id,
      name: c.name,
      description: c.description ?? '',
      sortOrder: String(c.sort_order ?? 0),
      isActive: c.is_active,
    })

  const save = async () => {
    if (!draft) return
    if (!draft.name.trim()) {
      setFormError('The category name is required.')
      return
    }
    setBusy(true)
    setFormError(null)
    const input = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      sort_order: draft.sortOrder ? Number(draft.sortOrder) : null,
      is_active: draft.isActive,
    }
    try {
      if (draft.id == null) await createCategory(input)
      else await updateCategory(draft.id, input)
      setDraft(null)
      load()
    } catch (e: unknown) {
      setFormError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (c: AdminCategory) => {
    setBusy(true)
    try {
      await deleteCategory(c.id)
      setConfirmDelete(null)
      setDraft(null)
      load()
    } catch (e: unknown) {
      setConfirmDelete(null)
      setFormError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <h1 className="text-xl text-neutral-700">Categories</h1>
        <p className="mt-1 text-[13px] text-neutral-500">
          Menu categories group products on the POS. Deleting one leaves its products
          uncategorised — it never deletes products.
        </p>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => {
              setFormError(null)
              setDraft({ ...EMPTY })
            }}
            className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
          >
            New
          </button>
        </div>
      </div>

      {/* List */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {busy && <LoadingOverlay />}
        {rows === null && !error ? (
          <div className="flex items-center justify-center p-16">
            <Loader />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={load}
              className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {formError && !draft && (
              <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {formError}
                <button
                  type="button"
                  aria-label="Dismiss error"
                  onClick={() => setFormError(null)}
                  className="shrink-0 transition hover:opacity-70"
                >
                  <LuX className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-800">
                  <th className="px-4 py-2.5 font-bold">Name</th>
                  <th className="py-2.5 pr-4 font-bold">Description</th>
                  <th className="py-2.5 pr-4 text-right font-bold">Sort</th>
                  <th className="py-2.5 pr-4 font-bold">Active</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setFormError(null)
                      openEdit(c)
                    }}
                    className="cursor-pointer border-b border-neutral-100 text-neutral-700 transition hover:bg-neutral-50"
                  >
                    <td className="px-4 py-2 text-neutral-800">{c.name}</td>
                    <td className="py-2 pr-4 text-neutral-600">{c.description ?? '—'}</td>
                    <td className="py-2 pr-4 text-right">{c.sort_order}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                          c.is_active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-neutral-200 text-neutral-600'
                        }`}
                      >
                        {c.is_active ? 'active' : 'hidden'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(rows ?? []).length === 0 && (
              <div className="p-10 text-center text-sm text-neutral-500">
                No categories yet — create one, or import products to auto-create them.
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit / create dialog */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-3 text-[15px] font-semibold text-neutral-800">
              {draft.id == null ? 'New Category' : 'Edit Category'}
            </div>
            <div className="px-5 py-4">
              {formError && (
                <p className="mb-3 rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                  {formError}
                </p>
              )}
              <FieldGroup>
                <label className={LABEL}>Name</label>
                <input
                  autoFocus
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={TEXT_INPUT}
                />

                <label className={LABEL}>Description</label>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className={TEXT_INPUT}
                />

                <label className={LABEL}>Sort Order</label>
                <input
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value.replace(/[^0-9]/g, '') })}
                  className={`${TEXT_INPUT} max-w-28`}
                />

                <label className={LABEL}>Active</label>
                <span className="pt-1">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                    className="h-4 w-4 accent-[#57779a]"
                  />
                </span>
              </FieldGroup>
            </div>
            <div className="flex items-center gap-1.5 border-t border-neutral-200 px-5 py-3">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="flex items-center gap-2 rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d] disabled:opacity-60"
              >
                {busy && <Loader size="sm" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
              {draft.id != null && (
                <button
                  type="button"
                  onClick={() => {
                    const current = rows?.find((r) => r.id === draft.id)
                    if (current) setConfirmDelete(current)
                  }}
                  className="ml-auto rounded-[3px] border border-rose-200 bg-white px-3 py-1.5 text-sm text-rose-600 transition hover:bg-rose-50"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-3 text-[15px] font-semibold text-neutral-800">
              Confirmation
            </div>
            <p className="px-5 py-4 text-sm text-neutral-700">
              Delete the category “{confirmDelete.name}”? Its products stay on the menu but lose
              this grouping.
            </p>
            <div className="flex gap-1.5 border-t border-neutral-200 px-5 py-3">
              <button
                type="button"
                onClick={() => void remove(confirmDelete)}
                className="rounded-[3px] bg-red-600 px-4 py-1.5 text-sm text-white transition hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
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
