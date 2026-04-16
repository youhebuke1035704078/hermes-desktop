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
})
