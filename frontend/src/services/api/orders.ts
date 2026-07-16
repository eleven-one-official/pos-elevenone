import { api } from './client'
import type { OrderLine } from '../../features/pos/catalog'

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
  guest_count?: number
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
  /** Seated guests. 0 = not recorded (take-away or pre-feature orders). */
  guest_count: number
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

/**
 * Rebuild editable order lines from a saved order. The backend keeps one
 * order-level discount rather than per-line ones, and the POS only ever applies
 * a uniform "Discount All", so spreading it back as a flat percentage restores
 * the same total. Lines whose product has since been deleted carry no
 * menu_item_id and can no longer be re-sent, so they are dropped.
 */
export function orderToLines(order: ApiOrder): OrderLine[] {
  const items = order.items.filter((i) => i.menu_item_id != null)
  const gross = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0)
  const discount = Number(order.discount)
  const percent = gross > 0 && discount > 0 ? (discount / gross) * 100 : 0

  // The rest of the POS keys lines by product, so fold any duplicates together.
  const byProduct = new Map<string, OrderLine>()
  for (const item of items) {
    const id = String(item.menu_item_id)
    const existing = byProduct.get(id)
    if (existing) {
      existing.qty += item.quantity
      existing.note ??= item.note ?? undefined
      continue
    }
    byProduct.set(id, {
      id,
      name: item.name,
      // Charge what the order was taken at, not today's menu price.
      price: Number(item.price),
      qty: item.quantity,
      note: item.note ?? undefined,
      discount: percent > 0 ? percent : undefined,
    })
  }
  return [...byProduct.values()]
}
