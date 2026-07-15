import { useState } from 'react'
import { LuDelete } from 'react-icons/lu'
import Modal from './Modal'

// Odoo-style numeric popup: a big live value plus a keypad, returning a number.
// Used for whole-number entry (guest count) and percentages (global discount).
export default function NumberPadDialog({
  title,
  subtitle,
  initialValue,
  integer = false,
  min = 0,
  max,
  suffix,
  confirmLabel = 'Confirm',
  onClose,
  onConfirm,
}: {
  title: string
  subtitle?: string
  initialValue: number
  /** Disallow the decimal key and round the result (e.g. guest count). */
  integer?: boolean
  min?: number
  max?: number
  suffix?: string
  confirmLabel?: string
  onClose: () => void
  onConfirm: (value: number) => void
}) {
  // `null` entry means "still showing the prefill" — the first digit replaces it.
  const [entry, setEntry] = useState<string | null>(null)
  const shown = entry ?? String(initialValue)

  const keys = integer
    ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'del']
    : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']

  function press(key: string) {
    const current = entry ?? String(initialValue)
    if (key === 'C') return setEntry('0')
    if (key === 'del') return setEntry((current.slice(0, -1) || '0'))
    if (key === '.') return setEntry(current.includes('.') ? current : `${current}.`)
    setEntry((entry === null ? '' : current) + key)
  }

  function confirm() {
    let value = Number(shown)
    if (!Number.isFinite(value)) value = min
    if (integer) value = Math.round(value)
    if (min != null) value = Math.max(min, value)
    if (max != null) value = Math.min(max, value)
    onConfirm(value)
  }

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      width="max-w-sm"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-300 py-3 font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="flex-1 rounded-xl bg-[#2b2138] py-3 font-semibold text-white shadow-sm transition hover:bg-[#37294a]"
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="mb-4 flex items-baseline justify-center gap-2 rounded-xl bg-neutral-50 py-6">
        <span className="text-5xl font-bold tabular-nums text-neutral-900">{shown}</span>
        {suffix && <span className="text-xl font-semibold text-neutral-400">{suffix}</span>}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className="flex h-14 items-center justify-center rounded-xl border border-neutral-200 bg-white text-xl font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50 active:scale-[0.98]"
          >
            {key === 'del' ? <LuDelete className="h-6 w-6" /> : key}
          </button>
        ))}
      </div>
    </Modal>
  )
}
