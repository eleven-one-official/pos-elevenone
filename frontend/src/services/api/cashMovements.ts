import { api } from './client'

// ---------------------------------------------------------------------------
// Cash drawer log (GET/POST /cash-movements) — server-side so every terminal
// sees the same drawer and each movement lands in the audit trail. The list
// covers one business day (default today).
// ---------------------------------------------------------------------------

export type ApiCashMovement = {
  id: number
  type: 'in' | 'out'
  amount: string // decimal cast serializes as a string
  reason: string
  business_date: string
  created_at: string
  user: { id: number; name: string } | null
}

export function fetchCashMovements(date?: string): Promise<ApiCashMovement[]> {
  return api<ApiCashMovement[]>(`/cash-movements${date ? `?date=${date}` : ''}`)
}

export function createCashMovement(input: {
  type: 'in' | 'out'
  amount: number
  reason: string
}): Promise<ApiCashMovement> {
  return api<ApiCashMovement>('/cash-movements', { body: input })
}
