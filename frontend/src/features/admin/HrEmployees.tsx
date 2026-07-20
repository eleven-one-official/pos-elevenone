import { useCallback, useEffect, useState } from 'react'
import { LuChevronsUpDown, LuEye, LuEyeOff, LuSearch, LuTrash2, LuX } from 'react-icons/lu'
import { Loader, LoadingState } from '../../components/ui/Loader'
import {
  createUser,
  deleteUser,
  fetchRoles,
  fetchUsers,
  updateUser,
  type AdminRole,
  type AdminUser,
  type UserInput,
} from '../../services/api/users'
import { ApiError } from '../../services/api/client'
import { BLUE_SELECT, FIELD_BG, FieldGroup, LABEL, TEXT_INPUT } from './formKit'

// ---------------------------------------------------------------------------
// Employees module — the staff directory over the admin-only /users CRUD.
// Odoo-style list + form like the other back-office screens. This is where
// cashier PINs get set/reset (previously a direct-database chore); waiters
// tap in without a PIN, so their accounts simply leave PIN login off.
// ---------------------------------------------------------------------------

function errorText(e: unknown): string {
  if (e instanceof ApiError && e.errors) {
    const first = Object.values(e.errors)[0]?.[0]
    if (first) return first
  }
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

export default function HrEmployees() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<AdminUser | null>(null)
  // Row ids whose PIN is revealed — hidden again on reload for shoulder safety.
  const [shownPins, setShownPins] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    const [u, r] = await Promise.all([fetchUsers(), fetchRoles()])
    setUsers(u)
    setRoles(r)
    setChecked(new Set())
  }, [])

  useEffect(() => {
    load().catch((e: unknown) => setLoadError(errorText(e)))
  }, [load])

  const q = query.trim().toLowerCase()
  const visible = (users ?? []).filter(
    (u) =>
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.role?.name.toLowerCase().includes(q) ?? false),
  )

  const toggleChecked = (id: number) =>
    setChecked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const deleteChecked = async () => {
    setBusy(true)
    setActionError(null)
    try {
      for (const id of checked) await deleteUser(id)
      await load()
    } catch (e: unknown) {
      setActionError(errorText(e))
      // A guard (own account / last admin) may have stopped mid-batch — the
      // list must reflect what actually got deleted.
      await load().catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoadError(null)
            load().catch((e: unknown) => setLoadError(errorText(e)))
          }}
          className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
        >
          Retry
        </button>
      </div>
    )
  }

  if (users === null) {
    return <LoadingState label="Loading employees..." className="h-full" />
  }

  if (creating || selected) {
    return (
      <EmployeeForm
        user={selected ?? undefined}
        roles={roles}
        onBack={() => {
          setCreating(false)
          setSelected(null)
        }}
        onSaved={async () => {
          await load()
          setCreating(false)
          setSelected(null)
        }}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <div>
            <h1 className="text-xl text-neutral-700">Employees</h1>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-[3px] bg-[#57779a] px-3 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
              >
                Create
              </button>
              {checked.size > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-[3px] border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                >
                  <LuTrash2 className="h-3.5 w-3.5" />
                  Delete ({checked.size})
                </button>
              )}
            </div>
          </div>

          <div className="flex min-w-72 max-w-[880px] flex-1 flex-col gap-2">
            <label className="relative block">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-[3px] border border-neutral-300 px-3 py-1.5 pr-9 text-sm outline-none transition focus:border-sky-600"
              />
              <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            </label>
            <span className="self-end text-[13px] text-neutral-600">
              {visible.length === 0 ? '0-0' : `1-${visible.length}`} / {visible.length}
            </span>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-700">
          {actionError}
        </div>
      )}

      {/* Editable-list style table */}
      <div className="overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-800">
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={visible.length > 0 && visible.every((u) => checked.has(u.id))}
                  onChange={(e) =>
                    setChecked(e.target.checked ? new Set(visible.map((u) => u.id)) : new Set())
                  }
                  className="h-3.5 w-3.5 align-middle"
                />
              </th>
              <th className="w-8" />
              <th className="py-2.5 pr-4 font-bold">Name</th>
              <th className="w-[16%] py-2.5 pr-4 font-bold">Username</th>
              <th className="w-[14%] py-2.5 pr-4 font-bold">Role</th>
              <th className="w-[16%] py-2.5 pr-4 font-bold">Phone</th>
              <th className="w-[12%] py-2.5 pr-4 font-bold">PIN</th>
              <th className="w-[12%] py-2.5 pr-4 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => (
              <tr
                key={u.id}
                onClick={() => setSelected(u)}
                className="cursor-pointer border-b border-neutral-100 text-neutral-700 transition hover:bg-neutral-50"
              >
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${u.name}`}
                    checked={checked.has(u.id)}
                    onChange={() => toggleChecked(u.id)}
                    className="h-3.5 w-3.5 align-middle"
                  />
                </td>
                <td className="py-2 text-neutral-400">
                  <LuChevronsUpDown className="h-3.5 w-3.5" />
                </td>
                <td className="py-2 pr-4 text-neutral-800">{u.name}</td>
                <td className="py-2 pr-4">{u.username}</td>
                <td className="py-2 pr-4">{u.role?.name ?? '—'}</td>
                <td className="py-2 pr-4">{u.phone ?? '—'}</td>
                <td className="py-2 pr-4" onClick={(e) => e.stopPropagation()}>
                  {u.has_pin ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono tracking-widest">
                        {shownPins.has(u.id) ? u.pin : '••••'}
                      </span>
                      <button
                        type="button"
                        aria-label={shownPins.has(u.id) ? `Hide ${u.name}'s PIN` : `Show ${u.name}'s PIN`}
                        onClick={() =>
                          setShownPins((s) => {
                            const next = new Set(s)
                            if (next.has(u.id)) next.delete(u.id)
                            else next.add(u.id)
                            return next
                          })
                        }
                        className="text-neutral-400 transition hover:text-neutral-700"
                      >
                        {shownPins.has(u.id) ? (
                          <LuEyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <LuEye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                      u.is_active
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-neutral-200 text-neutral-600'
                    }`}
                  >
                    {u.is_active ? 'Active' : 'Archived'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="p-10 text-center text-sm text-neutral-500">
            {query.trim()
              ? `No employee matches "${query}".`
              : 'No employees yet — hit Create to add the first one.'}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[3px] border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-3 text-[15px] font-semibold text-neutral-800">
              Confirmation
            </div>
            <p className="px-5 py-4 text-sm text-neutral-700">
              Are you sure you want to delete{' '}
              {checked.size === 1 ? 'this employee' : `these ${checked.size} employees`}? They lose
              all access immediately. Past orders and payments keep their history.
            </p>
            <div className="flex gap-1.5 border-t border-neutral-200 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false)
                  void deleteChecked()
                }}
                className="rounded-[3px] bg-red-600 px-4 py-1.5 text-sm text-white transition hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create/edit form — identity, role and the two credentials (password for the
// back office, PIN for the register PIN pad).
// ---------------------------------------------------------------------------

function EmployeeForm({
  user,
  roles,
  onBack,
  onSaved,
}: {
  user?: AdminUser
  roles: AdminRole[]
  onBack: () => void
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [roleId, setRoleId] = useState<string>(user?.role ? String(user.role.id) : '')
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [password, setPassword] = useState('')
  const [pinEnabled, setPinEnabled] = useState(user?.has_pin ?? false)
  // Prefilled with the current PIN (admin-viewable); masked until the eye toggle.
  const [pin, setPin] = useState(user?.pin ?? '')
  const [showPin, setShowPin] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (saving) return
    if (!name.trim()) {
      setError('The employee name is required.')
      return
    }
    if (!username.trim()) {
      setError('The username is required.')
      return
    }
    if (!user && password.length < 8) {
      setError('A password of at least 8 characters is required.')
      return
    }
    if (user && password.length > 0 && password.length < 8) {
      setError('The new password must be at least 8 characters.')
      return
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      setError('The PIN must be 4 to 6 digits.')
      return
    }
    if (pinEnabled && !pin) {
      setError('Enter a PIN (4-6 digits) or turn PIN login off.')
      return
    }

    const input: UserInput = {
      name: name.trim(),
      username: username.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      role_id: roleId ? Number(roleId) : null,
      is_active: isActive,
    }
    if (password) input.password = password
    // PIN semantics on the API: a value sets it, '' clears it, absent keeps it.
    if (!pinEnabled && user?.has_pin) input.pin = ''
    else if (pinEnabled && pin && pin !== user?.pin) input.pin = pin

    setSaving(true)
    setError(null)
    try {
      if (user) await updateUser(user.id, input)
      else await createUser(input)
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
          <span>{user ? user.name : 'New'}</span>
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
          <div className="text-[13px] font-bold text-neutral-800">Employee Name</div>
          <input
            placeholder="e.g. Sok Dara"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mt-1 w-[56%] min-w-72 rounded-[2px] border border-neutral-300 ${FIELD_BG} px-3 py-1.5 text-[22px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-sky-600`}
          />

          <div className="mt-6 grid grid-cols-1 gap-x-16 gap-y-3 xl:grid-cols-2">
            <FieldGroup title="Work Information">
              <label className={LABEL}>Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Sign-in name, no spaces"
                className={TEXT_INPUT}
              />

              <label className={LABEL}>Role</label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className={BLUE_SELECT}
              >
                <option value="">No role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              <label className={LABEL}>Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 012 345 678"
                className={TEXT_INPUT}
              />

              <label className={LABEL}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. dara@elevenone.com"
                className={TEXT_INPUT}
              />

              <label className={LABEL}>Active</label>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="mt-1.5 h-3.5 w-3.5 justify-self-start accent-teal-700"
              />
            </FieldGroup>

            <FieldGroup title="Security">
              <label className={LABEL}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={user ? 'Leave blank to keep current' : 'At least 8 characters'}
                autoComplete="new-password"
                className={TEXT_INPUT}
              />

              <label className={LABEL}>PIN Login</label>
              <input
                type="checkbox"
                checked={pinEnabled}
                onChange={(e) => setPinEnabled(e.target.checked)}
                className="mt-1.5 h-3.5 w-3.5 justify-self-start accent-teal-700"
              />

              {pinEnabled && (
                <>
                  <label className={LABEL}>PIN</label>
                  <span className="relative block max-w-40">
                    <input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="4-6 digits"
                      autoComplete="off"
                      className={`${TEXT_INPUT} pr-8 tracking-widest`}
                    />
                    <button
                      type="button"
                      aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                      onClick={() => setShowPin((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 transition hover:text-neutral-700"
                    >
                      {showPin ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
                    </button>
                  </span>
                </>
              )}
            </FieldGroup>
          </div>

          <p className="mt-8 border-t border-neutral-200 pt-4 text-[12.5px] italic text-neutral-500">
            The password signs in on the login page (admins and back-office). The PIN is for the
            register PIN pad — cashiers need one to open a session. Waiters tap their name with no
            PIN, so leave PIN login off for the shared Waiter account.
          </p>
        </div>
      </div>
    </div>
  )
}
