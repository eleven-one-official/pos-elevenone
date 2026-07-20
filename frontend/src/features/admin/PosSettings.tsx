import { useEffect, useState } from 'react'
import { LuX } from 'react-icons/lu'
import { Loader, LoadingState } from '../../components/ui/Loader'
import { useSettings } from '../../hooks/useSettings'
import {
  fetchSettings,
  updateSettings,
  type StoreSettings,
} from '../../services/api/settings'
import { fetchPricelists, type Pricelist } from '../../services/api/pricelists'
import { BLUE_SELECT, FieldGroup, LABEL, TEXT_INPUT } from './formKit'

// ---------------------------------------------------------------------------
// Configuration › Settings — the store settings form (GET/PUT /settings).
// Store identity feeds the receipt header; the KHR rate drives the riel
// conversion on the POS payment screen. Writes are admin-only server-side.
// ---------------------------------------------------------------------------

export default function PosSettings() {
  // Pushes freshly saved values into the app-wide settings context, so an
  // open POS register picks up e.g. a new KHR rate without a re-login.
  const { applySettings } = useSettings()

  const [loaded, setLoaded] = useState<StoreSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [storeName, setStoreName] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [storePhone, setStorePhone] = useState('')
  const [khrRate, setKhrRate] = useState('')
  const [openingFloat, setOpeningFloat] = useState('')
  const [pricelistId, setPricelistId] = useState('')
  const [pricelists, setPricelists] = useState<Pricelist[]>([])

  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = () => {
    setLoadError(null)
    fetchSettings()
      .then((s) => {
        setLoaded(s)
        setStoreName(s.storeName)
        setStoreAddress(s.storeAddress)
        setStorePhone(s.storePhone)
        setKhrRate(String(s.khrRate))
        setOpeningFloat(String(s.openingFloat))
        setPricelistId(s.defaultPricelistId ? String(s.defaultPricelistId) : '')
      })
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : 'Failed to load the settings.'),
      )
    fetchPricelists()
      .then(setPricelists)
      .catch(() => {}) // the picker just stays empty; saving still works
  }

  useEffect(load, [])

  const save = async () => {
    if (saving) return
    const rate = Number.parseFloat(khrRate.replace(/[^0-9.]/g, ''))
    const float = Number.parseFloat(openingFloat.replace(/[^0-9.]/g, ''))
    if (!storeName.trim()) {
      setNotice({ ok: false, text: 'The store name is required.' })
      return
    }
    if (Number.isNaN(rate) || rate <= 0) {
      setNotice({ ok: false, text: 'Enter a valid KHR exchange rate (riel per dollar).' })
      return
    }
    if (Number.isNaN(float) || float < 0) {
      setNotice({ ok: false, text: 'Enter a valid opening float (0 or more).' })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const next = await updateSettings({
        store_name: storeName.trim(),
        store_address: storeAddress.trim(),
        store_phone: storePhone.trim(),
        currency_khr_rate: rate,
        default_pricelist_id: pricelistId ? Number(pricelistId) : null,
        opening_float: float,
      })
      setLoaded(next)
      // Live registers in this app session follow the new values immediately.
      applySettings(next)
      setNotice({ ok: true, text: 'Settings saved.' })
    } catch (e: unknown) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Save failed. Try again.' })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={load}
          className="rounded-[3px] bg-[#57779a] px-4 py-1.5 text-sm text-white transition hover:bg-[#4c6b8d]"
        >
          Retry
        </button>
      </div>
    )
  }

  if (loaded === null) {
    return <LoadingState label="Loading settings..." className="h-full" />
  }

  return (
    <div className="flex h-full flex-col">
      {/* Control panel — Save/Discard, Odoo settings style */}
      <div className="border-b border-neutral-200/80 px-4 pb-2.5 pt-4">
        <h1 className="text-xl text-neutral-700">Settings</h1>
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
            onClick={() => {
              setStoreName(loaded.storeName)
              setStoreAddress(loaded.storeAddress)
              setStorePhone(loaded.storePhone)
              setKhrRate(String(loaded.khrRate))
              setOpeningFloat(String(loaded.openingFloat))
              setPricelistId(loaded.defaultPricelistId ? String(loaded.defaultPricelistId) : '')
              setNotice(null)
            }}
            disabled={saving}
            className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
          >
            Discard
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-100/60 pb-6">
        {notice && (
          <div
            className={`mx-4 mt-3 flex items-center justify-between gap-3 rounded-[2px] border px-3 py-2 text-[13px] ${
              notice.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {notice.text}
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => setNotice(null)}
              className="shrink-0 transition hover:opacity-70"
            >
              <LuX className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="mx-4 mt-4 rounded-[2px] border border-neutral-200 bg-white px-8 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="grid grid-cols-1 gap-x-16 gap-y-8 xl:grid-cols-2">
            <FieldGroup title="Store">
              <label className={LABEL}>Store Name</label>
              <input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className={TEXT_INPUT}
              />

              <label className={LABEL}>Address</label>
              <input
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                className={TEXT_INPUT}
              />

              <label className={LABEL}>Phone</label>
              <input
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                className={TEXT_INPUT}
              />
            </FieldGroup>

            <FieldGroup title="Currencies">
              <label className={LABEL}>KHR per USD</label>
              <div>
                <input
                  value={khrRate}
                  onChange={(e) => setKhrRate(e.target.value)}
                  className={`${TEXT_INPUT} max-w-40`}
                />
                <p className="mt-1.5 text-[12.5px] italic text-neutral-500">
                  Riel charged per US dollar — drives the KHR cash amounts on the payment screen
                  and the receipt.
                </p>
              </div>

              <label className={LABEL}>Opening Float (USD)</label>
              <div>
                <input
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  className={`${TEXT_INPUT} max-w-40`}
                />
                <p className="mt-1.5 text-[12.5px] italic text-neutral-500">
                  Cash the drawer starts the day with — the base of the Cash In/Out balance on
                  the register.
                </p>
              </div>
            </FieldGroup>

            <FieldGroup title="Pricing">
              <label className={LABEL}>Default Pricelist</label>
              <div>
                <select
                  value={pricelistId}
                  onChange={(e) => setPricelistId(e.target.value)}
                  className={`${BLUE_SELECT} max-w-64`}
                >
                  <option value="">None — plain menu prices</option>
                  {pricelists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.currency})
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[12.5px] italic text-neutral-500">
                  Applied to every new order the POS opens — its rules override menu prices
                  (KHR rules convert at the rate above). Products without a rule keep their
                  menu price.
                </p>
              </div>
            </FieldGroup>
          </div>

          <p className="mt-8 border-t border-neutral-200 pt-4 text-[12.5px] italic text-neutral-500">
            The store identity prints on every receipt header. The venue charges no tax, so there
            is no tax configuration here.
          </p>
        </div>
      </div>
    </div>
  )
}
