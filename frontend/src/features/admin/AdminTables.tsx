import { useCallback, useEffect, useState } from 'react'
import { LuLayoutGrid, LuPencil, LuPlus, LuTrash2, LuUsers } from 'react-icons/lu'
import {
  deleteTable,
  fetchTables,
  type ApiTable,
  type TableStatus,
} from '../../services/api/tables'
import { ApiError } from '../../services/api/client'
import { LoadingPanel, ErrorPanel } from './AdminStates'
import TableDialog from './TableDialog'
import ConfirmDialog from './ConfirmDialog'

const STATUS_STYLE: Record<TableStatus, string> = {
  available: 'bg-emerald-100 text-emerald-700',
  occupied: 'bg-rose-100 text-rose-700',
  reserved: 'bg-amber-100 text-amber-700',
}

const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100'

export default function AdminTables() {
  const [tables, setTables] = useState<ApiTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [dialog, setDialog] = useState<{ table?: ApiTable } | null>(null)
  const [confirm, setConfirm] = useState<ApiTable | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setTables(await fetchTables())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tables.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function upsert(saved: ApiTable) {
    setTables((prev) => {
      const i = prev.findIndex((x) => x.id === saved.id)
      const next = i === -1 ? [...prev, saved] : prev.map((x) => (x.id === saved.id ? saved : x))
      return next.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    })
  }

  async function handleDelete() {
    if (!confirm) return
    await deleteTable(confirm.id)
    setTables((prev) => prev.filter((x) => x.id !== confirm.id))
    setConfirm(null)
  }

  if (loading) return <LoadingPanel label="Loading tables…" />
  if (error) return <ErrorPanel message={error} onRetry={() => void load()} />

  return (
    <div className="p-8">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          Physical dining tables shown on the POS floor. Take-away slots are automatic.
        </p>
        <button
          type="button"
          onClick={() => setDialog({})}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark"
        >
          <LuPlus className="h-4 w-4" />
          Add Table
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-neutral-400">
            <LuLayoutGrid className="h-8 w-8" />
            <p className="text-sm">No tables yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Seats</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {tables.map((t) => (
                <tr key={t.id} className="text-neutral-700">
                  <td className="px-5 py-3 font-semibold text-neutral-900">{t.name}</td>
                  <td className="px-5 py-3">
                    {t.type === 'vip' ? (
                      <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                        VIP
                      </span>
                    ) : (
                      <span className="text-neutral-500">Normal</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 text-neutral-600">
                      <LuUsers className="h-4 w-4 text-neutral-400" />
                      {t.capacity}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[t.status]}`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label="Edit table"
                        onClick={() => setDialog({ table: t })}
                        className={iconBtn}
                      >
                        <LuPencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete table"
                        onClick={() => setConfirm(t)}
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

      {dialog && (
        <TableDialog
          table={dialog.table}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            upsert(saved)
            setDialog(null)
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title="Delete table"
          message={`Delete "${confirm.name}"? This can't be undone.`}
          onConfirm={handleDelete}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
