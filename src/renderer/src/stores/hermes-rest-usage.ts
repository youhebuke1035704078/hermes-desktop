import type {
  SessionsUsageResult,
  SessionsUsageSession,
  SessionsUsageTotals,
  SessionsUsageModelItem,
  SessionsUsageDailyItem,
} from '@/api/types'
import type { HermesConversation, TokenUsageEntry } from './hermes-chat'

export interface UsageFilter {
  /** Start of range (inclusive), Unix ms. Omit for no lower bound. */
  startTs?: number
  /** End of range (inclusive), Unix ms. Omit for no upper bound. */
  endTs?: number
}

/**
 * Build a SessionsUsageResult from locally-stored Hermes REST conversations.
 *
 * When `filter` is omitted, aggregates from cumulative `tokenUsage` (preserves
 * v0.4.2/v0.4.3 data that lacks per-turn history).
 *
 * When `filter` is provided, aggregates from per-turn `tokenUsageHistory`:
 * - Conversations without history are excluded (cannot be attributed to a time)
 * - Daily breakdown is populated from in-range entries
 * - byModel uses entry.model when available
 */
export function buildHermesRestUsageData(
  conversations: readonly HermesConversation[],
  filter?: UsageFilter,
): SessionsUsageResult {
  const sessions: SessionsUsageSession[] = []
  const totals = zeroTotals()
  const messages = { total: 0, user: 0, assistant: 0, toolCalls: 0, toolResults: 0, errors: 0 }
  const modelMap = new Map<string, SessionsUsageModelItem>()
  const dailyMap = new Map<string, SessionsUsageDailyItem>()

  const useHistoryMode = filter !== undefined

  for (const conv of conversations) {
    // Count messages from every conversation (not time-filtered — messages have no per-turn ts)
    for (const msg of conv.messages || []) {
      messages.total++
      if (msg.role === 'user') messages.user++
      else if (msg.role === 'assistant') messages.assistant++
    }

    if (useHistoryMode) {
      // New path: aggregate per-turn history entries matching the filter
      const history = conv.tokenUsageHistory
      if (!history || history.length === 0) continue

      let convInput = 0
      let convOutput = 0
      const convModelFallback = conv.resolvedModel || conv.model || 'unknown'

      for (const entry of history) {
        if (!entryInRange(entry, filter)) continue
        convInput += entry.input
        convOutput += entry.output
        totals.input += entry.input
        totals.output += entry.output
        totals.totalTokens += entry.input + entry.output

        const modelName = entry.model || convModelFallback
        addToModelMap(modelMap, modelName, entry.input, entry.output)
        addToDailyMap(dailyMap, entry.ts, entry.input + entry.output)
      }

      if (convInput === 0 && convOutput === 0) continue

      sessions.push({
        key: conv.id,
        label: conv.title || '',
        sessionId: conv.id,
        updatedAt: conv.updatedAt,
        model: convModelFallback,
        usage: {
          input: convInput,
          output: convOutput,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: convInput + convOutput,
          totalCost: 0,
        },
      })
    } else {
      // Legacy path: cumulative tokenUsage (no time filtering)
      if (!conv.tokenUsage) continue
      const { totalInput, totalOutput } = conv.tokenUsage
      const convTotalTokens = totalInput + totalOutput

      totals.input += totalInput
      totals.output += totalOutput
      totals.totalTokens += convTotalTokens

      const modelName = conv.resolvedModel || conv.model || 'unknown'
      addToModelMap(modelMap, modelName, totalInput, totalOutput)

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
  }

  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

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
      daily,
    },
  }
}

function entryInRange(entry: TokenUsageEntry, filter: UsageFilter): boolean {
  if (filter.startTs !== undefined && entry.ts < filter.startTs) return false
  if (filter.endTs !== undefined && entry.ts > filter.endTs) return false
  return true
}

function addToModelMap(
  map: Map<string, SessionsUsageModelItem>,
  modelName: string,
  input: number,
  output: number,
): void {
  let bucket = map.get(modelName)
  if (!bucket) {
    bucket = { model: modelName, count: 0, totals: zeroTotals() }
    map.set(modelName, bucket)
  }
  bucket.count++
  bucket.totals.input += input
  bucket.totals.output += output
  bucket.totals.totalTokens += input + output
}

function addToDailyMap(
  map: Map<string, SessionsUsageDailyItem>,
  ts: number,
  tokens: number,
): void {
  const date = tsToYmd(ts)
  let bucket = map.get(date)
  if (!bucket) {
    bucket = { date, tokens: 0, cost: 0, messages: 0, toolCalls: 0, errors: 0 }
    map.set(date, bucket)
  }
  bucket.tokens += tokens
  bucket.messages++
}

/** Format Unix ms as "YYYY-MM-DD" in local timezone */
function tsToYmd(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
