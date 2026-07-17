import { useEffect, useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuSearch } from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import { fetchAuditLogs, type AuditLogEntry, type AuditLogPage } from '../../services/api/auditLogs'

// ---------------------------------------------------------------------------
// Audit Log — read-only who-did-what trail (admin only). Server-side filters
// and pagination; each row can expand to show the full old/new values.
// ---------------------------------------------------------------------------

const EVENT_OPTIONS = [
  'login',
  'login_failed',
  'logout',
  'sale',
  'refund',
  'created',
  'updated',
  'deleted',
  'price_change',
  'stock_adjustment',
] as const

const TYPE_OPTIONS = [
  'Order',
  'Payment',
  'MenuItem',
  'Category',
  'Table',
  'User',
  'Customer',
  'PaymentMethod',
  'Setting',
] as const

/** Odoo-ish badge tints per event kind. */
const EVENT_TINT: Record<string, string> = {
  created: 'bg-sky-100 text-sky-800',
  updated: 'bg-amber-100 text-amber-800',
  deleted: 'bg-red-100 text-red-700',
  login: 'bg-emerald-100 text-emerald-800',
  login_failed: 'bg-red-100 text-red-700',
  logout: 'bg-neutral-200 text-neutral-600',
  sale: 'bg-teal-100 text-teal-800',
  refund: 'bg-orange-100 text-orange-800',
  price_change: 'bg-violet-100 text-violet-800',
  stock_adjustment: 'bg-indigo-100 text-indigo-800',
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** One "field: old → new" line per changed key, newest style kept compact. */
function changeLines(entry: AuditLogEntry): { field: string; from?: string; to?: string }[] {
  const keys = new Set([...Object.keys(entry.new_values ?? {}), ...Object.keys(entry.old_values ?? {})])
  return [...keys].map((field) => ({
    field,
    from: entry.old_values && field in entry.old_values ? formatValue(entry.old_values[field]) : undefined,
    to: entry.new_values && field in entry.new_values ? formatValue(entry.new_values[field]) : undefined,
  }))
}

export default function PosAuditLog() {
  const [page, setPage] = useState(1)
  const [event, setEvent] = useState('')
  const [type, setType] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<AuditLogPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAuditLogs({ page, event, type, search })
      .then((res) => {
        if (!cancelled) setResult(res)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load the audit log.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, event, type, search])

  const rows = result?.data ?? []

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <div>
            <h1 className="text-xl text-neutral-700">Audit Log</h1>
            <p className="mt-1 text-[13px] text-neutral-500">
              Records every login, sale, refund, delete, price change and stock adjustment.
            </p>
          </div>

          <div className="flex min-w-72 max-w-[880px] flex-1 flex-col gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setPage(1)
                setSearch(searchInput.trim())
              }}
              className="relative block"
            >
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search order number, item, username... (press Enter)"
                className="w-full rounded-[3px] border border-neutral-300 px-3 py-1.5 pr-9 text-sm outline-none transition focus:border-sky-600"
              />
              <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <select
                  value={event}
                  onChange={(e) => {
                    setPage(1)
                    setEvent(e.target.value)
                  }}
                  className="rounded-[3px] border border-neutral-300 bg-white px-2 py-1.5 text-[13px] text-neutral-700 outline-none focus:border-sky-600"
                >
                  <option value="">All events</option>
                  {EVENT_OPTIONS.map((ev) => (
                    <option key={ev} value={ev}>
                      {ev.replace('_', ' ')}
                    </option>
                  ))}
                </select>
                <select
                  value={type}
                  onChange={(e) => {
                    setPage(1)
                    setType(e.target.value)
                  }}
                  className="rounded-[3px] border border-neutral-300 bg-white px-2 py-1.5 text-[13px] text-neutral-700 outline-none focus:border-sky-600"
                >
                  <option value="">All records</option>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[13px] text-neutral-600">
                  {result && result.total > 0 ? `${result.from ?? 0}-${result.to ?? 0}` : '0-0'} /{' '}
                  {result?.total ?? 0}
                </span>
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <LuChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={!result || page >= result.last_page}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded p-1 text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <LuChevronRight className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trail */}
      <div className="overflow-y-auto">
        {loading && !result ? (
          <div className="flex items-center justify-center p-16">
            <Loader />
          </div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-red-600">{error}</div>
        ) : (
          <>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-800">
                  <th className="w-44 px-4 py-2.5 font-bold">When</th>
                  <th className="w-40 py-2.5 pr-4 font-bold">Who</th>
                  <th className="w-28 py-2.5 pr-4 font-bold">Event</th>
                  <th className="w-56 py-2.5 pr-4 font-bold">Record</th>
                  <th className="py-2.5 pr-4 font-bold">Changes</th>
                  <th className="w-32 py-2.5 pr-4 font-bold">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const lines = changeLines(entry)
                  const isOpen = expanded === entry.id
                  const shown = isOpen ? lines : lines.slice(0, 2)
                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setExpanded(isOpen ? null : entry.id)}
                      className="cursor-pointer border-b border-neutral-100 align-top text-neutral-700 transition hover:bg-neutral-50"
                    >
                      <td className="whitespace-nowrap px-4 py-2 text-neutral-600">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-neutral-800">{entry.user_name ?? '—'}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${EVENT_TINT[entry.event] ?? 'bg-neutral-200 text-neutral-600'}`}
                        >
                          {entry.event.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        {entry.subject_type ? (
                          <>
                            <span className="text-neutral-500">{entry.subject_type}</span>{' '}
                            <span className="text-neutral-800">{entry.label ?? `#${entry.subject_id}`}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {lines.length === 0 ? (
                          <span className="text-neutral-400">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            {shown.map((line) => (
                              <div key={line.field} className="break-all">
                                <span className="text-neutral-500">{line.field}:</span>{' '}
                                {line.from !== undefined && (
                                  <>
                                    <span className="text-red-700/80 line-through decoration-red-300">
                                      {line.from}
                                    </span>
                                    {' → '}
                                  </>
                                )}
                                <span className="text-emerald-800">{line.to ?? '—'}</span>
                              </div>
                            ))}
                            {!isOpen && lines.length > 2 && (
                              <div className="text-xs text-sky-700">+{lines.length - 2} more…</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4 text-neutral-500">
                        {entry.ip_address ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="p-10 text-center text-sm text-neutral-500">
                No audit entries match the current filters.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
