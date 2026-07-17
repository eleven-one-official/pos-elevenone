import { useState } from 'react'
import {
  LuArrowRight,
  LuArrowRightLeft,
  LuCamera,
  LuChevronDown,
  LuClock,
  LuCreditCard,
  LuEllipsisVertical,
  LuExternalLink,
  LuList,
  LuPaperclip,
  LuStar,
  LuUser,
} from 'react-icons/lu'
import ChooseLabelsLayoutDialog from './ChooseLabelsLayoutDialog'
import {
  BLUE_SELECT,
  DropdownStub,
  FIELD_BG,
  FieldGroup,
  LABEL,
  Many2OneField,
  NoteSection,
  TEXT_INPUT,
} from './formKit'
import StockRulesReport from './StockRulesReport'

// ---------------------------------------------------------------------------
// Product form — Odoo-style, used both for Products / New and for editing an
// existing product (breadcrumb shows its name, fields prefill). Pure UI: Save
// and Discard both just go back until the backend endpoints are wired in.
// ---------------------------------------------------------------------------

const FORM_TABS = ['General Information', 'Sales', 'Purchase', 'Inventory', 'Accounting']

// Product category tree, sorted by full path — the first seven fill the
// dropdown and the rest sit behind "Search More...", Odoo style.
const PRODUCT_CATEGORIES = [
  'Addition_',
  'Addition_ / ECO BOXES',
  'Alcoholic Drink_',
  'Alcoholic Drink_ / Beer_',
  'Alcoholic Drink_ / Cocktails_',
  'Alcoholic Drink_ / Cocktails_ / Monthly Special_',
  'All',
  'Coffee_',
  'Coffee_ / Hot_',
  'Coffee_ / Iced_',
  'Food_',
  'Food_ / Breakfast_',
  'Food_ / Dessert_',
  'Food_ / Main Course_',
  'Juice_ & Shake_',
  'Soft Drink_',
  'Tea_',
  'Water_',
]

export default function PosProductForm({
  onBack,
  onSave,
  product,
}: {
  /** Breadcrumb + Discard — leaves the form back to the product list. */
  onBack: () => void
  /** Save — back to the record detail when editing; defaults to onBack. */
  onSave?: () => void
  product?: { name: string; price: string }
}) {
  // Dev builds can open a specific tab with `?product-tab=<name>`.
  const [formTab, setFormTab] = useState(() => {
    const t = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get('product-tab')
      : null
    return t && FORM_TABS.includes(t) ? t : FORM_TABS[0]
  })
  // Print Labels opens the label-layout wizard, Odoo style. Dev builds can
  // pre-open it with `?print-labels`.
  const [printLabelsOpen, setPrintLabelsOpen] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('print-labels'),
  )
  // View Diagram on the Inventory tab swaps the screen for the Stock Rules
  // Report, Odoo style.
  const [diagramOpen, setDiagramOpen] = useState(false)

  if (diagramOpen) {
    return (
      <StockRulesReport
        productName={product ? product.name : 'New'}
        onProducts={onBack}
        onBack={() => setDiagramOpen(false)}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel — breadcrumb + Save/Discard */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="text-[15px] text-neutral-700">
          <button type="button" onClick={onBack} className="transition hover:underline">
            Products
          </button>
          <span className="text-neutral-400"> / </span>
          <span>{product ? product.name : 'New'}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSave ?? onBack}
            className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            Discard
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Form area */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-neutral-100/60 pb-6">
          <div className="px-4 pt-3">
            <button
              type="button"
              onClick={() => setPrintLabelsOpen(true)}
              className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50"
            >
              Print Labels
            </button>
          </div>

          {/* Sheet */}
          <div className="mx-4 mt-3 rounded-[2px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
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
                    <span className="block">In: 0</span>
                    Out: 0
                  </span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2.5 px-4 py-2 text-left transition hover:bg-neutral-50"
                >
                  <LuCreditCard className="h-4.5 w-4.5 text-neutral-500" />
                  <span className="text-[12px] leading-tight text-neutral-700">
                    <span className="block font-semibold">0.00 kg</span>
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
                    className="text-neutral-400 transition hover:text-amber-500"
                  >
                    <LuStar className="h-6 w-6" />
                  </button>
                  <span className="inline-flex w-[56%] min-w-72 items-stretch">
                    <input
                      placeholder="e.g. Cheese Burger"
                      defaultValue={product?.name}
                      className={`min-w-0 flex-1 rounded-l-[2px] border border-neutral-300 ${FIELD_BG} px-3 py-1.5 text-[22px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-sky-600`}
                    />
                    <span className="flex items-center rounded-r-[2px] border border-l-0 border-neutral-300 bg-white px-2 text-[12px] font-semibold text-neutral-600">
                      EN
                    </span>
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-6 pl-9 text-[13px] font-bold text-neutral-800">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" defaultChecked className="h-3.5 w-3.5 accent-teal-700" />
                    Can be Sold
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" defaultChecked className="h-3.5 w-3.5 accent-teal-700" />
                    Can be Purchased
                  </label>
                </div>
              </div>

              <button
                type="button"
                aria-label="Add product image"
                className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[2px] border border-neutral-300 text-neutral-300 transition hover:text-neutral-400"
              >
                <LuCamera className="h-9 w-9" />
              </button>
            </div>

            {/* Notebook tabs */}
            <div className="mt-5 flex items-end gap-0 border-b border-neutral-200 px-8 text-[13.5px]">
              {FORM_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFormTab(t)}
                  className={`-mb-px px-4 py-2 transition ${
                    t === formTab
                      ? 'rounded-t-[2px] border border-b-0 border-neutral-200 bg-white text-neutral-800'
                      : 'border border-transparent text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* ---- General Information ---- */}
            {formTab === 'General Information' && (
              <>
                <div className="grid grid-cols-1 gap-x-16 gap-y-3 px-8 py-5 xl:grid-cols-2">
                  <FieldGroup>
                    <label className={LABEL}>Product Type</label>
                    <select className={BLUE_SELECT}>
                      <option>Consumable</option>
                      <option>Storable Product</option>
                      <option>Service</option>
                    </select>

                    <label className={LABEL}>Invoicing Policy</label>
                    <select className={BLUE_SELECT}>
                      <option>Ordered quantities</option>
                      <option>Delivered quantities</option>
                    </select>

                    <label className="pt-0.5 text-[13px] font-bold text-neutral-800">
                      Re-Invoice Expenses
                    </label>
                    <div className="text-[13px] text-neutral-700">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="reinvoice"
                          defaultChecked
                          className="h-3.5 w-3.5 accent-teal-700"
                        />
                        No
                      </label>
                      <label className="mt-1 flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="reinvoice"
                          className="h-3.5 w-3.5 accent-teal-700"
                        />
                        At cost
                      </label>
                      <label className="mt-1 flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="reinvoice"
                          className="h-3.5 w-3.5 accent-teal-700"
                        />
                        Sales price
                      </label>

                      <p className="mt-4 italic text-neutral-500">
                        Consumables are physical products for which you don't manage the inventory
                        level: they are always available.
                      </p>
                      <p className="mt-2 italic text-neutral-500">
                        You can invoice them before they are delivered.
                      </p>
                    </div>

                    <label className={LABEL}>Unit of Measure</label>
                    <span className="flex items-center gap-2">
                      <select className={BLUE_SELECT}>
                        <option>kg</option>
                        <option>Units</option>
                        <option>Pcs</option>
                        <option>L</option>
                      </select>
                      <LuExternalLink className="h-4 w-4 shrink-0 text-neutral-500" />
                    </span>

                    <label className={LABEL}>Purchase UoM</label>
                    <span className="flex items-center gap-2">
                      <select className={BLUE_SELECT}>
                        <option>kg</option>
                        <option>Units</option>
                        <option>Pcs</option>
                        <option>L</option>
                      </select>
                      <LuExternalLink className="h-4 w-4 shrink-0 text-neutral-500" />
                    </span>
                  </FieldGroup>

                  <FieldGroup>
                    <label className={LABEL}>Sales Price</label>
                    <input
                      defaultValue={product?.price ?? '$1.00'}
                      className={`${TEXT_INPUT} max-w-28`}
                    />

                    <label className={LABEL}>Customer Taxes</label>
                    <DropdownStub />

                    <label className={LABEL}>Cost</label>
                    <input defaultValue="0.00" className={TEXT_INPUT} />

                    <label className={LABEL}>Product Category</label>
                    <span className="flex items-center gap-2">
                      <Many2OneField blue options={PRODUCT_CATEGORIES} value="All" />
                      <LuExternalLink className="h-4 w-4 shrink-0 text-neutral-500" />
                    </span>

                    <label className={LABEL}>Internal Reference</label>
                    <input className={TEXT_INPUT} />

                    <label className={LABEL}>Barcode</label>
                    <input className={TEXT_INPUT} />

                    <label className={LABEL}>Company</label>
                    <DropdownStub />
                  </FieldGroup>
                </div>

                <NoteSection
                  title="Internal Notes"
                  placeholder="This note is only for internal purposes."
                  className="px-8 pb-8"
                />
              </>
            )}

            {/* ---- Sales ---- */}
            {formTab === 'Sales' && (
              <div className="px-8 py-5 pb-10">
                <div className="max-w-xl">
                  <FieldGroup title="Point of Sale">
                    <label className={LABEL}>Available in POS</label>
                    <input
                      type="checkbox"
                      defaultChecked
                      className="mt-1.5 h-3.5 w-3.5 justify-self-start accent-teal-700"
                    />

                    <label className={LABEL}>To Weigh With Scale</label>
                    <input
                      type="checkbox"
                      className="mt-1.5 h-3.5 w-3.5 justify-self-start accent-teal-700"
                    />

                    <label className={LABEL}>Category</label>
                    <DropdownStub />
                  </FieldGroup>
                </div>

                <NoteSection
                  title="Sales Description"
                  placeholder="This note is added to sales orders and invoices."
                  className="mt-10 max-w-xl"
                />
              </div>
            )}

            {/* ---- Purchase ---- */}
            {formTab === 'Purchase' && (
              <div className="px-8 py-5 pb-10">
                {/* Vendor pricelist lines */}
                <div className="text-[13px]">
                  <div className="grid grid-cols-[2fr_1.6fr_0.8fr_1.4fr_0.8fr_0.9fr_2rem] gap-x-3 border-b border-neutral-200 pb-2 font-bold text-neutral-800">
                    <span>Vendor</span>
                    <span>Currency</span>
                    <span className="text-right">Quantity</span>
                    <span>Unit of Measure</span>
                    <span className="text-right">Price</span>
                    <span className="truncate">Delivery L...</span>
                    <LuEllipsisVertical className="h-4 w-4 justify-self-end text-neutral-500" />
                  </div>
                  <button
                    type="button"
                    className="w-full border-b border-neutral-100 py-2 text-left text-sky-700 transition hover:underline"
                  >
                    Add a line
                  </button>
                  <div className="mt-3 h-7 bg-neutral-100/80" />
                  <div className="mt-6 h-1.5 rounded-sm bg-neutral-700/80" />
                </div>

                <div className="mt-10 max-w-xl">
                  <FieldGroup title="Vendor Bills">
                    <label className={LABEL}>Vendor Taxes</label>
                    <DropdownStub />

                    <label className={LABEL}>Control Policy</label>
                    <div className="text-[13px] text-neutral-700">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="control-policy"
                          className="h-3.5 w-3.5 accent-teal-700"
                        />
                        On ordered quantities
                      </label>
                      <label className="mt-1 flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="control-policy"
                          defaultChecked
                          className="h-3.5 w-3.5 accent-teal-700"
                        />
                        On received quantities
                      </label>
                    </div>
                  </FieldGroup>
                </div>

                <NoteSection
                  title="Purchase Description"
                  placeholder="This note is added to purchase orders."
                  className="mt-10 max-w-xl"
                />
              </div>
            )}

            {/* ---- Inventory ---- */}
            {formTab === 'Inventory' && (
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
                    <span className="flex items-center gap-2">
                      <span className="relative flex w-full items-center gap-2 rounded-[2px] border border-neutral-300 px-2 py-1">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fuchsia-700 text-[10px] font-bold text-white">
                          S
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">
                          Srun Soklim
                        </span>
                        <LuChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                      </span>
                      <LuExternalLink className="h-4 w-4 shrink-0 text-neutral-500" />
                    </span>

                    <label className={LABEL}>Weight</label>
                    <input defaultValue="0.00" className={TEXT_INPUT} />

                    <label className={LABEL}>Volume</label>
                    <input defaultValue="0.00" className={TEXT_INPUT} />

                    <label className={LABEL}>Customer Lead Time</label>
                    <span className="flex items-center gap-2 text-[13px] text-neutral-700">
                      <input defaultValue="0.00" className={`${TEXT_INPUT} max-w-44`} />
                      days
                    </span>
                  </FieldGroup>
                </div>

                <div className="mt-10 grid grid-cols-1 gap-x-16 gap-y-6 xl:grid-cols-2">
                  <NoteSection
                    title="Description for Receipts"
                    placeholder="This note is added to receipt orders (e.g. where to store the product in the warehouse)."
                  />
                  <NoteSection
                    title="Description for Delivery Orders"
                    placeholder="This note is added to delivery orders."
                  />
                </div>
              </div>
            )}

            {/* ---- Accounting ---- */}
            {formTab === 'Accounting' && (
              <div className="grid grid-cols-1 gap-x-16 gap-y-8 px-8 py-5 pb-24 xl:grid-cols-2">
                <FieldGroup title="Receivables">
                  <label className={LABEL}>Income Account</label>
                  <DropdownStub />
                </FieldGroup>

                <FieldGroup title="Payables">
                  <label className={LABEL}>Expense Account</label>
                  <DropdownStub />

                  <label className={LABEL}>Asset Type</label>
                  <DropdownStub />

                  <label className={LABEL}>Price Difference Account</label>
                  <DropdownStub />
                </FieldGroup>
              </div>
            )}
          </div>
        </div>

        {/* Chatter */}
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

          <div className="relative mx-5 my-2">
            <hr className="border-neutral-200" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-[12px] font-semibold text-neutral-600">
              Today
            </span>
          </div>

          <div className="flex items-start gap-3 bg-[#f1f6fa] px-5 py-3">
            <span className="relative shrink-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-fuchsia-700 text-sm font-bold text-white">
                S
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
            </span>
            <span className="text-[13px] leading-snug">
              <span className="block font-semibold text-neutral-800">Srun Soklim</span>
              <span className="text-neutral-600">
                {product ? 'Editing the record...' : 'Creating a new record...'}
              </span>
            </span>
          </div>
        </aside>
      </div>

      {printLabelsOpen && <ChooseLabelsLayoutDialog onClose={() => setPrintLabelsOpen(false)} />}
    </div>
  )
}
