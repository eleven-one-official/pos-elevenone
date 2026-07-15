import { useState } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import Modal from '../../components/ui/Modal'
import { ApiError } from '../../services/api/client'
import { createCategory, updateCategory, type AdminCategory } from '../../services/api/adminMenu'

const inputCls =
  'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20'

/** Create / edit a category. Pass `category` to edit, omit it to create. */
export default function CategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  category?: AdminCategory | null
  onClose: () => void
  onSaved: (category: AdminCategory) => void
}) {
  const editing = Boolean(category)
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [active, setActive] = useState(category?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!name.trim()) return setError('Please enter a name.')

    setSaving(true)
    setError('')
    const payload = { name: name.trim(), description: description.trim() || null, is_active: active }
    try {
      const saved =
        category != null
          ? await updateCategory(category.id, payload)
          : await createCategory(payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the category.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? 'Edit Category' : 'Add Category'}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="category-form"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark disabled:opacity-60"
          >
            {saving && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            {editing ? 'Save Changes' : 'Add Category'}
          </button>
        </div>
      }
    >
      <form id="category-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Food"
            className={inputCls}
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-neutral-700">
            Description <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <label className="flex cursor-pointer select-none items-center justify-between rounded-xl border border-neutral-200 px-3.5 py-3">
          <span className="text-sm font-semibold text-neutral-700">Active</span>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="peer sr-only"
          />
          <span className="relative h-6 w-11 rounded-full bg-neutral-300 transition peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
        </label>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  )
}
