import { useCallback, useEffect, useState } from 'react'
import { LuPencil, LuPlus, LuTrash2, LuWallet } from 'react-icons/lu'
import {
  deletePaymentMethod,
  fetchPaymentMethods,
  updatePaymentMethod,
  type PaymentMethodRow,
} from '../../services/api/paymentMethods'
import { ApiError } from '../../services/api/client'
import { LoadingPanel, ErrorPanel } from './AdminStates'
import PaymentMethodDialog from './PaymentMethodDialog'
import ConfirmDialog from './ConfirmDialog'

const CHANNEL_STYLE: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-700',
  aba_qr: 'bg-sky-100 text-sky-700',
  khqr: 'bg-violet-100 text-violet-700',
  card: 'bg-amber-100 text-amber-700',
}

const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100'

export default function AdminPaymentMethods() {
  const [methods, setMethods] = useState<PaymentMethodRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banner, setBanner] = useState('')

  const [dialog, setDialog] = useState<{ method?: PaymentMethodRow } | null>(null)
  const [confirm, setConfirm] = useState<PaymentMethodRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setMethods(await fetchPaymentMethods())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load payment methods.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function upsert(saved: PaymentMethodRow) {
    setMethods((prev) => {
      const i = prev.findIndex((x) => x.id === saved.id)
      const next = i === -1 ? [...prev, saved] : prev.map((x) => (x.id === saved.id ? saved : x))
      return next.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    })
  }

  async function toggleActive(method: PaymentMethodRow) {
    const next = !method.is_active
    setMethods((prev) => prev.map((x) => (x.id === method.id ? { ...x, is_active: next } : x)))
    setBanner('')
    try {
      await updatePaymentMethod(method.id, { is_active: next })
    } catch (err) {
      setMethods((prev) =>
        prev.map((x) => (x.id === method.id ? { ...x, is_active: method.is_active } : x)),
      )
      setBanner(err instanceof ApiError ? err.message : 'Could not update the method.')
    }
  }

  async function handleDelete() {
    if (!confirm) return
    await deletePaymentMethod(confirm.id)
    setMethods((prev) => prev.filter((x) => x.id !== confirm.id))
    setConfirm(null)
  }

  if (loading) return <LoadingPanel label="Loading payment methods…" />
  if (error) return <ErrorPanel message={error} onRetry={() => void load()} />

  return (
    <div className="p-8">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          Journals shown on the cashier Payment screen, in order.
        </p>
        <button
          type="button"
          onClick={() => setDialog({})}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark"
        >
          <LuPlus className="h-4 w-4" />
          Add Method
        </button>
      </div>

      {banner && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{banner}</p>}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {methods.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-neutral-400">
            <LuWallet className="h-8 w-8" />
            <p className="text-sm">No payment methods yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-5 py-3 font-semibold">#</th>
                <th className="px-5 py-3 font-semibold">Label</th>
                <th className="px-5 py-3 font-semibold">Channel</th>
                <th className="px-5 py-3 text-center font-semibold">Shown</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {methods.map((m) => (
                <tr key={m.id} className="text-neutral-700">
                  <td className="px-5 py-3 text-neutral-400">{m.sort_order}</td>
                  <td className="px-5 py-3 font-semibold text-neutral-900">{m.label}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        CHANNEL_STYLE[m.channel] ?? 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {m.channel}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={m.is_active}
                        aria-label="Toggle visibility"
                        onClick={() => void toggleActive(m)}
                        className={`relative h-6 w-11 rounded-full transition ${
                          m.is_active ? 'bg-primary' : 'bg-neutral-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                            m.is_active ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label="Edit method"
                        onClick={() => setDialog({ method: m })}
                        className={iconBtn}
                      >
                        <LuPencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete method"
                        onClick={() => setConfirm(m)}
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
        <PaymentMethodDialog
          method={dialog.method}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            upsert(saved)
            setDialog(null)
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title="Delete payment method"
          message={`Delete "${confirm.label}"? It will disappear from the Payment screen.`}
          onConfirm={handleDelete}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
