<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton, NCard, NGrid, NGridItem, NIcon, NProgress,
  NRadioButton, NRadioGroup, NSpace, NTag, NText,
} from 'naive-ui'
import {
  AnalyticsOutline, RefreshOutline, TrendingUpOutline,
} from '@vicons/ionicons5'
import { useInsightsStore, type DateRange } from '@/stores/insights'

const { t } = useI18n()
const insightsStore = useInsightsStore()

// ── Format helpers ──
function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.round(n))
}

function formatCost(n: number): string {
  if (n === 0) return '$0'
  if (n < 0.01) return '<$0.01'
  if (n < 100) return '$' + n.toFixed(2)
  return '$' + Math.round(n).toLocaleString()
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length < 3) return dateStr
  return `${parseInt(parts[1]!)}/${parseInt(parts[2]!)}`
}

function formatPercent(n: number): string {
  return n.toFixed(1) + '%'
}

// ── Range options ──
const rangeOptions: Array<{ label: string; value: DateRange }> = [
  { label: '7d', value: '7d' },
  { label: '14d', value: '14d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
]

// ── Share helpers ──
const inputSharePct = computed(() => {
  const t = insightsStore.totals
  if (!t || !t.totalTokens) return 0
  return (t.input / t.totalTokens) * 100
})
const outputSharePct = computed(() => {
  const t = insightsStore.totals
  if (!t || !t.totalTokens) return 0
  return (t.output / t.totalTokens) * 100
})
const cacheReadSharePct = computed(() => {
  const t = insightsStore.totals
  if (!t || !t.totalTokens) return 0
  return (t.cacheRead / t.totalTokens) * 100
})

// ── Top provider summary ──
const topProvidersWithShare = computed(() => {
  const total = insightsStore.totals?.totalTokens || 0
  return insightsStore.topProviders.slice(0, 5).map((p) => ({
    ...p,
    share: total > 0 ? (p.totals.totalTokens / total) * 100 : 0,
  }))
})

// ── Lifecycle ──
onMounted(() => {
  insightsStore.fetchInsights()
})
</script>

<template>
  <NSpace vertical :size="16">
      <!-- Header with range + refresh -->
      <NCard>
        <template #header>
          <NSpace align="center" :size="8">
            <NIcon :component="AnalyticsOutline" :size="20" />
            <span>{{ t('pages.insights.title') }}</span>
          </NSpace>
        </template>
        <template #header-extra>
          <NSpace :size="12" align="center">
            <NRadioGroup
              :value="insightsStore.range"
              size="small"
              @update:value="(v: DateRange) => insightsStore.setRange(v)"
            >
              <NRadioButton
                v-for="opt in rangeOptions"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              />
            </NRadioGroup>
            <NButton
              secondary
              size="small"
              :loading="insightsStore.loading"
              @click="insightsStore.fetchInsights()"
            >
              <template #icon><NIcon :component="RefreshOutline" /></template>
              {{ t('pages.insights.refresh') }}
            </NButton>
          </NSpace>
        </template>

        <!-- Top-level metrics -->
        <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="10" :y-gap="10">
          <NGridItem>
            <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
              <NText depth="3" style="font-size: 12px;">{{ t('pages.insights.metrics.totalTokens') }}</NText>
              <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
                {{ formatTokens(insightsStore.totals?.totalTokens || 0) }}
              </div>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
              <NText depth="3" style="font-size: 12px;">{{ t('pages.insights.metrics.totalCost') }}</NText>
              <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
                <NText type="warning">{{ formatCost(insightsStore.totals?.totalCost || 0) }}</NText>
              </div>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
              <NText depth="3" style="font-size: 12px;">{{ t('pages.insights.metrics.sessions') }}</NText>
              <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
                <NText type="info">{{ insightsStore.totalSessions }}</NText>
              </div>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
              <NText depth="3" style="font-size: 12px;">{{ t('pages.insights.metrics.errorRate') }}</NText>
              <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
                <NText :type="insightsStore.errorRate > 5 ? 'error' : 'success'">
                  {{ formatPercent(insightsStore.errorRate) }}
                </NText>
              </div>
            </NCard>
          </NGridItem>
        </NGrid>

        <!-- Token share breakdown -->
        <div style="margin-top: 16px;">
          <NText depth="3" style="font-size: 12px; display: block; margin-bottom: 6px;">
            {{ t('pages.insights.tokenBreakdown') }}
          </NText>
          <NGrid cols="1 s:3" responsive="screen" :x-gap="10" :y-gap="10">
            <NGridItem>
              <NSpace vertical :size="2">
                <NSpace justify="space-between" :size="4">
                  <NText style="font-size: 12px;">{{ t('pages.insights.input') }}</NText>
                  <NText depth="3" style="font-size: 12px;">
                    {{ formatTokens(insightsStore.totals?.input || 0) }}
                  </NText>
                </NSpace>
                <NProgress type="line" :percentage="Math.round(inputSharePct)" :height="6" :show-indicator="false" color="#63e2b7" />
              </NSpace>
            </NGridItem>
            <NGridItem>
              <NSpace vertical :size="2">
                <NSpace justify="space-between" :size="4">
                  <NText style="font-size: 12px;">{{ t('pages.insights.output') }}</NText>
                  <NText depth="3" style="font-size: 12px;">
                    {{ formatTokens(insightsStore.totals?.output || 0) }}
                  </NText>
                </NSpace>
                <NProgress type="line" :percentage="Math.round(outputSharePct)" :height="6" :show-indicator="false" color="#70c0e8" />
              </NSpace>
            </NGridItem>
            <NGridItem>
              <NSpace vertical :size="2">
                <NSpace justify="space-between" :size="4">
                  <NText style="font-size: 12px;">{{ t('pages.insights.cacheRead') }}</NText>
                  <NText depth="3" style="font-size: 12px;">
                    {{ formatTokens(insightsStore.totals?.cacheRead || 0) }}
                  </NText>
                </NSpace>
                <NProgress type="line" :percentage="Math.round(cacheReadSharePct)" :height="6" :show-indicator="false" color="#f0a020" />
              </NSpace>
            </NGridItem>
          </NGrid>
        </div>

        <!-- Averages -->
        <NGrid cols="1 s:2" responsive="screen" :x-gap="10" :y-gap="10" style="margin-top: 12px;">
          <NGridItem>
            <NSpace justify="space-between" :size="4" style="padding: 8px; background: var(--n-color-embedded); border-radius: 8px;">
              <NText depth="3" style="font-size: 12px;">{{ t('pages.insights.avgTokensPerSession') }}</NText>
              <NText>{{ formatTokens(insightsStore.avgTokensPerSession) }}</NText>
            </NSpace>
          </NGridItem>
          <NGridItem>
            <NSpace justify="space-between" :size="4" style="padding: 8px; background: var(--n-color-embedded); border-radius: 8px;">
              <NText depth="3" style="font-size: 12px;">{{ t('pages.insights.avgCostPerSession') }}</NText>
              <NText>{{ formatCost(insightsStore.avgCostPerSession) }}</NText>
            </NSpace>
          </NGridItem>
        </NGrid>

        <div v-if="insightsStore.error" style="margin-top: 12px;">
          <NText type="error" style="font-size: 12px;">{{ insightsStore.error }}</NText>
        </div>
      </NCard>

      <!-- Daily trend chart (CSS-based bars) -->
      <NCard v-if="insightsStore.dailyTrend.length > 0">
        <template #header>
          <NSpace align="center" :size="8">
            <NIcon :component="TrendingUpOutline" :size="18" />
            <span>{{ t('pages.insights.dailyTrend') }}</span>
          </NSpace>
        </template>
        <div class="trend-chart">
          <div
            v-for="day in insightsStore.dailyTrend"
            :key="day.date"
            class="trend-bar-wrap"
          >
            <div class="trend-bar-value">{{ formatTokens(day.tokens) }}</div>
            <div class="trend-bar-container">
              <div
                class="trend-bar"
                :style="{ height: insightsStore.maxDailyTokens ? (day.tokens / insightsStore.maxDailyTokens * 100) + '%' : '0%' }"
              />
            </div>
            <div class="trend-bar-date">{{ formatDate(day.date) }}</div>
          </div>
        </div>
      </NCard>

      <!-- Top models -->
      <NGrid cols="1 m:2" responsive="screen" :x-gap="16" :y-gap="16">
        <NGridItem>
          <NCard>
            <template #header>
              <span>{{ t('pages.insights.topModels') }}</span>
            </template>
            <NSpace vertical :size="8">
              <div
                v-if="insightsStore.topModels.length === 0"
                style="text-align: center; padding: 24px;"
              >
                <NText depth="3">{{ t('pages.insights.empty') }}</NText>
              </div>
              <div
                v-for="(m, idx) in insightsStore.topModels"
                :key="m.model || idx"
                class="rank-row"
              >
                <div class="rank-index">{{ idx + 1 }}</div>
                <div class="rank-info">
                  <NText strong style="font-size: 13px; display: block;">
                    {{ m.model || t('pages.insights.unknown') }}
                  </NText>
                  <NText depth="3" style="font-size: 11px;">
                    {{ m.provider || '-' }} · {{ m.count }} {{ t('pages.insights.calls') }}
                  </NText>
                </div>
                <div class="rank-metric">
                  <NText style="font-size: 13px;">{{ formatTokens(m.totals.totalTokens) }}</NText>
                  <NText depth="3" style="font-size: 11px; display: block;">{{ formatCost(m.totals.totalCost) }}</NText>
                </div>
              </div>
            </NSpace>
          </NCard>
        </NGridItem>

        <!-- Top providers -->
        <NGridItem>
          <NCard>
            <template #header>
              <span>{{ t('pages.insights.topProviders') }}</span>
            </template>
            <NSpace vertical :size="8">
              <div
                v-if="topProvidersWithShare.length === 0"
                style="text-align: center; padding: 24px;"
              >
                <NText depth="3">{{ t('pages.insights.empty') }}</NText>
              </div>
              <div
                v-for="(p, idx) in topProvidersWithShare"
                :key="p.provider || idx"
                style="padding: 8px 0;"
              >
                <NSpace justify="space-between" :size="4" style="margin-bottom: 4px;">
                  <NText strong style="font-size: 13px;">{{ p.provider || t('pages.insights.unknown') }}</NText>
                  <NText style="font-size: 12px;">{{ formatTokens(p.totals.totalTokens) }}</NText>
                </NSpace>
                <NProgress type="line" :percentage="Math.round(p.share)" :height="6" :show-indicator="false" />
              </div>
            </NSpace>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Top tools -->
      <NCard v-if="insightsStore.topTools.length > 0">
        <template #header>
          <span>{{ t('pages.insights.topTools') }}</span>
        </template>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          <NTag
            v-for="tool in insightsStore.topTools"
            :key="tool.name"
            size="medium"
            :bordered="false"
          >
            {{ tool.name }}
            <NText depth="3" style="font-size: 11px; margin-left: 4px;">{{ tool.count }}</NText>
          </NTag>
        </div>
      </NCard>

      <!-- Agents/Channels breakdown -->
      <NGrid
        v-if="insightsStore.topAgents.length > 0 || insightsStore.topChannels.length > 0"
        cols="1 m:2"
        responsive="screen"
        :x-gap="16"
        :y-gap="16"
      >
        <NGridItem v-if="insightsStore.topAgents.length > 0">
          <NCard>
            <template #header>
              <span>{{ t('pages.insights.topAgents') }}</span>
            </template>
            <NSpace vertical :size="6">
              <div
                v-for="(a, idx) in insightsStore.topAgents"
                :key="a.agentId || idx"
                class="rank-row"
              >
                <div class="rank-index">{{ idx + 1 }}</div>
                <div class="rank-info">
                  <NText strong style="font-size: 13px;">{{ a.agentId || t('pages.insights.unknown') }}</NText>
                </div>
                <div class="rank-metric">
                  <NText style="font-size: 13px;">{{ formatTokens(a.totals.totalTokens) }}</NText>
                </div>
              </div>
            </NSpace>
          </NCard>
        </NGridItem>
        <NGridItem v-if="insightsStore.topChannels.length > 0">
          <NCard>
            <template #header>
              <span>{{ t('pages.insights.topChannels') }}</span>
            </template>
            <NSpace vertical :size="6">
              <div
                v-for="(c, idx) in insightsStore.topChannels"
                :key="c.channel || idx"
                class="rank-row"
              >
                <div class="rank-index">{{ idx + 1 }}</div>
                <div class="rank-info">
                  <NText strong style="font-size: 13px;">{{ c.channel || t('pages.insights.unknown') }}</NText>
                </div>
                <div class="rank-metric">
                  <NText style="font-size: 13px;">{{ formatTokens(c.totals.totalTokens) }}</NText>
                </div>
              </div>
            </NSpace>
          </NCard>
        </NGridItem>
      </NGrid>
  </NSpace>
</template>

<style scoped>
.trend-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 180px;
  padding: 0 8px;
}

.trend-bar-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.trend-bar-value {
  font-size: 10px;
  color: var(--n-text-color-3);
  margin-bottom: 4px;
}

.trend-bar-container {
  flex: 1;
  display: flex;
  align-items: flex-end;
  width: 100%;
  min-height: 20px;
}

.trend-bar {
  width: 100%;
  background: linear-gradient(180deg, #63e2b7, #4ac292);
  border-radius: 4px 4px 0 0;
  min-height: 2px;
  transition: height 0.3s ease;
}

.trend-bar-date {
  font-size: 11px;
  color: var(--n-text-color-3);
  margin-top: 6px;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--n-border-color);
}

.rank-row:last-child {
  border-bottom: none;
}

.rank-index {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--n-color-embedded);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--n-text-color-2);
}

.rank-info {
  flex: 1;
  min-width: 0;
}

.rank-metric {
  text-align: right;
  flex-shrink: 0;
}
</style>
