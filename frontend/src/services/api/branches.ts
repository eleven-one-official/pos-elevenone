import { api } from './client'

// ---------------------------------------------------------------------------
// Branches (GET /branches — public: a device picks its branch before anyone
// signs in). Which one is active lives in the client (see getBranchId) and
// rides on every request as X-Branch-Id.
// ---------------------------------------------------------------------------

export type Branch = {
  id: number
  name: string
}

export function fetchBranches(): Promise<Branch[]> {
  return api<Branch[]>('/branches')
}
