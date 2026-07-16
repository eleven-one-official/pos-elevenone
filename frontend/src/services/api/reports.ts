import { api } from './client'

// ---------------------------------------------------------------------------
// Admin reporting endpoints (GET /reports/*). All require a bearer token.
// The backend casts money columns to float, so numbers arrive as numbers here;
// SUM() aggregates can still serialize as strings, so callers coerce with
// Number() before doing math.
// ---------------------------------------------------------------------------

export type DashboardOrder = {
  id: number
  order_number: string | null
  status: string
  order_type: string | null
  subtotal: string | number
  total: string | number
  created_at: string
  table: { id: number; name: string } | null
  user: { id: number; name: string; username: string } | null
}

export type DashboardSummary = {
  today_sales: number
  monthly_sales: number
  total_orders_today: number
  pending_orders: number
  tables: { total: number; occupied: number; available: number; reserved: number }
  recent_orders: DashboardOrder[]
}

/** Headline numbers + recent orders for the admin home screen. */
export function fetchDashboard(): Promise<DashboardSummary> {
  return api<DashboardSummary>('/reports/dashboard')
}

export type PaymentSummaryRow = {
  method: string
  total: string | number
  count: number
}

export type DailySales = {
  date: string
  orders_count: number
  gross_sales: number
  discount: number
  net_sales: number
  payment_summary: PaymentSummaryRow[]
}

/** Daily sales + payment-method breakdown for a date (YYYY-MM-DD, default today). */
export function fetchDailySales(date?: string): Promise<DailySales> {
  return api<DailySales>(`/reports/daily-sales${date ? `?date=${date}` : ''}`)
}

export type TopItem = {
  menu_item_id: number
  name: string
  total_quantity: string | number
  total_sales: string | number
}

/** Best-selling items by quantity (default top 10). */
export function fetchTopItems(limit = 10): Promise<TopItem[]> {
  return api<TopItem[]>(`/reports/top-items?limit=${limit}`)
}
