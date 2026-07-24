// Base HTTP client for the Laravel API.
//
// The base URL defaults to the local artisan server (port 8001 — BYD owns
// 8000); override it with VITE_API_URL in frontend/.env when the tablets
// reach the POS machine over the LAN (e.g. VITE_API_URL=https://192.168.1.10:8443/api).

export const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8001/api'

// Backend origin without the /api suffix — uploaded files live there under
// /storage (e.g. http://127.0.0.1:8001/storage/menu-items/x.jpg).
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

/** Resolve an image/asset path from the API into an absolute URL. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`
}

const TOKEN_KEY = 'pos_token'

let token: string | null = localStorage.getItem(TOKEN_KEY)

export function getToken(): string | null {
  return token
}

export function setToken(next: string | null): void {
  token = next
  if (next) localStorage.setItem(TOKEN_KEY, next)
  else localStorage.removeItem(TOKEN_KEY)
}

// Which branch this device works in (ElevenOne TTP / BKK). Picked on the
// login screen (or the admin's top-bar switcher), persisted per device, and
// sent as X-Branch-Id on every call — the backend scopes all data to it.
// Deliberately NOT cleared on logout: a till stays its branch's till.
const BRANCH_KEY = 'pos_branch_id'

let branchId: string | null = localStorage.getItem(BRANCH_KEY)

export function getBranchId(): string | null {
  return branchId
}

export function setBranchId(next: string | null): void {
  branchId = next
  if (next) localStorage.setItem(BRANCH_KEY, next)
  else localStorage.removeItem(BRANCH_KEY)
}

// Fired when the API rejects the stored token (expired or revoked). The token
// is already cleared by then; the app drops its session and shows the login
// screen instead of leaving every screen stuck on failing retries.
let unauthorizedHandler: (() => void) | null = null

export function setOnUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

/** Error thrown for any non-2xx response, carrying Laravel's message + errors bag. */
export class ApiError extends Error {
  status: number
  /** Laravel validation errors, keyed by field (e.g. { pin: ["The PIN is incorrect."] }). */
  errors?: Record<string, string[]>

  constructor(message: string, status: number, errors?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
}

/**
 * Perform a JSON request against the API, attaching the bearer token when one
 * is stored. Pass a FormData body for multipart uploads (the browser sets the
 * content type). Throws ApiError on non-2xx responses (including 422 validation).
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isForm = options.body instanceof FormData
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  if (branchId) headers['X-Branch-Id'] = branchId

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
    })
  } catch {
    // Network-level failure (server down, wrong URL, no LAN).
    throw new ApiError('Cannot reach the server. Check the connection.', 0)
  }

  if (!res.ok) {
    // 401 with a token attached means that token is dead — a session expiry,
    // not a bad credential (login endpoints answer 422 for those).
    if (res.status === 401 && token) {
      setToken(null)
      unauthorizedHandler?.()
    }

    let message = `Request failed (${res.status})`
    let errors: Record<string, string[]> | undefined
    try {
      const data = await res.json()
      if (typeof data?.message === 'string' && data.message) message = data.message
      if (data?.errors && typeof data.errors === 'object') errors = data.errors
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(message, res.status, errors)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/**
 * Download a file from the API (backups, CSV exports) with the bearer token
 * attached, then trigger the browser's save dialog. `api<T>()` only handles
 * JSON, so this is the app's one binary-download path. The server's
 * Content-Disposition filename wins; `fallbackName` is used if it's absent.
 * Throws ApiError on non-2xx (and clears a dead token like api()).
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (branchId) headers['X-Branch-Id'] = branchId

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { headers })
  } catch {
    throw new ApiError('Cannot reach the server. Check the connection.', 0)
  }

  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null)
      unauthorizedHandler?.()
    }
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (typeof data?.message === 'string' && data.message) message = data.message
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(message, res.status)
  }

  const blob = await res.blob()

  // Prefer the server's filename (e.g. orders-20260722.csv), fall back otherwise.
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  const name = match ? decodeURIComponent(match[1]) : fallbackName

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
