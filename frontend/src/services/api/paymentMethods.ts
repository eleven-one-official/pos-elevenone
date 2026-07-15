import { api } from './client'
import type { PayMethodBackend } from './payments'

// ---------------------------------------------------------------------------
// Payment journals (GET/POST/PUT/DELETE /payment-methods). The POS shows the
// active ones on the Payment screen; each maps to a backend channel that the
// recorded payment uses. Writes are admin-only on the backend.
// ---------------------------------------------------------------------------

export type PaymentMethodRow = {
  id: number
  label: string
  channel: PayMethodBackend
  is_active: boolean
  sort_order: number
}

export const PAY_CHANNELS: { value: PayMethodBackend; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'aba_qr', label: 'ABA QR' },
  { value: 'khqr', label: 'KHQR' },
  { value: 'card', label: 'Card' },
]

// Fallback list matching the seed, used if the API can't be reached so the
// Payment screen still works offline.
export const DEFAULT_PAYMENT_METHODS: PaymentMethodRow[] = [
  { id: -1, label: 'Cash USD', channel: 'cash', is_active: true, sort_order: 1 },
  { id: -2, label: 'Cash KHR', channel: 'cash', is_active: true, sort_order: 2 },
  { id: -6, label: 'ABA PAY', channel: 'aba_qr', is_active: true, sort_order: 6 },
]

/** Active journals for the POS Payment screen. */
export function fetchActivePaymentMethods(): Promise<PaymentMethodRow[]> {
  return api<PaymentMethodRow[]>('/payment-methods?active=1')
}

/** All journals (admin management). */
export function fetchPaymentMethods(): Promise<PaymentMethodRow[]> {
  return api<PaymentMethodRow[]>('/payment-methods')
}

export type PaymentMethodInput = {
  label: string
  channel: PayMethodBackend
  is_active?: boolean
  sort_order?: number | null
}

export function createPaymentMethod(input: PaymentMethodInput): Promise<PaymentMethodRow> {
  return api<PaymentMethodRow>('/payment-methods', { method: 'POST', body: input })
}

export function updatePaymentMethod(
  id: number,
  input: Partial<PaymentMethodInput>,
): Promise<PaymentMethodRow> {
  return api<PaymentMethodRow>(`/payment-methods/${id}`, { method: 'PUT', body: input })
}

export function deletePaymentMethod(id: number): Promise<{ message: string }> {
  return api<{ message: string }>(`/payment-methods/${id}`, { method: 'DELETE' })
}
