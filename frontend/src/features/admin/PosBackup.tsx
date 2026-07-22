import { useEffect, useState } from 'react'
import {
  LuCircleAlert,
  LuDatabase,
  LuDownload,
  LuFileSpreadsheet,
  LuPlus,
  LuShieldCheck,
  LuTrash2,
  LuTriangleAlert,
} from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import { ApiError } from '../../services/api/client'
import {
  createBackup,
  deleteBackup,
  downloadBackup,
  exportOrdersCsv,
  exportSalesDetailsCsv,
  fetchBackups,
  type Backup,
} from '../../services/api/backups'

// ---------------------------------------------------------------------------
// Data Backup (admin only). Two jobs on one screen:
//   1. Database backups — create / download / delete the nightly .sql.gz dumps,
//      and nudge the admin to keep an off-server copy every day.
//   2. Daily report export — download the day's orders / sales as CSV for the
//      records.
// The backend enforces the admin role on every call here.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000

function formatBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

/** Local YYYY-MM-DD for a date input (not UTC — the venue's own day). */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The picker's day boundaries as absolute UTC instants for the API. */
const dayStartIso = (s: string): string => new Date(`${s}T00:00:00`).toISOString()
const dayEndIso = (s: string): string => new Date(`${s}T23:59:59.999`).toISOString()

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

export default function PosBackup() {
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const today = localDate(new Date())
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [exporting, setExporting] = useState<'orders' | 'sales' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetchBackups()
      .then(setBackups)
      .catch((e: unknown) => setError(errorMessage(e, 'Failed to load backups.')))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const newest = backups[0]
  const stale = !newest || Date.now() - new Date(newest.created_at).getTime() > DAY_MS

  const handleCreate = () => {
    setCreating(true)
    setError(null)
    setNotice(null)
    createBackup()
      .then((b) => {
        setNotice(`Backup created — ${b.name} (${formatBytes(b.size)}). Download a copy to keep it safe.`)
        load()
      })
      .catch((e: unknown) => setError(errorMessage(e, 'Backup failed.')))
      .finally(() => setCreating(false))
  }

  const handleDownload = (name: string) => {
    setDownloading(name)
    setError(null)
    downloadBackup(name)
      .catch((e: unknown) => setError(errorMessage(e, 'Download failed.')))
      .finally(() => setDownloading(null))
  }

  const handleDelete = (name: string) => {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return
    setDeleting(name)
    setError(null)
    deleteBackup(name)
      .then(() => setBackups((list) => list.filter((b) => b.name !== name)))
      .catch((e: unknown) => setError(errorMessage(e, 'Delete failed.')))
      .finally(() => setDeleting(null))
  }

  const runExport = (kind: 'orders' | 'sales') => {
    if (from > to) {
      setExportError('The "from" date must be on or before the "to" date.')
      return
    }
    setExporting(kind)
    setExportError(null)
    const start = dayStartIso(from)
    const end = dayEndIso(to)
    const call = kind === 'orders' ? exportOrdersCsv(start, end) : exportSalesDetailsCsv(start, end)
    call
      .catch((e: unknown) => setExportError(errorMessage(e, 'Export failed.')))
      .finally(() => setExporting(null))
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-neutral-200/80 px-6 py-4">
        <h1 className="flex items-center gap-2 text-xl text-neutral-700">
          <LuShieldCheck className="h-5 w-5 text-emerald-600" />
          Data Backup
        </h1>
        <p className="mt-1 text-[13px] text-neutral-500">
          Keep the business safe: back up the database and download a copy every day.
          <span className="ml-1 text-neutral-400">
            រក្សាទុកទិន្នន័យ — Backup មូលដ្ឋានទិន្នន័យ ហើយ Download យក copy ទុករៀងរាល់ថ្ងៃ។
          </span>
        </p>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-8 px-6 py-6">
        {/* ---- Database backups ---------------------------------------- */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-neutral-700">
              <LuDatabase className="h-4 w-4 text-neutral-500" />
              Database backups
            </h2>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-[3px] bg-[#2f6cad] px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-[#295f98] disabled:opacity-60"
            >
              {creating ? <Loader size="sm" className="text-white" /> : <LuPlus className="h-4 w-4" />}
              {creating ? 'Creating…' : 'Create backup now'}
            </button>
          </div>

          {/* Stale-backup nudge */}
          {!loading && stale && (
            <div className="mb-3 flex items-start gap-2 rounded-[3px] border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              <LuTriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {newest
                  ? 'No backup in the last 24 hours.'
                  : 'There are no backups yet.'}{' '}
                Create one and download it to keep an off-server copy.
                <span className="ml-1 text-amber-700/80">
                  គ្មាន backup ២៤ម៉ោងចុងក្រោយ — សូមបង្កើត ហើយ Download ថ្ងៃនេះ។
                </span>
              </span>
            </div>
          )}

          {notice && (
            <div className="mb-3 rounded-[3px] border border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
              {notice}
            </div>
          )}
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-[3px] border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="overflow-hidden rounded-[3px] border border-neutral-200">
            {loading ? (
              <div className="flex items-center justify-center p-12">
                <Loader />
              </div>
            ) : backups.length === 0 ? (
              <div className="p-10 text-center text-sm text-neutral-500">
                No backups yet. Click “Create backup now”.
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-800">
                    <th className="px-4 py-2.5 font-bold">Created</th>
                    <th className="py-2.5 pr-4 font-bold">File</th>
                    <th className="w-24 py-2.5 pr-4 font-bold">Size</th>
                    <th className="w-40 py-2.5 pr-4 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.name} className="border-b border-neutral-100 text-neutral-700 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 text-neutral-600">
                        {new Date(b.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 font-mono text-[12px] text-neutral-500">{b.name}</td>
                      <td className="whitespace-nowrap py-2 pr-4">{formatBytes(b.size)}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleDownload(b.name)}
                            disabled={downloading === b.name}
                            title="Download"
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] text-sky-700 transition hover:bg-sky-50 disabled:opacity-50"
                          >
                            {downloading === b.name ? (
                              <Loader size="sm" className="text-sky-700" />
                            ) : (
                              <LuDownload className="h-4 w-4" />
                            )}
                            Download
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(b.name)}
                            disabled={deleting === b.name}
                            title="Delete"
                            className="inline-flex items-center rounded px-2 py-1 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deleting === b.name ? (
                              <Loader size="sm" className="text-red-600" />
                            ) : (
                              <LuTrash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="mt-2 text-[12px] text-neutral-400">
            The server also makes one automatic backup every night and keeps the last 30 days.
          </p>
        </section>

        {/* ---- Daily report export ------------------------------------- */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-neutral-700">
            <LuFileSpreadsheet className="h-4 w-4 text-neutral-500" />
            Daily report export (CSV)
          </h2>

          <div className="rounded-[3px] border border-neutral-200 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-[13px] text-neutral-700">
                <span className="font-semibold">From</span>
                <input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-[3px] border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-sky-600"
                />
              </label>
              <label className="flex flex-col gap-1 text-[13px] text-neutral-700">
                <span className="font-semibold">To</span>
                <input
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-[3px] border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-sky-600"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => runExport('orders')}
                  disabled={exporting !== null}
                  className="inline-flex items-center gap-1.5 rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
                >
                  {exporting === 'orders' ? (
                    <Loader size="sm" className="text-neutral-700" />
                  ) : (
                    <LuDownload className="h-4 w-4" />
                  )}
                  Export Orders
                </button>
                <button
                  type="button"
                  onClick={() => runExport('sales')}
                  disabled={exporting !== null}
                  className="inline-flex items-center gap-1.5 rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
                >
                  {exporting === 'sales' ? (
                    <Loader size="sm" className="text-neutral-700" />
                  ) : (
                    <LuDownload className="h-4 w-4" />
                  )}
                  Export Sales Details
                </button>
              </div>
            </div>

            {exportError && (
              <div className="mt-3 flex items-start gap-2 text-[13px] text-red-700">
                <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{exportError}</span>
              </div>
            )}
            <p className="mt-3 text-[12px] text-neutral-400">
              Opens in Excel / Google Sheets. “Orders” lists every bill in the range; “Sales Details” is
              the product + payment breakdown (completed orders only).
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
