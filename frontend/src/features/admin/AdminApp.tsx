import { useEffect, useState } from 'react'
import type { IconType } from 'react-icons'
import {
  LuBoxes,
  LuCalculator,
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
import type { Kitchen } from '../kitchen/KitchenLoginDialog'
import type { Bar } from '../bar/BarLoginDialog'
import { fetchBranches, type Branch } from '../../services/api/branches'
import { getBranchId, setBranchId } from '../../services/api/client'
import ZoomControl from '../../components/ui/ZoomControl'
import HrEmployees from './HrEmployees'
import ModulePlaceholder from './ModulePlaceholder'
import PosAuditLog from './PosAuditLog'
import PosBackup from './PosBackup'
import PosCategories from './PosCategories'
import PosChefPerformance from './PosChefPerformance'
import PosCustomers from './PosCustomers'
import PosDashboard from './PosDashboard'
import PosOrders from './PosOrders'
import PosOrdersAnalysis from './PosOrdersAnalysis'
import PosPaymentMethods from './PosPaymentMethods'
import PosPricelists from './PosPricelists'
import PosProducts from './PosProducts'
import PosSalesDashboard from './PosSalesDashboard'
import PosSessionLogin from './PosSessionLogin'
import PosSettings from './PosSettings'
import PosTables from './PosTables'
import SalesDetailsDialog from './SalesDetailsDialog'

// ---------------------------------------------------------------------------
// Admin "side" — an Odoo-style back office. The black sidebar on the left is
// an app switcher listing the business modules; the dark top bar carries the
// active module's menus. Point of Sale and Employees are real; every other
// module and menu renders a UI-first placeholder.
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
  {
    label: 'Orders',
    items: [
      { id: 'orders', label: 'Orders' },
      { id: 'customers', label: 'Customers' },
    ],
  },
  {
    label: 'Products',
    items: [
      { id: 'products', label: 'Products' },
      { id: 'categories', label: 'Categories' },
      { id: 'pricelists', label: 'Pricelists' },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { id: 'sales-dashboard', label: 'Sales Dashboard' },
      { id: 'reporting-orders', label: 'Orders' },
      { id: 'chef-performance', label: 'Chef Performance' },
      { id: 'sales-details', label: 'Sales Details' },
      { id: 'audit-log', label: 'Audit Log' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { id: 'settings', label: 'Settings' },
      { id: 'payment-methods', label: 'Payment Methods' },
      { id: 'tables', label: 'Tables' },
      { id: 'backup', label: 'Data Backup' },
    ],
  },
]

// The Employees module is a single screen — the staff directory, which folds
// the kitchen chef roster in alongside real login accounts.
const EMPLOYEE_MENUS: typeof POS_MENUS = [{ label: 'Employees' }]

// Modules with real screens hang their top-bar menus here; the rest render a
// placeholder with no menus.
const MODULE_MENUS: Partial<Record<ModuleKey, typeof POS_MENUS>> = {
  pos: POS_MENUS,
  employees: EMPLOYEE_MENUS,
}

// Branches for the Odoo-style switcher in the top bar come from the backend;
// the active one is the device's stored branch (see getBranchId), and every
// screen only ever shows that branch's data.

type PosTab = { menu: string; item?: string }

/** A dashboard card handed over to the full-screen POS session login. */
type SessionGate = { name: string; kind: 'cashier' | 'waiter' | 'kitchen' | 'bar' }

export default function AdminApp({
  admin,
  onLogout,
  onCashierLogin,
  onWaiterLogin,
  onKitchenLogin,
  onBarLogin,
}: {
  admin: Cashier
  onLogout: () => void
  /** A cashier passed the PIN gate on the POS session login — open the register as them. */
  onCashierLogin: (cashier: Cashier) => void
  /** A waiter passed the PIN gate on the waiter config — open the waiter side as them. */
  onWaiterLogin: (waiter: Waiter) => void
  /** The kitchen station tapped in — open the kitchen display screen. */
  onKitchenLogin: (kitchen: Kitchen) => void
  /** The bar station tapped in — open the bar display screen. */
  onBarLogin: (bar: Bar) => void
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
  // Branch switcher — data is strictly one branch at a time, so switching
  // stores the new branch and reloads (every screen refetches under the new
  // X-Branch-Id header).
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])

  useEffect(() => {
    let cancelled = false
    fetchBranches()
      .then((list) => {
        if (!cancelled) setBranches(list)
      })
      .catch(() => {
        // Server unreachable — the switcher just shows nothing to pick.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const currentBranch =
    branches.find((b) => String(b.id) === getBranchId()) ?? branches[0] ?? null
  // "Continue selling" hands over the whole screen to the POS session login,
  // Odoo style — no back-office chrome around it. Dev builds can jump straight
  // there with `?pos-login=<config name>` for quick UI iteration (a name
  // containing "waiter"/"kitchen"/"bar" gates that roster).
  const [sessionLogin, setSessionLogin] = useState<SessionGate | null>(() => {
    const name = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get('pos-login')
      : null
    if (!name) return null
    const lower = name.toLowerCase()
    const kind = lower.includes('kitchen')
      ? 'kitchen'
      : lower.includes('bar')
        ? 'bar'
        : lower.includes('waiter')
          ? 'waiter'
          : 'cashier'
    return { name, kind }
  })

  const active = MODULES.find((m) => m.key === moduleKey) ?? MODULES[0]

  /** Switch the whole app onto another branch's data. */
  const switchBranch = (branch: Branch) => {
    setCompanyMenuOpen(false)
    if (branch.id === currentBranch?.id) return
    setBranchId(String(branch.id))
    window.location.reload()
  }

  if (sessionLogin) {
    return (
      <PosSessionLogin
        name={sessionLogin.name}
        kind={sessionLogin.kind}
        onBack={() => setSessionLogin(null)}
        onLoggedIn={onCashierLogin}
        onWaiterLoggedIn={onWaiterLogin}
        onKitchenLoggedIn={onKitchenLogin}
        onBarLoggedIn={onBarLogin}
      />
    )
  }

  const content =
    active.key === 'employees' ? (
      <HrEmployees />
    ) : active.key !== 'pos' ? (
      <ModulePlaceholder icon={active.icon} title={active.label} />
    ) : tab.menu === 'Dashboard' ? (
      <PosDashboard onContinueSelling={setSessionLogin} />
    ) : tab.menu === 'Orders' && tab.item === 'Customers' ? (
      <PosCustomers />
    ) : tab.menu === 'Orders' ? (
      <PosOrders />
    ) : tab.menu === 'Products' && tab.item === 'Products' ? (
      <PosProducts />
    ) : tab.menu === 'Products' && tab.item === 'Categories' ? (
      <PosCategories />
    ) : tab.menu === 'Products' && tab.item === 'Pricelists' ? (
      <PosPricelists />
    ) : tab.menu === 'Configuration' && tab.item === 'Settings' ? (
      <PosSettings />
    ) : tab.menu === 'Configuration' && tab.item === 'Payment Methods' ? (
      <PosPaymentMethods />
    ) : tab.menu === 'Configuration' && tab.item === 'Tables' ? (
      <PosTables />
    ) : tab.menu === 'Configuration' && tab.item === 'Data Backup' ? (
      <PosBackup />
    ) : tab.menu === 'Reporting' && tab.item === 'Audit Log' ? (
      <PosAuditLog />
    ) : tab.menu === 'Reporting' && tab.item === 'Sales Dashboard' ? (
      <PosSalesDashboard />
    ) : tab.menu === 'Reporting' && tab.item === 'Chef Performance' ? (
      <PosChefPerformance />
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

        {MODULE_MENUS[active.key] && (
          <nav className="flex items-center text-sm">
            {MODULE_MENUS[active.key]!.map((m) =>
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
          <ZoomControl tone="dark" size="sm" className="mr-1" />

          {/* Branch switcher — Odoo-style dropdown; picking one reloads the
              back office onto that branch's data */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setCompanyMenuOpen((v) => !v)}
              className={`rounded px-2 py-1 text-[13px] transition hover:bg-white/10 ${
                companyMenuOpen ? 'bg-white/10 text-white' : 'text-white/90'
              }`}
            >
              {currentBranch?.name ?? 'ElevenOne'}
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
                  {branches.map((branch) => (
                    <div
                      key={branch.id}
                      className={`flex items-center gap-2.5 px-3 py-1.5 transition hover:bg-neutral-100 ${
                        branch.id === currentBranch?.id ? 'bg-[#e7ecf0]' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Switch to ${branch.name}`}
                        checked={branch.id === currentBranch?.id}
                        onChange={() => switchBranch(branch)}
                        className="h-3.5 w-3.5 shrink-0 accent-[#2f6cad]"
                      />
                      <button
                        type="button"
                        onClick={() => switchBranch(branch)}
                        className="min-w-0 flex-1 truncate text-left text-[13px]"
                      >
                        {branch.name}
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
                  setTab({ menu: m.key === 'employees' ? 'Employees' : 'Dashboard' })
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
                {m.key !== 'pos' && m.key !== 'employees' && (
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
