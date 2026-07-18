import { useRef, useState } from 'react'
import { LuEllipsisVertical, LuTrash2, LuX } from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import {
  createPricelist,
  updatePricelist,
  type Pricelist,
  type PricelistInput,
} from '../../services/api/pricelists'
import { ApiError } from '../../services/api/client'
import { BLUE_SELECT, DropdownStub, FIELD_BG, FieldGroup, LABEL, Many2OneField, TEXT_INPUT } from './formKit'

// ---------------------------------------------------------------------------
// Pricelist form — Odoo-style, opened by Create on the pricelist list and by
// clicking an existing row (fields prefill). Save writes the pricelist and
// its full rule set through the API.
// ---------------------------------------------------------------------------

const FORM_TABS = ['Price Rules', 'Configuration']

/** Rule label meaning "no specific product" — prices the whole catalog. */
const ALL_PRODUCTS = 'All Products'

type RuleDraft = {
  key: number
  menuItemId: number | null
  minQty: string
  price: string
  dateStart: string
  dateEnd: string
}

function saveErrorText(e: unknown): string {
  if (e instanceof ApiError && e.errors) {
    const first = Object.values(e.errors)[0]?.[0]
    if (first) return first
  }
  return e instanceof Error ? e.message : 'Save failed. Try again.'
}

export default function PosPricelistForm({
  onBack,
  onSaved,
  pricelist,
  products,
}: {
  /** Breadcrumb + Discard — leaves the form back to the pricelist list. */
  onBack: () => void
  /** Called after a successful create/update. */
  onSaved: () => void | Promise<void>
  /** Existing record when editing; omit to create a new pricelist. */
  pricelist?: Pricelist
  /** Product roster for the rule "Applied On" picker. */
  products: { id: number; name: string }[]
}) {
  const [tab, setTab] = useState(FORM_TABS[0])
  const [name, setName] = useState(pricelist?.name ?? '')
  const [currency, setCurrency] = useState<'USD' | 'KHR'>(pricelist?.currency ?? 'USD')
  const [discountPolicy, setDiscountPolicy] = useState<'included' | 'public'>(
    pricelist?.discount_policy ?? 'included',
  )
  const nextKey = useRef(0)
  const [rules, setRules] = useState<RuleDraft[]>(() =>
    (pricelist?.rules ?? []).map((r) => ({
      key: nextKey.current++,
      menuItemId: r.menu_item_id,
      minQty: String(r.min_quantity),
      price: Number(r.fixed_price).toFixed(2),
      dateStart: r.date_start ?? '',
      dateEnd: r.date_end ?? '',
    })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const productName = (id: number | null) =>
    id === null ? ALL_PRODUCTS : (products.find((p) => p.id === id)?.name ?? ALL_PRODUCTS)

  const addRule = () =>
    setRules((rs) => [
      ...rs,
      { key: nextKey.current++, menuItemId: null, minQty: '1', price: '', dateStart: '', dateEnd: '' },
    ])

  const patchRule = (key: number, patch: Partial<RuleDraft>) =>
    setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const removeRule = (key: number) => setRules((rs) => rs.filter((r) => r.key !== key))

  const save = async () => {
    if (saving) return
    if (!name.trim()) {
      setError('The pricelist name is required.')
      return
    }
    const ruleInputs = []
    for (const r of rules) {
      const price = Number.parseFloat(r.price.replace(/[^0-9.]/g, ''))
      if (Number.isNaN(price) || price < 0) {
        setError('Enter a valid price on every rule line.')
        return
      }
      ruleInputs.push({
        menu_item_id: r.menuItemId,
        min_quantity: Math.max(1, Number.parseInt(r.minQty, 10) || 1),
        fixed_price: price,
        date_start: r.dateStart || null,
        date_end: r.dateEnd || null,
      })
    }
    const input: PricelistInput = {
      name: name.trim(),
      currency,
      discount_policy: discountPolicy,
      rules: ruleInputs,
    }
    setSaving(true)
    setError(null)
    try {
      if (pricelist) await updatePricelist(pricelist.id, input)
      else await createPricelist(input)
      await onSaved()
    } catch (e: unknown) {
      setError(saveErrorText(e))
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel — breadcrumb + Save/Discard */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="truncate text-[15px] text-neutral-700">
          <button type="button" onClick={onBack} className="transition hover:underline">
            Pricelists
          </button>
          <span className="text-neutral-400"> / </span>
          <span>{pricelist ? pricelist.name : 'New'}</span>
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

      {/* Sheet */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-100/60 pb-6">
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

        <div className="mx-4 mt-4 rounded-[2px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          {/* Name + currency/company */}
          <div className="px-8 pt-6">
            <div className="text-[13px] font-bold text-neutral-800">Pricelist Name</div>
            <span className="mt-1 inline-flex w-[56%] min-w-72 items-stretch">
              <input
                placeholder="e.g. USD Retailers"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`min-w-0 flex-1 rounded-l-[2px] border border-neutral-300 ${FIELD_BG} px-3 py-1.5 text-[22px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-sky-600`}
              />
              <span className="flex items-center rounded-r-[2px] border border-l-0 border-neutral-300 bg-white px-2 text-[12px] font-semibold text-neutral-600">
                EN
              </span>
            </span>

            <div className="mt-6 grid grid-cols-1 gap-x-16 gap-y-3 xl:grid-cols-2">
              <FieldGroup>
                <label className={LABEL}>Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'USD' | 'KHR')}
                  className={BLUE_SELECT}
                >
                  <option>USD</option>
                  <option>KHR</option>
                </select>
              </FieldGroup>
              <FieldGroup>
                <label className={LABEL}>Company</label>
                <DropdownStub />
              </FieldGroup>
            </div>
          </div>

          {/* Notebook tabs */}
          <div className="mt-6 flex items-end gap-0 border-b border-neutral-200 px-8 text-[13.5px]">
            {FORM_TABS.map((t) => (
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

          {/* ---- Price Rules ---- */}
          {tab === 'Price Rules' && (
            <div className="px-8 py-5 pb-10">
              <div className="text-[13px]">
                <div className="grid grid-cols-[2fr_0.8fr_1fr_1.2fr_1.2fr_2rem] gap-x-3 border-b border-neutral-200 pb-2 font-bold text-neutral-800">
                  <span>Applied On</span>
                  <span className="text-right">Min. Quantity</span>
                  <span className="text-right">Price</span>
                  <span>Start Date</span>
                  <span>End Date</span>
                  <LuEllipsisVertical className="h-4 w-4 justify-self-end text-neutral-500" />
                </div>

                {rules.map((r) => (
                  <div
                    key={r.key}
                    className="grid grid-cols-[2fr_0.8fr_1fr_1.2fr_1.2fr_2rem] items-center gap-x-3 border-b border-neutral-100 py-1.5"
                  >
                    <Many2OneField
                      title="Applied On"
                      options={[ALL_PRODUCTS, ...products.map((p) => p.name)]}
                      value={productName(r.menuItemId)}
                      onSelect={(v) =>
                        patchRule(r.key, {
                          menuItemId:
                            v === ALL_PRODUCTS
                              ? null
                              : (products.find((p) => p.name === v)?.id ?? null),
                        })
                      }
                    />
                    <input
                      aria-label="Minimum quantity"
                      value={r.minQty}
                      onChange={(e) => patchRule(r.key, { minQty: e.target.value })}
                      className={`${TEXT_INPUT} text-right`}
                    />
                    <input
                      aria-label="Fixed price"
                      placeholder="0.00"
                      value={r.price}
                      onChange={(e) => patchRule(r.key, { price: e.target.value })}
                      className={`${TEXT_INPUT} text-right`}
                    />
                    <input
                      aria-label="Start date"
                      type="date"
                      value={r.dateStart}
                      onChange={(e) => patchRule(r.key, { dateStart: e.target.value })}
                      className={TEXT_INPUT}
                    />
                    <input
                      aria-label="End date"
                      type="date"
                      value={r.dateEnd}
                      onChange={(e) => patchRule(r.key, { dateEnd: e.target.value })}
                      className={TEXT_INPUT}
                    />
                    <button
                      type="button"
                      aria-label="Remove rule"
                      onClick={() => removeRule(r.key)}
                      className="justify-self-end text-neutral-400 transition hover:text-red-600"
                    >
                      <LuTrash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addRule}
                  className="w-full border-b border-neutral-100 py-2 text-left text-sky-700 transition hover:underline"
                >
                  Add a line
                </button>
              </div>
            </div>
          )}

          {/* ---- Configuration ---- */}
          {tab === 'Configuration' && (
            <div className="grid grid-cols-1 gap-x-16 gap-y-8 px-8 py-5 pb-10 xl:grid-cols-2">
              <FieldGroup title="Availability">
                <label className={LABEL}>Country Groups</label>
                <DropdownStub />
              </FieldGroup>

              <FieldGroup title="Discounts">
                <label className={LABEL}>Discount Policy</label>
                <div className="text-[13px] text-neutral-700">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="discount-policy"
                      checked={discountPolicy === 'included'}
                      onChange={() => setDiscountPolicy('included')}
                      className="h-3.5 w-3.5 accent-teal-700"
                    />
                    Discount included in the price
                  </label>
                  <label className="mt-1 flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="discount-policy"
                      checked={discountPolicy === 'public'}
                      onChange={() => setDiscountPolicy('public')}
                      className="h-3.5 w-3.5 accent-teal-700"
                    />
                    Show public price & discount to the customer
                  </label>
                </div>
              </FieldGroup>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
