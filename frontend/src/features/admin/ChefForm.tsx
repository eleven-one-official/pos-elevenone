import { useState } from 'react'
import { LuX } from 'react-icons/lu'
import { Loader } from '../../components/ui/Loader'
import { createChef, updateChef, type Chef, type ChefInput } from '../../services/api/chefs'
import { ApiError } from '../../services/api/client'
import { FIELD_BG, FieldGroup, LABEL, TEXT_INPUT } from './formKit'

// ---------------------------------------------------------------------------
// Chef create/edit form — name, sequence and the active toggle. Cooks aren't
// user accounts (no login/PIN); they're a light roster whose only job is to
// name themselves on the kitchen display so the Chef Performance report can
// attribute tickets. Lives inside the Employees module, edited from the same
// staff list as real employees.
// ---------------------------------------------------------------------------

function errorText(e: unknown): string {
  if (e instanceof ApiError && e.errors) {
    const first = Object.values(e.errors)[0]?.[0]
    if (first) return first
  }
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

export default function ChefForm({
  chef,
  onBack,
  onSaved,
}: {
  chef?: Chef
  onBack: () => void
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState(chef?.name ?? '')
  const [isActive, setIsActive] = useState(chef?.is_active ?? true)
  const [sortOrder, setSortOrder] = useState(chef ? String(chef.sort_order) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (saving) return
    if (!name.trim()) {
      setError('The chef name is required.')
      return
    }
    const input: ChefInput = {
      name: name.trim(),
      is_active: isActive,
      sort_order: sortOrder.trim() === '' ? null : Number.parseInt(sortOrder, 10) || 0,
    }
    setSaving(true)
    setError(null)
    try {
      if (chef) await updateChef(chef.id, input)
      else await createChef(input)
      await onSaved()
    } catch (e: unknown) {
      setError(errorText(e))
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel — breadcrumb + Save/Discard */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="truncate text-[15px] text-neutral-700">
          <button type="button" onClick={onBack} className="transition hover:underline">
            Employees
          </button>
          <span className="text-neutral-400"> / </span>
          <span>{chef ? chef.name : 'New chef'}</span>
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

        <div className="mx-4 mt-4 rounded-[2px] border border-neutral-200 bg-white px-8 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="text-[13px] font-bold text-neutral-800">Chef name</div>
          <input
            placeholder="e.g. Bopha"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mt-1 w-[56%] min-w-72 rounded-[2px] border border-neutral-300 ${FIELD_BG} px-3 py-1.5 text-[22px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-sky-600`}
          />

          <div className="mt-6 grid grid-cols-1 gap-x-16 gap-y-3 xl:grid-cols-2">
            <FieldGroup>
              <label className={LABEL}>Sequence</label>
              <input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="Position in the display picker"
                className={`${TEXT_INPUT} max-w-40`}
              />
            </FieldGroup>

            <FieldGroup>
              <label className={LABEL}>Active</label>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="mt-1.5 h-3.5 w-3.5 justify-self-start accent-teal-700"
              />
            </FieldGroup>
          </div>

          <p className="mt-8 border-t border-neutral-200 pt-4 text-[12.5px] italic text-neutral-500">
            A chef is a kitchen cook, not a login account — no username, password or PIN. Active
            chefs appear in the kitchen display’s “who’s cooking?” picker, in sequence order. A cook
            picks their name when they tap Start on a ticket — that attribution drives the Chef
            Performance report.
          </p>
        </div>
      </div>
    </div>
  )
}
