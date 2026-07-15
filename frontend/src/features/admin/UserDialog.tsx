import { useState } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import Modal from '../../components/ui/Modal'
import { ApiError } from '../../services/api/client'
import {
  createUser,
  updateUser,
  type AdminRole,
  type AdminUser,
  type UserInput,
} from '../../services/api/users'

const inputCls =
  'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20'

/** Create / edit a staff member. Pass `user` to edit, omit it to create. */
export default function UserDialog({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user?: AdminUser | null
  roles: AdminRole[]
  onClose: () => void
  onSaved: (user: AdminUser) => void
}) {
  const editing = Boolean(user)
  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [roleId, setRoleId] = useState<number | ''>(user?.role?.id ?? roles[0]?.id ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [active, setActive] = useState(user?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!name.trim()) return setError('Please enter a name.')
    if (!username.trim()) return setError('Please enter a username.')
    if (!editing && password.length < 4) return setError('Set a password of at least 4 characters.')
    if (pin && !/^\d{4,6}$/.test(pin)) return setError('PIN must be 4–6 digits.')

    setSaving(true)
    setError('')

    // Only send password/PIN when provided so an edit keeps the current ones.
    const payload: UserInput = {
      name: name.trim(),
      username: username.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      role_id: roleId === '' ? null : roleId,
      is_active: active,
    }
    if (password) payload.password = password
    if (pin) payload.pin = pin

    try {
      const saved = user != null ? await updateUser(user.id, payload) : await createUser(payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the staff member.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? 'Edit Staff' : 'Add Staff'}
      subtitle={editing ? user?.name : 'Create a new staff account'}
      onClose={onClose}
      width="max-w-lg"
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
            form="user-form"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark disabled:opacity-60"
          >
            {saving && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            {editing ? 'Save Changes' : 'Add Staff'}
          </button>
        </div>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. sok-dara"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : '')}
              className={inputCls}
            >
              <option value="">No role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">
              Phone <span className="font-normal text-neutral-400">(optional)</span>
            </label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-neutral-700">
            Email <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">
              Password {editing && <span className="font-normal text-neutral-400">(leave blank to keep)</span>}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={editing ? '••••••' : 'At least 4 characters'}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-neutral-700">
              PIN <span className="font-normal text-neutral-400">(4–6 digits, optional)</span>
            </label>
            <input
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="off"
              placeholder={user?.has_pin ? '•••• set' : 'For POS/tablet login'}
              className={inputCls}
            />
          </div>
        </div>

        <label className="flex cursor-pointer select-none items-center justify-between rounded-xl border border-neutral-200 px-3.5 py-3">
          <span className="text-sm font-semibold text-neutral-700">Active account</span>
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
