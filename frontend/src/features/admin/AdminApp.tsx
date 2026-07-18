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
import type { Waiter } from '../waiter/WaiterLoginDialog'
import ModulePlaceholder from './ModulePlaceholder'
import PosAuditLog from './PosAuditLog'
import PosDashboard from './PosDashboard'
import PosOrders from './PosOrders'
import PosOrdersAnalysis from './PosOrdersAnalysis'
import PosPaymentMethods from './PosPaymentMethods'
import PosPricelists from './PosPricelists'
import PosProducts from './PosProducts'
import PosSessionLogin from './PosSessionLogin'
import PosSettings from './PosSettings'
import SalesDetailsDialog from './SalesDetailsDialog'

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

// Top-bar menus for the Point of Sale module. Entries with `items` open an
// Odoo-style dropdown; the rest switch the screen directly.
const POS_MENUS: { label: string; items?: { id: string; label: string }[] }[] = [
  { label: 'Dashboard' },
  { label: 'Orders' },
  {
    label: 'Products',
    items: [
      { id: 'products', label: 'Products' },
      { id: 'pricelists', label: 'Pricelists' },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { id: 'reporting-orders', label: 'Orders' },
      { id: 'sales-details', label: 'Sales Details' },
      { id: 'audit-log', label: 'Audit Log' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { id: 'settings', label: 'Settings' },
      { id: 'payment-methods', label: 'Payment Methods' },
    ],
  },
]

// Companies for the Odoo-style switcher in the top bar — placeholder list
// until the backend models branches.
const COMPANIES = ['ElevenOne BKK', 'ElevenOne TTP', 'Crums']

type PosTab = { menu: string; item?: string }

/** A dashboard card handed over to the full-screen POS session login. */
type SessionGate = { name: string; kind: 'cashier' | 'waiter' }

export default function AdminApp({
  admin,
  onLogout,
  onCashierLogin,
  onWaiterLogin,
}: {
  admin: Cashier
  onLogout: () => void
  /** A cashier passed the PIN gate on the POS session login — open the register as them. */
  onCashierLogin: (cashier: Cashier) => void
  /** A waiter passed the PIN gate on the waiter config — open the waiter side as them. */
  onWaiterLogin: (waiter: Waiter) => void
}) {
  const [moduleKey, setModuleKey] = useState<ModuleKey>('pos')
  // Dev builds can jump to a menu screen with `?pos-tab=<menu>/<item>`.
  const [tab, setTab] = useState<PosTab>(() => {
    const t = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get('pos-tab')
      : null
    if (!t) return { menu: 'Dashboard' }
    const [menu, item] = t.split('/')
    return { menu, item: item || undefined }
  })
  // Dev builds can pre-open a top-bar dropdown with `?pos-menu=<label>`.
  const [openMenu, setOpenMenu] = useState<string | null>(() =>
    import.meta.env.DEV ? new URLSearchParams(window.location.search).get('pos-menu') : null,
  )
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  // Multi-company switcher — checkboxes pick the active set (records from all
  // checked companies show), clicking a name makes it the current company.
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [currentCompany, setCurrentCompany] = useState('ElevenOne TTP')
  const [activeCompanies, setActiveCompanies] = useState<string[]>(['ElevenOne TTP'])
  // "Continue selling" hands over the whole screen to the POS session login,
  // Odoo style — no back-office chrome around it. Dev builds can jump straight
  // there with `?pos-login=<config name>` for quick UI iteration (a name
  // containing "waiter" gates the waiter roster).
  const [sessionLogin, setSessionLogin] = useState<SessionGate | null>(() => {
    const name = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get('pos-login')
      : null
    if (!name) return null
    return { name, kind: name.toLowerCase().includes('waiter') ? 'waiter' : 'cashier' }
  })

  const active = MODULES.find((m) => m.key === moduleKey) ?? MODULES[0]

  /** Check/uncheck a company; at least one stays active, Odoo style. */
  const toggleCompany = (name: string) => {
    if (!activeCompanies.includes(name)) {
      setActiveCompanies([...activeCompanies, name])
      return
    }
    if (activeCompanies.length === 1) return
    const next = activeCompanies.filter((c) => c !== name)
    setActiveCompanies(next)
    if (name === currentCompany) setCurrentCompany(next[0])
  }

  /** Make a company the current one (shown in the top bar) and check it. */
  const switchCompany = (name: string) => {
    setCurrentCompany(name)
    if (!activeCompanies.includes(name)) setActiveCompanies([...activeCompanies, name])
    setCompanyMenuOpen(false)
  }

  if (sessionLogin) {
    return (
      <PosSessionLogin
        name={sessionLogin.name}
        kind={sessionLogin.kind}
        onBack={() => setSessionLogin(null)}
        onLoggedIn={onCashierLogin}
        onWaiterLoggedIn={onWaiterLogin}
      />
    )
  }

  const content =
    active.key !== 'pos' ? (
      <ModulePlaceholder icon={active.icon} title={active.label} />
    ) : tab.menu === 'Dashboard' ? (
      <PosDashboard onContinueSelling={setSessionLogin} />
    ) : tab.menu === 'Orders' ? (
      <PosOrders />
    ) : tab.menu === 'Products' && tab.item === 'Products' ? (
      <PosProducts />
    ) : tab.menu === 'Products' && tab.item === 'Pricelists' ? (
      <PosPricelists />
    ) : tab.menu === 'Configuration' && tab.item === 'Settings' ? (
      <PosSettings />
    ) : tab.menu === 'Configuration' && tab.item === 'Payment Methods' ? (
      <PosPaymentMethods />
    ) : tab.menu === 'Reporting' && tab.item === 'Audit Log' ? (
      <PosAuditLog />
    ) : tab.menu === 'Reporting' ? (
      // Odoo shows Sales Details as a dialog OVER the Orders Analysis screen.
      <>
        <PosOrdersAnalysis />
        {tab.item === 'Sales Details' && (
          <SalesDetailsDialog onClose={() => setTab({ menu: 'Reporting', item: 'Orders' })} />
        )}
      </>
    ) : (
      <ModulePlaceholder
        icon={active.icon}
        title={tab.item ?? tab.menu}
        note={`Point of Sale › ${tab.menu}${tab.item ? ` › ${tab.item}` : ''}`}
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
            {POS_MENUS.map((m) =>
              m.items ? (
                <div key={m.label} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenMenu((v) => (v === m.label ? null : m.label))}
                    className={`rounded-sm px-3.5 py-1 text-white/90 transition hover:bg-white/10 ${
                      openMenu === m.label ? 'bg-white/10 text-white' : ''
                    }`}
                  >
                    {m.label}
                  </button>

                  {openMenu === m.label && (
                    <>
                      <button
                        type="button"
                        aria-label="Close menu"
                        onClick={() => setOpenMenu(null)}
                        className="fixed inset-0 z-10 cursor-default"
                      />
                      <div className="absolute left-0 top-full z-20 min-w-40 border border-neutral-200/70 bg-white py-1 text-neutral-600 shadow-md">
                        {m.items.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => {
                              setTab({ menu: m.label, item: it.label })
                              setOpenMenu(null)
                            }}
                            className="block w-full px-4 py-1.5 text-left text-[13px] transition hover:bg-neutral-100"
                          >
                            {it.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => {
                    setTab({ menu: m.label })
                    setOpenMenu(null)
                  }}
                  className={`rounded-sm px-3.5 py-1 transition hover:bg-white/10 ${
                    m.label === tab.menu ? 'text-white' : 'text-white/90'
                  }`}
                >
                  {m.label}
                </button>
              ),
            )}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Messages"
            className="relative rounded p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <LuMessageSquare className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            aria-label="Activities"
            className="rounded p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <LuClock className="h-4.5 w-4.5" />
          </button>

          {/* Company switcher — Odoo-style multi-company dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setCompanyMenuOpen((v) => !v)}
              className={`rounded px-2 py-1 text-[13px] transition hover:bg-white/10 ${
                companyMenuOpen ? 'bg-white/10 text-white' : 'text-white/90'
              }`}
            >
              {currentCompany}
            </button>

            {companyMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setCompanyMenuOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 z-20 mt-1 w-48 border border-neutral-200/70 bg-white py-1 text-neutral-700 shadow-md">
                  {COMPANIES.map((name) => (
                    <div
                      key={name}
                      className={`flex items-center gap-2.5 px-3 py-1.5 transition hover:bg-neutral-100 ${
                        name === currentCompany ? 'bg-[#e7ecf0]' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Toggle ${name}`}
                        checked={activeCompanies.includes(name)}
                        onChange={() => toggleCompany(name)}
                        className="h-3.5 w-3.5 shrink-0 accent-[#2f6cad]"
                      />
                      <button
                        type="button"
                        onClick={() => switchCompany(name)}
                        className="min-w-0 flex-1 truncate text-left text-[13px]"
                      >
                        {name}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

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
        <aside className="w-44 shrink-0 overflow-y-auto bg-[#0a0c0e] py-1.5 text-[13px]">
          {MODULES.map((m) => {
            const isActive = m.key === active.key
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setModuleKey(m.key)
                  setTab({ menu: 'Dashboard' })
                  setOpenMenu(null)
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
                <span className="min-w-0 flex-1 truncate">{m.label}</span>
                {m.key !== 'pos' && (
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${
                      isActive ? 'bg-white/25 text-white' : 'bg-white/10 text-neutral-400'
                    }`}
                  >
                    Soon
                  </span>
                )}
              </button>
            )
          })}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-white">{content}</main>
      </div>
    </div>
  )
}
