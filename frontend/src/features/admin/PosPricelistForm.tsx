import { useState } from 'react'
import { LuEllipsisVertical } from 'react-icons/lu'
import { BLUE_SELECT, DropdownStub, FIELD_BG, FieldGroup, LABEL } from './formKit'

// ---------------------------------------------------------------------------
// Pricelist form — Odoo-style, opened by Create on the pricelist list and by
// clicking an existing row (fields prefill). Pure UI: Save and Discard both
// just go back until the backend endpoints are wired in.
// ---------------------------------------------------------------------------

const FORM_TABS = ['Price Rules', 'Configuration']

export default function PosPricelistForm({
  onBack,
  pricelist,
}: {
  /** Breadcrumb, Save and Discard — all leave back to the pricelist list. */
  onBack: () => void
  pricelist?: { name: string; currency: string }
}) {
  const [tab, setTab] = useState(FORM_TABS[0])

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
            onClick={onBack}
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

      {/* Sheet */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-100/60 pb-6">
        <div className="mx-4 mt-4 rounded-[2px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          {/* Name + currency/company */}
          <div className="px-8 pt-6">
            <div className="text-[13px] font-bold text-neutral-800">Pricelist Name</div>
            <span className="mt-1 inline-flex w-[56%] min-w-72 items-stretch">
              <input
                placeholder="e.g. USD Retailers"
                defaultValue={pricelist?.name}
                className={`min-w-0 flex-1 rounded-l-[2px] border border-neutral-300 ${FIELD_BG} px-3 py-1.5 text-[22px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-sky-600`}
              />
              <span className="flex items-center rounded-r-[2px] border border-l-0 border-neutral-300 bg-white px-2 text-[12px] font-semibold text-neutral-600">
                EN
              </span>
            </span>

            <div className="mt-6 grid grid-cols-1 gap-x-16 gap-y-3 xl:grid-cols-2">
              <FieldGroup>
                <label className={LABEL}>Currency</label>
                <select className={BLUE_SELECT} defaultValue={pricelist?.currency ?? 'USD'}>
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
                <div className="grid grid-cols-[2fr_1fr_1fr_1.2fr_1.2fr_2rem] gap-x-3 border-b border-neutral-200 pb-2 font-bold text-neutral-800">
                  <span>Applied On</span>
                  <span className="text-right">Min. Quantity</span>
                  <span className="text-right">Price</span>
                  <span>Start Date</span>
                  <span>End Date</span>
                  <LuEllipsisVertical className="h-4 w-4 justify-self-end text-neutral-500" />
                </div>
                <button
                  type="button"
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
                      defaultChecked
                      className="h-3.5 w-3.5 accent-teal-700"
                    />
                    Discount included in the price
                  </label>
                  <label className="mt-1 flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="discount-policy"
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
