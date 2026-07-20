import { api } from './client'

// ---------------------------------------------------------------------------
// Admin staff management (users + roles). All endpoints are admin-only on the
// backend; a non-admin token gets a 403 (surfaced as an ApiError).
// ---------------------------------------------------------------------------

export type AdminRole = { id: number; name: string; slug: string }

export type AdminUser = {
  id: number
  name: string
  username: string
  email: string | null
  phone: string | null
  is_active: boolean
  role: AdminRole | null
  /** The staff PIN in clear — this endpoint is admin-only. Null = PIN login off. */
  pin: string | null
  /** Whether PIN login is enabled. */
  has_pin: boolean
}

export function fetchRoles(): Promise<AdminRole[]> {
  return api<AdminRole[]>('/roles')
}

export function fetchUsers(): Promise<AdminUser[]> {
  return api<AdminUser[]>('/users')
}

export type UserInput = {
  name: string
  username: string
  email?: string | null
  phone?: string | null
  role_id?: number | null
  /** Required on create; omit on edit to keep the current password. */
  password?: string
  /** Set enables PIN login; empty string clears it; omit leaves it unchanged. */
  pin?: string | null
  is_active?: boolean
}

export function createUser(input: UserInput): Promise<AdminUser> {
  return api<AdminUser>('/users', { method: 'POST', body: input })
}

export function updateUser(id: number, input: Partial<UserInput>): Promise<AdminUser> {
  return api<AdminUser>(`/users/${id}`, { method: 'PUT', body: input })
}

export function deleteUser(id: number): Promise<{ message: string }> {
  return api<{ message: string }>(`/users/${id}`, { method: 'DELETE' })
}
