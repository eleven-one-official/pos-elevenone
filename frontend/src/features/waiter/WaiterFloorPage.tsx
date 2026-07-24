import { LuLock, LuPower, LuRefreshCw, LuUserCheck } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import ZoomControl from '../../components/ui/ZoomControl'
import { FloorBody, type PosTable } from '../pos/TableFloorPage'
import { LoadingState } from '../../components/ui/Loader'
import { useTables } from '../../hooks/useTables'
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
  // Poll every 5s so both waiter tablets (and the cashier POS) see tables get
  // seated/freed in near real time without a manual refresh.
  const { tables, loading, error, reload } = useTables(5000)
  const floor = tables ?? []
  const activeOrders = floor.reduce((sum, t) => sum + t.orders, 0)

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

        {/* Right: session controls — all three exit the session (back to the
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

      {!loading && !error && <FloorBody floor={floor} onSelectTable={onSelectTable} />}

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
