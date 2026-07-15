import { api } from './client'
import type { PosTable } from '../../features/pos/TableFloorPage'

// ---------------------------------------------------------------------------
// GET /tables → the POS floor shape
// ---------------------------------------------------------------------------

type ApiTable = {
  id: number
  name: string
  type: 'normal' | 'vip'
  capacity: number
  status: 'available' | 'occupied' | 'reserved'
}

// The backend only models physical tables (normal/vip); take-away is an order
// *type*, not a table. These synthetic slots give the floor a tappable
// "Take Away" section — orders started on one post as order_type=take_away
// with no table_id.
const TAKEAWAY_SLOTS = 6

function toPosTable(t: ApiTable): PosTable {
  return {
    id: String(t.id),
    backendId: t.id,
    label: t.name,
    seats: t.capacity,
    guests: 0, // the backend doesn't track seated guests yet
    orders: t.status === 'occupied' ? 1 : 0, // occupied → show the corner badge
    section: t.type === 'vip' ? 'vip' : 'dine-in',
  }
}

/** Fetch the floor: real tables from the API + synthetic take-away slots. */
export async function fetchFloorTables(): Promise<PosTable[]> {
  const tables = await api<ApiTable[]>('/tables')

  const takeaway: PosTable[] = Array.from({ length: TAKEAWAY_SLOTS }, (_, i) => ({
    id: `ta-${i + 1}`,
    label: `TA${i + 1}`,
    seats: 0,
    guests: 0,
    orders: 0,
    section: 'takeaway',
  }))

  return [...tables.map(toPosTable), ...takeaway]
}
