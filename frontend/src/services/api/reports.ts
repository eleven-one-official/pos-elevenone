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

// --- Cashier "Summary Report" docket ---------------------------------------

/** One row of the sales-by-section block (Eat In / VIP / Take Away), gross. */
export type SummarySection = { label: string; total: number }

/** One income line, grouped into Bank (card/ABA/KHQR) or Cash by journal. */
export type SummaryChannel = {
  group: 'Bank' | 'Cash'
  /** Journal name — "Cash USD", "ABA", "Grab Merchant", … */
  label: string
  amount: number
  count: number
}

/** Everything the cashier's printed Summary Report needs, in one call.
 *  grand_total is gross (the section rows add up to it); total_paid is what the
 *  income channels collected. Cashier-accessible, unlike the other reports. */
export type DailySummary = {
  date: string
  sections: SummarySection[]
  channels: SummaryChannel[]
  /** Number of completed bills — the "Total Receipt" line. */
  orders_count: number
  guests: number
  grand_total: number
  discount: number
  total_paid: number
}

/** The day's summary behind the cashier's Print Summary docket (default today). */
export function fetchDailySummary(date?: string): Promise<DailySummary> {
  return api<DailySummary>(`/reports/summary${date ? `?date=${date}` : ''}`)
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

/** Stats for one register card. last_closing_* is the most recent finished day
 *  (before today) with a completed order; cash is that day's paid cash total
 *  (cashier side only). */
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
  /** Unit price — a product sold at two prices in the period gets two lines. */
  price: number
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

/** One dish's tally over the filtered tickets — how many plates went out and
 *  how fast the tickets carrying it ran. The board times the whole ticket,
 *  not each plate, so avg_prep_seconds is the average clock of the tickets the
 *  dish appeared on; null until at least one of them carries both stamps. */
export type ChefDishRow = {
  name: string
  /** Plates — line quantities added up. */
  units: number
  /** Tickets the dish appeared on. */
  rounds: number
  orders: number
  timed_rounds: number
  avg_prep_seconds: number | null
}

/** One cook × one dish — the row behind the By Chef view. A line the board
 *  tracked credits only its real maker with its own clock; a whole-card-era
 *  line credits the ticket's whole crew, the way the leaderboard does. */
export type ChefDishDetailRow = {
  chef_id: number
  chef: string
  name: string
  /** Plates of this dish the cook made — line quantities added up. */
  units: number
  /** Tickets where this cook made this dish. */
  rounds: number
  orders: number
  timed_rounds: number
  avg_prep_seconds: number | null
}

/** One dish on a ticket, as it was fired to the board. Since per-dish
 *  tracking each line also names its own maker and carries its own cook time
 *  (null on lines from the whole-card era, or dishes never started). */
export type ChefTicketLine = {
  name: string
  quantity: number
  note: string | null
  chef?: string | null
  /** The dish's own two stamps — null on whole-card-era lines. */
  started_at?: string | null
  ready_at?: string | null
  prep_seconds?: number | null
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
  /** Most-cooked dish first. */
  by_item: ChefDishRow[]
  /** Grouped per cook in leaderboard order, each cook's biggest dish first. */
  by_chef_item: ChefDishDetailRow[]
  /** Newest first, capped by the backend — compare with details_total. */
  details: ChefTicket[]
  details_total: number
}

export type ChefPerformanceFilters = {
  period: AnalysisPeriod
  /** One cook, or null for everyone. */
  chefId?: number | null
  station?: Station | null
  /** Custom window as local YYYY-MM-DD dates — either bound may stand alone;
   *  when set, the backend ignores `period`. */
  from?: string | null
  to?: string | null
}

/** Overview + per-cook rows + trends + the ticket list, in one call. Day and
 *  hour buckets are cut in the browser's timezone (the backend stores UTC). */
export function fetchChefPerformance(filters: ChefPerformanceFilters): Promise<ChefPerformanceData> {
  const params = new URLSearchParams({ tz: String(-new Date().getTimezoneOffset()) })
  if (filters.period) params.set('period', filters.period)
  if (filters.chefId) params.set('chef_id', String(filters.chefId))
  if (filters.station) params.set('station', filters.station)
  // Calendar days on the venue's clock → ISO instants, so the backend's UTC
  // window covers the picked days exactly (same contract as Sales Details).
  if (filters.from) params.set('from', new Date(`${filters.from}T00:00:00`).toISOString())
  if (filters.to) params.set('to', new Date(`${filters.to}T23:59:59.999`).toISOString())
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
