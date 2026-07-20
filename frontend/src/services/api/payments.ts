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
  /** The journal (Cash USD, Cash KHR, Grab, …) that took the money. */
  payment_method_id?: number
  /** ALWAYS in USD — the base currency the reports sum. */
  amount: number
  /** What the guest actually tendered; defaults to USD server-side. */
  currency?: 'USD' | 'KHR'
  /** Riel per USD at payment time — required when currency is KHR. */
  exchange_rate?: number
  received?: number
  reference?: string
  /** Defaults to true server-side: complete the order once fully paid. */
  complete_order?: boolean
}

export type ApiPayment = {
  id: number
  order_id: number
  method: PayMethodBackend
  payment_method_id: number | null
  amount: string
  currency: string
  exchange_rate: string | null
  status: string
}

/** Record one tender against an order. */
export function recordPayment(payload: PaymentPayload): Promise<ApiPayment> {
  return api<ApiPayment>('/payments', { body: payload })
}

/**
 * Flip a paid payment to refunded (supervisor action — the backend only allows
 * admin/manager). The row keeps its amount so the money trail stays intact;
 * once no paid payment remains, the server moves the order to `refunded` and
 * it leaves the sales reports.
 */
export function refundPayment(paymentId: number, reason?: string): Promise<ApiPayment> {
  return api<ApiPayment>(`/payments/${paymentId}/refund`, { body: { reason: reason ?? null } })
}
