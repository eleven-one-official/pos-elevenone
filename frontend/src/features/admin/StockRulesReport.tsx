import { LuPrinter } from 'react-icons/lu'

// ---------------------------------------------------------------------------
// Stock Rules Report — the page behind "View Diagram" on the product
// Inventory tab, Odoo style: source/destination locations as columns, one
// colored arrow per stock rule, route legend underneath. Placeholder data
// mirrors the single Buy route until the backend exposes real routes.
// ---------------------------------------------------------------------------

// Odoo colors report arrows from this palette; the first route gets blue.
const ROUTE_COLOR = '#1f77b4'

export default function StockRulesReport({
  productName,
  onProducts,
  onBack,
}: {
  productName: string
  /** "Products" breadcrumb — back to the product list. */
  onProducts: () => void
  /** Product-name breadcrumb — back to the record this was opened from. */
  onBack: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Control panel — breadcrumb + Print */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="truncate text-[15px] text-neutral-700">
          <button type="button" onClick={onProducts} className="transition hover:underline">
            Products
          </button>
          <span className="text-neutral-400"> / </span>
          <button type="button" onClick={onBack} className="transition hover:underline">
            {productName}
          </button>
          <span className="text-neutral-400"> / </span>
          <span>Stock Rules Report</span>
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
          >
            <LuPrinter className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* Report sheet */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-100/60 py-6">
        <div className="mx-auto w-[min(52rem,calc(100%-2rem))] rounded-[2px] border border-neutral-200 bg-white px-10 py-8 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <h2 className="text-[19px] font-semibold text-neutral-800">{productName}</h2>

          {/* Locations as columns, rules as arrows between them */}
          <div className="mt-6 grid grid-cols-2 border-b border-neutral-300 text-center text-[13px] font-bold text-neutral-800">
            <span className="border-r border-neutral-300 pb-2">Vendors</span>
            <span className="pb-2">WH/Stock</span>
          </div>
          <div className="py-9">
            <div
              aria-label="Buy rule: Vendors to WH/Stock"
              className="mx-[12.5%] flex items-center"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: ROUTE_COLOR }}
              />
              <span className="h-0.5 flex-1" style={{ backgroundColor: ROUTE_COLOR }} />
              <span
                className="h-0 w-0 shrink-0 border-y-[5px] border-l-8 border-y-transparent"
                style={{ borderLeftColor: ROUTE_COLOR }}
              />
            </div>
            <div className="mt-1.5 text-center text-[12px]" style={{ color: ROUTE_COLOR }}>
              Buy
            </div>
          </div>

          {/* Legend */}
          <div className="border-t border-neutral-200 pt-4 text-[13px]">
            <span className="font-bold text-neutral-800">Routes</span>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-0.5 w-8" style={{ backgroundColor: ROUTE_COLOR }} />
              <span style={{ color: ROUTE_COLOR }}>Buy</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
