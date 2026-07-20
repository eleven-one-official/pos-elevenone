import { useMemo, useState } from 'react'
import { LuArrowDownLeft, LuArrowUpRight, LuDelete, LuWallet } from 'react-icons/lu'
import Modal from '../../components/ui/Modal'

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type CashMovementType = 'in' | 'out'

export type CashMovement = {
  id: string
  type: CashMovementType
  amount: number
  reason: string
  /** Pre-formatted clock time, e.g. "02:14 PM". */
  time: string
  cashier: string
}

const money = (n: number) => `$ ${n.toFixed(2)}`

// Reason chips offered per movement type (Odoo's typical cash-move reasons).
const REASON_PRESETS: Record<CashMovementType, string[]> = {
  in: ['Opening float', 'Change added', 'Owner deposit', 'Correction'],
  out: ['Supplier payment', 'Petty cash', 'Bank drop', 'Refund', 'Correction'],
}

const NUMPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export default function CashInOutDialog({
  movements,
  openingFloat,
  error,
  onSubmit,
  onClose,
}: {
  movements: CashMovement[]
  /** Drawer balance at open of day — an admin setting. */
  openingFloat: number
  /** Server failure loading or recording — shown until the next action. */
  error?: string | null
  onSubmit: (movement: Omit<CashMovement, 'id' | 'time' | 'cashier'>) => void
  onClose: () => void
}) {
  const [type, setType] = useState<CashMovementType>('in')
  const [entry, setEntry] = useState('')
  const [reason, setReason] = useState('')

  const amount = Number(entry || '0')
  const valid = amount > 0 && Number.isFinite(amount)

  // Running drawer balance: opening float plus every recorded movement.
  const balance = useMemo(
    () =>
      movements.reduce(
        (sum, m) => sum + (m.type === 'in' ? m.amount : -m.amount),
        openingFloat,
      ),
    [movements, openingFloat],
  )

  const isIn = type === 'in'
  const accent = isIn
    ? { text: 'text-emerald-600', bg: 'bg-emerald-600 hover:bg-emerald-700', soft: 'bg-emerald-50 text-emerald-700 ring-emerald-300' }
    : { text: 'text-rose-600', bg: 'bg-rose-600 hover:bg-rose-700', soft: 'bg-rose-50 text-rose-700 ring-rose-300' }

  function switchType(next: CashMovementType) {
    setType(next)
    setReason('')
  }

  function press(key: string) {
    if (key === 'del') return setEntry((cur) => cur.slice(0, -1))
    if (key === '.') return setEntry((cur) => (cur.includes('.') ? cur : `${cur || '0'}.`))
    // Cap at two decimal places — it's a money amount.
    setEntry((cur) => {
      const next = cur + key
      const dot = next.indexOf('.')
      if (dot !== -1 && next.length - dot > 3) return cur
      return next.replace(/^0+(?=\d)/, '')
    })
  }

  function confirm() {
    if (!valid) return
    onSubmit({ type, amount, reason: reason.trim() || REASON_PRESETS[type][0] })
    // Keep the dialog open so the cashier sees the drawer update, ready for the
    // next movement.
    setEntry('')
    setReason('')
  }

  return (
    <Modal
      title="Cash In / Out"
      subtitle="Record money added to or removed from the drawer"
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-neutral-500">
            {isIn ? 'Adding to drawer' : 'Removing from drawer'}
            <span className={`ml-1.5 text-lg font-bold ${valid ? accent.text : 'text-neutral-300'}`}>
              {isIn ? '+' : '−'}
              {money(amount)}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-300 px-5 py-3 font-semibold text-neutral-700 transition hover:bg-neutral-100"
            >
              Done
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!valid}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${accent.bg}`}
            >
              {isIn ? <LuArrowDownLeft className="h-5 w-5" /> : <LuArrowUpRight className="h-5 w-5" />}
              Confirm Cash {isIn ? 'In' : 'Out'}
            </button>
          </div>
        </div>
      }
    >
      {error && (
        <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-5">
        {/* Left — type, amount, numpad */}
        <div>
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => switchType('in')}
              className={`flex items-center justify-center gap-2 rounded-xl border py-3 font-semibold transition ${
                isIn
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              <LuArrowDownLeft className="h-5 w-5" />
              Cash In
            </button>
            <button
              type="button"
              onClick={() => switchType('out')}
              className={`flex items-center justify-center gap-2 rounded-xl border py-3 font-semibold transition ${
                !isIn
                  ? 'border-rose-500 bg-rose-50 text-rose-700'
                  : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              <LuArrowUpRight className="h-5 w-5" />
              Cash Out
            </button>
          </div>

          {/* Amount display */}
          <div className="mt-3 flex items-baseline justify-center gap-1 rounded-xl bg-neutral-50 py-5">
            <span className={`text-2xl font-semibold ${accent.text}`}>{isIn ? '+' : '−'} $</span>
            <span className="text-4xl font-bold tabular-nums text-neutral-900">
              {entry === '' ? '0.00' : entry}
            </span>
          </div>

          {/* Numpad */}
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {NUMPAD.map((key) => (
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
        </div>

        {/* Right — balance, reason, history */}
        <div className="flex flex-col">
          {/* Drawer balance */}
          <div className="flex items-center gap-3 rounded-xl bg-[#2b2138] px-4 py-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
              <LuWallet className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <div className="text-[11px] uppercase tracking-wide text-white/55">Cash in drawer</div>
              <div className="text-xl font-bold tabular-nums">{money(balance)}</div>
            </div>
          </div>

          {/* Reason */}
          <div className="mt-4">
            <label className="text-xs font-bold uppercase tracking-wide text-neutral-400">Reason</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {REASON_PRESETS[type].map((preset) => {
                const active = reason === preset
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(active ? '' : preset)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? `${accent.soft} ring-1`
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    {preset}
                  </button>
                )
              })}
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Or type a reason…"
              className="mt-2.5 h-10 w-full rounded-xl border border-neutral-200 px-3 text-sm text-neutral-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Recent movements */}
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-400">
              Today’s movements
            </h3>
            <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
              {movements.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 py-6 text-center text-sm text-neutral-400">
                  No cash moved yet
                </p>
              ) : (
                [...movements]
                  .reverse()
                  .map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-md ${
                            m.type === 'in' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                          }`}
                        >
                          {m.type === 'in' ? (
                            <LuArrowDownLeft className="h-3.5 w-3.5" />
                          ) : (
                            <LuArrowUpRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-neutral-800">{m.reason}</span>
                          <span className="block text-xs text-neutral-400">{m.time}</span>
                        </span>
                      </span>
                      <span
                        className={`shrink-0 font-semibold tabular-nums ${
                          m.type === 'in' ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {m.type === 'in' ? '+' : '−'}
                        {money(m.amount)}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
