import { describe, it, expect } from 'vitest'
import { buildHermesRestUsageData } from './hermes-rest-usage'
import type { HermesConversation } from './hermes-chat'

function mkConv(partial: Partial<HermesConversation>): HermesConversation {
  return {
    id: partial.id || 'c1',
    title: partial.title || '',
    messages: partial.messages || [],
    model: partial.model || 'hermes-agent',
    resolvedModel: partial.resolvedModel,
    createdAt: partial.createdAt || 1_700_000_000_000,
    updatedAt: partial.updatedAt || 1_700_000_000_000,
    tokenUsage: partial.tokenUsage,
  }
}

describe('buildHermesRestUsageData', () => {
  it('empty conversations → empty result with zero totals', () => {
    const result = buildHermesRestUsageData([])
    expect(result.sessions).toEqual([])
    expect(result.totals.input).toBe(0)
    expect(result.totals.output).toBe(0)
    expect(result.totals.totalTokens).toBe(0)
    expect(result.totals.totalCost).toBe(0)
    expect(result.aggregates.messages.total).toBe(0)
    expect(result.aggregates.byModel).toEqual([])
    expect(result.aggregates.daily).toEqual([])
  })

  it('single conversation with tokenUsage reflected in totals', () => {
    const convs = [
      mkConv({
        id: 'c1',
        tokenUsage: { totalInput: 100, totalOutput: 200 },
      }),
    ]
    const result = buildHermesRestUsageData(convs)
    expect(result.totals.input).toBe(100)
    expect(result.totals.output).toBe(200)
    expect(result.totals.totalTokens).toBe(300)
    expect(result.totals.cacheRead).toBe(0)
    expect(result.totals.cacheWrite).toBe(0)
    expect(result.totals.totalCost).toBe(0)
    expect(result.sessions.length).toBe(1)
  })

  it('multiple conversations sum totals', () => {
    const convs = [
      mkConv({ id: 'c1', tokenUsage: { totalInput: 100, totalOutput: 200 } }),
      mkConv({ id: 'c2', tokenUsage: { totalInput: 50, totalOutput: 80 } }),
      mkConv({ id: 'c3', tokenUsage: { totalInput: 10, totalOutput: 20 } }),
    ]
    const result = buildHermesRestUsageData(convs)
    expect(result.totals.input).toBe(160)
    expect(result.totals.output).toBe(300)
    expect(result.totals.totalTokens).toBe(460)
  })

  it('conversations without tokenUsage are excluded from sessions but may contribute messages', () => {
    const convs = [
      mkConv({
        id: 'c1',
        tokenUsage: { totalInput: 100, totalOutput: 200 },
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
      }),
      mkConv({
        id: 'c2',
        // no tokenUsage
        messages: [{ role: 'user', content: 'ping' }],
      }),
    ]
    const result = buildHermesRestUsageData(convs)
    expect(result.totals.totalTokens).toBe(300)
    expect(result.sessions.length).toBe(1)
    expect(result.sessions[0]!.key).toBe('c1')
    // messages aggregate still counts messages from all conversations
    expect(result.aggregates.messages.total).toBe(3)
    expect(result.aggregates.messages.user).toBe(2)
    expect(result.aggregates.messages.assistant).toBe(1)
  })

  it('byModel groups by resolvedModel with fallback to model', () => {
    const convs = [
      mkConv({
        id: 'c1',
        model: 'hermes-agent',
        resolvedModel: 'gpt-5.4',
        tokenUsage: { totalInput: 100, totalOutput: 200 },
      }),
      mkConv({
        id: 'c2',
        model: 'hermes-agent',
        resolvedModel: 'gpt-5.4',
        tokenUsage: { totalInput: 50, totalOutput: 80 },
      }),
      mkConv({
        id: 'c3',
        model: 'claude-sonnet-4.5',
        // no resolvedModel, falls back to model
        tokenUsage: { totalInput: 30, totalOutput: 60 },
      }),
    ]
    const result = buildHermesRestUsageData(convs)
    expect(result.aggregates.byModel.length).toBe(2)

    const gpt = result.aggregates.byModel.find(m => m.model === 'gpt-5.4')!
    expect(gpt.count).toBe(2)
    expect(gpt.totals.input).toBe(150)
    expect(gpt.totals.output).toBe(280)
    expect(gpt.totals.totalTokens).toBe(430)

    const claude = result.aggregates.byModel.find(m => m.model === 'claude-sonnet-4.5')!
    expect(claude.count).toBe(1)
    expect(claude.totals.totalTokens).toBe(90)
  })

  it('messages aggregate counts user/assistant/other roles', () => {
    const convs = [
      mkConv({
        id: 'c1',
        tokenUsage: { totalInput: 100, totalOutput: 200 },
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'u1' },
          { role: 'assistant', content: 'a1' },
          { role: 'user', content: 'u2' },
          { role: 'assistant', content: 'a2' },
        ],
      }),
    ]
    const result = buildHermesRestUsageData(convs)
    expect(result.aggregates.messages.total).toBe(5)
    expect(result.aggregates.messages.user).toBe(2)
    expect(result.aggregates.messages.assistant).toBe(2)
    // no tool calls or errors in REST mode
    expect(result.aggregates.messages.toolCalls).toBe(0)
    expect(result.aggregates.messages.errors).toBe(0)
  })

  it('session entries capture per-conversation usage and title', () => {
    const convs = [
      mkConv({
        id: 'conv-abc',
        title: 'Project X discussion',
        model: 'hermes-agent',
        resolvedModel: 'gpt-5.4',
        updatedAt: 1_700_000_123_456,
        tokenUsage: { totalInput: 100, totalOutput: 200 },
      }),
    ]
    const result = buildHermesRestUsageData(convs)
    const session = result.sessions[0]!
    expect(session.key).toBe('conv-abc')
    expect(session.label).toBe('Project X discussion')
    expect(session.model).toBe('gpt-5.4')
    expect(session.updatedAt).toBe(1_700_000_123_456)
    expect(session.usage?.input).toBe(100)
    expect(session.usage?.output).toBe(200)
    expect(session.usage?.totalTokens).toBe(300)
  })

  it('result.updatedAt is set to current time', () => {
    const before = Date.now()
    const result = buildHermesRestUsageData([])
    const after = Date.now()
    expect(result.updatedAt).toBeGreaterThanOrEqual(before)
    expect(result.updatedAt).toBeLessThanOrEqual(after)
  })
})
