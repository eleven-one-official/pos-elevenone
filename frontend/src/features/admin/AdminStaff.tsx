import { useCallback, useEffect, useState } from 'react'
import { LuKeyRound, LuPencil, LuPlus, LuTrash2, LuUsers } from 'react-icons/lu'
import {
  deleteUser,
  fetchRoles,
  fetchUsers,
  updateUser,
  type AdminRole,
  type AdminUser,
} from '../../services/api/users'
import { ApiError } from '../../services/api/client'
import { LoadingPanel, ErrorPanel } from './AdminStates'
import UserDialog from './UserDialog'
import ConfirmDialog from './ConfirmDialog'

const ROLE_STYLE: Record<string, string> = {
  admin: 'bg-primary/10 text-primary',
  manager: 'bg-violet-100 text-violet-700',
  cashier: 'bg-sky-100 text-sky-700',
  waiter: 'bg-emerald-100 text-emerald-700',
  kitchen: 'bg-amber-100 text-amber-700',
}

const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100'

export default function AdminStaff() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banner, setBanner] = useState('')

  const [dialog, setDialog] = useState<{ user?: AdminUser } | null>(null)
  const [confirm, setConfirm] = useState<AdminUser | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [u, r] = await Promise.all([fetchUsers(), fetchRoles()])
      setUsers(u)
      setRoles(r)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load staff.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function upsert(saved: AdminUser) {
    setUsers((prev) => {
      const i = prev.findIndex((x) => x.id === saved.id)
      if (i === -1) return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
      const next = [...prev]
      next[i] = saved
      return next
    })
  }

  async function toggleActive(user: AdminUser) {
    const next = !user.is_active
    setUsers((prev) => prev.map((x) => (x.id === user.id ? { ...x, is_active: next } : x)))
    setBanner('')
    try {
      await updateUser(user.id, { is_active: next })
    } catch (err) {
      setUsers((prev) => prev.map((x) => (x.id === user.id ? { ...x, is_active: user.is_active } : x)))
      setBanner(err instanceof ApiError ? err.message : 'Could not update the account.')
    }
  }

  async function handleDelete() {
    if (!confirm) return
    await deleteUser(confirm.id)
    setUsers((prev) => prev.filter((x) => x.id !== confirm.id))
    setConfirm(null)
  }

  if (loading) return <LoadingPanel label="Loading staff…" />
  if (error) return <ErrorPanel message={error} onRetry={() => void load()} />

  return (
    <div className="p-8">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-neutral-500">{users.length} staff accounts</p>
        <button
          type="button"
          onClick={() => setDialog({})}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark"
        >
          <LuPlus className="h-4 w-4" />
          Add Staff
        </button>
      </div>

      {banner && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{banner}</p>}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-neutral-400">
            <LuUsers className="h-8 w-8" />
            <p className="text-sm">No staff yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Username</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">PIN</th>
                <th className="px-5 py-3 text-center font-semibold">Active</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.map((u) => (
                <tr key={u.id} className="text-neutral-700">
                  <td className="px-5 py-3 font-semibold text-neutral-900">
                    {u.name}
                    {u.phone && <div className="text-xs font-normal text-neutral-400">{u.phone}</div>}
                  </td>
                  <td className="px-5 py-3 text-neutral-500">{u.username}</td>
                  <td className="px-5 py-3">
                    {u.role ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          ROLE_STYLE[u.role.slug] ?? 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {u.role.name}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {u.has_pin ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <LuKeyRound className="h-3.5 w-3.5" />
                        Enabled
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={u.is_active}
                        aria-label="Toggle active"
                        onClick={() => void toggleActive(u)}
                        className={`relative h-6 w-11 rounded-full transition ${
                          u.is_active ? 'bg-primary' : 'bg-neutral-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                            u.is_active ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label="Edit staff"
                        onClick={() => setDialog({ user: u })}
                        className={iconBtn}
                      >
                        <LuPencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete staff"
                        onClick={() => setConfirm(u)}
                        className={`${iconBtn} hover:text-rose-600`}
                      >
                        <LuTrash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog && (
        <UserDialog
          user={dialog.user}
          roles={roles}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            upsert(saved)
            setDialog(null)
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title="Delete staff"
          message={`Delete "${confirm.name}"? They will no longer be able to sign in.`}
          onConfirm={handleDelete}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
