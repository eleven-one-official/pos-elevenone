// Admin-only audit trail (GET /audit-logs). Read-only by design.

import { api } from './client'

export type AuditLogEntry = {
  id: number
  created_at: string
  /** The actor; null for e.g. failed logins or deleted accounts. */
  user: { id: number; name: string } | null
  /** Actor name captured at write time — survives account deletion. */
  user_name: string | null
  event: 'created' | 'updated' | 'deleted' | 'login' | 'login_failed' | 'logout' | string
  /** Model basename the event happened to, e.g. "Order", "MenuItem". */
  subject_type: string | null
  subject_id: number | null
  /** Human handle: order number, item name, username... */
  label: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
}

/** Laravel paginator envelope (the fields the UI uses). */
export type AuditLogPage = {
  data: AuditLogEntry[]
  current_page: number
  last_page: number
  per_page: number
  total: number
  from: number | null
  to: number | null
}

export type AuditLogFilters = {
  page?: number
  event?: string
  /** Model basename, e.g. "Order". */
  type?: string
  /** Matches the label column. */
  search?: string
}

export function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogPage> {
  const params = new URLSearchParams()
  if (filters.page && filters.page > 1) params.set('page', String(filters.page))
  if (filters.event) params.set('event', filters.event)
  if (filters.type) params.set('type', filters.type)
  if (filters.search) params.set('search', filters.search)
  const qs = params.toString()
  return api<AuditLogPage>(`/audit-logs${qs ? `?${qs}` : ''}`)
}
