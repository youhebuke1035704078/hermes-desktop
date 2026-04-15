/**
 * Unit tests for the rewritten useModelStore.
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.2
 * and docs/superpowers/plans/2026-04-14-hermes-desktop-fallback-visibility.md Task D2.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useModelStore } from './model'

describe('useModelStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts in unknown kind', () => {
    const store = useModelStore()
    expect(store.state.kind).toBe('unknown')
    expect(store.state.primaryModel).toBe(null)
    expect(store.state.currentModel).toBe(null)
  })

  it('bootstrap with primary sets normal kind', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })
    expect(store.state.kind).toBe('normal')
    expect(store.state.primaryModel).toBe('gpt-5.4')
    expect(store.state.currentModel).toBe('gpt-5.4')
    expect(store.state.fallbackChain).toEqual(['gpt-5.4', 'gemini-2.5-pro'])
  })

  it('bootstrap with null primary stays unknown', () => {
    const store = useModelStore()
    store.bootstrap({ primary: null, fallbackChain: [] })
    expect(store.state.kind).toBe('unknown')
    expect(store.state.primaryModel).toBe(null)
  })

  it('applyFallbackActivated from normal → fallback', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })
    store.applyFallbackActivated({
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
    })
    expect(store.state.kind).toBe('fallback')
    expect(store.state.currentModel).toBe('gemini-2.5-pro')
    expect(store.state.fallbackFrom).toBe('gpt-5.4')
    expect(store.state.reasonCode).toBe('auth_failed')
    expect(store.state.primaryModel).toBe('gpt-5.4') // unchanged
  })

  it('applyFallbackActivated from fallback → fallback updates reason', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'a', fallbackChain: ['a', 'b', 'c'] })
    store.applyFallbackActivated({
      schema_version: 1,
      timestamp: 't1',
      from_model: 'a',
      to_model: 'b',
      from_provider: 'x',
      to_provider: 'y',
      reason_code: 'auth_failed',
      reason_text: 'first',
      fallback_chain: ['a', 'b', 'c'],
      fallback_index: 1,
    })
    store.applyFallbackActivated({
      schema_version: 1,
      timestamp: 't2',
      from_model: 'b',
      to_model: 'c',
      from_provider: 'y',
      to_provider: 'z',
      reason_code: 'server_error',
      reason_text: 'second',
      fallback_chain: ['a', 'b', 'c'],
      fallback_index: 2,
    })
    expect(store.state.currentModel).toBe('c')
    expect(store.state.reasonCode).toBe('server_error')
    expect(store.state.reasonText).toBe('second')
  })

  it('applyFallbackActivated from unknown → fallback', () => {
    const store = useModelStore()
    // no bootstrap — start from unknown
    store.applyFallbackActivated({
      schema_version: 1,
      timestamp: 't',
      from_model: 'a',
      to_model: 'b',
      from_provider: 'x',
      to_provider: 'y',
      reason_code: 'other',
      reason_text: '',
      fallback_chain: ['a', 'b'],
      fallback_index: 1,
    })
    expect(store.state.kind).toBe('fallback')
    expect(store.state.currentModel).toBe('b')
  })

  it('applyPrimaryRestored from fallback → normal and clears reason', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })
    store.applyFallbackActivated({
      schema_version: 1,
      timestamp: 't1',
      from_model: 'gpt-5.4',
      to_model: 'gemini-2.5-pro',
      from_provider: 'openai',
      to_provider: 'google',
      reason_code: 'auth_failed',
      reason_text: '401',
      fallback_chain: ['gpt-5.4', 'gemini-2.5-pro'],
      fallback_index: 1,
    })
    store.applyPrimaryRestored({
      schema_version: 1,
      timestamp: 't2',
      restored_to: 'gpt-5.4',
      restored_from: 'gemini-2.5-pro',
      primary_model: 'gpt-5.4',
    })
    expect(store.state.kind).toBe('normal')
    expect(store.state.currentModel).toBe('gpt-5.4')
    expect(store.state.fallbackFrom).toBe(null)
    expect(store.state.reasonCode).toBe(null)
    expect(store.state.reasonText).toBe(null)
  })

  it('applyChainExhausted → exhausted', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'a', fallbackChain: ['a', 'b', 'c'] })
    store.applyChainExhausted({
      schema_version: 1,
      timestamp: 't',
      attempted_models: ['a', 'b', 'c'],
      last_error_code: 'server_error',
      last_error_text: 'all failed',
      fallback_chain: ['a', 'b', 'c'],
    })
    expect(store.state.kind).toBe('exhausted')
    expect(store.state.currentModel).toBe(null)
    expect(store.state.attemptedModels).toEqual(['a', 'b', 'c'])
    expect(store.state.reasonCode).toBe('server_error')
  })

  it('applyChainExhausted strips provider prefixes from attempted_models (Bug 3)', () => {
    // hermes-agent emits attempted_models with the provider prefix
    // intact (e.g. "openrouter/anthropic/claude-3.5-sonnet") while the
    // bootstrapped fallbackChain uses short names from config-parser
    // ("claude-3.5-sonnet"). ModelDropdown.vue compares them with
    // `chain.includes(attempted)`, which never matched and left the
    // is-failed line-through styling un-applied in acceptance scenario
    // 3. Normalize on ingest so downstream consumers can do plain
    // string equality.
    const store = useModelStore()
    store.bootstrap({
      primary: 'claude-3.5-sonnet',
      fallbackChain: ['claude-3.5-sonnet', 'claude-3-opus'],
    })
    store.applyChainExhausted({
      schema_version: 1,
      timestamp: '2026-04-15T06:00:00Z',
      attempted_models: [
        'openrouter/anthropic/claude-3.5-sonnet',
        'anthropic/claude-3-opus',
      ],
      last_error_code: 'auth_failed',
      last_error_text: 'HTTP 401: No cookie auth credentials found',
      fallback_chain: [
        'openrouter/anthropic/claude-3.5-sonnet',
        'anthropic/claude-3-opus',
      ],
    })
    expect(store.state.kind).toBe('exhausted')
    expect(store.state.attemptedModels).toEqual([
      'claude-3.5-sonnet',
      'claude-3-opus',
    ])
    // The invariant the dropdown needs: every attempted model appears
    // in the chain after normalization so `chain.includes(attempted)`
    // finds every failed entry.
    for (const attempted of store.state.attemptedModels) {
      expect(store.state.fallbackChain).toContain(attempted)
    }
  })

  it('applyFallbackActivated preserves short-name fallbackFrom for display (Bug 3 sibling)', () => {
    // The dropdown/badge display fallbackFrom as-is; this test pins
    // that normalization happens on attempted_models ONLY, and
    // fallbackFrom is left as-emitted so existing tooltip copy stays
    // stable. (Does NOT normalize fallbackFrom — that's intentional,
    // humans recognize "openrouter/anthropic/claude-3.5-sonnet" and
    // the full path carries provider info the short name lacks.)
    const store = useModelStore()
    store.bootstrap({
      primary: 'claude-3.5-sonnet',
      fallbackChain: ['claude-3.5-sonnet', 'gemini-2.5-pro'],
    })
    store.applyFallbackActivated({
      schema_version: 1,
      timestamp: '2026-04-15T06:00:00Z',
      from_model: 'openrouter/anthropic/claude-3.5-sonnet',
      to_model: 'gemini-2.5-pro',
      from_provider: 'openrouter',
      to_provider: 'google',
      reason_code: 'auth_failed',
      reason_text: 'HTTP 401',
      fallback_chain: ['claude-3.5-sonnet', 'gemini-2.5-pro'],
      fallback_index: 1,
    })
    // fallbackFrom stays full (not normalized)
    expect(store.state.fallbackFrom).toBe('openrouter/anthropic/claude-3.5-sonnet')
    // currentModel is already a short name in our tests
    expect(store.state.currentModel).toBe('gemini-2.5-pro')
  })

  it('markStale from normal keeps data, changes kind to stale', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4'] })
    store.markStale()
    expect(store.state.kind).toBe('stale')
    expect(store.state.currentModel).toBe('gpt-5.4') // kept
    expect(store.state.primaryModel).toBe('gpt-5.4')
  })

  it('markStale from unknown is a no-op', () => {
    const store = useModelStore()
    store.markStale()
    expect(store.state.kind).toBe('unknown')
  })

  it('reset returns to initial state', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini'] })
    store.applyFallbackActivated({
      schema_version: 1,
      timestamp: 't',
      from_model: 'gpt-5.4',
      to_model: 'gemini',
      from_provider: 'openai',
      to_provider: 'google',
      reason_code: 'auth_failed',
      reason_text: '401',
      fallback_chain: ['gpt-5.4', 'gemini'],
      fallback_index: 1,
    })
    store.reset()
    expect(store.state.kind).toBe('unknown')
    expect(store.state.primaryModel).toBe(null)
    expect(store.state.currentModel).toBe(null)
    expect(store.state.fallbackFrom).toBe(null)
  })

  it('displayModel computed falls back: current → primary → "unknown"', () => {
    const store = useModelStore()
    expect(store.displayModel).toBe('unknown') // unknown state
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4'] })
    expect(store.displayModel).toBe('gpt-5.4')
    store.applyFallbackActivated({
      schema_version: 1,
      timestamp: 't',
      from_model: 'gpt-5.4',
      to_model: 'gemini',
      from_provider: 'openai',
      to_provider: 'google',
      reason_code: 'auth_failed',
      reason_text: '401',
      fallback_chain: ['gpt-5.4', 'gemini'],
      fallback_index: 1,
    })
    expect(store.displayModel).toBe('gemini')
  })

  it('legacy models + fetchModels fields preserved for SessionsPage compatibility', () => {
    const store = useModelStore()
    expect(Array.isArray(store.models)).toBe(true)
    expect(store.models).toEqual([])
    expect(typeof store.fetchModels).toBe('function')
  })
})
