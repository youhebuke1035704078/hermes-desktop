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
  makeChainExhaustedPayload
} from '@/test-utils/sse-fixtures'
import {
  __routeLifecycleForTest as routeLifecycle,
  __resetDebounceForTest as resetDebounce,
  resolveBootstrap,
  bootstrapFromRealModelIfUnknown
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
      makeFallbackActivatedPayload({ from_model: 'a', to_model: 'b' })
    )
    routeLifecycle(
      'hermes.model.fallback_activated',
      makeFallbackActivatedPayload({ from_model: 'b', to_model: 'c' })
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

  // Bug 6 (post-merge): terminal error state must not auto-dismiss.
  // The acceptance-test observation was that the 5 s exhausted toast
  // disappeared before users could read the attempted-models list and
  // the last error. triggerExhaustedToast now pushes with durationMs=0
  // (persistent) so the toast stays until the user dismisses it.
  it('chain_exhausted toast is persistent (durationMs = 0)', () => {
    const store = useModelStore()
    const notif = useNotificationStore()
    store.bootstrap({ primary: 'a', fallbackChain: ['a', 'b', 'c'] })

    routeLifecycle('hermes.model.chain_exhausted', makeChainExhaustedPayload())
    expect(notif.items.length).toBe(1)
    expect(notif.items[0].durationMs).toBe(0)

    // Fast-forward far beyond any sane auto-dismiss window
    vi.advanceTimersByTime(60_000)
    expect(notif.items.length).toBe(1) // still there
    expect(notif.items[0].kind).toBe('exhausted')
  })

  it('fallback toast still auto-dismisses after 3 s', () => {
    // Regression guard: the fix for Bug 6 must not change fallback toast
    // timing.  Informational toasts stay informational.
    const store = useModelStore()
    const notif = useNotificationStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })

    routeLifecycle('hermes.model.fallback_activated', makeFallbackActivatedPayload())
    expect(notif.items.length).toBe(1)
    expect(notif.items[0].durationMs).toBe(3000)

    vi.advanceTimersByTime(2999)
    expect(notif.items.length).toBe(1)
    vi.advanceTimersByTime(1)
    expect(notif.items.length).toBe(0)
  })

  // Bug 7 (post-v0.4.0): remote hermes-rest bootstrap path.
  //
  // v0.4.0 only knew two paths: localhost hermes-rest (read ~/.hermes/
  // config.yaml via IPC) and acp-ws (wait for live events). Remote
  // hermes-rest over Tailscale read the *client* machine's config.yaml,
  // which usually doesn't exist on a Windows laptop — so the badge
  // stayed 'unknown' forever. resolveBootstrap + the fallthrough to
  // hermesRealModel fix this.
  describe('resolveBootstrap', () => {
    it('uses remote REST result when it returns a primary', async () => {
      const result = await resolveBootstrap({
        fetchRemote: async () => ({
          primary: 'gemini-2.5-flash',
          fallback_chain: ['gemini-2.5-flash', 'gemini-2.5-pro']
        }),
        fetchLocal: async () => {
          throw new Error('local should not be called when remote succeeds')
        },
        getRealModel: () => {
          throw new Error('realModel should not be called when remote succeeds')
        }
      })
      expect(result.primary).toBe('gemini-2.5-flash')
      expect(result.fallback_chain).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro'])
    })

    it('falls through to local IPC when remote returns null', async () => {
      const result = await resolveBootstrap({
        fetchRemote: async () => null,
        fetchLocal: async () => ({
          primary: 'gemini-2.5-flash',
          fallback_chain: ['gemini-2.5-flash']
        }),
        getRealModel: () => {
          throw new Error('realModel should not be called when local succeeds')
        }
      })
      expect(result.primary).toBe('gemini-2.5-flash')
      expect(result.fallback_chain).toEqual(['gemini-2.5-flash'])
    })

    it('falls through to realModel when remote and local both return null', async () => {
      const result = await resolveBootstrap({
        fetchRemote: async () => null,
        fetchLocal: async () => null,
        getRealModel: () => 'gpt-5.4'
      })
      expect(result.primary).toBe('gpt-5.4')
      expect(result.fallback_chain).toEqual([])
    })

    it('returns null primary with empty chain when every source fails', async () => {
      const result = await resolveBootstrap({
        fetchRemote: async () => null,
        fetchLocal: async () => null,
        getRealModel: () => null
      })
      expect(result.primary).toBe(null)
      expect(result.fallback_chain).toEqual([])
    })
  })

  describe('bootstrapFromRealModelIfUnknown', () => {
    it('promotes store from unknown to normal when realModel is non-null', () => {
      const store = useModelStore()
      expect(store.state.kind).toBe('unknown')
      bootstrapFromRealModelIfUnknown('gpt-5.4')
      expect(store.state.kind).toBe('normal')
      expect(store.state.primaryModel).toBe('gpt-5.4')
      expect(store.state.currentModel).toBe('gpt-5.4')
      expect(store.state.fallbackChain).toEqual([])
    })

    it('is a no-op when realModel is null', () => {
      const store = useModelStore()
      bootstrapFromRealModelIfUnknown(null)
      expect(store.state.kind).toBe('unknown')
      expect(store.state.primaryModel).toBe(null)
    })

    it('does not overwrite an already-bootstrapped normal store', () => {
      const store = useModelStore()
      store.bootstrap({
        primary: 'gemini-2.5-flash',
        fallbackChain: ['gemini-2.5-flash', 'gemini-2.5-pro']
      })
      bootstrapFromRealModelIfUnknown('gpt-5.4')
      expect(store.state.primaryModel).toBe('gemini-2.5-flash')
      expect(store.state.fallbackChain).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro'])
    })

    it('does not overwrite a store in fallback state', () => {
      const store = useModelStore()
      store.bootstrap({
        primary: 'gemini-2.5-flash',
        fallbackChain: ['gemini-2.5-flash', 'gemini-2.5-pro']
      })
      store.applyFallbackActivated(makeFallbackActivatedPayload())
      expect(store.state.kind).toBe('fallback')
      bootstrapFromRealModelIfUnknown('gpt-5.4')
      expect(store.state.kind).toBe('fallback')
    })

    it('does not overwrite a stale store', () => {
      const store = useModelStore()
      store.bootstrap({ primary: 'gemini-2.5-flash', fallbackChain: [] })
      store.markStale()
      expect(store.state.kind).toBe('stale')
      bootstrapFromRealModelIfUnknown('gpt-5.4')
      expect(store.state.kind).toBe('stale')
      expect(store.state.primaryModel).toBe('gemini-2.5-flash')
    })
  })
})
