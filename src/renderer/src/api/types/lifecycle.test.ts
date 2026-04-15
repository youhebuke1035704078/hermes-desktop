/**
 * Type-level tests for the fallback lifecycle types added in Task D1.
 *
 * These tests are primarily compile-time: Vitest's Vite transform runs TSC on
 * import, so a missing property or wrong field type on `ChatMessage` /
 * `FallbackActivatedPayload` / etc. will cause the whole file to fail to
 * transform and Vitest will report a hard failure.  The runtime `expect`
 * assertions are just sanity checks that keep each test registered.
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §2.3
 */
import { describe, it, expect } from 'vitest'
import type {
  ChatMessage,
  FallbackActivatedPayload,
  PrimaryRestoredPayload,
  ChainExhaustedPayload,
  LifecycleEvent,
  LifecycleEventName,
} from './index'

describe('ChatMessage — fallback fields (D1)', () => {
  it('accepts fromFallback / fallbackFrom / fallbackReasonText as optional', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'hello from fallback',
      model: 'gemini-2.5-pro',
      fromFallback: true,
      fallbackFrom: 'gpt-5.4',
      fallbackReasonText: '401 Unauthorized',
    }
    expect(msg.fromFallback).toBe(true)
    expect(msg.fallbackFrom).toBe('gpt-5.4')
    expect(msg.fallbackReasonText).toBe('401 Unauthorized')
  })

  it('all fallback fields are optional — a plain assistant message still type-checks', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'normal reply',
    }
    expect(msg.fromFallback).toBeUndefined()
    expect(msg.fallbackFrom).toBeUndefined()
    expect(msg.fallbackReasonText).toBeUndefined()
  })
})

describe('FallbackActivatedPayload — agent schema (D1)', () => {
  it('matches hermes.model.fallback_activated spec payload', () => {
    const payload: FallbackActivatedPayload = {
      schema_version: 1,
      timestamp: '2026-04-14T10:00:00Z',
      from_model: 'gpt-5.4',
      to_model: 'gemini-2.5-pro',
      from_provider: 'openai',
      to_provider: 'google',
      reason_code: 'auth_failed',
      reason_text: '401 Unauthorized',
      fallback_chain: ['gpt-5.4', 'gemini-2.5-pro'],
      fallback_index: 1,
    }
    expect(payload.schema_version).toBe(1)
    expect(payload.from_model).toBe('gpt-5.4')
    expect(payload.to_model).toBe('gemini-2.5-pro')
    expect(payload.fallback_chain).toHaveLength(2)
  })
})

describe('PrimaryRestoredPayload (D1)', () => {
  it('matches hermes.model.primary_restored spec payload', () => {
    const payload: PrimaryRestoredPayload = {
      schema_version: 1,
      timestamp: '2026-04-14T10:01:00Z',
      restored_to: 'gpt-5.4',
      restored_from: 'gemini-2.5-pro',
      primary_model: 'gpt-5.4',
    }
    expect(payload.restored_to).toBe('gpt-5.4')
    expect(payload.restored_from).toBe('gemini-2.5-pro')
  })
})

describe('ChainExhaustedPayload (D1)', () => {
  it('matches hermes.model.chain_exhausted spec payload', () => {
    const payload: ChainExhaustedPayload = {
      schema_version: 1,
      timestamp: '2026-04-14T10:02:00Z',
      attempted_models: ['gpt-5.4', 'gemini-2.5-pro', 'claude-4'],
      last_error_code: 'server_error',
      last_error_text: 'all providers failed',
      fallback_chain: ['gpt-5.4', 'gemini-2.5-pro', 'claude-4'],
    }
    expect(payload.attempted_models).toHaveLength(3)
    expect(payload.last_error_code).toBe('server_error')
  })
})

describe('LifecycleEventName union (D1)', () => {
  it('includes all three spec event names', () => {
    const a: LifecycleEventName = 'hermes.model.fallback_activated'
    const b: LifecycleEventName = 'hermes.model.primary_restored'
    const c: LifecycleEventName = 'hermes.model.chain_exhausted'
    expect(a).toBe('hermes.model.fallback_activated')
    expect(b).toBe('hermes.model.primary_restored')
    expect(c).toBe('hermes.model.chain_exhausted')
  })
})

describe('LifecycleEvent (D1)', () => {
  it('carries a name + payload union', () => {
    const ev: LifecycleEvent = {
      name: 'hermes.model.fallback_activated',
      payload: {
        schema_version: 1,
        timestamp: '2026-04-14T10:00:00Z',
        from_model: 'gpt-5.4',
        to_model: 'gemini-2.5-pro',
        from_provider: 'openai',
        to_provider: 'google',
        reason_code: 'auth_failed',
        reason_text: '401 Unauthorized',
        fallback_chain: ['gpt-5.4', 'gemini-2.5-pro'],
        fallback_index: 1,
      },
    }
    expect(ev.name).toBe('hermes.model.fallback_activated')
    expect(ev.payload).toMatchObject({ from_model: 'gpt-5.4' })
  })
})
