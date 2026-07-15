import {
  LuCrown,
  LuLock,
  LuPower,
  LuRefreshCw,
  LuShoppingBag,
  LuUserCheck,
  LuUtensilsCrossed,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import {
  SectionHeading,
  TABLES,
  TableCard,
  type PosTable,
} from '../pos/TableFloorPage'
import type { Waiter } from './WaiterLoginDialog'

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WaiterFloorPage({
  waiter,
  onSelectTable,
  onLogout,
}: {
  waiter: Waiter
  onSelectTable: (table: PosTable) => void
  onLogout: () => void
}) {
  const dineIn = TABLES.filter((t) => t.section === 'dine-in')
  const vip = TABLES.filter((t) => t.section === 'vip')
  const takeaway = TABLES.filter((t) => t.section === 'takeaway')
  const activeOrders = TABLES.reduce((sum, t) => sum + t.orders, 0)

  return (
    <div className="flex h-screen flex-col bg-[#eef0f3]">
      {/* Header — waiter session, no cash controls (payment is the cashier's job) */}
      <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-[#2b2138] px-4 shadow-md">
        {/* Left: brand */}
        <div className="flex items-center gap-1">
          <ElevenOneLogo />
          <div className="mx-3 h-8 w-px bg-white/15" />
          <span className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/90">
            Pick a table to take an order
          </span>
        </div>

        {/* Center: signed-in waiter */}
        <div className="flex items-center gap-2.5 text-white">
          <LuUserCheck className="h-5 w-5 text-emerald-300" />
          <div className="leading-tight">
            <div className="text-[11px] uppercase tracking-wide text-white/55">Waiter</div>
            <div className="text-sm font-semibold">{waiter.name}</div>
          </div>
        </div>

        {/* Right: session controls */}
        <div className="flex items-center justify-end gap-1">
          <HeaderIconButton icon={LuRefreshCw} label="Reload" onClick={() => window.location.reload()} />
          <div className="h-8 w-px bg-white/15" />
          <HeaderIconButton icon={LuLock} label="Lock" onClick={onLogout} />
          <div className="h-8 w-px bg-white/15" />
          <HeaderIconButton icon={LuPower} label="Close" onClick={onLogout} danger />
        </div>
      </header>

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

      <footer className="flex shrink-0 items-center justify-between border-t border-neutral-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6 text-sm text-neutral-500">
          <span>Tap a table to start taking the order, then send it to the kitchen.</span>
        </div>
        <div className="text-sm">
          <span className="text-neutral-500">Active Orders: </span>
          <span className="font-bold text-primary">{activeOrders}</span>
        </div>
      </footer>
    </div>
  )
}
