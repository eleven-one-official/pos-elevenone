import { useEffect, useState } from 'react'
import {
  LuArrowLeftRight,
  LuBike,
  LuClipboardList,
  LuCrown,
  LuLock,
  LuPower,
  LuPrinter,
  LuRefreshCw,
  LuShoppingBag,
  LuUserCheck,
  LuUsers,
  LuUtensilsCrossed,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import type { Cashier } from '../auth/CashierLoginDialog'
import { fetchBranches } from '../../services/api/branches'
import { getBranchId } from '../../services/api/client'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import ZoomControl from '../../components/ui/ZoomControl'
import Toast from '../../components/ui/Toast'
import CashInOutDialog, { type CashMovement } from './CashInOutDialog'
import OrdersHistoryPage from './OrdersHistoryPage'
import { printSummary } from './printSummary'
import { LoadingState } from '../../components/ui/Loader'
import { useSettings } from '../../hooks/useSettings'
import { useTables } from '../../hooks/useTables'
import {
  createCashMovement,
  fetchCashMovements,
  type ApiCashMovement,
} from '../../services/api/cashMovements'
import { fetchDailySummary } from '../../services/api/reports'
import { ApiError } from '../../services/api/client'

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export type Section = 'dine-in' | 'vip' | 'takeaway' | 'delivery'

export type PosTable = {
  id: string
  /** Numeric id of the table row in the backend; absent for slot cards. */
  backendId?: number
  /** Slot number of a take-away/delivery card (T1/D1 = 1); absent on real tables. */
  takeawaySlot?: number
  /** Floor tab this table shows under (e.g. "BKK Eat In"); absent = classic floor. */
  zone?: string
  /** Spot on the floor-plan canvas (% of its width/height); absent = plain grid. */
  posX?: number
  posY?: number
  /** Card shape on the canvas: double-width room, garden pill, full-height pill. */
  shape?: 'wide' | 'round' | 'tall'
  label: string
  seats: number
  /** Guests currently seated — numerator of the bottom pill. */
  guests: number
  /** Active orders on the table — shown as a red corner badge when > 0. */
  orders: number
  /** Slot cards only: the bill running on this slot, so the card can show it. */
  openOrderNumber?: string
  openOrderTotal?: number
  section: Section
}

const SECTION_UI: Record<Section, { card: string; ring: string }> = {
  'dine-in': { card: 'bg-[#4caf50] hover:bg-[#43a047]', ring: 'focus-visible:ring-[#4caf50]' },
  vip: { card: 'bg-[#f0a11e] hover:bg-[#e0940f]', ring: 'focus-visible:ring-[#f0a11e]' },
  takeaway: { card: 'bg-[#5c6bc0] hover:bg-[#5061b8]', ring: 'focus-visible:ring-[#5c6bc0]' },
  delivery: { card: 'bg-[#26a69a] hover:bg-[#1f978b]', ring: 'focus-visible:ring-[#26a69a]' },
}

/** A slot with a bill running on it — darker, like a seated table. */
const SLOT_BUSY_UI: Partial<Record<Section, { card: string; ring: string }>> = {
  takeaway: { card: 'bg-[#3949ab] hover:bg-[#303f9f]', ring: 'focus-visible:ring-[#3949ab]' },
  delivery: { card: 'bg-[#00796b] hover:bg-[#00695c]', ring: 'focus-visible:ring-[#00796b]' },
}

/** Take-away and delivery cards are order slots, not physical tables. */
export function isSlotSection(section: Section): boolean {
  return section === 'takeaway' || section === 'delivery'
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
  onOrders,
  onPrintSummary,
  onLogout,
}: {
  cashierName: string
  activeOrders: number
  onCashInOut: () => void
  onOrders: () => void
  onPrintSummary: () => void
  onLogout: () => void
}) {
  return (
    <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-[#2b2138] px-4 shadow-md">
      {/* Left: brand + primary actions */}
      <div className="flex items-center gap-1">
        <ElevenOneLogo />
        <div className="mx-3 h-8 w-px bg-white/15" />
        <HeaderAction icon={LuArrowLeftRight} label="Cash In/Out" onClick={onCashInOut} />
        {/* Invoice history — every order, searchable, with reprint. */}
        <HeaderAction icon={LuClipboardList} label="Orders" badge={activeOrders} onClick={onOrders} />
        {/* End-of-day X-report — today's sales + payment breakdown on an 80mm docket. */}
        <HeaderAction icon={LuPrinter} label="Print Summary" onClick={onPrintSummary} />
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
        <ZoomControl tone="dark" className="mr-2" />
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
  const isSlot = isSlotSection(table.section)
  // A slot is "busy" when a bill is running on it — the equivalent of a seated
  // table, so it gets the same darker card and a badge.
  const busySlot = isSlot && table.orders > 0
  const ui = (busySlot && SLOT_BUSY_UI[table.section]) || SECTION_UI[table.section]
  const seated = table.guests > 0
  // More guests than seats (e.g. 5/4) — make the pill stand out as a warning.
  const overfull = !isSlot && table.guests > table.seats

  // A slot carries no seats or guests; show the running bill instead, so the
  // cashier can see at a glance which card has an order waiting and for how much.
  const orderTag = table.openOrderNumber ? `#${table.openOrderNumber.slice(-4)}` : '-'
  const topLine = isSlot ? orderTag : table.seats
  const bottomLine = isSlot
    ? table.openOrderTotal != null
      ? `$${table.openOrderTotal.toFixed(2)}`
      : '-'
    : `${table.guests}/${table.seats}`

  // Garden pills and the long G12 read as their real-world shapes on the canvas.
  const pill = table.shape === 'round' || table.shape === 'tall'

  return (
    <button
      type="button"
      onClick={() => onSelect(table)}
      className={`group relative flex min-h-[104px] w-full flex-col justify-between text-left text-white shadow-sm outline-none transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 ${
        table.shape === 'tall' ? 'h-full' : ''
      } ${pill ? 'rounded-[44px] px-5 py-4' : 'rounded-xl p-3'} ${ui.card} ${ui.ring}`}
    >
      {table.orders > 0 && (
        <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white shadow ring-2 ring-white">
          {table.orders}
        </span>
      )}

      <div>
        <span className="block text-2xl font-bold leading-none">{table.label}</span>
        <span className="mt-2 flex items-center gap-1.5 text-sm font-medium text-white/90">
          {table.section === 'delivery' ? (
            <LuBike className="h-4 w-4" />
          ) : isSlot ? (
            <LuShoppingBag className="h-4 w-4" />
          ) : (
            <LuUsers className="h-4 w-4" />
          )}
          {topLine}
        </span>
      </div>

      <span
        className={`mt-2 rounded-md py-1 text-center text-sm font-semibold ${
          overfull ? 'bg-rose-600/90' : seated || busySlot ? 'bg-black/25' : 'bg-black/15'
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
// Floor body — the classic single screen, or Odoo-style floor tabs when the
// branch's tables carry zone names (BKK: "BKK Eat In" / "Eat In Gaden" plus
// the Take Out and Delivery slot tabs). Shared by the cashier and waiter
// floors so both read the same way.
// ---------------------------------------------------------------------------

/** The classic one-screen floor: dine-in left; VIP + slot sections right. */
function ClassicFloor({
  floor,
  onSelectTable,
}: {
  floor: PosTable[]
  onSelectTable: (table: PosTable) => void
}) {
  const dineIn = floor.filter((t) => t.section === 'dine-in')
  const vip = floor.filter((t) => t.section === 'vip')
  const takeaway = floor.filter((t) => t.section === 'takeaway')
  const delivery = floor.filter((t) => t.section === 'delivery')

  return (
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
          {/* With no Delivery section (TTP), the one slot section serves both. */}
          <SectionHeading
            icon={LuShoppingBag}
            title={delivery.length > 0 ? 'Take Away' : 'Take Away / Delivery'}
            color="#5c6bc0"
          />
          <div className="grid grid-cols-4 gap-3.5">
            {takeaway.map((table) => (
              <TableCard key={table.id} table={table} onSelect={onSelectTable} />
            ))}
          </div>
        </section>

        {delivery.length > 0 && (
          <section>
            <SectionHeading icon={LuBike} title="Delivery" color="#26a69a" />
            <div className="grid grid-cols-4 gap-3.5">
              {delivery.map((table) => (
                <TableCard key={table.id} table={table} onSelect={onSelectTable} />
              ))}
            </div>
          </section>
        )}
      </aside>
    </main>
  )
}

type FloorTab = { key: string; label: string; tables: PosTable[] }

/** Group the floor into tabs: one per zone (floor order), then the slot tabs. */
function buildTabs(floor: PosTable[], branchTag: string): FloorTab[] {
  const byZone = new Map<string, PosTable[]>()
  for (const t of floor) {
    if (isSlotSection(t.section)) continue
    const zone = t.zone ?? 'Eat In'
    const list = byZone.get(zone)
    if (list) list.push(t)
    else byZone.set(zone, [t])
  }

  const tabs: FloorTab[] = [...byZone].map(([zone, tables]) => ({
    key: `zone:${zone}`,
    label: zone,
    tables,
  }))

  const takeaway = floor.filter((t) => t.section === 'takeaway')
  const delivery = floor.filter((t) => t.section === 'delivery')
  if (takeaway.length > 0) {
    tabs.push({
      key: 'takeaway',
      label: branchTag ? `${branchTag} Take Out` : 'Take Out',
      tables: takeaway,
    })
  }
  if (delivery.length > 0) {
    tabs.push({
      key: 'delivery',
      label: branchTag ? `${branchTag} Delivery` : 'Delivery',
      tables: delivery,
    })
  }

  return tabs
}

/**
 * Odoo-style floor plan: each card pinned at its stored spot (percent of the
 * canvas), so the screen mirrors where the tables physically stand.
 */
function FloorCanvas({
  tables,
  onSelectTable,
}: {
  tables: PosTable[]
  onSelectTable: (table: PosTable) => void
}) {
  // A table someone created without a spot must still be tappable — those
  // queue along the bottom edge until an admin gives them coordinates.
  let stray = 0

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="relative h-full min-h-[640px]">
        {tables.map((table) => {
          const placed = table.posX != null && table.posY != null
          const x = placed ? table.posX! : (stray++ * 12) % 96
          const y = placed ? table.posY! : 86
          return (
            <div
              key={table.id}
              className="absolute"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: table.shape === 'wide' ? '21%' : '10.5%',
                height: table.shape === 'tall' ? '44%' : undefined,
              }}
            >
              <TableCard table={table} onSelect={onSelectTable} />
            </div>
          )
        })}
      </div>
    </main>
  )
}

/** One tab's floor: a slot grid, a plain table grid, or tables + VIP two-pane. */
function TabFloor({
  tables,
  onSelectTable,
}: {
  tables: PosTable[]
  onSelectTable: (table: PosTable) => void
}) {
  const slots = tables.filter((t) => isSlotSection(t.section))
  if (slots.length > 0) {
    const isDelivery = slots[0].section === 'delivery'
    return (
      <main className="flex-1 overflow-auto p-6">
        <SectionHeading
          icon={isDelivery ? LuBike : LuShoppingBag}
          title={isDelivery ? 'Delivery' : 'Take Away'}
          color={isDelivery ? '#26a69a' : '#5c6bc0'}
        />
        <div className="grid grid-cols-6 gap-3.5">
          {slots.map((table) => (
            <TableCard key={table.id} table={table} onSelect={onSelectTable} />
          ))}
        </div>
      </main>
    )
  }

  // Tables with stored coordinates render as a floor plan instead of a grid.
  if (tables.some((t) => t.posX != null && t.posY != null)) {
    return <FloorCanvas tables={tables} onSelectTable={onSelectTable} />
  }

  const dineIn = tables.filter((t) => t.section === 'dine-in')
  const vip = tables.filter((t) => t.section === 'vip')

  // A floor with no VIP tables (the garden) spreads across the full width.
  if (vip.length === 0) {
    return (
      <main className="flex-1 overflow-auto p-6">
        <SectionHeading icon={LuUtensilsCrossed} title="Dine In (Tables)" color="#5b6470" />
        <div className="grid grid-cols-6 gap-3.5">
          {dineIn.map((table) => (
            <TableCard key={table.id} table={table} onSelect={onSelectTable} />
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-1 overflow-auto p-6">
      <section className="flex-1 pr-6">
        <SectionHeading icon={LuUtensilsCrossed} title="Dine In (Tables)" color="#5b6470" />
        <div className="grid grid-cols-4 gap-3.5">
          {dineIn.map((table) => (
            <TableCard key={table.id} table={table} onSelect={onSelectTable} />
          ))}
        </div>
      </section>
      <aside className="w-[42%] min-w-[340px] border-l border-neutral-200 pl-6">
        <SectionHeading icon={LuCrown} title="VIP Tables" color="#f0a11e" />
        <div className="grid grid-cols-4 gap-3.5">
          {vip.map((table) => (
            <TableCard key={table.id} table={table} onSelect={onSelectTable} />
          ))}
        </div>
      </aside>
    </main>
  )
}

/**
 * The floor itself. Zoned tables (BKK) render as Odoo-style tabs; a branch
 * without zones (TTP) keeps the classic single screen.
 */
export function FloorBody({
  floor,
  onSelectTable,
}: {
  floor: PosTable[]
  onSelectTable: (table: PosTable) => void
}) {
  // "ElevenOne BKK" → "BKK", naming the slot tabs ("BKK Take Out").
  const [branchTag, setBranchTag] = useState('')
  const [activeKey, setActiveKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchBranches()
      .then((list) => {
        const current = list.find((b) => String(b.id) === getBranchId()) ?? list[0]
        if (!cancelled && current) setBranchTag(current.name.replace(/^ElevenOne\s+/i, ''))
      })
      .catch(() => {
        // Offline — the slot tabs just drop the branch prefix.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!floor.some((t) => !isSlotSection(t.section) && t.zone)) {
    return <ClassicFloor floor={floor} onSelectTable={onSelectTable} />
  }

  const tabs = buildTabs(floor, branchTag)
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-neutral-200 bg-white">
        {tabs.map((tab) => {
          const orders = tab.tables.reduce((sum, t) => sum + t.orders, 0)
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveKey(tab.key)}
              className={`flex flex-1 items-center justify-center gap-2 border-r border-neutral-200 px-4 py-3 text-sm font-semibold transition last:border-r-0 ${
                tab.key === active.key
                  ? 'bg-[#00857c] text-white'
                  : 'bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {tab.label}
              {/* Bills running on this floor, visible from every other tab. */}
              {orders > 0 && (
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                    tab.key === active.key ? 'bg-white/25 text-white' : 'bg-rose-500 text-white'
                  }`}
                >
                  {orders}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <TabFloor tables={active.tables} onSelectTable={onSelectTable} />
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
  const hasDelivery = floor.some((t) => t.section === 'delivery')
  const activeOrders = floor.reduce((sum, t) => sum + t.orders, 0)

  // Cash drawer — the log lives on the server so every terminal sees the same
  // day and each movement is audited; the opening float is an admin setting.
  // storeName heads the daily Summary Report docket.
  const { openingFloat, storeName } = useSettings()
  const [cashOpen, setCashOpen] = useState(false)
  // The header's "Orders" screen — invoice history shown in place of the floor.
  const [ordersOpen, setOrdersOpen] = useState(false)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [drawerError, setDrawerError] = useState<string | null>(null)

  // Daily "Summary" docket — fetch today's totals, then print silently. Guard
  // against a double-tap while the fetch is in flight; a failure flashes a toast.
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.tone === 'error' ? 3500 : 1500)
    return () => clearTimeout(t)
  }, [toast])

  async function printDailySummary() {
    if (summaryBusy) return
    setSummaryBusy(true)
    try {
      const data = await fetchDailySummary()
      printSummary({ storeName }, data)
      // The docket prints silently under kiosk printing, so confirm on screen.
      setToast({ message: 'Today’s summary sent to printer', tone: 'success' })
    } catch (e: unknown) {
      setToast({
        message: e instanceof ApiError ? e.message : 'Could not load today’s summary.',
        tone: 'error',
      })
    } finally {
      setSummaryBusy(false)
    }
  }

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
        onOrders={() => setOrdersOpen(true)}
        onPrintSummary={() => void printDailySummary()}
        onLogout={onLogout}
      />

      {ordersOpen && <OrdersHistoryPage floor={floor} onBack={() => setOrdersOpen(false)} />}

      {!ordersOpen && loading && (
        <main className="flex flex-1 items-center justify-center">
          <LoadingState label="Loading tables…" />
        </main>
      )}

      {!ordersOpen && error && (
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

      {!ordersOpen && !loading && !error && (
        <FloorBody floor={floor} onSelectTable={onSelectTable} />
      )}

      {!ordersOpen && (
      <footer className="flex shrink-0 items-center justify-between border-t border-neutral-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6 text-sm">
          <LegendItem color="#4caf50" label="Available" />
          <LegendItem color="#f0a11e" label="Occupied" />
          <LegendItem color="#5c6bc0" label={hasDelivery ? 'Take Away' : 'Take Away / Delivery'} />
          {hasDelivery && <LegendItem color="#26a69a" label="Delivery" />}
        </div>
        <div className="text-right">
          <div className="text-sm">
            <span className="text-neutral-500">Active Orders: </span>
            <span className="font-bold text-primary">{activeOrders}</span>
          </div>
        </div>
      </footer>
      )}

      {cashOpen && (
        <CashInOutDialog
          movements={movements}
          openingFloat={openingFloat}
          error={drawerError}
          onSubmit={(m) => void recordMovement(m)}
          onClose={() => setCashOpen(false)}
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  )
}
