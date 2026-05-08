import { useConnectionStore } from '@/stores/connection'

export function hermesRestBase(): string | null {
  const connectionStore = useConnectionStore()
  if (connectionStore.serverType !== 'hermes-rest') return null
  const url = connectionStore.currentServer?.url
  return url ? url.replace(/\/+$/, '') : null
}

function hermesRestHeaders(): Record<string, string> {
  const connectionStore = useConnectionStore()
  const headers: Record<string, string> = {}
  if (connectionStore.hermesAuthToken) {
    headers.Authorization = `Bearer ${connectionStore.hermesAuthToken}`
  }
  return headers
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return ''
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

export async function hermesRestRequest<T>(
  path: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {},
  params?: Record<string, unknown>,
): Promise<T> {
  const base = hermesRestBase()
  if (!base) throw new Error('Hermes REST server is not connected')

  const url = `${base}${path}${buildQuery(params)}`
  const headers = { ...hermesRestHeaders(), ...(options.headers || {}) }
  if (window.api?.httpFetch) {
    const response = await window.api.httpFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body,
    })
    if (!response.ok) {
      throw new Error(response.body || `${path} returned HTTP ${response.status}`)
    }
    return response.body ? JSON.parse(response.body) as T : ({} as T)
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body,
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    throw new Error((await response.text()) || `${path} returned HTTP ${response.status}`)
  }
  return await response.json() as T
}

export async function hermesRestGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  return hermesRestRequest<T>(path, {}, params)
}
