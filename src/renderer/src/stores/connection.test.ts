import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConnectionStore } from './connection'

function createStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key)
    },
    setItem: (key: string, value: string) => {
      data.set(key, value)
    }
  }
}

function installWindowApi(api: Record<string, unknown>): void {
  vi.stubGlobal('window', {
    api,
    localStorage: createStorage(),
    sessionStorage: createStorage()
  })
}

describe('connection store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not let a superseded slow connection overwrite the active server', async () => {
    installWindowApi({
      decryptPassword: vi.fn((id: string) =>
        id === 'slow'
          ? new Promise((resolve) => setTimeout(() => resolve('token'), 50))
          : Promise.resolve('token')
      ),
      httpFetch: vi.fn(async (url: string) => {
        if (url.endsWith('/health')) {
          return { ok: true, status: 200, body: '{"status":"ok"}' }
        }
        if (url.endsWith('/v1/models')) {
          const model = url.includes('fast') ? 'model-fast' : 'model-slow'
          return { ok: true, status: 200, body: JSON.stringify({ data: [{ id: model }] }) }
        }
        return { ok: false, status: 404, body: '' }
      })
    })

    const store = useConnectionStore()
    store.servers = [
      { id: 'slow', name: 'slow', url: 'http://slow', username: 'user' },
      { id: 'fast', name: 'fast', url: 'http://fast', username: 'user' }
    ]

    const slow = store.connect('slow')
    await store.connect('fast')
    await vi.advanceTimersByTimeAsync(50)
    await slow

    expect(store.status).toBe('connected')
    expect(store.currentServer?.id).toBe('fast')
    expect(store.hermesRealModel).toBe('model-fast')
  })

  it('keeps timed-out connection attempts from mutating state after they finish', async () => {
    installWindowApi({
      decryptPassword: vi.fn(async () => 'token'),
      httpFetch: vi.fn((url: string) => {
        if (url.endsWith('/health')) {
          return new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, status: 200, body: '{"status":"ok"}' }), 20_000)
          )
        }
        if (url.endsWith('/v1/models')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            body: JSON.stringify({ data: [{ id: 'late-model' }] })
          })
        }
        return Promise.resolve({ ok: false, status: 404, body: '' })
      })
    })

    const store = useConnectionStore()
    store.servers = [{ id: 'slow', name: 'slow', url: 'http://slow', username: 'user' }]

    const pending = store.connect('slow')
    const timeoutAssertion = expect(pending).rejects.toMatchObject({ type: 'timeout' })
    await vi.advanceTimersByTimeAsync(15_000)
    await timeoutAssertion

    await vi.advanceTimersByTimeAsync(5_000)

    expect(store.status).toBe('error')
    expect(store.currentServer).toBeNull()
    expect(store.hermesRealModel).toBeNull()
  })
})
