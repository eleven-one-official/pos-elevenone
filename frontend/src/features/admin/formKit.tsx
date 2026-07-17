import { useState } from 'react'
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

/** Odoo many2one lookup — type-to-filter dropdown listing the record's full
 *  hierarchy path (e.g. "Alcoholic Drink_ / Beer_"). At most `limit` matches
 *  show until "Search More..." expands the list, Odoo style. */
export function Many2OneField({
  options,
  value = '',
  blue = false,
  limit = 7,
  onSelect,
}: {
  options: string[]
  /** Initially selected record label. */
  value?: string
  /** Paint the pale blue required-field fill. */
  blue?: boolean
  /** Rows shown before "Search More..." expands the dropdown. */
  limit?: number
  onSelect?: (value: string) => void
}) {
  const [selected, setSelected] = useState(value)
  // null while not typing — the input then shows the committed selection.
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState(0)

  const matches =
    query === null
      ? options
      : options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
  const visible = expanded ? matches : matches.slice(0, limit)
  const activeIdx = Math.min(active, visible.length - 1)

  const close = () => {
    setOpen(false)
    setQuery(null)
    setExpanded(false)
    setActive(0)
  }
  const pick = (option: string) => {
    setSelected(option)
    onSelect?.(option)
    close()
  }

  return (
    <span className="relative block w-full">
      <input
        value={query ?? selected}
        onFocus={(e) => {
          setOpen(true)
          e.currentTarget.select()
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.currentTarget.value)
          setOpen(true)
          setExpanded(false)
          setActive(0)
        }}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive(Math.min(activeIdx + 1, visible.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(Math.max(activeIdx - 1, 0))
          } else if (e.key === 'Enter') {
            if (open && visible[activeIdx]) {
              e.preventDefault()
              pick(visible[activeIdx])
            }
          } else if (e.key === 'Escape') {
            close()
          }
        }}
        className={`${blue ? BLUE_SELECT : TEXT_INPUT} pr-7`}
      />
      <LuChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
      {open && (
        <ul className="absolute left-0 top-full z-30 max-h-72 w-max min-w-full max-w-md overflow-y-auto border border-neutral-300 bg-white py-1 shadow-[0_2px_6px_rgba(0,0,0,0.15)]">
          {/* mousedown (not click) so picking wins over the input's blur */}
          {visible.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(o)
                }}
                onMouseEnter={() => setActive(i)}
                className={`block w-full whitespace-nowrap px-3 py-1.5 text-left text-[13px] text-neutral-700 ${
                  i === activeIdx ? 'bg-neutral-100' : ''
                }`}
              >
                {o}
              </button>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="px-3 py-1.5 text-[13px] italic text-neutral-500">No records</li>
          )}
          {!expanded && matches.length > limit && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setExpanded(true)
                }}
                className="block w-full py-1.5 pl-7 pr-3 text-left text-[13px] text-neutral-700 hover:bg-neutral-100"
              >
                Search More...
              </button>
            </li>
          )}
        </ul>
      )}
    </span>
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
