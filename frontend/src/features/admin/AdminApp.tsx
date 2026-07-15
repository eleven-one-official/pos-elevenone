import { useState } from 'react'
import {
  LuChartColumnBig,
  LuLayoutDashboard,
  LuLayoutGrid,
  LuPower,
  LuSettings,
  LuUserCog,
  LuUsers,
  LuUtensils,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import type { Cashier } from '../auth/CashierLoginDialog'
import AdminDashboard from './AdminDashboard'
import AdminReports from './AdminReports'
import AdminMenu from './AdminMenu'
import AdminStaff from './AdminStaff'
import AdminSettings from './AdminSettings'
import Placeholder from './Placeholder'

// ---------------------------------------------------------------------------
// Admin "side" — a back-office console for the owner/manager. Unlike the POS
// and waiter sides (which switch full screens by state), the admin side keeps a
// persistent sidebar and swaps the main panel between sections.
// ---------------------------------------------------------------------------

type Section = 'dashboard' | 'reports' | 'menu' | 'staff' | 'tables' | 'settings'

const NAV: { key: Section; label: string; icon: IconType }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LuLayoutDashboard },
  { key: 'reports', label: 'Reports', icon: LuChartColumnBig },
  { key: 'menu', label: 'Menu', icon: LuUtensils },
  { key: 'staff', label: 'Staff', icon: LuUsers },
  { key: 'tables', label: 'Tables', icon: LuLayoutGrid },
  { key: 'settings', label: 'Settings', icon: LuSettings },
]

const SECTION_TITLE: Record<Section, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: "Today's performance at a glance" },
  reports: { title: 'Reports', subtitle: 'Daily sales and best sellers' },
  menu: { title: 'Menu Management', subtitle: 'Categories, items, prices and availability' },
  staff: { title: 'Staff', subtitle: 'Accounts, roles and PIN access' },
  tables: { title: 'Tables', subtitle: 'Floor layout and table setup' },
  settings: { title: 'Settings', subtitle: 'Store details, tax and preferences' },
}

export default function AdminApp({ admin, onLogout }: { admin: Cashier; onLogout: () => void }) {
  const [section, setSection] = useState<Section>('dashboard')
  const header = SECTION_TITLE[section]

  return (
    <div className="flex h-screen bg-[#eef0f3] text-neutral-800">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col bg-[#2b2138] text-white">
        <div className="flex h-16 items-center px-5">
          <ElevenOneLogo />
        </div>

        <div className="mt-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Management
        </div>

        <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active = item.key === section
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSection(item.key)}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition ${
                  active
                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Signed-in admin + logout */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
              <LuUserCog className="h-5 w-5 text-white/80" />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold">{admin.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-white/45">
                {admin.role ?? 'Admin'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white/70 transition hover:bg-rose-500/20 hover:text-rose-300"
          >
            <LuPower className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center border-b border-neutral-200 bg-white px-8">
          <div>
            <h1 className="text-lg font-bold text-neutral-900">{header.title}</h1>
            <p className="text-xs text-neutral-500">{header.subtitle}</p>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {section === 'dashboard' && <AdminDashboard />}
          {section === 'reports' && <AdminReports />}
          {section === 'menu' && <AdminMenu />}
          {section === 'staff' && <AdminStaff />}
          {section === 'tables' && (
            <Placeholder
              icon={LuLayoutGrid}
              title="Table management is coming soon"
              body="Add, rename and arrange dining tables here. The floor and its statuses already run live on the POS side."
            />
          )}
          {section === 'settings' && <AdminSettings />}
        </main>
      </div>
    </div>
  )
}
