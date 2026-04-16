import type {
  SessionsUsageResult,
  SessionsUsageSession,
  SessionsUsageTotals,
  SessionsUsageModelItem,
} from '@/api/types'
import type { HermesConversation } from './hermes-chat'

/**
 * Build a SessionsUsageResult from locally-stored Hermes REST conversations.
 *
 * REST mode has no server-side usage RPC, so we aggregate what we have locally:
 * - Per-conversation cumulative `tokenUsage` (captured from streaming SSE `usage`)
 * - Message counts from conversation.messages array
 * - Model breakdown from conversation.resolvedModel || conversation.model
 *
 * Fields we don't have in REST mode are filled with zeros / empty arrays:
 * - cacheRead / cacheWrite (OpenAI-compatible APIs expose them in extended usage, not widely populated)
 * - totalCost (no pricing data on the client)
 * - tool calls / errors (not tracked per-message in REST)
 * - daily breakdown (we only have conversation.updatedAt, not per-turn timestamps)
 */
export function buildHermesRestUsageData(
  conversations: readonly HermesConversation[],
): SessionsUsageResult {
  const sessions: SessionsUsageSession[] = []
  const totals = zeroTotals()
  const messages = { total: 0, user: 0, assistant: 0, toolCalls: 0, toolResults: 0, errors: 0 }
  const modelMap = new Map<string, SessionsUsageModelItem>()

  for (const conv of conversations) {
    // Count messages from every conversation (regardless of tokenUsage)
    for (const msg of conv.messages || []) {
      messages.total++
      if (msg.role === 'user') messages.user++
      else if (msg.role === 'assistant') messages.assistant++
    }

    // Only conversations with tokenUsage contribute to token totals / sessions / byModel
    if (!conv.tokenUsage) continue
    const { totalInput, totalOutput } = conv.tokenUsage
    const convTotalTokens = totalInput + totalOutput

    totals.input += totalInput
    totals.output += totalOutput
    totals.totalTokens += convTotalTokens

    const modelName = conv.resolvedModel || conv.model || 'unknown'
    let bucket = modelMap.get(modelName)
    if (!bucket) {
      bucket = { model: modelName, count: 0, totals: zeroTotals() }
      modelMap.set(modelName, bucket)
    }
    bucket.count++
    bucket.totals.input += totalInput
    bucket.totals.output += totalOutput
    bucket.totals.totalTokens += convTotalTokens

    sessions.push({
      key: conv.id,
      label: conv.title || '',
      sessionId: conv.id,
      updatedAt: conv.updatedAt,
      model: modelName,
      usage: {
        input: totalInput,
        output: totalOutput,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: convTotalTokens,
        totalCost: 0,
      },
    })
  }

  return {
    updatedAt: Date.now(),
    startDate: '',
    endDate: '',
    sessions,
    totals,
    aggregates: {
      messages,
      tools: { totalCalls: 0, uniqueTools: 0, tools: [] },
      byModel: Array.from(modelMap.values()),
      byProvider: [],
      byAgent: [],
      byChannel: [],
      daily: [],
    },
  }
}

function zeroTotals(): SessionsUsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    missingCostEntries: 0,
  }
}
