import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import type { SessionsUsageResult, CostUsageSummary } from '@/api/types'

export type DateRange = '7d' | '14d' | '30d' | '90d' | 'all'

function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function rangeToDates(range: DateRange): { startDate?: string; endDate?: string; days?: number } {
  if (range === 'all') return {}
  const daysMap: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 }
  const days = daysMap[range] || 7
  const now = new Date()
  // Use local calendar dates so the date range matches what the user sees in
  // their timezone, not UTC (which would shift the boundary by the TZ offset).
  const end = toLocalDateString(now)
  const start = toLocalDateString(new Date(now.getTime() - (days - 1) * 86400000))
  return { startDate: start, endDate: end, days }
}

export const useInsightsStore = defineStore('insights', () => {
  const usage = ref<SessionsUsageResult | null>(null)
  const cost = ref<CostUsageSummary | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const range = ref<DateRange>('7d')

  // ── Getters ──
  const totals = computed(() => usage.value?.totals || null)
  const totalSessions = computed(() => usage.value?.sessions.length || 0)
  const messageAggregates = computed(() => usage.value?.aggregates?.messages || null)
  const toolAggregates = computed(() => usage.value?.aggregates?.tools || null)

  const dailyTrend = computed(() => usage.value?.aggregates?.daily || [])

  const maxDailyTokens = computed(() => {
    const daily = dailyTrend.value
    if (!daily.length) return 1
    return Math.max(...daily.map((d) => d.tokens), 1)
  })

  const maxDailyCost = computed(() => {
    const daily = dailyTrend.value
    if (!daily.length) return 0.01
    return Math.max(...daily.map((d) => d.cost), 0.01)
  })

  const topModels = computed(() => {
    const models = usage.value?.aggregates?.byModel || []
    return [...models].sort((a, b) => b.totals.totalTokens - a.totals.totalTokens).slice(0, 10)
  })

  const topProviders = computed(() => {
    const providers = usage.value?.aggregates?.byProvider || []
    return [...providers].sort((a, b) => b.totals.totalTokens - a.totals.totalTokens)
  })

  const topAgents = computed(() => {
    const agents = usage.value?.aggregates?.byAgent || []
    return [...agents].sort((a, b) => b.totals.totalTokens - a.totals.totalTokens).slice(0, 10)
  })

  const topChannels = computed(() => {
    const channels = usage.value?.aggregates?.byChannel || []
    return [...channels].sort((a, b) => b.totals.totalTokens - a.totals.totalTokens).slice(0, 10)
  })

  const topTools = computed(() => {
    const tools = toolAggregates.value?.tools || []
    return [...tools].sort((a, b) => b.count - a.count).slice(0, 15)
  })

  const errorRate = computed(() => {
    const msgs = messageAggregates.value
    if (!msgs || !msgs.total) return 0
    return ((msgs.errors || 0) / msgs.total) * 100
  })

  const avgCostPerSession = computed(() => {
    const t = totals.value
    if (!t || !totalSessions.value) return 0
    return t.totalCost / totalSessions.value
  })

  const avgTokensPerSession = computed(() => {
    const t = totals.value
    if (!t || !totalSessions.value) return 0
    return t.totalTokens / totalSessions.value
  })

  // ── Actions ──
  async function fetchInsights(): Promise<void> {
    const wsStore = useWebSocketStore()
    loading.value = true
    error.value = null
    try {
      const { startDate, endDate, days } = rangeToDates(range.value)
      const [usageResult, costResult] = await Promise.allSettled([
        wsStore.rpc.getSessionsUsage({
          limit: 1000,
          startDate,
          endDate,
          includeContextWeight: true,
        }),
        wsStore.rpc.getUsageCost({ startDate, endDate, days }),
      ])

      if (usageResult.status === 'fulfilled') {
        usage.value = usageResult.value
      } else {
        usage.value = null
        const reason = usageResult.reason
        error.value = reason instanceof Error ? reason.message : String(reason)
      }

      if (costResult.status === 'fulfilled') {
        cost.value = costResult.value
      } else {
        cost.value = null
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function setRange(newRange: DateRange): void {
    range.value = newRange
    fetchInsights().catch(() => {})
  }

  return {
    usage, cost, loading, error, range,
    totals, totalSessions, messageAggregates, toolAggregates,
    dailyTrend, maxDailyTokens, maxDailyCost,
    topModels, topProviders, topAgents, topChannels, topTools,
    errorRate, avgCostPerSession, avgTokensPerSession,
    fetchInsights, setRange,
  }
})
