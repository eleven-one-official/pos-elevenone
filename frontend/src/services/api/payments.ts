import { api } from './client'

// ---------------------------------------------------------------------------
// POST /payments — record money taken against an order. The backend completes
// the order and frees its table once cumulative paid amount covers the total,
// so several partial payments (a split bill) settle the same order over time.
// ---------------------------------------------------------------------------

/** Payment channels the backend accepts (payments table enum). */
export type PayMethodBackend = 'cash' | 'aba_qr' | 'khqr' | 'card'

export type PaymentPayload = {
  order_id: number
  method: PayMethodBackend
  amount: number
  received?: number
  reference?: string
  /** Defaults to true server-side: complete the order once fully paid. */
  complete_order?: boolean
}

export type ApiPayment = {
  id: number
  order_id: number
  method: PayMethodBackend
  amount: string
  status: string
}

/** Record one tender against an order. */
export function recordPayment(payload: PaymentPayload): Promise<ApiPayment> {
  return api<ApiPayment>('/payments', { body: payload })
}
