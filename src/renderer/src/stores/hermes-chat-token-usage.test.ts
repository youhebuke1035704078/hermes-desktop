import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHermesChatStore } from './hermes-chat'

describe('hermes-chat token usage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('new conversation has no tokenUsage', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    const conv = store.conversations.find(c => c.id === id)
    expect(conv?.tokenUsage).toBeUndefined()
  })

  it('accumulateTokenUsage adds to a fresh conversation', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 100, 200)
    const conv = store.conversations.find(c => c.id === id)
    expect(conv?.tokenUsage).toEqual({ totalInput: 100, totalOutput: 200 })
  })

  it('accumulateTokenUsage accumulates across multiple calls', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 100, 200)
    store.accumulateTokenUsage(id, 50, 80)
    const conv = store.conversations.find(c => c.id === id)
    expect(conv?.tokenUsage).toEqual({ totalInput: 150, totalOutput: 280 })
  })

  it('accumulateTokenUsage is a no-op for unknown conversation id', () => {
    const store = useHermesChatStore()
    store.accumulateTokenUsage('nonexistent', 100, 200)
    // Should not throw
    expect(store.conversations.every(c => !c.tokenUsage)).toBe(true)
  })

  it('accumulateTokenUsage ignores zero values', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 0, 0)
    // Zero usage should not create a tokenUsage object
    expect(store.conversations.find(c => c.id === id)?.tokenUsage).toBeUndefined()
  })

  it('tokenUsage survives round-trip through JSON serialization', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 100, 200)
    const conv = store.conversations.find(c => c.id === id)!
    const roundTripped = JSON.parse(JSON.stringify(conv))
    expect(roundTripped.tokenUsage).toEqual({ totalInput: 100, totalOutput: 200 })
  })

  it('accumulateTokenUsage appends per-turn history entry with timestamp', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    const before = Date.now()
    store.accumulateTokenUsage(id, 100, 200)
    const after = Date.now()
    const conv = store.conversations.find(c => c.id === id)
    expect(conv?.tokenUsageHistory).toBeDefined()
    expect(conv!.tokenUsageHistory!.length).toBe(1)
    const entry = conv!.tokenUsageHistory![0]!
    expect(entry.input).toBe(100)
    expect(entry.output).toBe(200)
    expect(entry.ts).toBeGreaterThanOrEqual(before)
    expect(entry.ts).toBeLessThanOrEqual(after)
  })

  it('accumulateTokenUsage appends multiple history entries preserving order', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 100, 200)
    store.accumulateTokenUsage(id, 50, 80)
    store.accumulateTokenUsage(id, 10, 20)
    const conv = store.conversations.find(c => c.id === id)
    expect(conv!.tokenUsageHistory!.length).toBe(3)
    expect(conv!.tokenUsageHistory![0]!.input).toBe(100)
    expect(conv!.tokenUsageHistory![1]!.input).toBe(50)
    expect(conv!.tokenUsageHistory![2]!.input).toBe(10)
  })

  it('accumulateTokenUsage records optional model on history entry', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 100, 200, 'gpt-5.4')
    const conv = store.conversations.find(c => c.id === id)
    expect(conv!.tokenUsageHistory![0]!.model).toBe('gpt-5.4')
  })

  it('accumulateTokenUsage with model also sets conv.resolvedModel', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    // Initially resolvedModel is undefined (fresh conversation)
    expect(store.conversations.find(c => c.id === id)?.resolvedModel).toBeUndefined()
    store.accumulateTokenUsage(id, 100, 200, 'gemini-2.5-flash')
    const conv = store.conversations.find(c => c.id === id)
    // The real model name from the SSE chunk should be persisted on the conversation
    // so legacy-mode byModel aggregation (no time filter) doesn't fall back to "hermes-agent".
    expect(conv!.resolvedModel).toBe('gemini-2.5-flash')
  })

  it('accumulateTokenUsage updates conv.resolvedModel when the model changes mid-conversation', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 100, 200, 'gpt-5.4')
    store.accumulateTokenUsage(id, 50, 80, 'claude-sonnet-4.5')
    const conv = store.conversations.find(c => c.id === id)
    // Most recent real model wins on the conversation (per-turn history still
    // has each turn's own model for filtered aggregation).
    expect(conv!.resolvedModel).toBe('claude-sonnet-4.5')
  })

  it('accumulateTokenUsage works without model argument (backward compat)', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 100, 200)
    const conv = store.conversations.find(c => c.id === id)
    expect(conv!.tokenUsageHistory![0]!.model).toBeUndefined()
    // Without a real model, we don't touch resolvedModel — stays undefined
    expect(conv!.resolvedModel).toBeUndefined()
  })

  it('tokenUsageHistory survives round-trip through JSON serialization', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 100, 200, 'gpt-5.4')
    store.accumulateTokenUsage(id, 50, 80, 'gpt-5.4')
    const conv = store.conversations.find(c => c.id === id)!
    const roundTripped = JSON.parse(JSON.stringify(conv))
    expect(roundTripped.tokenUsageHistory).toHaveLength(2)
    expect(roundTripped.tokenUsageHistory[0].model).toBe('gpt-5.4')
    expect(roundTripped.tokenUsageHistory[1].input).toBe(50)
  })

  it('zero-value call does not append history entry', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 0, 0)
    const conv = store.conversations.find(c => c.id === id)
    expect(conv?.tokenUsageHistory).toBeUndefined()
  })
})
