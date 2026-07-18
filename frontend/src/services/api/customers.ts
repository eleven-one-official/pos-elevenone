import { api } from './client'

// ---------------------------------------------------------------------------
// Customer directory (GET/POST /customers). Cashiers can add a walk-in on the
// fly from the order screen; admins can manage the full list via the same CRUD.
// ---------------------------------------------------------------------------

export type Customer = {
  id: number
  name: string
  phone: string | null
  email?: string | null
  note?: string | null
}

/** All customers, optionally filtered by name/phone with ?search=. */
export function fetchCustomers(search?: string): Promise<Customer[]> {
  const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
  return api<Customer[]>(`/customers${q}`)
}

export type CustomerInput = {
  name: string
  phone?: string | null
  email?: string | null
  note?: string | null
}

export function createCustomer(input: CustomerInput): Promise<Customer> {
  return api<Customer>('/customers', { method: 'POST', body: input })
}

// Editing and deleting are back-office ops (admin/manager on the backend).

export function updateCustomer(id: number, input: Partial<CustomerInput>): Promise<Customer> {
  return api<Customer>(`/customers/${id}`, { method: 'PUT', body: input })
}

export function deleteCustomer(id: number): Promise<{ message: string }> {
  return api<{ message: string }>(`/customers/${id}`, { method: 'DELETE' })
}
