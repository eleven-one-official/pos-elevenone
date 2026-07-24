import { api } from './client'
import { fetchOpenSlotOrders, type ApiOrder, type SlotOrderType } from './orders'
import type { PosTable, Section } from '../../features/pos/TableFloorPage'

// ---------------------------------------------------------------------------
// GET /tables → the POS floor shape
// ---------------------------------------------------------------------------

export type TableType = 'normal' | 'vip'
export type TableStatus = 'available' | 'occupied' | 'reserved'

export type TableShape = 'wide' | 'round' | 'tall'

export type ApiTable = {
  id: number
  name: string
  type: TableType
  /** Floor tab this table shows under (e.g. "BKK Eat In"); null = classic floor. */
  zone?: string | null
  /** Spot on the floor-plan canvas (% of its width/height); null = plain grid. */
  pos_x?: number | null
  pos_y?: number | null
  shape?: TableShape | null
  capacity: number
  status: TableStatus
  /** Guests on the table's open order; null when no order is running. */
  guest_count?: number | null
}

/** The order_type a bill started on this floor card carries. */
export function sectionOrderType(section: Section): 'dine_in' | SlotOrderType {
  if (section === 'takeaway') return 'take_away'
  if (section === 'delivery') return 'delivery'
  return 'dine_in'
}

function toPosTable(t: ApiTable): PosTable {
  return {
    id: String(t.id),
    backendId: t.id,
    label: t.name,
    zone: t.zone ?? undefined,
    posX: t.pos_x ?? undefined,
    posY: t.pos_y ?? undefined,
    shape: t.shape ?? undefined,
    seats: t.capacity,
    guests: t.guest_count ?? 0,
    orders: t.status === 'occupied' ? 1 : 0, // occupied → show the corner badge
    section: t.type === 'vip' ? 'vip' : 'dine-in',
  }
}

// The backend only models physical tables (normal/vip); take-away and delivery
// are order *types*, not tables. These synthetic cards give the floor tappable
// sections — orders started on one post with that order_type, a slot number
// and no table_id. Per-section prefixes/counts; the counts are per-branch
// settings (TTP: 8 take-away, no delivery; BKK: 15 and 12).
function slotCards(
  section: Extract<Section, 'takeaway' | 'delivery'>,
  type: SlotOrderType,
  count: number,
  openOrders: ApiOrder[],
): PosTable[] {
  // Newest-first from the API: keep the first bill seen per slot, which is the
  // current one if a closed-and-reopened slot ever doubles up.
  const bySlot = new Map<number, ApiOrder>()
  for (const order of openOrders) {
    if (order.takeaway_slot != null && !bySlot.has(order.takeaway_slot)) {
      bySlot.set(order.takeaway_slot, order)
    }
  }

  const prefix = type === 'take_away' ? 'T' : 'D'
  return Array.from({ length: count }, (_, i) => {
    const slot = i + 1
    const open = bySlot.get(slot)
    return {
      id: `${section}-${slot}`,
      label: `${prefix}${slot}`,
      takeawaySlot: slot,
      seats: 0,
      guests: 0,
      orders: open ? 1 : 0, // running bill → corner badge, like a seated table
      openOrderNumber: open?.order_number,
      openOrderTotal: open ? Number(open.total) : undefined,
      section,
    }
  })
}

/** Fetch the floor: real tables from the API + synthetic slot cards. */
export async function fetchFloorTables(
  takeawaySlots: number,
  deliverySlots: number,
): Promise<PosTable[]> {
  const [tables, takeawayOrders, deliveryOrders] = await Promise.all([
    api<ApiTable[]>('/tables'),
    // A slot the terminal can't confirm is better shown empty than blocked, so
    // a failed lookup just leaves the slot cards blank.
    fetchOpenSlotOrders('take_away').catch(() => []),
    deliverySlots > 0 ? fetchOpenSlotOrders('delivery').catch(() => []) : Promise.resolve([]),
  ])

  return [
    ...tables.map(toPosTable),
    ...slotCards('takeaway', 'take_away', takeawaySlots, takeawayOrders),
    ...slotCards('delivery', 'delivery', deliverySlots, deliveryOrders),
  ]
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
  zone?: string | null
  pos_x?: number | null
  pos_y?: number | null
  shape?: TableShape | null
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
