let baseURL = ''
let authToken = ''
let onUnauthorized: (() => void) | null = null
let onGlobalError: ((msg: string) => void) | null = null

export function setBaseURL(url: string): void {
  baseURL = url.replace(/\/$/, '')
}

export function getBaseURL(): string {
  return baseURL
}

export function setAuthToken(token: string): void {
  authToken = token
  // Persist token to sessionStorage so it survives page refreshes
  try { sessionStorage.setItem('oc_token', token) } catch {}
}

export function getAuthToken(): string {
  if (!authToken) {
    try { authToken = sessionStorage.getItem('oc_token') || '' } catch {}
  }
  return authToken
}

export function clearAuthToken(): void {
  authToken = ''
  try { sessionStorage.removeItem('oc_token') } catch {}
}

/** Register a callback invoked on 401 responses (e.g. redirect to login) */
export function setOnUnauthorized(fn: () => void): void {
  onUnauthorized = fn
}

/** Register a callback for global error reporting */
export function setOnGlobalError(fn: (message: string) => void): void {
  onGlobalError = fn
}

/**
 * Trigger the global 401 handler from any module (e.g. http-client RPC).
 * Clears the token and invokes the registered onUnauthorized callback.
 */
export async function triggerUnauthorized(): Promise<void> {
  clearAuthToken()
  try { await Promise.resolve(onUnauthorized?.()) } catch (e) {
    console.error('[triggerUnauthorized] handler error:', e)
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${baseURL}${path}`
  const currentToken = getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    ...(init?.headers as Record<string, string> | undefined)
  }

  const res = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store'
  })

  if (!res.ok) {
    const body = await res.text()
    const error = new ApiError(res.status, body)

    if (res.status === 401) {
      clearAuthToken()
      // Invoke async handler safely — catch errors to avoid unhandled rejections
      try { await Promise.resolve(onUnauthorized?.()) } catch (e) {
        console.error('[apiFetch] onUnauthorized handler error:', e)
      }
    } else {
      onGlobalError?.(body || `HTTP ${res.status}`)
    }

    throw error
  }

  return res.json()
}

/**
 * Generic fetch wrapper that auto-injects auth header and handles 401 globally.
 * Unlike apiFetch() this returns the raw Response — callers parse it themselves.
 * Use this for non-JSON responses (blobs, FormData, etc.) or when you need
 * fine-grained control over response handling.
 */
export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${baseURL}${path}`
  const currentToken = getAuthToken()

  // Merge auth header without overwriting caller-supplied headers
  const headers = new Headers(init?.headers)
  if (currentToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${currentToken}`)
  }

  const res = await fetch(url, { ...init, headers })

  if (res.status === 401) {
    clearAuthToken()
    try { await Promise.resolve(onUnauthorized?.()) } catch (e) {
      console.error('[authFetch] onUnauthorized handler error:', e)
    }
  }

  return res
}

// SSE connection for real-time events
//
// ⚠️  Known limitation: the auth token is passed via URL query parameter because
// the native EventSource API does not support custom headers.
// This means the token may appear in server access logs and proxy logs.
// For an Electron desktop app on local/private networks the risk is minimal.
// TODO: Consider migrating to fetch + ReadableStream for header-based auth.
export function connectSSE(
  onEvent: (event: { type: string; data: unknown }) => void,
  onError?: (error: Event) => void
): EventSource | null {
  if (!baseURL) return null
  const url = `${baseURL}/api/events${authToken ? `?token=${authToken}` : ''}`
  const source = new EventSource(url)

  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      onEvent(data)
    } catch {
      // ignore parse errors
    }
  }

  source.onerror = (e) => {
    onError?.(e)
  }

  return source
}
