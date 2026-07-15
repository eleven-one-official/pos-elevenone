import { useState } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import Modal from '../../components/ui/Modal'
import { ApiError } from '../../services/api/client'
import {
  createMenuItem,
  updateMenuItem,
  type AdminCategory,
  type AdminMenuItem,
} from '../../services/api/adminMenu'

const inputCls =
  'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20'

/** Create / edit a menu item. Pass `item` to edit, omit it to create. */
export default function MenuItemDialog({
  item,
  categories,
  onClose,
  onSaved,
}: {
  item?: AdminMenuItem | null
  categories: AdminCategory[]
  onClose: () => void
  onSaved: (item: AdminMenuItem) => void
}) {
  const editing = Boolean(item)
  const [name, setName] = useState(item?.name ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>(
    item?.category_id ?? categories[0]?.id ?? '',
  )
  const [price, setPrice] = useState(item ? String(item.price) : '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [available, setAvailable] = useState(item?.is_available ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!name.trim()) return setError('Please enter a name.')
    if (categoryId === '') return setError('Please choose a category.')
    const priceNum = Number(price)
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError('Please enter a valid price.')

    setSaving(true)
    setError('')
    const payload = {
      category_id: categoryId,
      name: name.trim(),
      price: priceNum,
      description: description.trim() || null,
      is_available: available,
    }
    try {
      const saved =
        item != null ? await updateMenuItem(item.id, payload) : await createMenuItem(payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the item.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? 'Edit Item' : 'Add Item'}
      subtitle={editing ? item?.name : 'Create a new menu item'}
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
            form="menu-item-form"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark disabled:opacity-60"
          >
            {saving && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            {editing ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      }
    >
      <form id="menu-item-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Beef Lok Lak"
            className={inputCls}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
              className={inputCls}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Price ($)</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-neutral-700">
            Description <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Short description shown to staff"
            className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <label className="flex cursor-pointer select-none items-center justify-between rounded-xl border border-neutral-200 px-3.5 py-3">
          <span className="text-sm font-semibold text-neutral-700">Available for ordering</span>
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
            className="peer sr-only"
          />
          <span className="relative h-6 w-11 rounded-full bg-neutral-300 transition peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
        </label>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  )
}
