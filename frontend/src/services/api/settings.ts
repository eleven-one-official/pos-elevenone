import { api } from './client'

// ---------------------------------------------------------------------------
// Store settings (GET/PUT /settings). The backend stores a flat key→string map;
// this module parses it into a typed shape and back. Reads are allowed for any
// authed user (the POS/receipt need store info + tax rate); writes are admin-only.
// ---------------------------------------------------------------------------

export type StoreSettings = {
  storeName: string
  storeAddress: string
  storePhone: string
  /** Riel per US dollar. */
  khrRate: number
  /** Tax as a fraction of the net subtotal (0.1 = 10%). */
  taxRate: number
}

/** Fallbacks used before the API responds or if it can't be reached. */
export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'Elevenone Restaurant',
  storeAddress: 'Street 123, Phnom Penh, Cambodia',
  storePhone: '012 345 678',
  khrRate: 4100,
  taxRate: 0.1,
}

type RawSettings = Record<string, string | null>

function num(value: string | null | undefined, fallback: number): number {
  if (value == null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parse(raw: RawSettings): StoreSettings {
  return {
    storeName: raw.store_name || DEFAULT_SETTINGS.storeName,
    storeAddress: raw.store_address || DEFAULT_SETTINGS.storeAddress,
    storePhone: raw.store_phone || DEFAULT_SETTINGS.storePhone,
    khrRate: num(raw.currency_khr_rate, DEFAULT_SETTINGS.khrRate),
    taxRate: num(raw.tax_rate, DEFAULT_SETTINGS.taxRate),
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
  tax_rate?: number
}

export function updateSettings(patch: SettingsUpdate): Promise<StoreSettings> {
  return api<RawSettings>('/settings', { method: 'PUT', body: patch }).then(parse)
}
