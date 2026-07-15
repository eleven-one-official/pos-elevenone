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

/** The slice of the order response the frontend uses. */
export type ApiOrder = {
  id: number
  order_number: string
  order_type: 'dine_in' | 'take_away' | 'delivery'
  table_id: number | null
  status: 'new' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled'
  subtotal: string
  total: string
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
