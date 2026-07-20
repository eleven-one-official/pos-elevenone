import { api } from './client'

// ---------------------------------------------------------------------------
// Store settings (GET/PUT /settings). The backend stores a flat key→string map;
// this module parses it into a typed shape and back. Reads are allowed for any
// authed user (the POS/receipt need store info + KHR rate); writes are admin-only.
// The venue charges no tax, so the backend's tax_rate key is ignored.
// ---------------------------------------------------------------------------

export type StoreSettings = {
  storeName: string
  storeAddress: string
  storePhone: string
  /** Riel per US dollar. */
  khrRate: number
  /** Pricelist the backend applies to new orders; null = plain menu prices. */
  defaultPricelistId: number | null
  /** USD the cash drawer starts the day with. */
  openingFloat: number
}

/** Fallbacks used before the API responds or if it can't be reached. */
export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'Elevenone Restaurant',
  storeAddress: 'Street 123, Phnom Penh, Cambodia',
  storePhone: '012 345 678',
  khrRate: 4100,
  defaultPricelistId: null,
  openingFloat: 100,
}

type RawSettings = Record<string, string | null>

function num(value: string | null | undefined, fallback: number): number {
  if (value == null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parse(raw: RawSettings): StoreSettings {
  const pricelist = num(raw.default_pricelist_id, 0)
  return {
    storeName: raw.store_name || DEFAULT_SETTINGS.storeName,
    storeAddress: raw.store_address || DEFAULT_SETTINGS.storeAddress,
    storePhone: raw.store_phone || DEFAULT_SETTINGS.storePhone,
    khrRate: num(raw.currency_khr_rate, DEFAULT_SETTINGS.khrRate),
    defaultPricelistId: pricelist > 0 ? pricelist : null,
    openingFloat: num(raw.opening_float, DEFAULT_SETTINGS.openingFloat),
  }
}

export function fetchSettings(): Promise<StoreSettings> {
  return api<RawSettings>('/settings').then(parse)
}

/** Only the fields provided are changed (backend whitelists these keys). */
export type SettingsUpdate = {
  store_name?: string
  store_address?: string
  store_phone?: string
  currency_khr_rate?: number
  default_pricelist_id?: number | null
  opening_float?: number
}

export function updateSettings(patch: SettingsUpdate): Promise<StoreSettings> {
  return api<RawSettings>('/settings', { method: 'PUT', body: patch }).then(parse)
}
