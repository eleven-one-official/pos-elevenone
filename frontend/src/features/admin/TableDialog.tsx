import { useState } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import Modal from '../../components/ui/Modal'
import { ApiError } from '../../services/api/client'
import {
  createTable,
  updateTable,
  type ApiTable,
  type TableInput,
  type TableStatus,
  type TableType,
} from '../../services/api/tables'

const inputCls =
  'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20'

const TYPES: { value: TableType; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'vip', label: 'VIP' },
]

const STATUSES: { value: TableStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
]

/** Create / edit a dining table. Pass `table` to edit, omit it to create. */
export default function TableDialog({
  table,
  onClose,
  onSaved,
}: {
  table?: ApiTable | null
  onClose: () => void
  onSaved: (table: ApiTable) => void
}) {
  const editing = Boolean(table)
  const [name, setName] = useState(table?.name ?? '')
  const [type, setType] = useState<TableType>(table?.type ?? 'normal')
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 4))
  const [status, setStatus] = useState<TableStatus>(table?.status ?? 'available')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!name.trim()) return setError('Please enter a table name.')

    setSaving(true)
    setError('')
    const payload: TableInput = {
      name: name.trim(),
      type,
      capacity: Number(capacity) || 1,
      status,
    }
    try {
      const saved =
        table != null ? await updateTable(table.id, payload) : await createTable(payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the table.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? 'Edit Table' : 'Add Table'}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="table-form"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark disabled:opacity-60"
          >
            {saving && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            {editing ? 'Save Changes' : 'Add Table'}
          </button>
        </div>
      }
    >
      <form id="table-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. T1 or VIP 2"
            className={inputCls}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TableType)}
              className={inputCls}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Seats</label>
            <input
              value={capacity}
              onChange={(e) => setCapacity(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TableStatus)}
            className={inputCls}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-400">
            Usually managed automatically by the POS floor during service.
          </p>
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  )
}
