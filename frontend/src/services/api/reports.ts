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
  /** Journal name (Cash USD, ABA PAY, Grab Merchant, …); the channel code for
   *  older payments that carry no journal. */
  label: string
  amount: string | number // SUM() can serialize as a string
  count: number
}

/** Data behind the printable Sales Details report — completed orders only,
 *  net of order-level discounts. */
export type SalesDetailsData = {
  start: string
  end: string
  orders_count: number
  /** Seated guests across the completed orders (0 for take-away). */
  guests: number
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

/** Where a ticket is made — the two display boards. */
export type Station = 'kitchen' | 'bar'

/** One cook's KPI row. avg_prep_seconds is null until a ticket carries both a
 *  Start and a Ready stamp (older orders / still-cooking tickets don't);
 *  timed_rounds says how many tickets that average is actually built on. */
export type ChefPerformanceRow = {
  chef_id: number
  chef: string
  orders: number
  rounds: number
  items: number
  timed_rounds: number
  avg_prep_seconds: number | null
}

/** A trend bucket. Only one of date/hour/station is set, per the series. */
export type ChefBucket = {
  date?: string
  hour?: number
  station?: string
  rounds: number
  items: number
  avg_prep_seconds: number | null
}

/** One dish on a ticket, as it was fired to the board. */
export type ChefTicketLine = {
  name: string
  quantity: number
  note: string | null
}

/** One ticket a cook worked — the row behind every number on the screen. */
export type ChefTicket = {
  id: number
  order_id: number
  order_number: string | null
  table: string | null
  round_no: number
  station: string | null
  status: string
  chef_id: number
  chef: string
  items: number
  started_at: string | null
  ready_at: string | null
  created_at: string | null
  prep_seconds: number | null
  /** The dishes themselves; `items` is their summed quantity. */
  lines: ChefTicketLine[]
  /** How many distinct dishes — the line count, not the units. */
  dishes: number
}

export type ChefPerformanceData = {
  overview: {
    orders: number
    rounds: number
    items: number
    chefs: number
    timed_rounds: number
    avg_prep_seconds: number | null
    fastest_seconds: number | null
    slowest_seconds: number | null
    busiest_chef: string | null
  }
  chefs: ChefPerformanceRow[]
  by_day: ChefBucket[]
  by_hour: ChefBucket[]
  by_station: ChefBucket[]
  /** Newest first, capped by the backend — compare with details_total. */
  details: ChefTicket[]
  details_total: number
}

export type ChefPerformanceFilters = {
  period: AnalysisPeriod
  /** One cook, or null for everyone. */
  chefId?: number | null
  station?: Station | null
}

/** Overview + per-cook rows + trends + the ticket list, in one call. Day and
 *  hour buckets are cut in the browser's timezone (the backend stores UTC). */
export function fetchChefPerformance(filters: ChefPerformanceFilters): Promise<ChefPerformanceData> {
  const params = new URLSearchParams({ tz: String(-new Date().getTimezoneOffset()) })
  if (filters.period) params.set('period', filters.period)
  if (filters.chefId) params.set('chef_id', String(filters.chefId))
  if (filters.station) params.set('station', filters.station)
  return api<ChefPerformanceData>(`/reports/chef-performance?${params}`)
}

// --- Orders list (for the admin's "Export Orders" PDF) ---------------------

/** One bill in the export — date/time already shifted to the browser's day. */
export type OrderListRow = {
  order_number: string | null
  date: string | null
  time: string | null
  type: string | null
  table: string | null
  staff: string | null
  guests: number
  items: number
  subtotal: number
  discount: number
  total: number
  status: string
}

/** Every order between two UTC instants, one row per bill (newest last). */
export function fetchOrdersList(start: string, end: string): Promise<OrderListRow[]> {
  const params = new URLSearchParams({
    start,
    end,
    tz: String(-new Date().getTimezoneOffset()),
  })
  return api<OrderListRow[]>(`/reports/orders-list?${params}`)
}
