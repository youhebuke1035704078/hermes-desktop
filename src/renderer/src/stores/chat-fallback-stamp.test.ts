/**
 * Tests for the fallback-stamp helpers used by chat.ts to mark
 * in-flight assistant messages with the current fallback state.
 *
 * Bug 2 (fallback-visibility post-merge):
 * During real-agent acceptance testing we observed assistant
 * messages rendering with `fromFallback` undefined even after
 * hermes-agent emitted a fallback_activated lifecycle event
 * mid-stream. The chat store had an inline `watch` on
 * `modelStore.state.kind` to retro-stamp the placeholder, but
 * the logic was buried inside sendMessage and never unit tested.
 *
 * This file extracts the stamping logic into two pure helpers
 * (`initialFallbackStamp` / `applyFallbackStamp`) and covers
 * every transition we care about. chat.ts now imports them so
 * the same code path is exercised by tests and production.
 *
 * Also includes a Pinia-backed reactivity check that mirrors the
 * chat-store watcher to pin the behavior we depend on: that a
 * watch on `modelStore.state.kind` fires synchronously when
 * `applyFallbackActivated` mutates the store, which is how the
 * retro-stamp propagates to in-flight messages without a round
 * trip through Vue's scheduler.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ref, watch, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useModelStore } from './model'
import type { ChatMessage } from '@/api/types'
import { initialFallbackStamp, applyFallbackStamp } from './chat-fallback-stamp'

function makeAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    timestamp: '2026-04-15T06:00:00Z',
    ...overrides,
  }
}

describe('initialFallbackStamp', () => {
  it('returns clean defaults when the model store is normal', () => {
    const stamp = initialFallbackStamp({
      kind: 'normal',
      currentModel: 'gpt-5.4',
      fallbackFrom: null,
      reasonText: null,
    })
    expect(stamp).toEqual({
      model: 'gpt-5.4',
      fromFallback: false,
      fallbackFrom: undefined,
      fallbackReasonText: undefined,
    })
  })

  it('stamps first-turn fallback when the store is already in fallback', () => {
    const stamp = initialFallbackStamp({
      kind: 'fallback',
      currentModel: 'gemini-2.5-pro',
      fallbackFrom: 'gpt-5.4',
      reasonText: 'HTTP 429 rate limit',
    })
    expect(stamp).toEqual({
      model: 'gemini-2.5-pro',
      fromFallback: true,
      fallbackFrom: 'gpt-5.4',
      fallbackReasonText: 'HTTP 429 rate limit',
    })
  })

  it('returns model=undefined when currentModel is null', () => {
    const stamp = initialFallbackStamp({
      kind: 'unknown',
      currentModel: null,
      fallbackFrom: null,
      reasonText: null,
    })
    expect(stamp.model).toBeUndefined()
    expect(stamp.fromFallback).toBe(false)
  })

  it('stale state is not treated as fallback for new messages', () => {
    // Edge case: user reconnects while agent was previously in
    // fallback, and markStale ran. New messages start from whatever
    // the reconnect produces, not the stale residue.
    const stamp = initialFallbackStamp({
      kind: 'stale',
      currentModel: 'gemini-2.5-pro',
      fallbackFrom: 'gpt-5.4',
      reasonText: 'stale 429',
    })
    expect(stamp.fromFallback).toBe(false)
  })
})

describe('applyFallbackStamp', () => {
  it('returns null when the store is not in fallback', () => {
    const result = applyFallbackStamp(makeAssistantMessage(), {
      kind: 'normal',
      currentModel: 'gpt-5.4',
      fallbackFrom: null,
      reasonText: null,
    })
    expect(result).toBe(null)
  })

  it('returns null when the message is already stamped', () => {
    const result = applyFallbackStamp(
      makeAssistantMessage({ fromFallback: true, fallbackFrom: 'gpt-5.4' }),
      {
        kind: 'fallback',
        currentModel: 'gemini-2.5-pro',
        fallbackFrom: 'gpt-5.4',
        reasonText: 'HTTP 429',
      },
    )
    expect(result).toBe(null)
  })

  it('retroactively stamps an in-flight message with all meta fields', () => {
    const existing = makeAssistantMessage({ content: 'Hello, wor' })
    const result = applyFallbackStamp(existing, {
      kind: 'fallback',
      currentModel: 'gemini-2.5-pro',
      fallbackFrom: 'gpt-5.4',
      reasonText: 'HTTP 429 rate limit',
    })
    expect(result).not.toBe(null)
    expect(result).toMatchObject({
      id: 'assistant-1',
      content: 'Hello, wor',
      fromFallback: true,
      model: 'gemini-2.5-pro',
      fallbackFrom: 'gpt-5.4',
      fallbackReasonText: 'HTTP 429 rate limit',
    })
  })

  it('preserves existing model if the store currentModel is null', () => {
    const existing = makeAssistantMessage({ model: 'claude-3.5-sonnet' })
    const result = applyFallbackStamp(existing, {
      kind: 'fallback',
      currentModel: null,
      fallbackFrom: 'claude-3.5-sonnet',
      reasonText: 'quota',
    })
    expect(result?.model).toBe('claude-3.5-sonnet')
    expect(result?.fromFallback).toBe(true)
  })

  it('returns a new object (does not mutate the input)', () => {
    const existing = makeAssistantMessage({ content: 'Hi' })
    const result = applyFallbackStamp(existing, {
      kind: 'fallback',
      currentModel: 'gemini-2.5-pro',
      fallbackFrom: 'gpt-5.4',
      reasonText: 'x',
    })
    expect(result).not.toBe(existing)
    expect(existing.fromFallback).toBeUndefined()
  })
})

describe('Pinia reactivity mirror for mid-stream retro-stamp', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('a watch on modelStore.state.kind fires when applyFallbackActivated mutates the store', async () => {
    const store = useModelStore()
    store.bootstrap({
      primary: 'gpt-5.4',
      fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'],
    })
    expect(store.state.kind).toBe('normal')

    const observedKinds: string[] = []
    const stop = watch(
      () => store.state.kind,
      (kind) => {
        observedKinds.push(kind)
      },
      { flush: 'sync' },
    )

    store.applyFallbackActivated({
      schema_version: 1,
      timestamp: 't',
      from_model: 'gpt-5.4',
      to_model: 'gemini-2.5-pro',
      from_provider: 'openai',
      to_provider: 'google',
      reason_code: 'auth_failed',
      reason_text: 'HTTP 429',
      fallback_chain: ['gpt-5.4', 'gemini-2.5-pro'],
      fallback_index: 1,
    })
    // flush: 'sync' means the callback should have fired before we
    // reach the next statement — no await needed.
    expect(observedKinds).toEqual(['fallback'])

    stop()
  })

  it('chat.ts-style retro-stamp end-to-end on a mocked message ref', () => {
    const store = useModelStore()
    store.bootstrap({
      primary: 'gpt-5.4',
      fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'],
    })

    const messages = ref<ChatMessage[]>([
      makeAssistantMessage({
        id: 'in-flight',
        content: 'Hello, wor',
        ...initialFallbackStamp(store.state),
      }),
    ])
    expect(messages.value[0].fromFallback).toBe(false)

    const stop = watch(
      () => store.state.kind,
      () => {
        const idx = messages.value.findIndex((m) => m.id === 'in-flight')
        if (idx < 0) return
        const stamped = applyFallbackStamp(messages.value[idx], store.state)
        if (!stamped) return
        messages.value[idx] = stamped
        messages.value = [...messages.value] // trigger Vue reactivity
      },
      { flush: 'sync' },
    )

    store.applyFallbackActivated({
      schema_version: 1,
      timestamp: 't',
      from_model: 'gpt-5.4',
      to_model: 'gemini-2.5-pro',
      from_provider: 'openai',
      to_provider: 'google',
      reason_code: 'auth_failed',
      reason_text: 'HTTP 429 rate limit',
      fallback_chain: ['gpt-5.4', 'gemini-2.5-pro'],
      fallback_index: 1,
    })

    expect(messages.value[0]).toMatchObject({
      id: 'in-flight',
      content: 'Hello, wor',
      fromFallback: true,
      model: 'gemini-2.5-pro',
      fallbackFrom: 'gpt-5.4',
      fallbackReasonText: 'HTTP 429 rate limit',
    })

    stop()
  })

  it('subsequent content chunks after retro-stamp preserve the fallback meta', async () => {
    // This mirrors the chat.ts sequence:
    //   1. placeholder created (not fallback)
    //   2. content chunk arrives -> spread preserves fields
    //   3. fallback_activated arrives -> retro-stamp
    //   4. more content chunks -> spread must not drop the new fields
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })

    const messages = ref<ChatMessage[]>([
      makeAssistantMessage({
        id: 'in-flight',
        content: '',
        ...initialFallbackStamp(store.state),
      }),
    ])

    function appendContent(delta: string): void {
      const idx = messages.value.findIndex((m) => m.id === 'in-flight')
      messages.value[idx] = {
        ...messages.value[idx],
        content: messages.value[idx].content + delta,
      }
      messages.value = [...messages.value]
    }

    const stop = watch(
      () => store.state.kind,
      () => {
        const idx = messages.value.findIndex((m) => m.id === 'in-flight')
        if (idx < 0) return
        const stamped = applyFallbackStamp(messages.value[idx], store.state)
        if (!stamped) return
        messages.value[idx] = stamped
        messages.value = [...messages.value]
      },
      { flush: 'sync' },
    )

    appendContent('Hello')
    store.applyFallbackActivated({
      schema_version: 1,
      timestamp: 't',
      from_model: 'gpt-5.4',
      to_model: 'gemini-2.5-pro',
      from_provider: 'openai',
      to_provider: 'google',
      reason_code: 'auth_failed',
      reason_text: 'HTTP 429',
      fallback_chain: ['gpt-5.4', 'gemini-2.5-pro'],
      fallback_index: 1,
    })
    appendContent(', world')

    await nextTick()
    expect(messages.value[0]).toMatchObject({
      content: 'Hello, world',
      fromFallback: true,
      model: 'gemini-2.5-pro',
      fallbackFrom: 'gpt-5.4',
      fallbackReasonText: 'HTTP 429',
    })

    stop()
  })
})
