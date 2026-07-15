import { useState } from 'react'
import { Loader } from '../../components/ui/Loader'
import Modal from '../../components/ui/Modal'
import { ApiError } from '../../services/api/client'
import {
  createPaymentMethod,
  updatePaymentMethod,
  PAY_CHANNELS,
  type PaymentMethodRow,
  type PaymentMethodInput,
} from '../../services/api/paymentMethods'
import type { PayMethodBackend } from '../../services/api/payments'

const inputCls =
  'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20'

/** Create / edit a payment journal. Pass `method` to edit, omit it to create. */
export default function PaymentMethodDialog({
  method,
  onClose,
  onSaved,
}: {
  method?: PaymentMethodRow | null
  onClose: () => void
  onSaved: (method: PaymentMethodRow) => void
}) {
  const editing = Boolean(method)
  const [label, setLabel] = useState(method?.label ?? '')
  const [channel, setChannel] = useState<PayMethodBackend>(method?.channel ?? 'cash')
  const [sortOrder, setSortOrder] = useState(String(method?.sort_order ?? 0))
  const [active, setActive] = useState(method?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!label.trim()) return setError('Please enter a label.')

    setSaving(true)
    setError('')
    const payload: PaymentMethodInput = {
      label: label.trim(),
      channel,
      is_active: active,
      sort_order: Number(sortOrder) || 0,
    }
    try {
      const saved =
        method != null
          ? await updatePaymentMethod(method.id, payload)
          : await createPaymentMethod(payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the payment method.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? 'Edit Payment Method' : 'Add Payment Method'}
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
            form="payment-method-form"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark disabled:opacity-60"
          >
            {saving && <Loader size="sm" />}
            {editing ? 'Save Changes' : 'Add Method'}
          </button>
        </div>
      }
    >
      <form id="payment-method-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Cash USD"
            className={inputCls}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Channel</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as PayMethodBackend)}
              className={inputCls}
            >
              {PAY_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-400">How the recorded payment is categorised.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Sort order</label>
            <input
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              className={inputCls}
            />
          </div>
        </div>

        <label className="flex cursor-pointer select-none items-center justify-between rounded-xl border border-neutral-200 px-3.5 py-3">
          <span className="text-sm font-semibold text-neutral-700">Show on the payment screen</span>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="peer sr-only"
          />
          <span className="relative h-6 w-11 rounded-full bg-neutral-300 transition peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
        </label>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  )
}
