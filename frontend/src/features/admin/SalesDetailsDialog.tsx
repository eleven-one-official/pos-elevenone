import { useEffect, useState } from 'react'
import { LuX } from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import { fetchSalesDetails, type SalesDetailsData } from '../../services/api/reports'
import { buildSalesDetailsHtml, printSalesDetails } from './printSalesDetails'
import type { SalesDetailsParams, SalesReportType } from './printSalesDetails'

// ---------------------------------------------------------------------------
// Reporting › Sales Details — Odoo opens this as a dialog over the Orders
// Analysis screen: a date range, a report type (Product / Category / Both)
// and the POS configs to include. Print fetches the real summary from
// /reports/sales-details and renders it through the same hidden-iframe
// pipeline the kitchen tickets use.
// ---------------------------------------------------------------------------

// Each register card maps to a backend "side" (who fired the order), so the
// picker really filters the report.
const ALL_CONFIGS = [
  { pos: 'TTP', company: 'ElevenOne TTP', side: 'cashier' as const },
  { pos: 'TTP Waiter', company: 'ElevenOne TTP', side: 'waiter' as const },
]

const REPORT_TYPES: SalesReportType[] = ['Product', 'Category', 'Both']

const pad = (n: number) => String(n).padStart(2, '0')

/** datetime-local value, e.g. "2026-07-18T07:22". */
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Odoo-style datetime label for the printed header, e.g. "18-Jul-2026 07:22". */
function fmtDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const month = d.toLocaleString('en-GB', { month: 'short' })
  return `${pad(d.getDate())}-${month}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The wizard defaults to "today so far": midnight through now. */
function defaultDates() {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return { start: toLocalInput(start), end: toLocalInput(now) }
}

const DATE_INPUT =
  'w-full rounded-[2px] border border-neutral-300 bg-[#eef4fb] px-3 py-1.5 text-sm text-neutral-800 outline-none transition focus:border-sky-600'

export default function SalesDetailsDialog({ onClose }: { onClose: () => void }) {
  const [initial] = useState(defaultDates)
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [reportType, setReportType] = useState<SalesReportType>('Product')
  const [configs, setConfigs] = useState(ALL_CONFIGS)
  const [addOpen, setAddOpen] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dev builds can inspect the printed report with `?sales-report-preview` —
  // it fetches the summary (today by default; give the param a datetime value
  // like `2026-07-01T00:00` to widen the range) and renders it full-screen.
  const preview = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('sales-report-preview')
    : null
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  useEffect(() => {
    if (preview === null) return
    const start = preview || initial.start
    fetchSalesDetails(start, initial.end)
      .then((data) =>
        setPreviewHtml(
          buildSalesDetailsHtml(
            {
              startDate: fmtDateTime(start),
              endDate: fmtDateTime(initial.end),
              reportType: 'Both',
              configs: ALL_CONFIGS,
            },
            data,
          ),
        ),
      )
      .catch(() => setPreviewHtml('<p>Failed to load the sales details.</p>'))
  }, [preview, initial])

  if (preview !== null) {
    return previewHtml === null ? null : (
      <iframe
        title="Sales Details report preview"
        srcDoc={previewHtml}
        className="fixed inset-0 z-50 h-full w-full bg-white"
      />
    )
  }

  const params: SalesDetailsParams = {
    startDate: fmtDateTime(startDate),
    endDate: fmtDateTime(endDate),
    reportType,
    configs,
  }

  const available = ALL_CONFIGS.filter((c) => !configs.some((x) => x.pos === c.pos))

  const print = async () => {
    if (printing) return
    if (!startDate || !endDate) {
      setError('Pick a start and end date.')
      return
    }
    if (configs.length === 0) {
      setError('Pick at least one POS configuration.')
      return
    }
    setPrinting(true)
    setError(null)
    let data: SalesDetailsData
    try {
      data = await fetchSalesDetails(startDate, endDate, configs.map((c) => c.side))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load the sales details.')
      setPrinting(false)
      return
    }
    printSalesDetails(params, data)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 p-6 pt-8">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="fixed inset-0 cursor-default"
      />

      <div className="relative w-[980px] max-w-full rounded-[3px] bg-white shadow-[0_6px_30px_rgba(0,0,0,0.3)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-800">Sales Details</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <LuX className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {error && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
                className="shrink-0 transition hover:opacity-70"
              >
                <LuX className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-[160px_1fr] items-center gap-y-3">
            <label className="text-[13px] font-semibold text-neutral-800" htmlFor="sd-start">
              Start Date
            </label>
            <input
              id="sd-start"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={DATE_INPUT}
            />

            <label className="text-[13px] font-semibold text-neutral-800" htmlFor="sd-end">
              End Date
            </label>
            <input
              id="sd-end"
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={DATE_INPUT}
            />

            <label className="text-[13px] font-semibold text-neutral-800">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as SalesReportType)}
              className="w-full rounded-[2px] border border-neutral-300 bg-[#eef4fb] px-2.5 py-1.5 text-sm text-neutral-800 outline-none transition focus:border-sky-600"
            >
              {REPORT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* POS configs to include */}
          <div className="mt-8">
            <div className="grid grid-cols-[1fr_1fr_2rem] border-b border-neutral-200 pb-2 text-[13px] font-semibold text-neutral-800">
              <span>Point of Sale</span>
              <span>Company</span>
              <span />
            </div>
            {configs.map((l) => (
              <div
                key={l.pos}
                className="grid grid-cols-[1fr_1fr_2rem] items-center border-b border-neutral-100 py-2 text-[13px] text-neutral-700 transition hover:bg-neutral-50"
              >
                <span>{l.pos}</span>
                <span>{l.company}</span>
                <button
                  type="button"
                  aria-label={`Remove ${l.pos}`}
                  onClick={() => setConfigs(configs.filter((x) => x.pos !== l.pos))}
                  className="justify-self-end text-neutral-500 transition hover:text-neutral-800"
                >
                  <LuX className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <span className="relative block w-max">
              <button
                type="button"
                onClick={() => setAddOpen(!addOpen)}
                onBlur={() => setAddOpen(false)}
                className="py-2 text-[13px] text-sky-700 transition hover:underline"
              >
                Add a line
              </button>
              {addOpen && (
                <ul className="absolute left-0 top-full z-30 w-max min-w-48 border border-neutral-300 bg-white py-1 shadow-[0_2px_6px_rgba(0,0,0,0.15)]">
                  {/* mousedown (not click) so picking wins over the button's blur */}
                  {available.map((c) => (
                    <li key={c.pos}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setConfigs([...configs, c])
                          setAddOpen(false)
                        }}
                        className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-100"
                      >
                        {c.pos}
                      </button>
                    </li>
                  ))}
                  {available.length === 0 && (
                    <li className="px-3 py-1.5 text-[13px] italic text-neutral-500">
                      No records
                    </li>
                  )}
                </ul>
              )}
            </span>
            <div className="mt-1 h-1.5 rounded-sm bg-neutral-700/70" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-neutral-200 px-6 py-4">
          <button
            type="button"
            onClick={() => void print()}
            disabled={printing}
            className="flex items-center gap-2 rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d] disabled:opacity-60"
          >
            {printing && <Loader size="sm" />}
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            className="rounded-[3px] border border-neutral-300 bg-white px-4 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
