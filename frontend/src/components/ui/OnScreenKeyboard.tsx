import { useState } from 'react'
import { LuDelete, LuArrowBigUp, LuGlobe } from 'react-icons/lu'

// Bottom-docked virtual keyboard for touch POS terminals.
// Appends/edits the current text so the caller can drive a search box or any
// text field. Two layouts — English QWERTY and Khmer (NiDA arrangement, the
// same as the standard Windows/phone Khmer keyboard) so cooking notes can be
// written in Khmer. Each key is a [normal, shifted] pair; Shift is one-shot.
type Lang = 'en' | 'km'

type Key = [string, string]

const EN_ROWS: Key[][] = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((row) =>
  row.split('').map((k) => [k, k.toUpperCase()] as Key),
)

const KM_ROWS: Key[][] = [
  [
    ['១', '!'], ['២', 'ៗ'], ['៣', '"'], ['៤', '៛'], ['៥', '%'], ['៦', '៍'],
    ['៧', '័'], ['៨', '៏'], ['៩', '('], ['០', ')'], ['ឥ', '៌'], ['ឲ', '='],
  ],
  [
    ['ឆ', 'ឈ'], ['ឹ', 'ឺ'], ['េ', 'ែ'], ['រ', 'ឬ'], ['ត', 'ទ'], ['យ', 'ួ'],
    ['ុ', 'ូ'], ['ិ', 'ី'], ['ោ', 'ៅ'], ['ផ', 'ភ'], ['ៀ', 'ឿ'], ['ឪ', 'ឧ'],
  ],
  [
    ['ា', 'ាំ'], ['ស', 'ៃ'], ['ដ', 'ឌ'], ['ថ', 'ធ'], ['ង', 'អ'], ['ហ', 'ះ'],
    ['្', 'ញ'], ['ក', 'គ'], ['ល', 'ឡ'], ['ើ', 'ោះ'], ['់', '៉'],
  ],
  [
    ['ឋ', 'ឍ'], ['ខ', 'ឃ'], ['ច', 'ជ'], ['វ', 'េះ'], ['ប', 'ព'], ['ន', 'ណ'],
    ['ម', 'ំ'], ['ុំ', 'ុះ'], ['។', '៕'], ['៊', '?'],
  ],
]

const LANG_KEY = 'pos-keyboard-lang'

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
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem(LANG_KEY) === 'km' ? 'km' : 'en'))

  const rows = lang === 'km' ? KM_ROWS : EN_ROWS

  function press([normal, shifted]: Key) {
    onChange(value + (shift ? shifted : normal))
    if (shift) setShift(false)
  }

  function toggleLang() {
    setLang((prev) => {
      const next: Lang = prev === 'en' ? 'km' : 'en'
      localStorage.setItem(LANG_KEY, next)
      return next
    })
    setShift(false)
  }

  const keyClass =
    'flex h-12 flex-1 items-center justify-center rounded-lg border border-neutral-200 bg-white text-lg font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50 active:scale-[0.97]'

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-neutral-200 bg-neutral-100 p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-center gap-1.5">
            {i === rows.length - 1 && (
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
              <button key={key[0]} type="button" onClick={() => press(key)} className={`${keyClass} max-w-14`}>
                {shift ? key[1] : key[0]}
              </button>
            ))}
            {i === rows.length - 1 && (
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
            onClick={toggleLang}
            className={`${keyClass} max-w-28 gap-1.5 text-sm`}
            aria-label="Switch keyboard language"
          >
            <LuGlobe className="h-4 w-4 shrink-0" />
            {lang === 'en' ? 'ខ្មែរ' : 'EN'}
          </button>
          <button
            type="button"
            onClick={() => onChange('')}
            className={`${keyClass} max-w-24 text-sm`}
          >
            Clear
          </button>
          <button type="button" onClick={() => press([' ', ' '])} className={`${keyClass} max-w-none flex-[4]`}>
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
