import { useState } from 'react'
import type { IconType } from 'react-icons'
import {
  LuBoxes,
  LuCalculator,
  LuClock,
  LuGrip,
  LuLayoutGrid,
  LuLogOut,
  LuMessageSquare,
  LuSettings,
  LuShoppingCart,
  LuStore,
  LuUserCheck,
  LuUsers,
} from 'react-icons/lu'
import type { Cashier } from '../auth/CashierLoginDialog'
import ModulePlaceholder from './ModulePlaceholder'
import PosDashboard from './PosDashboard'

// ---------------------------------------------------------------------------
// Admin "side" — an Odoo-style back office. The black sidebar on the left is
// an app switcher listing the business modules; the dark top bar carries the
// active module's menus. Only Point of Sale → Dashboard is a real screen so
// far; every other module and menu renders a UI-first placeholder.
// ---------------------------------------------------------------------------

type ModuleKey =
  | 'pos'
  | 'discuss'
  | 'accounting'
  | 'purchase'
  | 'inventory'
  | 'employees'
  | 'attendances'
  | 'apps'
  | 'settings'

const MODULES: { key: ModuleKey; label: string; icon: IconType; tint: string }[] = [
  { key: 'pos', label: 'Point of Sale', icon: LuStore, tint: 'bg-violet-500' },
  { key: 'discuss', label: 'Discuss', icon: LuMessageSquare, tint: 'bg-teal-500' },
  { key: 'accounting', label: 'Accounting', icon: LuCalculator, tint: 'bg-amber-500' },
  { key: 'purchase', label: 'Purchase', icon: LuShoppingCart, tint: 'bg-cyan-600' },
  { key: 'inventory', label: 'Inventory', icon: LuBoxes, tint: 'bg-orange-500' },
  { key: 'employees', label: 'Employees', icon: LuUsers, tint: 'bg-purple-500' },
  { key: 'attendances', label: 'Attendances', icon: LuUserCheck, tint: 'bg-emerald-500' },
  { key: 'apps', label: 'Apps', icon: LuLayoutGrid, tint: 'bg-rose-500' },
  { key: 'settings', label: 'Settings', icon: LuSettings, tint: 'bg-slate-500' },
]

const POS_TABS = ['Dashboard', 'Orders', 'Products', 'Reporting', 'Configuration'] as const
type PosTab = (typeof POS_TABS)[number]

export default function AdminApp({ admin, onLogout }: { admin: Cashier; onLogout: () => void }) {
  const [moduleKey, setModuleKey] = useState<ModuleKey>('pos')
  const [tab, setTab] = useState<PosTab>('Dashboard')
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const active = MODULES.find((m) => m.key === moduleKey) ?? MODULES[0]

  const content =
    active.key !== 'pos' ? (
      <ModulePlaceholder icon={active.icon} title={active.label} />
    ) : tab === 'Dashboard' ? (
      <PosDashboard />
    ) : (
      <ModulePlaceholder
        icon={active.icon}
        title={tab}
        note={`Point of Sale › ${tab} — UI coming soon.`}
      />
    )

  return (
    <div className="flex h-screen flex-col bg-white text-neutral-800">
      {/* Top bar — module title, module menus, then messaging/activity + user */}
      <header className="flex h-12 shrink-0 items-center bg-[#1f2e3d] pr-3 text-white">
        <div className="flex items-center gap-3 pl-4 pr-5">
          <LuGrip className="h-5 w-5 shrink-0 text-white/90" />
          <span className="whitespace-nowrap text-[17px] font-bold">{active.label}</span>
        </div>

        {active.key === 'pos' && (
          <nav className="flex items-center text-sm">
            {POS_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-sm px-3.5 py-1 transition hover:bg-white/10 ${
                  t === tab ? 'text-white' : 'text-white/90'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Messages"
            className="relative rounded p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <LuMessageSquare className="h-4.5 w-4.5" />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-none">
              2
            </span>
          </button>
          <button
            type="button"
            aria-label="Activities"
            className="rounded p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <LuClock className="h-4.5 w-4.5" />
          </button>

          <span className="px-2 text-[13px] text-white/90">ElevenOne BKK</span>

          {/* Signed-in admin + dropdown with sign out */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded px-2 py-1 transition hover:bg-white/10"
            >
              <span className="flex h-6.5 w-6.5 items-center justify-center rounded-full bg-fuchsia-700 text-[11px] font-bold">
                {(admin.name || 'A').charAt(0).toUpperCase()}
              </span>
              <span className="max-w-36 truncate text-[13px]">{admin.name}</span>
            </button>

            {userMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setUserMenuOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-neutral-200 bg-white py-1 text-neutral-700 shadow-lg">
                  <div className="px-3 py-1.5 text-xs uppercase tracking-wide text-neutral-400">
                    {admin.role ?? 'Admin'}
                  </div>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm transition hover:bg-neutral-100"
                  >
                    <LuLogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* App switcher — black module list, Odoo style */}
        <aside className="w-36 shrink-0 overflow-y-auto bg-[#0a0c0e] py-1.5 text-[13px]">
          {MODULES.map((m) => {
            const isActive = m.key === active.key
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setModuleKey(m.key)
                  setTab('Dashboard')
                }}
                className={`flex w-full items-center gap-2 px-2.5 py-[7px] text-left transition ${
                  isActive
                    ? 'bg-[#2f6cad] text-white'
                    : 'text-neutral-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm ${m.tint}`}
                >
                  <m.icon className="h-3.5 w-3.5 text-white" />
                </span>
                <span className="truncate">{m.label}</span>
              </button>
            )
          })}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-white">{content}</main>
      </div>
    </div>
  )
}
