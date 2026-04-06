let baseURL = ''
let authToken = ''

export function setBaseURL(url: string): void {
  baseURL = url.replace(/\/$/, '')
}

export function setAuthToken(token: string): void {
  authToken = token
}

export function getAuthToken(): string {
  return authToken
}

export function clearAuthToken(): void {
  authToken = ''
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(init?.headers as Record<string, string> | undefined)
  }

  const res = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store'
  })

  if (!res.ok) {
    // 401/403/5xx handling is added in Task 25 (global error interceptor)
    throw new ApiError(res.status, await res.text())
  }

  return res.json()
}

// SSE connection for real-time events
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
