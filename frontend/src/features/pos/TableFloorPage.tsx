import { useEffect, useState } from 'react'
import {
  LuArrowLeftRight,
  LuClipboardList,
  LuCrown,
  LuLock,
  LuPower,
  LuRefreshCw,
  LuShoppingBag,
  LuUserCheck,
  LuUsers,
  LuUtensilsCrossed,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import type { Cashier } from '../auth/CashierLoginDialog'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import CashInOutDialog, { type CashMovement } from './CashInOutDialog'
import { LoadingState } from '../../components/ui/Loader'
import { useSettings } from '../../hooks/useSettings'
import { useTables } from '../../hooks/useTables'
import {
  createCashMovement,
  fetchCashMovements,
  type ApiCashMovement,
} from '../../services/api/cashMovements'
import { ApiError } from '../../services/api/client'

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export type Section = 'dine-in' | 'vip' | 'takeaway'

export type PosTable = {
  id: string
  /** Numeric id of the table row in the backend; absent for take-away slots. */
  backendId?: number
  /** Slot number of a take-away card (T1 = 1); absent on real tables. */
  takeawaySlot?: number
  label: string
  seats: number
  /** Guests currently seated — numerator of the bottom pill. */
  guests: number
  /** Active orders on the table — shown as a red corner badge when > 0. */
  orders: number
  /** Take-away only: the bill running on this slot, so the card can show it. */
  openOrderNumber?: string
  openOrderTotal?: number
  section: Section
}

const SECTION_UI: Record<Section, { card: string; ring: string }> = {
  'dine-in': { card: 'bg-[#4caf50] hover:bg-[#43a047]', ring: 'focus-visible:ring-[#4caf50]' },
  vip: { card: 'bg-[#f0a11e] hover:bg-[#e0940f]', ring: 'focus-visible:ring-[#f0a11e]' },
  takeaway: { card: 'bg-[#5c6bc0] hover:bg-[#5061b8]', ring: 'focus-visible:ring-[#5c6bc0]' },
}

/** A take-away slot with a bill running on it — darker, like a seated table. */
const TAKEAWAY_BUSY_UI = {
  card: 'bg-[#3949ab] hover:bg-[#303f9f]',
  ring: 'focus-visible:ring-[#3949ab]',
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function HeaderAction({
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  icon: IconType
  label: string
  badge?: number
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex items-center gap-2 rounded-lg px-3 py-2 text-white/90 transition hover:bg-white/10"
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm font-medium">{label}</span>
      {badge ? (
        <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

function HeaderIconButton({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: IconType
  label: string
  onClick?: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-[68px] flex-col items-center gap-0.5 rounded-lg py-1.5 transition hover:bg-white/10 ${
        danger ? 'text-white/85 hover:text-rose-300' : 'text-white/85 hover:text-white'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  )
}

function HeaderBar({
  cashierName,
  activeOrders,
  onCashInOut,
  onLogout,
}: {
  cashierName: string
  activeOrders: number
  onCashInOut: () => void
  onLogout: () => void
}) {
  return (
    <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-[#2b2138] px-4 shadow-md">
      {/* Left: brand + primary actions */}
      <div className="flex items-center gap-1">
        <ElevenOneLogo />
        <div className="mx-3 h-8 w-px bg-white/15" />
        <HeaderAction icon={LuArrowLeftRight} label="Cash In/Out" onClick={onCashInOut} />
        <HeaderAction icon={LuClipboardList} label="Orders" badge={activeOrders} />
      </div>

      {/* Center: signed-in cashier */}
      <div className="flex items-center gap-2.5 text-white">
        <LuUserCheck className="h-5 w-5 text-emerald-300" />
        <div className="leading-tight">
          <div className="text-[11px] uppercase tracking-wide text-white/55">Cashier</div>
          <div className="text-sm font-semibold">{cashierName}</div>
        </div>
      </div>

      {/* Right: session controls — all three exit the register (back to the
          dashboard when it was opened from the admin side, login otherwise) */}
      <div className="flex items-center justify-end gap-1">
        <HeaderIconButton icon={LuRefreshCw} label="Reload" onClick={onLogout} />
        <div className="h-8 w-px bg-white/15" />
        <HeaderIconButton icon={LuLock} label="Lock" onClick={onLogout} />
        <div className="h-8 w-px bg-white/15" />
        <HeaderIconButton icon={LuPower} label="Close" onClick={onLogout} danger />
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------

export function SectionHeading({ icon: Icon, title, color }: { icon: IconType; title: string; color: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <Icon className="h-5 w-5" style={{ color }} />
      <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">{title}</h2>
    </div>
  )
}

export function TableCard({ table, onSelect }: { table: PosTable; onSelect: (table: PosTable) => void }) {
  const isTakeaway = table.section === 'takeaway'
  // A take-away slot is "busy" when a bill is running on it — the equivalent of
  // a seated table, so it gets the same darker card and a badge.
  const busyTakeaway = isTakeaway && table.orders > 0
  const ui = busyTakeaway ? TAKEAWAY_BUSY_UI : SECTION_UI[table.section]
  const seated = table.guests > 0
  // More guests than seats (e.g. 5/4) — make the pill stand out as a warning.
  const overfull = !isTakeaway && table.guests > table.seats

  // Take-away carries no seats or guests; show the running bill instead, so the
  // cashier can see at a glance which slot has an order waiting and for how much.
  const orderTag = table.openOrderNumber ? `#${table.openOrderNumber.slice(-4)}` : '-'
  const topLine = isTakeaway ? orderTag : table.seats
  const bottomLine = isTakeaway
    ? table.openOrderTotal != null
      ? `$${table.openOrderTotal.toFixed(2)}`
      : '-'
    : `${table.guests}/${table.seats}`

  return (
    <button
      type="button"
      onClick={() => onSelect(table)}
      className={`group relative flex min-h-[104px] flex-col justify-between rounded-xl p-3 text-left text-white shadow-sm outline-none transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 ${ui.card} ${ui.ring}`}
    >
      {table.orders > 0 && (
        <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white shadow ring-2 ring-white">
          {table.orders}
        </span>
      )}

      <div>
        <span className="block text-2xl font-bold leading-none">{table.label}</span>
        <span className="mt-2 flex items-center gap-1.5 text-sm font-medium text-white/90">
          {isTakeaway ? <LuShoppingBag className="h-4 w-4" /> : <LuUsers className="h-4 w-4" />}
          {topLine}
        </span>
      </div>

      <span
        className={`mt-2 rounded-md py-1 text-center text-sm font-semibold ${
          overfull ? 'bg-rose-600/90' : seated || busyTakeaway ? 'bg-black/25' : 'bg-black/15'
        }`}
      >
        {bottomLine}
      </span>
    </button>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3.5 w-3.5 rounded" style={{ backgroundColor: color }} />
      <span className="text-neutral-600">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Map an API drawer row onto the dialog's display shape. */
function toMovement(m: ApiCashMovement): CashMovement {
  return {
    id: String(m.id),
    type: m.type,
    amount: Number(m.amount),
    reason: m.reason,
    time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cashier: m.user?.name ?? '—',
  }
}

export default function TableFloorPage({
  cashier,
  onSelectTable,
  onLogout,
}: {
  cashier: Cashier
  onSelectTable: (table: PosTable) => void
  onLogout: () => void
}) {
  // Poll every 5s so this floor stays in sync with the waiter tablets as tables
  // are seated/freed elsewhere.
  const { tables, loading, error, reload } = useTables(5000)
  const floor = tables ?? []
  const dineIn = floor.filter((t) => t.section === 'dine-in')
  const vip = floor.filter((t) => t.section === 'vip')
  const takeaway = floor.filter((t) => t.section === 'takeaway')
  const activeOrders = floor.reduce((sum, t) => sum + t.orders, 0)

  // Cash drawer — the log lives on the server so every terminal sees the same
  // day and each movement is audited; the opening float is an admin setting.
  const { openingFloat } = useSettings()
  const [cashOpen, setCashOpen] = useState(false)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [drawerError, setDrawerError] = useState<string | null>(null)

  // Refresh the day's log every time the drawer opens, so movements recorded
  // on another terminal are already in the list.
  useEffect(() => {
    if (!cashOpen) return
    let alive = true
    setDrawerError(null)
    fetchCashMovements()
      .then((rows) => alive && setMovements(rows.map(toMovement)))
      .catch((e: unknown) => {
        if (alive) setDrawerError(e instanceof ApiError ? e.message : 'Could not load the drawer log.')
      })
    return () => {
      alive = false
    }
  }, [cashOpen])

  async function recordMovement(m: Omit<CashMovement, 'id' | 'time' | 'cashier'>) {
    setDrawerError(null)
    try {
      const created = await createCashMovement({ type: m.type, amount: m.amount, reason: m.reason })
      setMovements((prev) => [...prev, toMovement(created)])
    } catch (e: unknown) {
      setDrawerError(
        e instanceof ApiError ? e.message : 'Not recorded — the server could not be reached.',
      )
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[#eef0f3]">
      <HeaderBar
        cashierName={cashier.name}
        activeOrders={activeOrders}
        onCashInOut={() => setCashOpen(true)}
        onLogout={onLogout}
      />

      {loading && (
        <main className="flex flex-1 items-center justify-center">
          <LoadingState label="Loading tables…" />
        </main>
      )}

      {error && (
        <main className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-rose-500">{error}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
          >
            <LuRefreshCw className="h-4 w-4" />
            Retry
          </button>
        </main>
      )}

      {!loading && !error && (
      <main className="flex flex-1 overflow-auto p-6">
        {/* Dine-in */}
        <section className="flex-1 pr-6">
          <SectionHeading icon={LuUtensilsCrossed} title="Dine In (Tables)" color="#5b6470" />
          <div className="grid grid-cols-4 gap-3.5">
            {dineIn.map((table) => (
              <TableCard key={table.id} table={table} onSelect={onSelectTable} />
            ))}
          </div>
        </section>

        {/* VIP + Take away */}
        <aside className="flex w-[42%] min-w-[340px] flex-col gap-7 border-l border-neutral-200 pl-6">
          <section>
            <SectionHeading icon={LuCrown} title="VIP Tables" color="#f0a11e" />
            <div className="grid grid-cols-4 gap-3.5">
              {vip.map((table) => (
                <TableCard key={table.id} table={table} onSelect={onSelectTable} />
              ))}
            </div>
          </section>

          <section>
            <SectionHeading icon={LuShoppingBag} title="Take Away / Delivery" color="#5c6bc0" />
            <div className="grid grid-cols-4 gap-3.5">
              {takeaway.map((table) => (
                <TableCard key={table.id} table={table} onSelect={onSelectTable} />
              ))}
            </div>
          </section>
        </aside>
      </main>
      )}

      <footer className="flex shrink-0 items-center justify-between border-t border-neutral-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6 text-sm">
          <LegendItem color="#4caf50" label="Available" />
          <LegendItem color="#f0a11e" label="Occupied" />
          <LegendItem color="#5c6bc0" label="Take Away / Delivery" />
        </div>
        <div className="text-right">
          <div className="text-sm">
            <span className="text-neutral-500">Active Orders: </span>
            <span className="font-bold text-primary">{activeOrders}</span>
          </div>
        </div>
      </footer>

      {cashOpen && (
        <CashInOutDialog
          movements={movements}
          openingFloat={openingFloat}
          error={drawerError}
          onSubmit={(m) => void recordMovement(m)}
          onClose={() => setCashOpen(false)}
        />
      )}
    </div>
  )
}
