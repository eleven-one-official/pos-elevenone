import { api, setToken } from './client'

// ---------------------------------------------------------------------------
// Types mirroring the Laravel API payloads
// ---------------------------------------------------------------------------

/** One tappable entry from GET /staff (public login roster — no secrets). */
export type StaffMember = {
  id: number
  name: string
  username: string
  role: string | null
  role_name: string | null
}

export type ApiUser = {
  id: number
  name: string
  username: string
  email: string | null
  role_id: number | null
  is_active: boolean
  role?: { id: number; name: string; slug: string } | null
}

type LoginResponse = { token: string; user: ApiUser }

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/** Public roster for the tap-a-name login screen. */
export function fetchStaffRoster(role?: 'waiter' | 'cashier'): Promise<StaffMember[]> {
  return api<StaffMember[]>(`/staff${role ? `?role=${role}` : ''}`)
}

/** PIN login (POS terminals / waiter tablets). Stores the bearer token. */
export async function staffLogin(userId: number, pin: string): Promise<ApiUser> {
  const { token, user } = await api<LoginResponse>('/staff-login', {
    body: { user_id: userId, pin },
  })
  setToken(token)
  return user
}

/** Classic username + password login (admin / back office). Stores the token. */
export async function passwordLogin(username: string, password: string): Promise<ApiUser> {
  const { token, user } = await api<LoginResponse>('/login', {
    body: { username, password },
  })
  setToken(token)
  return user
}

/** Revoke the current token server-side and forget it locally. */
export async function logout(): Promise<void> {
  try {
    await api('/logout', { method: 'POST' })
  } finally {
    setToken(null)
  }
}
