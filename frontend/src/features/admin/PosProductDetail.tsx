import { useState } from 'react'
import {
  LuArrowRight,
  LuArrowRightLeft,
  LuCamera,
  LuChevronLeft,
  LuChevronRight,
  LuClock,
  LuCreditCard,
  LuList,
  LuPaperclip,
  LuSettings,
  LuStar,
  LuUser,
  LuX,
} from 'react-icons/lu'
import { LoadingOverlay } from '../../components/ui/Loader'
import type { ProductType } from '../../services/api/adminMenu'
import ChooseLabelsLayoutDialog from './ChooseLabelsLayoutDialog'
import { FieldGroup, LABEL } from './formKit'
import type { Product } from './PosProducts'
import StockRulesReport from './StockRulesReport'

// ---------------------------------------------------------------------------
// Product detail — the read-only Odoo form shown when a product is clicked in
// the list. Shows the real record; the Action menu archives, duplicates or
// deletes it through the API (delete asks for confirmation first).
// ---------------------------------------------------------------------------

const TABS = ['General Information', 'Sales', 'Purchase', 'Inventory', 'Accounting']

const TYPE_LABEL: Record<ProductType, string> = {
  consu: 'Consumable',
  product: 'Storable Product',
  service: 'Service',
}

const VALUE = 'pt-1 text-[13px] text-neutral-800'
const LINK = 'pt-1 text-[13px] text-[#3d6e93]'

export default function PosProductDetail({
  product,
  index,
  total,
  starred,
  onToggleStar,
  onBack,
  onCreate,
  onEdit,
  onPrev,
  onNext,
  onToggleArchive,
  onDuplicate,
  onDelete,
}: {
  product: Product
  index: number
  total: number
  starred: boolean
  onToggleStar: () => void
  onBack: () => void
  onCreate: () => void
  onEdit: () => void
  onPrev: () => void
  onNext: () => void
  onToggleArchive: () => Promise<void>
  onDuplicate: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [tab, setTab] = useState(TABS[0])
  // Dev builds can pre-open the Action menu with `?action-open`.
  const [actionOpen, setActionOpen] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('action-open'),
  )
  const [printLabelsOpen, setPrintLabelsOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // View Diagram on the Inventory tab swaps the screen for the Stock Rules
  // Report, Odoo style.
  const [diagramOpen, setDiagramOpen] = useState(false)

  const raw = product.raw

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The action failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (diagramOpen) {
    return (
      <StockRulesReport
        productName={product.name}
        onProducts={onBack}
        onBack={() => setDiagramOpen(false)}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel — breadcrumb, Edit/Create, Action, pagination */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="truncate text-[15px] text-neutral-700">
              <button type="button" onClick={onBack} className="transition hover:underline">
                Products
              </button>
              <span className="text-neutral-400"> / </span>
              <span>{product.name}</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onCreate}
                className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                Create
              </button>
            </div>
          </div>

          {/* Action menu, centered like Odoo */}
          <div className="relative flex flex-1 justify-center pt-8">
            <button
              type="button"
              onClick={() => setActionOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50"
            >
              <LuSettings className="h-3.5 w-3.5" />
              Action
            </button>
            {actionOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setActionOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute top-full z-20 mt-1 w-56 border border-neutral-200/70 bg-white py-1 text-neutral-600 shadow-md">
                  <button
                    type="button"
                    onClick={() => {
                      setActionOpen(false)
                      void runAction(onToggleArchive)
                    }}
                    className="block w-full px-4 py-1.5 text-left text-[13px] transition hover:bg-neutral-100"
                  >
                    {product.archived ? 'Unarchive' : 'Archive'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionOpen(false)
                      void runAction(onDuplicate)
                    }}
                    className="block w-full px-4 py-1.5 text-left text-[13px] transition hover:bg-neutral-100"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionOpen(false)
                      setConfirmDelete(true)
                    }}
                    className="block w-full px-4 py-1.5 text-left text-[13px] transition hover:bg-neutral-100"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionOpen(false)}
                    className="block w-full px-4 py-1.5 text-left text-[13px] transition hover:bg-neutral-100"
                  >
                    Generate Pricelist Report
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 pt-8">
            <span className="text-[13px] text-neutral-600">
              {index + 1} / {total}
            </span>
            <div className="inline-flex overflow-hidden rounded-[3px] border border-neutral-300">
              <button
                type="button"
                aria-label="Previous product"
                onClick={onPrev}
                disabled={index === 0}
                className="px-2 py-1.5 text-neutral-500 transition hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                <LuChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next product"
                onClick={onNext}
                disabled={index === total - 1}
                className="border-l border-neutral-300 px-2 py-1.5 text-neutral-500 transition hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                <LuChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Read-only sheet */}
        <div className="relative min-w-0 flex-1 overflow-y-auto bg-neutral-100/60 pb-6">
          {busy && <LoadingOverlay />}

          {error && (
            <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
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

          <div className="px-4 pt-3">
            <button
              type="button"
              onClick={() => setPrintLabelsOpen(true)}
              className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50"
            >
              Print Labels
            </button>
          </div>

          <div className="relative mx-4 mt-3 overflow-hidden rounded-[2px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            {/* Archived ribbon, Odoo style */}
            {product.archived && (
              <span className="absolute -right-9 top-5 z-10 rotate-45 bg-red-600/90 px-10 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Archived
              </span>
            )}

            {/* Stat buttons */}
            <div className="flex justify-end">
              <div className="inline-flex divide-x divide-neutral-200 border-b border-l border-neutral-200">
                <button
                  type="button"
                  className="flex items-center gap-2.5 px-4 py-2 text-left transition hover:bg-neutral-50"
                >
                  <LuList className="h-4.5 w-4.5 text-neutral-500" />
                  <span className="text-[12px] leading-tight text-neutral-700">
                    <span className="block font-semibold">0</span>
                    Extra Prices
                  </span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2.5 px-4 py-2 text-left transition hover:bg-neutral-50"
                >
                  <LuArrowRightLeft className="h-4.5 w-4.5 text-neutral-500" />
                  <span className="text-[12px] leading-tight text-neutral-700">
                    <span className="block">On hand:</span>
                    {product.onHand ?? '—'}
                  </span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2.5 px-4 py-2 text-left transition hover:bg-neutral-50"
                >
                  <LuCreditCard className="h-4.5 w-4.5 text-neutral-500" />
                  <span className="text-[12px] leading-tight text-neutral-700">
                    <span className="block font-semibold">0.00 Pcs</span>
                    Purchased
                  </span>
                </button>
              </div>
            </div>

            {/* Name + image */}
            <div className="flex items-start justify-between gap-6 px-8 pt-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-neutral-800">Product Name</div>
                <div className="mt-1 flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Favorite"
                    onClick={onToggleStar}
                    className={`transition ${
                      starred ? 'text-amber-500' : 'text-neutral-400 hover:text-amber-500'
                    }`}
                  >
                    <LuStar className={`h-6 w-6 ${starred ? 'fill-amber-500' : ''}`} />
                  </button>
                  <h1 className="truncate text-[26px] font-semibold text-neutral-800">
                    {product.name}
                  </h1>
                </div>

                <div className="mt-3 flex items-center gap-6 pl-9 text-[13px] font-bold text-neutral-800">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={product.canBeSold}
                      readOnly
                      className="h-3.5 w-3.5 accent-teal-700"
                    />
                    Can be Sold
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={product.canBePurchased}
                      readOnly
                      className="h-3.5 w-3.5 accent-teal-700"
                    />
                    Can be Purchased
                  </label>
                </div>
              </div>

              <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-neutral-300 text-neutral-300">
                {product.image ? (
                  <img src={product.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <LuCamera className="h-9 w-9" />
                )}
              </span>
            </div>

            {/* Notebook tabs */}
            <div className="mt-5 flex items-end gap-0 border-b border-neutral-200 px-8 text-[13.5px]">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`-mb-px px-4 py-2 transition ${
                    t === tab
                      ? 'rounded-t-[2px] border border-b-0 border-neutral-200 bg-white text-neutral-800'
                      : 'border border-transparent text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'General Information' ? (
              <>
                <div className="grid grid-cols-1 gap-x-16 gap-y-3 px-8 py-5 xl:grid-cols-2">
                  <FieldGroup>
                    <label className={LABEL}>Product Type</label>
                    <span className={VALUE}>{TYPE_LABEL[raw.product_type]}</span>

                    <label className={LABEL}>Invoicing Policy</label>
                    <span className={VALUE}>Ordered quantities</span>

                    <label className={LABEL}>Available in POS</label>
                    <span className={VALUE}>{product.availableInPos ? 'Yes' : 'No'}</span>

                    <label className={LABEL}>Unit of Measure</label>
                    <span className={LINK}>Pcs</span>

                    <label className={LABEL}>Purchase UoM</label>
                    <span className={LINK}>Pcs</span>
                  </FieldGroup>

                  <FieldGroup>
                    <label className={LABEL}>Sales Price</label>
                    <span className={VALUE}>{product.price}</span>

                    <label className={LABEL}>Customer Taxes</label>
                    <span className={VALUE} />

                    <label className={LABEL}>Cost</label>
                    <span className={VALUE}>$ {Number(raw.cost).toFixed(2)}&ensp;per Pcs</span>

                    <label className={LABEL}>Product Category</label>
                    <span className={VALUE}>{product.category}</span>

                    <label className={LABEL}>Internal Reference</label>
                    <span className={VALUE}>{raw.internal_reference}</span>

                    <label className={LABEL}>Barcode</label>
                    <span className={VALUE}>{raw.barcode}</span>

                    <label className={LABEL}>Company</label>
                    <span className={LINK}>ElevenOne TTP</span>
                  </FieldGroup>
                </div>

                <div className="px-8 pb-10">
                  <div className="border-b border-neutral-300 pb-1 text-[12.5px] font-semibold text-[#54717e]">
                    Internal Notes
                  </div>
                  {raw.internal_notes && (
                    <p className="whitespace-pre-wrap pt-2 text-[13px] text-neutral-700">
                      {raw.internal_notes}
                    </p>
                  )}
                </div>
              </>
            ) : tab === 'Inventory' ? (
              <div className="px-8 py-5 pb-10">
                <div className="grid grid-cols-1 gap-x-16 gap-y-8 xl:grid-cols-2">
                  <FieldGroup title="Operations">
                    <label className={LABEL}>Routes</label>
                    <div className="text-[13px] text-neutral-700">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          defaultChecked
                          className="h-3.5 w-3.5 accent-teal-700"
                        />
                        Buy
                      </label>
                      <button
                        type="button"
                        onClick={() => setDiagramOpen(true)}
                        className="mt-2.5 flex items-center gap-1.5 transition hover:underline"
                      >
                        <LuArrowRight className="h-3.5 w-3.5 text-teal-600" />
                        View Diagram
                      </button>
                    </div>
                  </FieldGroup>

                  <FieldGroup title="Logistics">
                    <label className={LABEL}>Responsible</label>
                    <span className="flex items-center gap-2 pt-1">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fuchsia-700 text-[10px] font-bold text-white">
                        S
                      </span>
                      <span className="truncate text-[13px] text-[#3d6e93]">Srun Soklim</span>
                    </span>

                    <label className={LABEL}>On Hand</label>
                    <span className={VALUE}>{product.onHand ?? 'Not tracked'}</span>

                    <label className={LABEL}>Weight</label>
                    <span className={VALUE}>0.00</span>

                    <label className={LABEL}>Volume</label>
                    <span className={VALUE}>0.00</span>
                  </FieldGroup>
                </div>

                <div className="mt-10 grid grid-cols-1 gap-x-16 gap-y-6 xl:grid-cols-2">
                  <div className="border-b border-neutral-300 pb-1 text-[12.5px] font-semibold text-[#54717e]">
                    Description for Receipts
                  </div>
                  <div className="border-b border-neutral-300 pb-1 text-[12.5px] font-semibold text-[#54717e]">
                    Description for Delivery Orders
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-8 py-10 text-center text-sm text-neutral-400">
                {tab} — UI coming soon.
              </div>
            )}
          </div>
        </div>

        {/* Chatter — empty conversation */}
        <aside className="hidden w-[31%] min-w-80 shrink-0 overflow-y-auto border-l border-neutral-200 bg-white lg:block">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13px] text-neutral-600">
            <div className="flex items-center gap-4">
              <button type="button" className="transition hover:text-neutral-900">
                Send message
              </button>
              <button type="button" className="transition hover:text-neutral-900">
                Log note
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 transition hover:text-neutral-900"
              >
                <LuClock className="h-4 w-4" />
                Schedule activity
              </button>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <LuPaperclip className="h-4 w-4" />0
              </span>
              <button type="button" className="transition hover:text-neutral-900">
                Follow
              </button>
              <span className="flex items-center gap-1">
                <LuUser className="h-4 w-4" />0
              </span>
            </div>
          </div>

          <p className="px-5 py-10 text-center text-[13px] italic text-neutral-500">
            There are no messages in this conversation.
          </p>
        </aside>
      </div>

      {/* Delete confirmation, Odoo style */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-3 text-[15px] font-semibold text-neutral-800">
              Confirmation
            </div>
            <p className="px-5 py-4 text-sm text-neutral-700">
              Are you sure you want to delete "{product.name}"? Past orders keep their history, but
              the product disappears from the catalog for good.
            </p>
            <div className="flex gap-1.5 border-t border-neutral-200 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false)
                  void runAction(onDelete)
                }}
                className="rounded-[3px] bg-red-600 px-4 py-1.5 text-sm text-white transition hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {printLabelsOpen && <ChooseLabelsLayoutDialog onClose={() => setPrintLabelsOpen(false)} />}
    </div>
  )
}
