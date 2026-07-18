import { useState } from 'react'
import { LuX } from 'react-icons/lu'
import { FIELD_BG, FieldGroup, LABEL, TEXT_INPUT } from './formKit'
import { printProductLabels, type LabelProduct } from './printProductLabels'

// ---------------------------------------------------------------------------
// "Choose Labels Layout" — the wizard Odoo opens from Print Labels. Confirm
// prints a sheet of labels for the product through the hidden-iframe pipeline
// (sheet formats grid onto A4; Dymo/ZPL print one label per row).
// ---------------------------------------------------------------------------

const FORMATS = [
  'Dymo',
  '2 x 7 with price',
  '4 x 7 with price',
  '4 x 12',
  '4 x 12 with price',
  'ZPL Labels',
  'ZPL Labels with price',
]

export default function ChooseLabelsLayoutDialog({
  product,
  onClose,
}: {
  product: LabelProduct
  onClose: () => void
}) {
  const [quantityText, setQuantityText] = useState('1')
  const [format, setFormat] = useState('2 x 7 with price')
  const [extra, setExtra] = useState('')

  const quantity = Number.parseInt(quantityText, 10)
  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= 500

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 p-6 pt-24">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="fixed inset-0 cursor-default"
      />

      <div className="relative w-[980px] max-w-full rounded-[3px] bg-white shadow-[0_6px_30px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-800">Choose Labels Layout</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <LuX className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-16 gap-y-6 px-6 py-6 xl:grid-cols-2">
          <FieldGroup>
            <label className={LABEL}>Quantity</label>
            <input
              value={quantityText}
              onChange={(e) => setQuantityText(e.target.value)}
              className={`w-full rounded-[2px] border border-neutral-400/70 ${FIELD_BG} px-2 py-1.5 text-sm text-neutral-800 outline-none transition focus:border-sky-600`}
            />

            <label className={LABEL}>Format</label>
            <div className="text-[13px] text-neutral-700">
              {FORMATS.map((f) => (
                <label key={f} className="mb-1.5 flex items-center gap-1.5 last:mb-0">
                  <input
                    type="radio"
                    name="label-format"
                    checked={format === f}
                    onChange={() => setFormat(f)}
                    className="h-3.5 w-3.5 accent-[#3572b0]"
                  />
                  {f}
                </label>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup>
            <label className={LABEL}>Extra Content</label>
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              className={TEXT_INPUT}
            />
          </FieldGroup>
        </div>

        <div className="flex items-center gap-2 border-t border-neutral-200 px-6 py-4">
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              printProductLabels({ product, quantity, format, extra })
              onClose()
            }}
            className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d] disabled:opacity-50"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[3px] border border-neutral-300 bg-white px-4 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}
