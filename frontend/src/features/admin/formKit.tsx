import type { ReactNode } from 'react'
import { LuChevronDown } from 'react-icons/lu'

// ---------------------------------------------------------------------------
// Shared Odoo-form building blocks for the admin side: field styling tokens,
// the label/control group with its vertical separator, empty many2one stubs
// and translatable note sections.
// ---------------------------------------------------------------------------

// Odoo paints required/editable dropdowns with this pale blue fill.
export const FIELD_BG = 'bg-[#dceaf5]'
export const LABEL = 'pt-1 text-[13px] font-bold text-neutral-800'
export const TEXT_INPUT =
  'w-full rounded-[2px] border border-neutral-300 px-2 py-1.5 text-sm text-neutral-800 outline-none transition focus:border-sky-600'
export const BLUE_SELECT = `w-full rounded-[2px] border border-neutral-300 ${FIELD_BG} px-2 py-1.5 text-sm text-neutral-800 outline-none transition focus:border-sky-600`

/** Odoo field group: optional underlined title + label/field grid with the
 *  vertical separator between the label and control columns. */
export function FieldGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && (
        <div className="border-b border-neutral-300 pb-1 text-[12.5px] font-semibold text-[#54717e]">
          {title}
        </div>
      )}
      <div className="relative mt-3">
        <span className="pointer-events-none absolute bottom-1 left-[161px] top-1 w-px bg-neutral-200" />
        <div className="grid grid-cols-[150px_1fr] items-start gap-x-6 gap-y-3">{children}</div>
      </div>
    </div>
  )
}

/** Empty many2one lookup — bordered input with a dropdown caret. */
export function DropdownStub() {
  return (
    <span className="relative block">
      <input className={`${TEXT_INPUT} pr-7`} />
      <LuChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
    </span>
  )
}

/** Underlined note title + translatable textarea with the EN marker. */
export function NoteSection({
  title,
  placeholder,
  className = '',
}: {
  title: string
  placeholder: string
  className?: string
}) {
  return (
    <div className={className}>
      <div className="border-b border-neutral-300 pb-1 text-[12.5px] font-semibold text-[#54717e]">
        {title}
      </div>
      <div className="relative mt-2">
        <textarea
          placeholder={placeholder}
          className="min-h-14 w-full resize-y rounded-[2px] border border-neutral-200 px-3 py-2 pr-10 text-sm outline-none transition placeholder:text-neutral-500 focus:border-sky-600"
        />
        <span className="absolute right-3 top-2 text-[12px] font-semibold text-neutral-500">EN</span>
      </div>
    </div>
  )
}
