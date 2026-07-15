import { api } from './client'

// ---------------------------------------------------------------------------
// POST / PUT /orders
// ---------------------------------------------------------------------------

export type OrderItemPayload = {
  menu_item_id: number
  quantity: number
  note?: string
}

export type OrderPayload = {
  order_type: 'dine_in' | 'take_away' | 'delivery'
  table_id?: number | null
  discount?: number
  tax?: number
  note?: string
  items: OrderItemPayload[]
}

/** A saved line of an order. `menu_item_id` is null once the product is deleted. */
export type ApiOrderItem = {
  id: number
  menu_item_id: number | null
  name: string
  price: string
  quantity: number
  note: string | null
  line_total: string
}

/** The slice of the order response the frontend uses. */
export type ApiOrder = {
  id: number
  order_number: string
  order_type: 'dine_in' | 'take_away' | 'delivery'
  table_id: number | null
  status: 'new' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled'
  subtotal: string
  discount: string
  tax: string
  total: string
  items: ApiOrderItem[]
}

/** Create the order (first "Send to Kitchen"). Totals are computed server-side. */
export function createOrder(payload: OrderPayload): Promise<ApiOrder> {
  return api<ApiOrder>('/orders', { body: payload })
}

/** Update an existing order — replaces its items and/or moves it to another table. */
export function updateOrder(
  id: number,
  payload: Partial<OrderPayload> & { status?: ApiOrder['status'] },
): Promise<ApiOrder> {
  return api<ApiOrder>(`/orders/${id}`, { method: 'PUT', body: payload })
}

// ---------------------------------------------------------------------------
// GET /orders
// ---------------------------------------------------------------------------

/** Statuses of a bill that is still running — anything else is off the floor. */
const OPEN_STATUSES: ApiOrder['status'][] = ['new', 'preparing', 'ready', 'served']

/**
 * The live bill sitting on a table, or null when the table has none. This is
 * how a cashier picks up what the waiter already fired: tapping an occupied
 * table loads its order so the items are on screen and the bill can be paid.
 */
export async function fetchOpenOrderForTable(tableId: number): Promise<ApiOrder | null> {
  const orders = await api<ApiOrder[]>(`/orders?table_id=${tableId}`)
  // The index returns newest-first, so the first open one is the current bill.
  return orders.find((o) => OPEN_STATUSES.includes(o.status)) ?? null
}
