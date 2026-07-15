import { useState } from 'react'
import { LuCheck, LuLoaderCircle } from 'react-icons/lu'
import { updateSettings } from '../../services/api/settings'
import { useSettings } from '../../hooks/useSettings'
import { ApiError } from '../../services/api/client'

const inputCls =
  'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-neutral-700">
        {label} {hint && <span className="font-normal text-neutral-400">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

export default function AdminSettings() {
  const settings = useSettings()
  const [name, setName] = useState(settings.storeName)
  const [address, setAddress] = useState(settings.storeAddress)
  const [phone, setPhone] = useState(settings.storePhone)
  const [khr, setKhr] = useState(String(settings.khrRate))
  const [taxPct, setTaxPct] = useState(String(Math.round(settings.taxRate * 1000) / 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const khrNum = Number(khr)
    const taxNum = Number(taxPct)
    if (!name.trim()) return setError('Store name is required.')
    if (!Number.isFinite(khrNum) || khrNum <= 0) return setError('Enter a valid KHR rate.')
    if (!Number.isFinite(taxNum) || taxNum < 0 || taxNum > 100) return setError('Tax must be 0–100%.')

    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const next = await updateSettings({
        store_name: name.trim(),
        store_address: address.trim(),
        store_phone: phone.trim(),
        currency_khr_rate: khrNum,
        tax_rate: Math.round((taxNum / 100) * 10000) / 10000,
      })
      settings.applySettings(next)
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8">
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Store info */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-neutral-800">Store Information</h2>
          <p className="-mt-3 mb-4 text-xs text-neutral-400">Shown on printed receipts.</p>
          <div className="space-y-4">
            <Field label="Store name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Address">
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Phone">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </section>

        {/* Currency & tax */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-neutral-800">Currency &amp; Tax</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="KHR rate" hint="(riel per $1)">
              <input value={khr} onChange={(e) => setKhr(e.target.value)} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Tax rate" hint="(%)">
              <input value={taxPct} onChange={(e) => setTaxPct(e.target.value)} inputMode="decimal" className={inputCls} />
            </Field>
          </div>
          <p className="mt-3 text-xs text-neutral-400">
            Tax applies to the net subtotal on every order and receipt.
          </p>
        </section>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark disabled:opacity-60"
          >
            {saving && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            Save Settings
          </button>
          {saved && !saving && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <LuCheck className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
