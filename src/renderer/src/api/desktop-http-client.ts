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

/** Default request timeout for non-streaming desktop API calls. Prevents
 *  indefinitely-hung fetches when the monitor backend stalls or the network
 *  blips during a request. */
const DEFAULT_FETCH_TIMEOUT_MS = 15000

/** Combine an optional caller-supplied signal with a timeout signal so
 *  either source can abort the request. */
function combineWithTimeout(caller?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS)
  if (!caller) return timeout
  // AbortSignal.any may be unavailable on older Electron/Chromium; fall back
  // to whichever fires first by manual wiring.
  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any
  if (typeof anyFn === 'function') return anyFn([caller, timeout])
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(caller.reason)
  const abortFromTimeout = () => controller.abort(timeout.reason)
  if (caller.aborted) controller.abort(caller.reason)
  else caller.addEventListener('abort', abortFromCaller, { once: true })
  if (timeout.aborted) controller.abort(timeout.reason)
  else timeout.addEventListener('abort', abortFromTimeout, { once: true })
  return controller.signal
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
    cache: 'no-store',
    signal: combineWithTimeout(init?.signal),
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

  const res = await fetch(url, { ...init, headers, signal: combineWithTimeout(init?.signal) })

  if (res.status === 401) {
    clearAuthToken()
    try { await Promise.resolve(onUnauthorized?.()) } catch (e) {
      console.error('[authFetch] onUnauthorized handler error:', e)
    }
  }

  return res
}

