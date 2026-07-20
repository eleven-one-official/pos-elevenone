import { useEffect, useState } from 'react'
import { LuCheck, LuPlus, LuSearch } from 'react-icons/lu'
import Modal from '../../components/ui/Modal'
import { Loader, LoadingState } from '../../components/ui/Loader'
import { fetchCustomers, createCustomer, type Customer } from '../../services/api/customers'
import { ApiError } from '../../services/api/client'

// ---------------------------------------------------------------------------
// Pick-or-create customer popup, shared by the order screen and the payment
// screen. Choosing (or removing) a customer closes the dialog via onChoose.
// ---------------------------------------------------------------------------

export default function CustomerDialog({
  current,
  onChoose,
  onClose,
}: {
  current: Customer | null
  onChoose: (c: Customer | null) => void
  onClose: () => void
}) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetchCustomers()
      .then((cs) => alive && setCustomers(cs))
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const term = search.trim().toLowerCase()
  const results = customers.filter(
    (c) => c.name.toLowerCase().includes(term) || (c.phone ?? '').includes(term),
  )

  async function addNew() {
    if (!newName.trim()) return setError('Enter a name')
    setSaving(true)
    setError('')
    try {
      const created = await createCustomer({ name: newName.trim(), phone: newPhone.trim() || null })
      onChoose(created) // select the freshly added customer and close
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the customer')
      setSaving(false)
    }
  }

  return (
    <Modal title={adding ? 'New Customer' : 'Select Customer'} onClose={onClose} width="max-w-lg">
      {adding ? (
        <div className="space-y-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Customer name"
            className="h-11 w-full rounded-xl border border-neutral-200 px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="h-11 w-full rounded-xl border border-neutral-200 px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setError('')
              }}
              className="flex-1 rounded-xl border border-neutral-300 py-3 font-semibold text-neutral-700 transition hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void addNew()}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2b2138] py-3 font-semibold text-white shadow-sm transition hover:bg-[#37294a] disabled:opacity-60"
            >
              {saving && <Loader size="sm" />}
              Save Customer
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-neutral-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone"
                className="h-11 w-full rounded-xl border border-neutral-200 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setNewName(search)
                setNewPhone('')
                setError('')
                setAdding(true)
              }}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 font-semibold text-white transition hover:bg-primary-dark"
            >
              <LuPlus className="h-4 w-4" />
              New
            </button>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {current && (
              <button
                type="button"
                onClick={() => onChoose(null)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
              >
                Remove current customer
              </button>
            )}
            {loading ? (
              <LoadingState label="Loading…" size="md" className="py-8" />
            ) : (
              <>
                {results.map((c) => {
                  const selected = current?.id === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onChoose(c)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        selected ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-600">
                        {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-neutral-800">{c.name}</span>
                        {c.phone && <span className="block text-xs text-neutral-500">{c.phone}</span>}
                      </span>
                      {selected && <LuCheck className="h-5 w-5 text-emerald-600" />}
                    </button>
                  )
                })}
                {results.length === 0 && (
                  <p className="py-6 text-center text-sm text-neutral-400">
                    No customers match “{search}”.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
