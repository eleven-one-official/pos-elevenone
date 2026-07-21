import { api } from './client'
import { fetchOpenTakeawayOrders } from './orders'
import type { PosTable } from '../../features/pos/TableFloorPage'

// ---------------------------------------------------------------------------
// GET /tables → the POS floor shape
// ---------------------------------------------------------------------------

export type TableType = 'normal' | 'vip'
export type TableStatus = 'available' | 'occupied' | 'reserved'

export type ApiTable = {
  id: number
  name: string
  type: TableType
  capacity: number
  status: TableStatus
  /** Guests on the table's open order; null when no order is running. */
  guest_count?: number | null
}

// The backend only models physical tables (normal/vip); take-away is an order
// *type*, not a table. These synthetic slots give the floor a tappable
// "Take Away" section — orders started on one post as order_type=take_away
// with no table_id.
const TAKEAWAY_SLOTS = 8

function toPosTable(t: ApiTable): PosTable {
  return {
    id: String(t.id),
    backendId: t.id,
    label: t.name,
    seats: t.capacity,
    guests: t.guest_count ?? 0,
    orders: t.status === 'occupied' ? 1 : 0, // occupied → show the corner badge
    section: t.type === 'vip' ? 'vip' : 'dine-in',
  }
}

/** Fetch the floor: real tables from the API + synthetic take-away slots. */
export async function fetchFloorTables(): Promise<PosTable[]> {
  const [tables, takeawayOrders] = await Promise.all([
    api<ApiTable[]>('/tables'),
    // A slot the terminal can't confirm is better shown empty than blocked, so
    // a failed lookup just leaves the take-away cards blank.
    fetchOpenTakeawayOrders().catch(() => []),
  ])

  // Newest-first from the API: keep the first bill seen per slot, which is the
  // current one if a closed-and-reopened slot ever doubles up.
  const bySlot = new Map<number, (typeof takeawayOrders)[number]>()
  for (const order of takeawayOrders) {
    if (order.takeaway_slot != null && !bySlot.has(order.takeaway_slot)) {
      bySlot.set(order.takeaway_slot, order)
    }
  }

  const takeaway: PosTable[] = Array.from({ length: TAKEAWAY_SLOTS }, (_, i) => {
    const slot = i + 1
    const open = bySlot.get(slot)
    return {
      id: `ta-${slot}`,
      label: `T${slot}`,
      takeawaySlot: slot,
      seats: 0,
      guests: 0,
      orders: open ? 1 : 0, // running bill → corner badge, like a seated table
      openOrderNumber: open?.order_number,
      openOrderTotal: open ? Number(open.total) : undefined,
      section: 'takeaway',
    }
  })

  return [...tables.map(toPosTable), ...takeaway]
}

// ---------------------------------------------------------------------------
// Admin table management — raw table rows (not the POS floor shape) plus CRUD.
// The backend TableController is behind auth:sanctum; the POS also uses these
// same endpoints to flip a table's status during service.
// ---------------------------------------------------------------------------

/** All physical tables, raw shape, for the admin management screen. */
export function fetchTables(): Promise<ApiTable[]> {
  return api<ApiTable[]>('/tables')
}

export type TableInput = {
  name: string
  type: TableType
  capacity: number
  status?: TableStatus
}

export function createTable(input: TableInput): Promise<ApiTable> {
  return api<ApiTable>('/tables', { method: 'POST', body: input })
}

export function updateTable(id: number, input: Partial<TableInput>): Promise<ApiTable> {
  return api<ApiTable>(`/tables/${id}`, { method: 'PUT', body: input })
}

export function deleteTable(id: number): Promise<{ message: string }> {
  return api<{ message: string }>(`/tables/${id}`, { method: 'DELETE' })
}
