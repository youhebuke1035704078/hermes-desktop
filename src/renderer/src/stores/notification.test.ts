/**
 * Unit tests for useNotificationStore.
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.3
 * and Task D3 of the implementation plan.
 *
 * Uses vitest fake timers to drive auto-dismiss without real waits.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNotificationStore } from './notification'
import type { FallbackActivatedPayload, ChainExhaustedPayload } from '@/api/types'

const FALLBACK_PAYLOAD: FallbackActivatedPayload = {
  schema_version: 1,
  timestamp: '2026-04-14T10:00:00Z',
  from_model: 'gpt-5.4',
  to_model: 'gemini-2.5-pro',
  from_provider: 'openai',
  to_provider: 'google',
  reason_code: 'auth_failed',
  reason_text: '401',
  fallback_chain: ['gpt-5.4', 'gemini-2.5-pro'],
  fallback_index: 1,
}

const EXHAUSTED_PAYLOAD: ChainExhaustedPayload = {
  schema_version: 1,
  timestamp: '2026-04-14T10:05:00Z',
  attempted_models: ['a', 'b', 'c'],
  last_error_code: 'server_error',
  last_error_text: 'all failed',
  fallback_chain: ['a', 'b', 'c'],
}

describe('useNotificationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with empty items', () => {
    const store = useNotificationStore()
    expect(store.items).toEqual([])
  })

  it('push returns a unique id and appends to items', () => {
    const store = useNotificationStore()
    const id = store.push({
      kind: 'fallback',
      payload: FALLBACK_PAYLOAD,
      durationMs: 5000,
    })
    expect(id).toMatch(/^notif-/)
    expect(store.items).toHaveLength(1)
    expect(store.items[0].id).toBe(id)
    expect(store.items[0].kind).toBe('fallback')
    expect(store.items[0].payload).toEqual(FALLBACK_PAYLOAD)
    expect(store.items[0].durationMs).toBe(5000)
    expect(typeof store.items[0].createdAt).toBe('number')
  })

  it('two pushes generate distinct ids', () => {
    const store = useNotificationStore()
    const id1 = store.push({
      kind: 'fallback',
      payload: FALLBACK_PAYLOAD,
      durationMs: 5000,
    })
    const id2 = store.push({
      kind: 'exhausted',
      payload: EXHAUSTED_PAYLOAD,
      durationMs: 5000,
    })
    expect(id1).not.toBe(id2)
    expect(store.items).toHaveLength(2)
  })

  it('dismiss removes only the targeted item', () => {
    const store = useNotificationStore()
    const id1 = store.push({
      kind: 'fallback',
      payload: FALLBACK_PAYLOAD,
      durationMs: 10000,
    })
    const id2 = store.push({
      kind: 'exhausted',
      payload: EXHAUSTED_PAYLOAD,
      durationMs: 10000,
    })
    store.dismiss(id1)
    expect(store.items).toHaveLength(1)
    expect(store.items[0].id).toBe(id2)
  })

  it('dismiss with unknown id is a no-op', () => {
    const store = useNotificationStore()
    store.push({ kind: 'fallback', payload: FALLBACK_PAYLOAD, durationMs: 10000 })
    expect(() => store.dismiss('nonexistent')).not.toThrow()
    expect(store.items).toHaveLength(1)
  })

  it('clear removes all items', () => {
    const store = useNotificationStore()
    store.push({ kind: 'fallback', payload: FALLBACK_PAYLOAD, durationMs: 10000 })
    store.push({ kind: 'exhausted', payload: EXHAUSTED_PAYLOAD, durationMs: 10000 })
    store.clear()
    expect(store.items).toEqual([])
  })

  it('auto-dismisses after durationMs elapses', () => {
    const store = useNotificationStore()
    const id = store.push({
      kind: 'fallback',
      payload: FALLBACK_PAYLOAD,
      durationMs: 3000,
    })
    expect(store.items).toHaveLength(1)
    vi.advanceTimersByTime(2999)
    expect(store.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(store.items).toHaveLength(0)
    // and dismiss is a no-op afterwards
    expect(() => store.dismiss(id)).not.toThrow()
  })

  it('auto-dismiss fires per item independently', () => {
    const store = useNotificationStore()
    store.push({ kind: 'fallback', payload: FALLBACK_PAYLOAD, durationMs: 1000 })
    vi.advanceTimersByTime(500)
    store.push({ kind: 'exhausted', payload: EXHAUSTED_PAYLOAD, durationMs: 1000 })
    expect(store.items).toHaveLength(2)
    vi.advanceTimersByTime(500) // first should be gone now
    expect(store.items).toHaveLength(1)
    expect(store.items[0].kind).toBe('exhausted')
    vi.advanceTimersByTime(500) // second gone
    expect(store.items).toHaveLength(0)
  })

  it('manual dismiss before timer prevents double-remove', () => {
    const store = useNotificationStore()
    const id = store.push({
      kind: 'fallback',
      payload: FALLBACK_PAYLOAD,
      durationMs: 1000,
    })
    store.dismiss(id)
    expect(store.items).toHaveLength(0)
    // Timer fires after manual dismiss — must not throw or touch items
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow()
    expect(store.items).toHaveLength(0)
  })
})
