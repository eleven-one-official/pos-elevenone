import { LuChevronDown, LuX } from 'react-icons/lu'
import { buildSalesDetailsHtml, printSalesDetails } from './printSalesDetails'

// ---------------------------------------------------------------------------
// Reporting › Sales Details — Odoo opens this as a dialog over the Orders
// Analysis screen: a date range + report type and the POS configs to include.
// Print renders the Sales Details report (placeholder data) through the same
// hidden-iframe pipeline the kitchen tickets use.
// ---------------------------------------------------------------------------

const PLACEHOLDER_LINES = [
  { pos: 'TTP', company: 'ElevenOne TTP' },
  { pos: 'TTP Waiter', company: 'ElevenOne TTP' },
]

const REPORT_PARAMS = {
  startDate: '16-Jul-2026 08:33:18',
  endDate: '16-Jul-2026 14:30:25',
  reportType: 'Product',
  configs: PLACEHOLDER_LINES,
}

export default function SalesDetailsDialog({ onClose }: { onClose: () => void }) {
  // Dev builds can inspect the printed report with `?sales-report-preview`.
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).has('sales-report-preview')
  ) {
    return (
      <iframe
        title="Sales Details report preview"
        srcDoc={buildSalesDetailsHtml(REPORT_PARAMS)}
        className="fixed inset-0 z-50 h-full w-full bg-white"
      />
    )
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
          <div className="grid grid-cols-[160px_1fr] items-center gap-y-3">
            <label className="text-[13px] font-semibold text-neutral-800">Start Date</label>
            <span className="relative">
              <input
                defaultValue="16-Jul-2026 08:33:18"
                className="w-full rounded-[2px] border border-neutral-300 bg-[#eef4fb] px-3 py-1.5 pr-8 text-sm text-neutral-800 outline-none transition focus:border-sky-600"
              />
              <LuChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
            </span>

            <label className="text-[13px] font-semibold text-neutral-800">End Date</label>
            <span className="relative">
              <input
                defaultValue="16-Jul-2026 14:30:25"
                className="w-full rounded-[2px] border border-neutral-300 bg-[#eef4fb] px-3 py-1.5 pr-8 text-sm text-neutral-800 outline-none transition focus:border-sky-600"
              />
              <LuChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
            </span>

            <label className="text-[13px] font-semibold text-neutral-800">Report Type</label>
            <select className="w-full rounded-[2px] border border-neutral-300 bg-[#eef4fb] px-2.5 py-1.5 text-sm text-neutral-800 outline-none transition focus:border-sky-600">
              <option>Product</option>
              <option>Category</option>
            </select>
          </div>

          {/* POS configs to include */}
          <div className="mt-8">
            <div className="grid grid-cols-[1fr_1fr_2rem] border-b border-neutral-200 pb-2 text-[13px] font-semibold text-neutral-800">
              <span>Point of Sale</span>
              <span>Company</span>
              <span />
            </div>
            {PLACEHOLDER_LINES.map((l) => (
              <div
                key={l.pos}
                className="grid grid-cols-[1fr_1fr_2rem] items-center border-b border-neutral-100 py-2 text-[13px] text-neutral-700 transition hover:bg-neutral-50"
              >
                <span>{l.pos}</span>
                <span>{l.company}</span>
                <button
                  type="button"
                  aria-label={`Remove ${l.pos}`}
                  className="justify-self-end text-neutral-500 transition hover:text-neutral-800"
                >
                  <LuX className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="py-2 text-[13px] text-sky-700 transition hover:underline"
            >
              Add a line
            </button>
            <div className="mt-1 h-1.5 rounded-sm bg-neutral-700/70" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-neutral-200 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              printSalesDetails(REPORT_PARAMS)
              onClose()
            }}
            className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[3px] border border-neutral-300 bg-white px-4 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
