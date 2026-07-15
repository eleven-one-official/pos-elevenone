import { useEffect, useMemo, useState } from 'react'
import { LuImage, LuUpload } from 'react-icons/lu'
import Modal from '../../components/ui/Modal'
import { Loader } from '../../components/ui/Loader'
import { ApiError, assetUrl } from '../../services/api/client'
import {
  createMenuItem,
  updateMenuItem,
  type AdminCategory,
  type AdminMenuItem,
} from '../../services/api/adminMenu'

const MAX_IMAGE_BYTES = 4 * 1024 * 1024 // matches the backend's max:4096 rule

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

  // Photo: a freshly picked file wins; `removeImage` clears the stored one.
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const previewUrl = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile])
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])
  const shownImage = previewUrl ?? (removeImage ? null : assetUrl(item?.image))

  function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be picked again after a remove
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) return setError('Image must be under 4 MB.')
    setImageFile(file)
    setRemoveImage(false)
    setError('')
  }

  function handleRemoveImage() {
    setImageFile(null)
    if (item?.image) setRemoveImage(true)
  }

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
      // File = upload new, null = clear stored photo, undefined = keep as-is.
      image: imageFile ?? (removeImage ? null : undefined),
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
            {saving && <Loader size="sm" />}
            {editing ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      }
    >
      <form id="menu-item-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-neutral-700">
            Photo <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 text-neutral-300">
              {shownImage ? (
                <img src={shownImage} alt="Item" className="h-full w-full object-cover" />
              ) : (
                <LuImage className="h-8 w-8" />
              )}
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50">
                <LuUpload className="h-4 w-4" />
                {shownImage ? 'Change photo' : 'Upload photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePickImage}
                  className="sr-only"
                />
              </label>
              {shownImage && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="px-1 text-sm font-medium text-rose-500 transition hover:text-rose-600"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

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
