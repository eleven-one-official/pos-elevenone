import { api } from './client'

// ---------------------------------------------------------------------------
// Chef roster (GET/POST/PUT/DELETE /chefs). The kitchen display shows the
// active cooks in its "who's cooking?" picker when a ticket is started; the
// admin side manages the list. Writes are back-office only on the backend.
// ---------------------------------------------------------------------------

export type Chef = {
  id: number
  name: string
  is_active: boolean
  sort_order: number
}

/** Active cooks for the kitchen display picker, in sequence order. */
export function fetchActiveChefs(): Promise<Chef[]> {
  return api<Chef[]>('/chefs?active=1')
}

/** All cooks (admin management). */
export function fetchChefs(): Promise<Chef[]> {
  return api<Chef[]>('/chefs')
}

export type ChefInput = {
  name: string
  is_active?: boolean
  sort_order?: number | null
}

export function createChef(input: ChefInput): Promise<Chef> {
  return api<Chef>('/chefs', { method: 'POST', body: input })
}

export function updateChef(id: number, input: Partial<ChefInput>): Promise<Chef> {
  return api<Chef>(`/chefs/${id}`, { method: 'PUT', body: input })
}

export function deleteChef(id: number): Promise<{ message: string }> {
  return api<{ message: string }>(`/chefs/${id}`, { method: 'DELETE' })
}
