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
  /** Money handed back on partially refunded orders — already off net_sales. */
  refunds: number
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

// --- Dashboard register cards ----------------------------------------------

/** Stats for one register card. last_closing_* is the most recent day with a
 *  completed order; cash is that day's paid cash total (cashier side only). */
export type PosConfigStats = {
  open_orders: number
  last_closing_date: string | null
  last_closing_cash: number | null
}

export function fetchPosConfigs(): Promise<{ cashier: PosConfigStats; waiter: PosConfigStats }> {
  return api<{ cashier: PosConfigStats; waiter: PosConfigStats }>('/reports/pos-configs')
}

// --- Sales Details ---------------------------------------------------------

export type SalesDetailsProduct = {
  name: string
  category: string
  quantity: number
  amount: number
}

export type SalesDetailsPayment = {
  method: string
  amount: string | number // SUM() can serialize as a string
  count: number
}

/** Data behind the printable Sales Details report — completed orders only,
 *  net of order-level discounts. */
export type SalesDetailsData = {
  start: string
  end: string
  orders_count: number
  total: number
  products: SalesDetailsProduct[]
  payments: SalesDetailsPayment[]
}

/** A register "side" — who fired the order (matches /reports/pos-configs). */
export type RegisterSide = 'cashier' | 'waiter'

/** start/end are absolute instants — pass UTC ISO ("2026-07-17T17:00:00.000Z"),
 *  not a naive local wall-clock, or the range shifts by the browser's offset.
 *  Omit sides for both registers. */
export function fetchSalesDetails(
  start: string,
  end: string,
  sides?: RegisterSide[],
): Promise<SalesDetailsData> {
  const params = new URLSearchParams({ start, end })
  if (sides && sides.length > 0) params.set('sides', sides.join(','))
  return api<SalesDetailsData>(`/reports/sales-details?${params}`)
}

// --- Orders Analysis -------------------------------------------------------

/** One bucket of the Orders Analysis aggregation (cancelled orders excluded).
 *  total_price is net of the order-level discount, spread over its lines;
 *  margin uses each product's current cost. */
export type OrdersAnalysisRow = {
  label: string
  total_price: number
  subtotal_wo_discount: number
  total_discount: number
  margin: number
  product_quantity: number
  sale_line_count: number
  order_count: number
  average_price: number
}

export type AnalysisGroupBy = 'category' | 'product' | 'order_date' | 'order_type' | 'employee'

/** Empty string = all time. */
export type AnalysisPeriod = '' | 'today' | 'week' | 'month' | 'year'

export function fetchOrdersAnalysis(
  groupBy: AnalysisGroupBy,
  period: AnalysisPeriod,
): Promise<OrdersAnalysisRow[]> {
  const params = new URLSearchParams({ group_by: groupBy })
  if (period) params.set('period', period)
  return api<OrdersAnalysisRow[]>(`/reports/orders-analysis?${params}`)
}

// --- Chef Performance ------------------------------------------------------

/** One cook's KPI row. avg_prep_seconds is null until a ticket carries both a
 *  Start and a Ready stamp (older orders / still-cooking tickets don't). */
export type ChefPerformanceRow = {
  chef_id: number
  chef: string
  orders: number
  items: number
  avg_prep_seconds: number | null
}

/** Per-cook productivity over ?period= (empty = all time). Busiest cook first. */
export function fetchChefPerformance(period: AnalysisPeriod): Promise<ChefPerformanceRow[]> {
  const params = new URLSearchParams()
  if (period) params.set('period', period)
  const qs = params.toString()
  return api<ChefPerformanceRow[]>(`/reports/chef-performance${qs ? `?${qs}` : ''}`)
}
