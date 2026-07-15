import { useState } from 'react'
import { LuDelete, LuArrowBigUp } from 'react-icons/lu'

// Bottom-docked virtual QWERTY keyboard for touch POS terminals.
// Appends/edits the current text so the caller can drive a search box or any
// text field. It stays out of the products area so results filter as you type.
const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

export default function OnScreenKeyboard({
  value,
  onChange,
  onClose,
}: {
  value: string
  onChange: (next: string) => void
  onClose: () => void
}) {
  const [shift, setShift] = useState(false)

  function press(key: string) {
    onChange(value + (shift ? key.toUpperCase() : key))
    if (shift) setShift(false)
  }

  const keyClass =
    'flex h-12 flex-1 items-center justify-center rounded-lg border border-neutral-200 bg-white text-lg font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50 active:scale-[0.97]'

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-neutral-200 bg-neutral-100 p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {ROWS.map((row, i) => (
          <div key={i} className="flex justify-center gap-1.5">
            {i === 3 && (
              <button
                type="button"
                onClick={() => setShift((s) => !s)}
                className={`${keyClass} max-w-16 ${shift ? 'bg-primary/10 text-primary' : ''}`}
                aria-label="Shift"
              >
                <LuArrowBigUp className="h-5 w-5" />
              </button>
            )}
            {row.map((key) => (
              <button key={key} type="button" onClick={() => press(key)} className={`${keyClass} max-w-14`}>
                {shift ? key.toUpperCase() : key}
              </button>
            ))}
            {i === 3 && (
              <button
                type="button"
                onClick={() => onChange(value.slice(0, -1))}
                className={`${keyClass} max-w-16`}
                aria-label="Backspace"
              >
                <LuDelete className="h-5 w-5" />
              </button>
            )}
          </div>
        ))}

        <div className="flex justify-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange('')}
            className={`${keyClass} max-w-24 text-sm`}
          >
            Clear
          </button>
          <button type="button" onClick={() => press(' ')} className={`${keyClass} max-w-none flex-[4]`}>
            Space
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 max-w-24 flex-1 items-center justify-center rounded-lg bg-[#2b2138] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#37294a] active:scale-[0.97]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
