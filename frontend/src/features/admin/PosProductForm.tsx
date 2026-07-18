import { useMemo, useRef, useState } from 'react'
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
  LuX,
} from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import {
  createMenuItem,
  updateMenuItem,
  type AdminCategory,
  type AdminMenuItem,
  type MenuItemInput,
  type ProductType,
} from '../../services/api/adminMenu'
import { ApiError, assetUrl } from '../../services/api/client'
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
// existing product (breadcrumb shows its name, fields prefill). Save writes
// the record through the menu-items API; fields the backend doesn't model yet
// (UoM, taxes, accounts, ...) stay as display-only placeholders.
// ---------------------------------------------------------------------------

const FORM_TABS = ['General Information', 'Sales', 'Purchase', 'Inventory', 'Accounting']

const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  consu: 'Consumable',
  product: 'Storable Product',
  service: 'Service',
}

// Units of measure in Odoo's dropdown order — the first seven fill the
// dropdown and the full list backs the "Search More..." dialog.
const UOM_OPTIONS = [
  'mm',
  'g',
  'cm',
  'in³',
  'in',
  'oz',
  'fl oz (US)',
  'kg',
  'Units',
  'Dozens',
  'm',
  'km',
  'mi',
  'ft',
  'yd',
  'L',
  'm³',
  'ft³',
  'gal (US)',
  'qt (US)',
  'lb',
  't',
  'Days',
  'Hours',
]

// Chart of accounts, sorted by code — the first seven fill the dropdown and
// the full list backs the "Search More..." dialog, Odoo style.
const ACCOUNT_OPTIONS = [
  '101000 Current Assets',
  '101300 Account Receivable (PoS)',
  '101401 Bank Suspense Account',
  '101402 Outstanding Receipts',
  '101403 Outstanding Payments',
  '101404 Bank',
  '101405 Sathyka & Viseth',
  '101501 Cash',
  '101701 Liquidity Transfer',
  '110100 Stock Valuation',
  '110200 Stock Interim (Received)',
  '110300 Stock Interim (Delivered)',
  '120000 Account Receivable',
  '131000 Tax Paid',
  '201000 Account Payable',
  '251000 Tax Received',
  '400000 Product Sales',
  '450000 Cost of Goods Sold',
  '600000 Expenses',
  '999999 Undistributed Profits/Losses',
]

// Expense-side lookups exclude receivable/payable/bank/cash accounts, so their
// dropdown leads with the suspense and stock accounts like Odoo's.
const EXPENSE_ACCOUNT_EXCLUDED = ['101300', '101404', '101405', '101501', '120000', '201000']
const EXPENSE_ACCOUNT_OPTIONS = ACCOUNT_OPTIONS.filter(
  (a) => !EXPENSE_ACCOUNT_EXCLUDED.includes(a.split(' ')[0]),
)

/** First human-readable message out of an API failure. */
function saveErrorText(e: unknown): string {
  if (e instanceof ApiError && e.errors) {
    const first = Object.values(e.errors)[0]?.[0]
    if (first) return first
  }
  return e instanceof Error ? e.message : 'Save failed. Try again.'
}

export default function PosProductForm({
  onBack,
  onSaved,
  product,
  categories,
}: {
  /** Breadcrumb + Discard — leaves the form back to the product list. */
  onBack: () => void
  /** Called with the saved record after a successful create/update. */
  onSaved: (item: AdminMenuItem) => void | Promise<void>
  /** Existing record when editing; omit to create a new product. */
  product?: AdminMenuItem
  categories: AdminCategory[]
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

  // --- Editable fields (everything the menu-items API persists) ------------
  const [name, setName] = useState(product?.name ?? '')
  const [canBeSold, setCanBeSold] = useState(product?.can_be_sold ?? true)
  const [canBePurchased, setCanBePurchased] = useState(product?.can_be_purchased ?? false)
  const [productType, setProductType] = useState<ProductType>(product?.product_type ?? 'consu')
  const [priceText, setPriceText] = useState(() =>
    product ? Number(product.price).toFixed(2) : '1.00',
  )
  const [costText, setCostText] = useState(() =>
    product ? Number(product.cost).toFixed(2) : '0.00',
  )
  const [categoryId, setCategoryId] = useState<number | null>(product?.category_id ?? null)
  const [internalReference, setInternalReference] = useState(product?.internal_reference ?? '')
  const [barcode, setBarcode] = useState(product?.barcode ?? '')
  const [availableInPos, setAvailableInPos] = useState(product?.is_available ?? true)
  const [internalNotes, setInternalNotes] = useState(product?.internal_notes ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const imagePreview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : assetUrl(product?.image ?? null)),
    [imageFile, product],
  )

  const save = async () => {
    if (saving) return
    const price = Number.parseFloat(priceText.replace(/[^0-9.]/g, ''))
    if (!name.trim()) {
      setError('The product name is required.')
      return
    }
    if (Number.isNaN(price) || price < 0) {
      setError('Enter a valid sales price.')
      return
    }
    if (categoryId === null) {
      setError('Pick a product category.')
      return
    }
    const input: MenuItemInput = {
      category_id: categoryId,
      product_type: productType,
      name: name.trim(),
      price,
      cost: Number.parseFloat(costText.replace(/[^0-9.]/g, '')) || 0,
      description: description.trim() || null,
      barcode: barcode.trim() || null,
      internal_reference: internalReference.trim() || null,
      internal_notes: internalNotes.trim() || null,
      is_available: availableInPos,
      can_be_sold: canBeSold,
      can_be_purchased: canBePurchased,
    }
    if (imageFile) input.image = imageFile
    setSaving(true)
    setError(null)
    try {
      const saved = product ? await updateMenuItem(product.id, input) : await createMenuItem(input)
      await onSaved(saved)
    } catch (e: unknown) {
      setError(saveErrorText(e))
      setSaving(false)
    }
  }

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
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d] disabled:opacity-60"
          >
            {saving && <Loader size="sm" />}
            Save
          </button>
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
          >
            Discard
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Form area */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-neutral-100/60 pb-6">
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
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`min-w-0 flex-1 rounded-l-[2px] border border-neutral-300 ${FIELD_BG} px-3 py-1.5 text-[22px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-sky-600`}
                    />
                    <span className="flex items-center rounded-r-[2px] border border-l-0 border-neutral-300 bg-white px-2 text-[12px] font-semibold text-neutral-600">
                      EN
                    </span>
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-6 pl-9 text-[13px] font-bold text-neutral-800">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={canBeSold}
                      onChange={(e) => setCanBeSold(e.target.checked)}
                      className="h-3.5 w-3.5 accent-teal-700"
                    />
                    Can be Sold
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={canBePurchased}
                      onChange={(e) => setCanBePurchased(e.target.checked)}
                      className="h-3.5 w-3.5 accent-teal-700"
                    />
                    Can be Purchased
                  </label>
                </div>
              </div>

              {/* Product image — click to pick a photo */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setImageFile(file)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                aria-label="Add product image"
                onClick={() => imageInputRef.current?.click()}
                className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-neutral-300 text-neutral-300 transition hover:text-neutral-400"
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <LuCamera className="h-9 w-9" />
                )}
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
                    <select
                      value={productType}
                      onChange={(e) => setProductType(e.target.value as ProductType)}
                      className={BLUE_SELECT}
                    >
                      {(Object.keys(PRODUCT_TYPE_LABEL) as ProductType[]).map((t) => (
                        <option key={t} value={t}>
                          {PRODUCT_TYPE_LABEL[t]}
                        </option>
                      ))}
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
                      <Many2OneField blue title="Unit of Measure" options={UOM_OPTIONS} value="kg" />
                      <LuExternalLink className="h-4 w-4 shrink-0 text-neutral-500" />
                    </span>

                    <label className={LABEL}>Purchase UoM</label>
                    <span className="flex items-center gap-2">
                      <Many2OneField blue title="Unit of Measure" options={UOM_OPTIONS} value="kg" />
                      <LuExternalLink className="h-4 w-4 shrink-0 text-neutral-500" />
                    </span>
                  </FieldGroup>

                  <FieldGroup>
                    <label className={LABEL}>Sales Price</label>
                    <input
                      value={priceText}
                      onChange={(e) => setPriceText(e.target.value)}
                      className={`${TEXT_INPUT} max-w-28`}
                    />

                    <label className={LABEL}>Customer Taxes</label>
                    <DropdownStub />

                    <label className={LABEL}>Cost</label>
                    <input
                      value={costText}
                      onChange={(e) => setCostText(e.target.value)}
                      className={TEXT_INPUT}
                    />

                    <label className={LABEL}>Product Category</label>
                    <span className="flex items-center gap-2">
                      <Many2OneField
                        blue
                        title="Product Category"
                        options={categories.map((c) => c.name)}
                        value={
                          categories.find((c) => c.id === categoryId)?.name ??
                          product?.category?.name ??
                          ''
                        }
                        onSelect={(v) =>
                          setCategoryId(categories.find((c) => c.name === v)?.id ?? null)
                        }
                      />
                      <LuExternalLink className="h-4 w-4 shrink-0 text-neutral-500" />
                    </span>

                    <label className={LABEL}>Internal Reference</label>
                    <input
                      value={internalReference}
                      onChange={(e) => setInternalReference(e.target.value)}
                      className={TEXT_INPUT}
                    />

                    <label className={LABEL}>Barcode</label>
                    <input
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      className={TEXT_INPUT}
                    />

                    <label className={LABEL}>Company</label>
                    <DropdownStub />
                  </FieldGroup>
                </div>

                <NoteSection
                  title="Internal Notes"
                  placeholder="This note is only for internal purposes."
                  className="px-8 pb-8"
                  value={internalNotes}
                  onChange={setInternalNotes}
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
                      checked={availableInPos}
                      onChange={(e) => setAvailableInPos(e.target.checked)}
                      className="mt-1.5 h-3.5 w-3.5 justify-self-start accent-teal-700"
                    />

                    <label className={LABEL}>To Weigh With Scale</label>
                    <input
                      type="checkbox"
                      className="mt-1.5 h-3.5 w-3.5 justify-self-start accent-teal-700"
                    />

                    <label className={LABEL}>Category</label>
                    <DropdownStub value={categories.find((c) => c.id === categoryId)?.name} />
                  </FieldGroup>
                </div>

                <NoteSection
                  title="Sales Description"
                  placeholder="This note is added to sales orders and invoices."
                  className="mt-10 max-w-xl"
                  value={description}
                  onChange={setDescription}
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
                  <Many2OneField title="Income Account" options={ACCOUNT_OPTIONS} />
                </FieldGroup>

                <FieldGroup title="Payables">
                  <label className={LABEL}>Expense Account</label>
                  <Many2OneField title="Expense Account" options={EXPENSE_ACCOUNT_OPTIONS} />

                  <label className={LABEL}>Asset Type</label>
                  <Many2OneField title="Asset Type" options={[]} />

                  <label className={LABEL}>Price Difference Account</label>
                  <Many2OneField title="Price Difference Account" options={ACCOUNT_OPTIONS} />
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

      {printLabelsOpen && (
        <ChooseLabelsLayoutDialog
          product={{
            name: name.trim() || 'New Product',
            price: `$ ${(Number.parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0).toFixed(2)}`,
            barcode: barcode.trim() || null,
          }}
          onClose={() => setPrintLabelsOpen(false)}
        />
      )}
    </div>
  )
}
