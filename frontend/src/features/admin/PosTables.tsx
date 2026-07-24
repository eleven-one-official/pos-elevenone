import { useCallback, useEffect, useState } from 'react'
import { LuChevronsUpDown, LuSearch, LuTrash2, LuX } from 'react-icons/lu'
import { Loader, LoadingState } from '../../components/ui/Loader'
import {
  createTable,
  deleteTable,
  fetchTables,
  updateTable,
  type ApiTable,
  type TableInput,
  type TableShape,
  type TableStatus,
  type TableType,
} from '../../services/api/tables'
import { ApiError } from '../../services/api/client'
import { BLUE_SELECT, FIELD_BG, FieldGroup, LABEL, TEXT_INPUT } from './formKit'

// ---------------------------------------------------------------------------
// Configuration › Tables — the physical floor plan behind the POS table
// screen. Odoo-style list + form over the real /tables CRUD (writes are
// admin/manager on the backend). Take-away is an order type, not a table,
// so those synthetic slots never appear here.
// ---------------------------------------------------------------------------

const TABLE_TYPES: { value: TableType; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'vip', label: 'VIP' },
]

const TABLE_STATUSES: { value: TableStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
]

const TABLE_SHAPES: { value: TableShape | ''; label: string }[] = [
  { value: '', label: 'Standard card' },
  { value: 'wide', label: 'Wide (private room)' },
  { value: 'round', label: 'Round (garden pill)' },
  { value: 'tall', label: 'Tall (long table)' },
]

const STATUS_BADGE: Record<TableStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800',
  occupied: 'bg-amber-100 text-amber-800',
  reserved: 'bg-sky-100 text-sky-800',
}

function errorText(e: unknown): string {
  if (e instanceof ApiError && e.errors) {
    const first = Object.values(e.errors)[0]?.[0]
    if (first) return first
  }
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

export default function PosTables() {
  const [tables, setTables] = useState<ApiTable[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<ApiTable | null>(null)

  const load = useCallback(async () => {
    setTables(await fetchTables())
    setChecked(new Set())
  }, [])

  useEffect(() => {
    load().catch((e: unknown) => setLoadError(errorText(e)))
  }, [load])

  const visible = (tables ?? []).filter((t) =>
    t.name.toLowerCase().includes(query.trim().toLowerCase()),
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
      for (const id of checked) await deleteTable(id)
      await load()
    } catch (e: unknown) {
      setActionError(errorText(e))
      await load().catch(() => {})
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

  if (tables === null) {
    return <LoadingState label="Loading tables..." className="h-full" />
  }

  if (creating || selected) {
    return (
      <TableForm
        table={selected ?? undefined}
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
            <h1 className="text-xl text-neutral-700">Tables</h1>
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
                  checked={visible.length > 0 && visible.every((t) => checked.has(t.id))}
                  onChange={(e) =>
                    setChecked(e.target.checked ? new Set(visible.map((t) => t.id)) : new Set())
                  }
                  className="h-3.5 w-3.5 align-middle"
                />
              </th>
              <th className="w-8" />
              <th className="py-2.5 pr-4 font-bold">Table</th>
              <th className="w-[15%] py-2.5 pr-4 font-bold">Type</th>
              <th className="w-[20%] py-2.5 pr-4 font-bold">Floor</th>
              <th className="w-[12%] py-2.5 pr-4 text-right font-bold">Seats</th>
              <th className="w-[16%] py-2.5 pr-4 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr
                key={t.id}
                onClick={() => setSelected(t)}
                className="cursor-pointer border-b border-neutral-100 text-neutral-700 transition hover:bg-neutral-50"
              >
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${t.name}`}
                    checked={checked.has(t.id)}
                    onChange={() => toggleChecked(t.id)}
                    className="h-3.5 w-3.5 align-middle"
                  />
                </td>
                <td className="py-2 text-neutral-400">
                  <LuChevronsUpDown className="h-3.5 w-3.5" />
                </td>
                <td className="py-2 pr-4 text-neutral-800">{t.name}</td>
                <td className="py-2 pr-4">
                  {TABLE_TYPES.find((x) => x.value === t.type)?.label ?? t.type}
                </td>
                <td className="py-2 pr-4">{t.zone || <span className="text-neutral-400">—</span>}</td>
                <td className="py-2 pr-4 text-right">{t.capacity}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status]}`}
                  >
                    {TABLE_STATUSES.find((x) => x.value === t.status)?.label ?? t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="p-10 text-center text-sm text-neutral-500">
            {query.trim()
              ? `No table matches "${query}".`
              : 'No tables yet — hit Create to add the first one.'}
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
              Are you sure you want to delete{' '}
              {checked.size === 1 ? 'this table' : `these ${checked.size} tables`}?{' '}
              {checked.size === 1 ? 'It disappears' : 'They disappear'} from the POS floor
              immediately; past orders keep their history.
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
// Create/edit form — name, section type, seat count and (rarely) a manual
// status correction.
// ---------------------------------------------------------------------------

function TableForm({
  table,
  onBack,
  onSaved,
}: {
  table?: ApiTable
  onBack: () => void
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState(table?.name ?? '')
  const [type, setType] = useState<TableType>(table?.type ?? 'normal')
  const [zone, setZone] = useState(table?.zone ?? '')
  const [posX, setPosX] = useState(table?.pos_x != null ? String(table.pos_x) : '')
  const [posY, setPosY] = useState(table?.pos_y != null ? String(table.pos_y) : '')
  const [shape, setShape] = useState<TableShape | ''>(table?.shape ?? '')
  const [capacity, setCapacity] = useState(table ? String(table.capacity) : '6')
  const [status, setStatus] = useState<TableStatus>(table?.status ?? 'available')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (saving) return
    if (!name.trim()) {
      setError('The table name is required.')
      return
    }
    const seats = Number.parseInt(capacity, 10)
    if (!Number.isFinite(seats) || seats < 1) {
      setError('Seats must be at least 1.')
      return
    }
    const px = posX.trim() === '' ? null : Number(posX)
    const py = posY.trim() === '' ? null : Number(posY)
    for (const value of [px, py]) {
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
        setError('Position X and Y are percentages — between 0 and 100.')
        return
      }
    }
    const input: TableInput = {
      name: name.trim(),
      type,
      zone: zone.trim() || null,
      pos_x: px,
      pos_y: py,
      shape: shape || null,
      capacity: seats,
      status,
    }
    setSaving(true)
    setError(null)
    try {
      if (table) await updateTable(table.id, input)
      else await createTable(input)
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
            Tables
          </button>
          <span className="text-neutral-400"> / </span>
          <span>{table ? table.name : 'New'}</span>
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
          <div className="text-[13px] font-bold text-neutral-800">Table Name</div>
          <input
            placeholder="e.g. B5 or VIP 2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mt-1 w-[56%] min-w-72 rounded-[2px] border border-neutral-300 ${FIELD_BG} px-3 py-1.5 text-[22px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-sky-600`}
          />

          <div className="mt-6 grid grid-cols-1 gap-x-16 gap-y-3 xl:grid-cols-2">
            <FieldGroup>
              <label className={LABEL}>Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TableType)}
                className={BLUE_SELECT}
              >
                {TABLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>

              <label className={LABEL}>Seats</label>
              <input
                inputMode="numeric"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 4"
                className={`${TEXT_INPUT} max-w-40`}
              />

              <label className={LABEL}>Floor</label>
              <input
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="e.g. BKK Eat In"
                className={TEXT_INPUT}
              />
            </FieldGroup>

            <FieldGroup>
              <label className={LABEL}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TableStatus)}
                className={BLUE_SELECT}
              >
                {TABLE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>

              <label className={LABEL}>Position X (%)</label>
              <input
                inputMode="decimal"
                value={posX}
                onChange={(e) => setPosX(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="e.g. 25 — empty = plain grid"
                className={`${TEXT_INPUT} max-w-40`}
              />

              <label className={LABEL}>Position Y (%)</label>
              <input
                inputMode="decimal"
                value={posY}
                onChange={(e) => setPosY(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="e.g. 50 — empty = plain grid"
                className={`${TEXT_INPUT} max-w-40`}
              />

              <label className={LABEL}>Shape</label>
              <select
                value={shape}
                onChange={(e) => setShape(e.target.value as TableShape | '')}
                className={BLUE_SELECT}
              >
                {TABLE_SHAPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </FieldGroup>
          </div>

          <p className="mt-8 border-t border-neutral-200 pt-4 text-[12.5px] italic text-neutral-500">
            VIP tables show in the floor's VIP section; everything else lands in Dine-in. Tables
            sharing a Floor name become a tab of their own on the POS screen (leave it empty for
            the classic one-screen floor). Status normally flips on its own during service — only
            correct it here when a table is stuck.
          </p>
        </div>
      </div>
    </div>
  )
}
