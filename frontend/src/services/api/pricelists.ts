import { api } from './client'

// ---------------------------------------------------------------------------
// Pricelists — CRUD for the admin's Odoo-style pricelist editor. A pricelist
// is a header (name/currency/discount policy) plus price rules; a rule pins a
// fixed price for one product (or all, when menu_item_id is null) above a
// minimum quantity, optionally within a date range.
// ---------------------------------------------------------------------------

export type PricelistRule = {
  id: number
  pricelist_id: number
  menu_item_id: number | null
  min_quantity: number
  fixed_price: string // decimal cast serializes as a string
  date_start: string | null // YYYY-MM-DD
  date_end: string | null
  menu_item: { id: number; name: string } | null
}

export type Pricelist = {
  id: number
  name: string
  currency: 'USD' | 'KHR'
  discount_policy: 'included' | 'public'
  rules: PricelistRule[]
}

export type PricelistRuleInput = {
  /** null prices all products. */
  menu_item_id: number | null
  min_quantity?: number
  fixed_price: number
  date_start?: string | null
  date_end?: string | null
}

export type PricelistInput = {
  name: string
  currency: 'USD' | 'KHR'
  discount_policy?: 'included' | 'public'
  /** Full rule set — the backend replaces the existing rules wholesale. */
  rules?: PricelistRuleInput[]
}

export function fetchPricelists(): Promise<Pricelist[]> {
  return api<Pricelist[]>('/pricelists')
}

export function createPricelist(input: PricelistInput): Promise<Pricelist> {
  return api<Pricelist>('/pricelists', { method: 'POST', body: input })
}

export function updatePricelist(id: number, input: PricelistInput): Promise<Pricelist> {
  return api<Pricelist>(`/pricelists/${id}`, { method: 'PUT', body: input })
}

export function deletePricelist(id: number): Promise<{ message: string }> {
  return api<{ message: string }>(`/pricelists/${id}`, { method: 'DELETE' })
}
