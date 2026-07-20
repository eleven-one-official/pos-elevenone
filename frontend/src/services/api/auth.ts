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
  /** false = signs in on tap alone (waiters); true = PIN step required. */
  requires_pin: boolean
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
export function fetchStaffRoster(role?: 'waiter' | 'cashier' | 'kitchen'): Promise<StaffMember[]> {
  return api<StaffMember[]>(`/staff${role ? `?role=${role}` : ''}`)
}

/** Tap login (POS terminals / waiter tablets). PIN is only needed for accounts
 *  that have one — waiters sign in with just their id. Stores the bearer token. */
export async function staffLogin(userId: number, pin?: string): Promise<ApiUser> {
  const { token, user } = await api<LoginResponse>('/staff-login', {
    body: { user_id: userId, pin: pin ?? null },
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

/** The user behind the stored token — used to restore a session on app boot. */
export function fetchMe(): Promise<ApiUser> {
  return api<ApiUser>('/me')
}

/** Revoke the current token server-side and forget it locally. */
export async function logout(): Promise<void> {
  try {
    await api('/logout', { method: 'POST' })
  } finally {
    setToken(null)
  }
}
