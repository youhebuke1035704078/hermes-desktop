/**
 * Unit tests for useModelStoreBootstrap.
 *
 * Exercises the pure routeLifecycle helper in isolation (no Vue mount
 * required). See docs/superpowers/plans/2026-04-14-hermes-desktop-fallback-visibility.md
 * Task F1.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useModelStore } from '@/stores/model'
import { useNotificationStore } from '@/stores/notification'
import {
  makeFallbackActivatedPayload,
  makePrimaryRestoredPayload,
  makeChainExhaustedPayload,
} from '@/test-utils/sse-fixtures'
import {
  __routeLifecycleForTest as routeLifecycle,
  __resetDebounceForTest as resetDebounce,
} from './useModelStoreBootstrap'

describe('useModelStoreBootstrap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers({ now: new Date('2026-04-14T10:00:00Z') })
    resetDebounce()
  })

  it('routeLifecycle dispatches fallback_activated to store', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })
    routeLifecycle('hermes.model.fallback_activated', makeFallbackActivatedPayload())
    expect(store.state.kind).toBe('fallback')
    expect(store.state.currentModel).toBe('gemini-2.5-pro')
  })

  it('routeLifecycle dispatches primary_restored to store', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })
    store.applyFallbackActivated(makeFallbackActivatedPayload())
    routeLifecycle('hermes.model.primary_restored', makePrimaryRestoredPayload())
    expect(store.state.kind).toBe('normal')
    expect(store.state.currentModel).toBe('gpt-5.4')
  })

  it('routeLifecycle dispatches chain_exhausted to store', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'a', fallbackChain: ['a', 'b', 'c'] })
    routeLifecycle('hermes.model.chain_exhausted', makeChainExhaustedPayload())
    expect(store.state.kind).toBe('exhausted')
  })

  it('fallback toast is debounced by key within 60s', () => {
    const store = useModelStore()
    const notif = useNotificationStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })

    const payload = makeFallbackActivatedPayload()
    routeLifecycle('hermes.model.fallback_activated', payload)
    expect(notif.items.length).toBe(1)

    // Same key within 60s → suppressed
    routeLifecycle('hermes.model.fallback_activated', payload)
    expect(notif.items.length).toBe(1) // still 1

    // Advance virtual time 61s (past the 60s window AND past the 3s toast auto-dismiss)
    vi.advanceTimersByTime(61_000)

    // Now allowed again (auto-dismiss removed the first toast, but a new one should land)
    routeLifecycle('hermes.model.fallback_activated', payload)
    expect(notif.items.length).toBeGreaterThan(0)
  })

  it('fallback toast allows different keys through', () => {
    const store = useModelStore()
    const notif = useNotificationStore()
    store.bootstrap({ primary: 'a', fallbackChain: ['a', 'b', 'c'] })

    routeLifecycle(
      'hermes.model.fallback_activated',
      makeFallbackActivatedPayload({ from_model: 'a', to_model: 'b' }),
    )
    routeLifecycle(
      'hermes.model.fallback_activated',
      makeFallbackActivatedPayload({ from_model: 'b', to_model: 'c' }),
    )

    // Different keys — both should land
    expect(notif.items.length).toBe(2)
  })

  it('unknown event name is logged and ignored (no crash)', () => {
    const store = useModelStore()
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    routeLifecycle('hermes.model.unknown_future_event', {})
    expect(spy).toHaveBeenCalled()
    expect(store.state.kind).toBe('unknown') // unchanged
    spy.mockRestore()
  })
})
