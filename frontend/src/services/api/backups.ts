// Admin-only database backups + CSV report exports (both admin-gated on the
// backend). Backups follow the same bearer-token pattern as reports.ts; the
// downloads go through downloadFile() since they return a binary/CSV file
// rather than JSON.

import { api, downloadFile } from './client'

export type Backup = {
  name: string
  /** Bytes. */
  size: number
  created_at: string
}

/** Every backup on the server, newest first. */
export function fetchBackups(): Promise<Backup[]> {
  return api<{ data: Backup[] }>('/backups').then((r) => r.data)
}

/** Create a fresh database backup now (runs synchronously on the server). */
export function createBackup(): Promise<Backup> {
  return api<Backup>('/backups', { method: 'POST' })
}

/** Delete one backup by name. */
export function deleteBackup(name: string): Promise<void> {
  return api<void>(`/backups/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

/** Download a backup's .sql.gz to the browser. */
export function downloadBackup(name: string): Promise<void> {
  return downloadFile(`/backups/${encodeURIComponent(name)}/download`, name)
}
