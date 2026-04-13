<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NCard, NGrid, NGridItem, NText, NSpace, NButton, NIcon, NTag,
  NProgress, NSpin, NTooltip,
} from 'naive-ui'
import { GridOutline, RefreshOutline } from '@vicons/ionicons5'
import { useHermesChatStore } from '@/stores/hermes-chat'
import { useCronStore } from '@/stores/cron'
import { useConnectionStore } from '@/stores/connection'
import { useWebSocketStore } from '@/stores/websocket'
import { formatRelativeTime } from '@/utils/format'
import type { SessionsUsageResult, CostUsageSummary } from '@/api/types'

const { t } = useI18n()
const router = useRouter()
const hermesChatStore = useHermesChatStore()
const cronStore = useCronStore()
const connectionStore = useConnectionStore()
const wsStore = useWebSocketStore()

// ── Basic Metrics ──
const totalConversations = computed(() => hermesChatStore.conversations.length)
const totalMessages = computed(() =>
  hermesChatStore.conversations.reduce((sum, c) => sum + (c.messages?.length || 0), 0),
)
const enabledJobs = computed(() => cronStore.jobs.filter(j => j.enabled).length)
const totalJobs = computed(() => cronStore.jobs.length)
const isOnline = computed(() => connectionStore.status === 'connected')
const modelName = computed(() => connectionStore.hermesRealModel || '-')

// ── Usage Data ──
const usageData = ref<SessionsUsageResult | null>(null)
const costData = ref<CostUsageSummary | null>(null)
const usageLoading = ref(false)
const usageError = ref<string | null>(null)

const totalTokens = computed(() => usageData.value?.totals?.totalTokens || 0)
const inputTokens = computed(() => usageData.value?.totals?.input || 0)
const outputTokens = computed(() => usageData.value?.totals?.output || 0)
const cacheReadTokens = computed(() => usageData.value?.totals?.cacheRead || 0)
const totalCost = computed(() => usageData.value?.totals?.totalCost || 0)
const totalSessions = computed(() => usageData.value?.sessions?.length || 0)
const messageAggregates = computed(() => usageData.value?.aggregates?.messages)
const toolAggregates = computed(() => usageData.value?.aggregates?.tools)

// Token breakdown percentages
const inputPercent = computed(() => totalTokens.value ? Math.round((inputTokens.value / totalTokens.value) * 100) : 0)
const outputPercent = computed(() => totalTokens.value ? Math.round((outputTokens.value / totalTokens.value) * 100) : 0)
const cachePercent = computed(() => totalTokens.value ? Math.round((cacheReadTokens.value / totalTokens.value) * 100) : 0)

// Top models
const topModels = computed(() => {
  const models = usageData.value?.aggregates?.byModel || []
  return [...models].sort((a, b) => b.totals.totalTokens - a.totals.totalTokens).slice(0, 5)
})

// Daily trend (last 7 days)
const dailyTrend = computed(() => {
  const daily = usageData.value?.aggregates?.daily || []
  return [...daily].slice(-7)
})

const maxDailyTokens = computed(() => {
  if (!dailyTrend.value.length) return 1
  return Math.max(...dailyTrend.value.map(d => d.tokens), 1)
})

// ── Recent data ──
const recentConversations = computed(() =>
  [...hermesChatStore.conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5),
)

const recentCronRuns = computed(() =>
  [...cronStore.jobs]
    .filter(j => j.state?.lastRunAtMs)
    .sort((a, b) => (b.state?.lastRunAtMs || 0) - (a.state?.lastRunAtMs || 0))
    .slice(0, 5),
)

// ── Format helpers ──
function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function formatCost(n: number): string {
  if (n === 0) return '$0'
  if (n < 0.01) return '<$0.01'
  return '$' + n.toFixed(2)
}

function formatDate(dateStr: string): string {
  // "2026-04-13" → "4/13"
  const parts = dateStr.split('-')
  return `${parseInt(parts[1]!)}/${parseInt(parts[2]!)}`
}

// ── Actions ──
function openConversation(id: string) {
  hermesChatStore.switchTo(id)
  router.push({ name: 'Chat' })
}

function goSessions() {
  router.push({ name: 'Sessions' })
}

function goCron() {
  router.push({ name: 'Cron' })
}

async function fetchUsageData() {
  usageLoading.value = true
  usageError.value = null
  try {
    const result = await wsStore.rpc.getSessionsUsage({ limit: 500 })
    usageData.value = result
  } catch (e: any) {
    usageError.value = e?.message || 'Failed to fetch usage data'
  } finally {
    usageLoading.value = false
  }
}

async function handleRefresh() {
  await cronStore.fetchJobs()
  if (hermesChatStore.serverSyncAvailable) {
    await hermesChatStore.loadFromServer()
  }
  await fetchUsageData()
}

onMounted(() => {
  if (cronStore.jobs.length === 0) {
    cronStore.fetchJobs()
  }
  fetchUsageData()
})
</script>

<template>
  <NSpace vertical :size="16">
    <!-- Header -->
    <NCard>
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="GridOutline" :size="20" />
          <span>{{ t('pages.dashboard.title') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NButton secondary size="small" @click="handleRefresh" :loading="cronStore.loading || usageLoading">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          {{ t('pages.dashboard.refresh') }}
        </NButton>
      </template>

      <!-- Basic Metric Cards -->
      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="10" :y-gap="10">
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.metrics.conversations') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">{{ totalConversations }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.metrics.messages') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">{{ totalMessages }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.metrics.cronJobs') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              {{ totalJobs }}
              <NText style="font-size: 12px; font-weight: 400;" type="success"> {{ enabledJobs }} {{ t('pages.dashboard.metrics.enabled') }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.metrics.server') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              <NText :type="isOnline ? 'success' : 'error'">{{ isOnline ? t('pages.dashboard.metrics.online') : t('pages.dashboard.metrics.offline') }}</NText>
            </div>
            <NText depth="3" style="font-size: 11px;">{{ modelName }}</NText>
          </NCard>
        </NGridItem>
      </NGrid>
    </NCard>

    <!-- Token Usage Stats -->
    <NCard>
      <template #header>
        <NSpace align="center" :size="8">
          <span>{{ t('pages.dashboard.usage.totalTokens') }}</span>
        </NSpace>
      </template>

      <NSpin :show="usageLoading" size="small">
        <div v-if="usageError" style="text-align: center; padding: 16px;">
          <NText type="error" style="font-size: 13px;">{{ usageError }}</NText>
        </div>
        <div v-else>
          <!-- Token Overview Cards -->
          <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="10" :y-gap="10">
            <NGridItem>
              <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
                <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.usage.totalTokens') }}</NText>
                <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
                  <NText type="info">{{ formatTokens(totalTokens) }}</NText>
                </div>
                <NText depth="3" style="font-size: 11px;">{{ totalSessions }} {{ t('pages.dashboard.stats.sessions') }}</NText>
              </NCard>
            </NGridItem>
            <NGridItem>
              <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
                <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.usage.totalCost') }}</NText>
                <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
                  <NText type="warning">{{ formatCost(totalCost) }}</NText>
                </div>
              </NCard>
            </NGridItem>
            <NGridItem>
              <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
                <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.kpis.messages.label') }}</NText>
                <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
                  {{ messageAggregates?.total || 0 }}
                </div>
                <NText depth="3" style="font-size: 11px;">
                  {{ t('pages.dashboard.kpis.toolCalls.label') }}: {{ toolAggregates?.totalCalls || 0 }}
                </NText>
              </NCard>
            </NGridItem>
            <NGridItem>
              <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
                <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.kpis.errorRate.label') }}</NText>
                <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
                  <NText :type="(messageAggregates?.errors || 0) > 0 ? 'error' : 'success'">
                    {{ messageAggregates?.total ? ((messageAggregates.errors / messageAggregates.total) * 100).toFixed(1) : '0' }}%
                  </NText>
                </div>
                <NText depth="3" style="font-size: 11px;">
                  {{ messageAggregates?.errors || 0 }} / {{ messageAggregates?.total || 0 }}
                </NText>
              </NCard>
            </NGridItem>
          </NGrid>

          <!-- Token Breakdown Bar -->
          <div v-if="totalTokens > 0" style="margin-top: 16px;">
            <NText depth="3" style="font-size: 12px; display: block; margin-bottom: 8px;">Token {{ t('pages.dashboard.cards.structure') }}</NText>
            <div style="display: flex; height: 24px; border-radius: 6px; overflow: hidden; background: var(--n-color-embedded);">
              <NTooltip trigger="hover">
                <template #trigger>
                  <div :style="{ width: inputPercent + '%', background: '#60a5fa', height: '100%', minWidth: inputPercent > 0 ? '2px' : '0' }" />
                </template>
                {{ t('pages.dashboard.usage.segments.input') }}: {{ formatTokens(inputTokens) }} ({{ inputPercent }}%)
              </NTooltip>
              <NTooltip trigger="hover">
                <template #trigger>
                  <div :style="{ width: outputPercent + '%', background: '#4ade80', height: '100%', minWidth: outputPercent > 0 ? '2px' : '0' }" />
                </template>
                {{ t('pages.dashboard.usage.segments.output') }}: {{ formatTokens(outputTokens) }} ({{ outputPercent }}%)
              </NTooltip>
              <NTooltip trigger="hover">
                <template #trigger>
                  <div :style="{ width: cachePercent + '%', background: '#a78bfa', height: '100%', minWidth: cachePercent > 0 ? '2px' : '0' }" />
                </template>
                {{ t('pages.dashboard.usage.segments.cacheRead') }}: {{ formatTokens(cacheReadTokens) }} ({{ cachePercent }}%)
              </NTooltip>
            </div>
            <div style="display: flex; gap: 16px; margin-top: 6px; flex-wrap: wrap;">
              <NSpace :size="4" align="center">
                <div style="width: 10px; height: 10px; border-radius: 2px; background: #60a5fa;" />
                <NText depth="3" style="font-size: 11px;">{{ t('pages.dashboard.usage.segments.input') }}</NText>
              </NSpace>
              <NSpace :size="4" align="center">
                <div style="width: 10px; height: 10px; border-radius: 2px; background: #4ade80;" />
                <NText depth="3" style="font-size: 11px;">{{ t('pages.dashboard.usage.segments.output') }}</NText>
              </NSpace>
              <NSpace :size="4" align="center">
                <div style="width: 10px; height: 10px; border-radius: 2px; background: #a78bfa;" />
                <NText depth="3" style="font-size: 11px;">{{ t('pages.dashboard.usage.segments.cacheRead') }}</NText>
              </NSpace>
            </div>
          </div>
        </div>
      </NSpin>
    </NCard>

    <!-- Two-column: Daily Trend + Top Models -->
    <NGrid cols="1 m:2" responsive="screen" :x-gap="12" :y-gap="12">
      <!-- Left: Daily Trend -->
      <NGridItem>
        <NCard :title="t('pages.dashboard.cards.trend')" size="small">
          <div v-if="!dailyTrend.length" style="text-align: center; padding: 24px;">
            <NText depth="3">{{ t('pages.dashboard.trend.empty') }}</NText>
          </div>
          <div v-else>
            <div style="display: flex; align-items: flex-end; gap: 4px; height: 120px; padding: 4px 0;">
              <NTooltip v-for="day in dailyTrend" :key="day.date" trigger="hover">
                <template #trigger>
                  <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%;">
                    <div
                      :style="{
                        width: '100%',
                        maxWidth: '32px',
                        minHeight: '3px',
                        height: Math.max(3, (day.tokens / maxDailyTokens) * 100) + '%',
                        background: 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s',
                      }"
                    />
                  </div>
                </template>
                {{ day.date }}: {{ formatTokens(day.tokens) }} tokens · {{ day.messages }} msg
              </NTooltip>
            </div>
            <div style="display: flex; gap: 4px; margin-top: 4px;">
              <div v-for="day in dailyTrend" :key="day.date + '-label'" style="flex: 1; text-align: center;">
                <NText depth="3" style="font-size: 10px;">{{ formatDate(day.date) }}</NText>
              </div>
            </div>
          </div>
        </NCard>
      </NGridItem>

      <!-- Right: Top Models -->
      <NGridItem>
        <NCard :title="t('pages.dashboard.top.models')" size="small">
          <div v-if="!topModels.length" style="text-align: center; padding: 24px;">
            <NText depth="3">-</NText>
          </div>
          <div v-else>
            <div
              v-for="model in topModels"
              :key="(model.model || '') + (model.provider || '')"
              style="padding: 8px 0; border-bottom: 1px solid var(--n-border-color);"
            >
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <NText strong style="font-size: 13px;">{{ model.model || 'unknown' }}</NText>
                <NText depth="3" style="font-size: 12px;">{{ formatTokens(model.totals.totalTokens) }}</NText>
              </div>
              <NProgress
                type="line"
                :percentage="totalTokens ? Math.round((model.totals.totalTokens / totalTokens) * 100) : 0"
                :height="6"
                :show-indicator="false"
                :color="'#60a5fa'"
                :rail-color="'var(--n-color-embedded)'"
              />
              <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                <NText depth="3" style="font-size: 11px;">{{ model.provider || '' }}</NText>
                <NText depth="3" style="font-size: 11px;">{{ formatCost(model.totals.totalCost) }}</NText>
              </div>
            </div>
          </div>
        </NCard>
      </NGridItem>
    </NGrid>

    <!-- Two-column: Recent Conversations + Cron Runs / Server Info -->
    <NGrid cols="1 m:2" responsive="screen" :x-gap="12" :y-gap="12">
      <!-- Left: Recent Conversations -->
      <NGridItem>
        <NCard :title="t('pages.dashboard.recentConversations')" size="small">
          <div v-if="recentConversations.length === 0" style="text-align: center; padding: 24px;">
            <NText depth="3">{{ t('pages.dashboard.emptyConversations') }}</NText>
          </div>
          <div v-else>
            <div
              v-for="conv in recentConversations"
              :key="conv.id"
              style="display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--n-border-color); cursor: pointer;"
              @click="openConversation(conv.id)"
            >
              <div style="flex: 1; min-width: 0;">
                <NText strong style="display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  {{ conv.title || t('pages.sessions.hermesRest.untitled') }}
                </NText>
                <NText depth="3" style="font-size: 12px;">
                  {{ t('pages.dashboard.messagesCount', { count: conv.messages?.length || 0 }) }}
                </NText>
              </div>
              <NText depth="3" style="font-size: 12px; white-space: nowrap;">
                {{ formatRelativeTime(conv.updatedAt) }}
              </NText>
            </div>
            <div style="text-align: center; padding-top: 12px;">
              <NButton text type="primary" @click="goSessions">{{ t('pages.dashboard.viewAll') }}</NButton>
            </div>
          </div>
        </NCard>
      </NGridItem>

      <!-- Right: Cron Runs + Server Info -->
      <NGridItem>
        <NSpace vertical :size="12">
          <!-- Recent Cron Runs -->
          <NCard :title="t('pages.dashboard.recentCronRuns')" size="small">
            <div v-if="recentCronRuns.length === 0" style="text-align: center; padding: 24px;">
              <NText depth="3">{{ t('pages.dashboard.emptyCronRuns') }}</NText>
            </div>
            <div v-else>
              <div
                v-for="job in recentCronRuns"
                :key="job.id"
                style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--n-border-color); cursor: pointer;"
                @click="goCron"
              >
                <NText style="flex: 1; font-size: 13px;">{{ job.name }}</NText>
                <NTag
                  :type="job.state?.lastStatus === 'ok' ? 'success' : job.state?.lastStatus === 'error' ? 'error' : 'warning'"
                  size="small" :bordered="false" round
                >
                  {{ job.state?.lastStatus === 'ok' ? 'OK' : job.state?.lastStatus === 'error' ? 'Error' : job.state?.lastStatus || '-' }}
                </NTag>
                <NText depth="3" style="font-size: 12px; white-space: nowrap;">
                  {{ formatRelativeTime(job.state?.lastRunAtMs || 0) }}
                </NText>
              </div>
            </div>
          </NCard>

          <!-- Server Info -->
          <NCard :title="t('pages.dashboard.serverInfo')" size="small">
            <NSpace vertical :size="8">
              <div style="display: flex; justify-content: space-between;">
                <NText depth="3">{{ t('pages.dashboard.model') }}</NText>
                <NText>{{ modelName }}</NText>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <NText depth="3">{{ t('pages.dashboard.syncStatus') }}</NText>
                <NTag
                  :type="hermesChatStore.serverSyncAvailable ? 'success' : 'default'"
                  size="small" :bordered="false" round
                >
                  {{ hermesChatStore.serverSyncAvailable ? t('pages.dashboard.syncConnected') : t('pages.dashboard.syncLocalOnly') }}
                </NTag>
              </div>
            </NSpace>
          </NCard>
        </NSpace>
      </NGridItem>
    </NGrid>
  </NSpace>
</template>
