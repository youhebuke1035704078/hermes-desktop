# Dashboard openclaw Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `DashboardPage.vue` to mirror openclaw-desktop's Dashboard.vue visual language while preserving v0.4.4 time-range filter data flow; drop Recent Conversations / Cron Runs / Server Info modules per user directive.

**Architecture:** Pure UI refactor — no data model changes. Existing `buildHermesRestUsageData` + `tokenUsageHistory` feed the new layout unchanged. New computeds + SVG chart ported from openclaw. Scoped styles replace the inline `style=""` attrs.

**Tech Stack:** Vue 3 `<script setup>`, Pinia stores (already present), naive-ui (NCard/NGrid/NButton/NTag/NSpin/NAlert/NSpace), SVG for trend, scoped CSS, vue-i18n.

**Spec:** `docs/superpowers/specs/2026-04-16-dashboard-openclaw-redesign-design.md`

---

### Task 1: Extend i18n with new keys, mark deprecated ones as dead

**Files:**
- Modify: `src/renderer/src/i18n/messages/zh-CN.ts:969-1111`
- Modify: `src/renderer/src/i18n/messages/en-US.ts` (corresponding dashboard section)

Inspection shows many needed keys already exist (`hero.title/subtitle`, `connection.*`, `lastUpdated.*`, `usage.coverage.*`, `cards.trend/structure/top`, `kpis.messages/activeDays`, `top.models`, `trend.empty/pointTitle`, `stats.sessions/cronJobs/totalTokens`). Only net-new keys needed:

- [ ] **Step 1: Add net-new keys to `zh-CN.ts`**

Add inside `pages.dashboard`:

```typescript
// under pages.dashboard.stats (after `skills: '已安装技能'`)
modelsSeen: '见过的模型数',

// under pages.dashboard.kpis (after activeDays block)
totalTokens: {
  label: '总 Token',
  hint: '范围内累计 token 消耗',
},
lastUsed: {
  label: '最近使用',
  hint: '最近一次产生 token 的时间',
  never: '尚未使用',
},
```

Also update `kpis.activeDays.hint` from existing `'已选范围 {days} 天'` to `'已选范围内 {days} 天有记录'` (the current string implies total days in range; we want days *with* usage).

- [ ] **Step 2: Add net-new keys to `en-US.ts`**

Mirror the zh-CN additions:

```typescript
modelsSeen: 'Models Seen',

totalTokens: {
  label: 'Total Tokens',
  hint: 'Cumulative tokens in range',
},
lastUsed: {
  label: 'Last Used',
  hint: 'Most recent token-consuming turn',
  never: 'Never',
},
```

And `kpis.activeDays.hint`: `'{days} days with activity in range'`.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS (existing, no regression).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/messages/zh-CN.ts src/renderer/src/i18n/messages/en-US.ts
git commit -m "i18n(dashboard): add modelsSeen/totalTokens/lastUsed keys for openclaw redesign"
```

---

### Task 2: Rewrite DashboardPage.vue script block — computeds & helpers

**Files:**
- Modify: `src/renderer/src/views/dashboard/DashboardPage.vue:1-209` (script section)

This task replaces the existing script with a new structure that keeps v0.4.4 data flow (filter preset → `buildHermesRestUsageData`) and adds openclaw-style computeds. Template is rewritten in Task 3.

- [ ] **Step 1: Replace script block**

Overwrite lines 1-209 with the following. (Note: the entire file is being rewritten in two steps — script now, template+style in Task 3. Preserve line 210 `</script>` and everything below.)

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NCard, NGrid, NGridItem, NText, NSpace, NButton, NIcon, NTag,
  NSpin, NAlert,
} from 'naive-ui'
import { GridOutline, RefreshOutline, ChatboxEllipsesOutline } from '@vicons/ionicons5'
import { useHermesChatStore } from '@/stores/hermes-chat'
import { buildHermesRestUsageData, type UsageFilter } from '@/stores/hermes-rest-usage'
import { useCronStore } from '@/stores/cron'
import { useConnectionStore } from '@/stores/connection'
import { useWebSocketStore } from '@/stores/websocket'
import { formatRelativeTime } from '@/utils/format'
import type { SessionsUsageResult } from '@/api/types'

type RangePreset = 'all' | 'today' | 'yesterday' | '7d' | '15d' | '30d'

const { t } = useI18n()
const router = useRouter()
const hermesChatStore = useHermesChatStore()
const cronStore = useCronStore()
const connectionStore = useConnectionStore()
const wsStore = useWebSocketStore()

// ── Basic state ──
const usageData = ref<SessionsUsageResult | null>(null)
const usageLoading = ref(false)
const usageError = ref<string | null>(null)
const lastUpdatedAt = ref<number | null>(null)
const rangePreset = ref<RangePreset>('all')

const isHermesRest = computed(() => connectionStore.serverType === 'hermes-rest')

// ── Stat row computeds ──
const totalConversations = computed(() => hermesChatStore.conversations.length)
const totalJobs = computed(() => cronStore.jobs.length)
const enabledJobs = computed(() => cronStore.jobs.filter(j => j.enabled).length)

const modelsSeen = computed(() => {
  const set = new Set<string>()
  for (const c of hermesChatStore.conversations) {
    const m = c.resolvedModel || c.model
    if (m) set.add(m)
  }
  return set.size
})

const totalTokens = computed(() => usageData.value?.totals?.totalTokens || 0)
const inputTokens = computed(() => usageData.value?.totals?.input || 0)
const outputTokens = computed(() => usageData.value?.totals?.output || 0)

// ── Hero card computeds ──
const connectionLabel = computed(() => {
  switch (connectionStore.status) {
    case 'connected': return t('pages.dashboard.connection.connected')
    case 'connecting': return t('pages.dashboard.connection.connecting')
    case 'reconnecting': return t('pages.dashboard.connection.reconnecting')
    case 'failed': return t('pages.dashboard.connection.failed')
    default: return t('pages.dashboard.connection.disconnected')
  }
})

const connectionType = computed<'success' | 'warning' | 'error' | 'default'>(() => {
  switch (connectionStore.status) {
    case 'connected': return 'success'
    case 'connecting':
    case 'reconnecting': return 'warning'
    case 'failed': return 'error'
    default: return 'default'
  }
})

const coverageText = computed(() => {
  const total = hermesChatStore.conversations.length
  const withUsage = hermesChatStore.conversations.filter(
    c => (c.tokenUsage?.totalInput || 0) + (c.tokenUsage?.totalOutput || 0) > 0,
  ).length
  if (total === 0) return t('pages.dashboard.usage.coverage.none')
  return t('pages.dashboard.usage.coverage.text', { withUsage, total })
})

const lastUpdatedText = computed(() => {
  if (!lastUpdatedAt.value) return t('pages.dashboard.lastUpdated.none')
  return t('pages.dashboard.lastUpdated.text', { time: formatRelativeTime(lastUpdatedAt.value) })
})

// ── KPI computeds ──
const lastUsedMs = computed(() => {
  let max = 0
  for (const c of hermesChatStore.conversations) {
    const history = c.tokenUsageHistory
    if (!history) continue
    for (const entry of history) {
      if (entry.ts > max) max = entry.ts
    }
  }
  return max
})

const activeDays = computed(() => {
  const daily = usageData.value?.aggregates?.daily
  if (daily && daily.length > 0) return daily.length
  // No filter / 'all' preset: count distinct YMD across all history
  const dates = new Set<string>()
  for (const c of hermesChatStore.conversations) {
    for (const entry of c.tokenUsageHistory || []) {
      dates.add(tsToYmd(entry.ts))
    }
  }
  return dates.size
})

const kpiCells = computed(() => [
  {
    key: 'messages',
    label: t('pages.dashboard.kpis.messages.label'),
    value: formatCompact(usageData.value?.aggregates?.messages?.total || 0),
    hint: t('pages.dashboard.kpis.messages.hint', { days: activeDays.value }),
  },
  {
    key: 'totalTokens',
    label: t('pages.dashboard.kpis.totalTokens.label'),
    value: formatTokens(totalTokens.value),
    hint: t('pages.dashboard.kpis.totalTokens.hint'),
  },
  {
    key: 'activeDays',
    label: t('pages.dashboard.kpis.activeDays.label'),
    value: String(activeDays.value),
    hint: t('pages.dashboard.kpis.activeDays.hint', { days: activeDays.value }),
  },
  {
    key: 'lastUsed',
    label: t('pages.dashboard.kpis.lastUsed.label'),
    value: lastUsedMs.value > 0
      ? formatRelativeTime(lastUsedMs.value)
      : t('pages.dashboard.kpis.lastUsed.never'),
    hint: t('pages.dashboard.kpis.lastUsed.hint'),
  },
])

// ── Trend chart ──
const dailyTrend = computed(() => usageData.value?.aggregates?.daily || [])
const showDailyTrend = computed(() => !isHermesRest.value || dailyTrend.value.length > 0)

const trendSeries = computed(() =>
  dailyTrend.value.map(item => ({
    date: item.date,
    value: item.tokens,
    messages: item.messages,
    errors: item.errors,
  })),
)

const trendGeometry = computed(() => {
  const width = 760
  const height = 240
  const left = 56
  const right = 18
  const top = 18
  const bottom = 44
  const series = trendSeries.value
  const usableWidth = width - left - right
  const usableHeight = height - top - bottom
  const maxValue = Math.max(...series.map(item => item.value), 0, 1)

  const points = series.map((item, index) => {
    const x =
      series.length === 1
        ? left + usableWidth / 2
        : left + (index / (series.length - 1)) * usableWidth
    const y = top + usableHeight - (item.value / maxValue) * usableHeight
    return { ...item, x, y }
  })

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ')
  const areaPath = points.length > 1
    ? `M ${points[0]!.x} ${top + usableHeight} L ${points.map(p => `${p.x} ${p.y}`).join(' L ')} L ${points[points.length - 1]!.x} ${top + usableHeight} Z`
    : ''
  const guides = [0, 0.25, 0.5, 0.75, 1].map(ratio => ({
    ratio,
    y: top + usableHeight - usableHeight * ratio,
    value: maxValue * ratio,
  }))

  return {
    width, height, left, right, top, bottom,
    usableWidth, usableHeight, maxValue,
    points, polyline, areaPath, guides,
  }
})

const trendAxisLabels = computed(() => {
  if (trendSeries.value.length === 0) return { start: '-', mid: '-', end: '-' }
  const start = trendSeries.value[0]
  const mid = trendSeries.value[Math.floor((trendSeries.value.length - 1) / 2)]
  const end = trendSeries.value[trendSeries.value.length - 1]
  return {
    start: start?.date.slice(5) || '-',
    mid: mid?.date.slice(5) || '-',
    end: end?.date.slice(5) || '-',
  }
})

const trendSvgRef = ref<SVGSVGElement | null>(null)
const trendHoverIndex = ref<number | null>(null)
const trendTooltipStyle = ref<Record<string, string> | null>(null)

const hoveredTrendPoint = computed(() => {
  const idx = trendHoverIndex.value
  if (idx === null) return null
  return trendGeometry.value.points[idx] || null
})

const hoveredTrendText = computed(() => {
  const p = hoveredTrendPoint.value
  if (!p) return ''
  return t('pages.dashboard.trend.pointTitle', {
    date: p.date,
    value: formatTokens(p.value),
    messages: p.messages,
    errors: p.errors,
  })
})

function clearTrendHover() {
  trendHoverIndex.value = null
  trendTooltipStyle.value = null
}

function handleTrendMouseMove(event: MouseEvent) {
  const svg = trendSvgRef.value
  const points = trendGeometry.value.points
  if (!svg || points.length === 0) { clearTrendHover(); return }
  const firstPoint = points[0]
  if (!firstPoint) { clearTrendHover(); return }
  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) { clearTrendHover(); return }

  const svgX = ((event.clientX - rect.left) / rect.width) * trendGeometry.value.width
  const plotMin = trendGeometry.value.left
  const plotMax = trendGeometry.value.left + trendGeometry.value.usableWidth
  if (svgX < plotMin || svgX > plotMax) { clearTrendHover(); return }

  let nearestIndex = 0
  let nearestDist = Math.abs(firstPoint.x - svgX)
  for (let i = 1; i < points.length; i++) {
    const cand = points[i]
    if (!cand) continue
    const d = Math.abs(cand.x - svgX)
    if (d < nearestDist) { nearestDist = d; nearestIndex = i }
  }

  const point = points[nearestIndex]
  if (!point) { clearTrendHover(); return }
  trendHoverIndex.value = nearestIndex

  const pxX = (point.x / trendGeometry.value.width) * rect.width
  const pxY = (point.y / trendGeometry.value.height) * rect.height
  const tw = 340
  const th = 36
  const margin = 8
  let left = pxX + 12
  let top = pxY - 10 - th
  if (left + tw > rect.width - margin) left = pxX - 12 - tw
  left = Math.max(margin, Math.min(left, rect.width - tw - margin))
  if (top < margin) top = pxY + 10
  top = Math.max(margin, Math.min(top, rect.height - th - margin))
  trendTooltipStyle.value = { left: `${left}px`, top: `${top}px` }
}

// ── Top models ──
const topModels = computed(() => {
  const models = usageData.value?.aggregates?.byModel || []
  return [...models]
    .sort((a, b) => b.totals.totalTokens - a.totals.totalTokens)
    .slice(0, 5)
})

const topModelMax = computed(() =>
  Math.max(...topModels.value.map(m => m.totals.totalTokens), 0),
)

// ── Range preset logic (preserved from v0.4.4) ──
function buildFilterFromPreset(preset: RangePreset): UsageFilter | undefined {
  if (preset === 'all') return undefined
  const now = new Date()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 24 * 60 * 60 * 1000
  switch (preset) {
    case 'today': return { startTs: startOfToday, endTs: endOfToday }
    case 'yesterday': return { startTs: startOfToday - day, endTs: startOfToday - 1 }
    case '7d': return { startTs: startOfToday - 6 * day, endTs: endOfToday }
    case '15d': return { startTs: startOfToday - 14 * day, endTs: endOfToday }
    case '30d': return { startTs: startOfToday - 29 * day, endTs: endOfToday }
  }
}

function setRangePreset(preset: RangePreset) {
  rangePreset.value = preset
  if (isHermesRest.value) {
    usageData.value = buildHermesRestUsageData(
      hermesChatStore.conversations,
      buildFilterFromPreset(preset),
    )
    lastUpdatedAt.value = Date.now()
  }
}

watch(
  () => [hermesChatStore.conversations.length, hermesChatStore.activeConversation?.updatedAt],
  () => {
    if (isHermesRest.value) {
      usageData.value = buildHermesRestUsageData(
        hermesChatStore.conversations,
        buildFilterFromPreset(rangePreset.value),
      )
    }
  },
)

// ── Format helpers ──
function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function formatCompact(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)
}

function tsToYmd(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function segmentWidth(value: number): string {
  const total = inputTokens.value + outputTokens.value
  if (total <= 0 || value <= 0) return '0%'
  return `${(value / total) * 100}%`
}

function topBarWidth(value: number, max: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return '0%'
  return `${Math.min(Math.max((value / max) * 100, 8), 100)}%`
}

// ── Actions ──
async function fetchUsageData() {
  if (isHermesRest.value) {
    usageData.value = buildHermesRestUsageData(
      hermesChatStore.conversations,
      buildFilterFromPreset(rangePreset.value),
    )
    usageError.value = null
    lastUpdatedAt.value = Date.now()
    return
  }
  usageLoading.value = true
  usageError.value = null
  try {
    const result = await wsStore.rpc.getSessionsUsage({ limit: 500 })
    usageData.value = result
    lastUpdatedAt.value = Date.now()
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

function goSessions() { router.push({ name: 'Sessions' }) }
function goCron() { router.push({ name: 'Cron' }) }
function goChat() { router.push({ name: 'Chat' }) }

onMounted(() => {
  if (cronStore.jobs.length === 0) cronStore.fetchJobs()
  fetchUsageData()
})
</script>
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (the template references below in Task 3 will be added next; template block from previous version will error until Task 3 is complete, so note: run typecheck AFTER Task 3 Step 1, not after Task 2 Step 1).

Skip this step; verification runs at end of Task 3.

- [ ] **Step 3: Do NOT commit yet**

Leave uncommitted; template still references removed computeds. Commit happens at end of Task 3.

---

### Task 3: Rewrite DashboardPage.vue template and styles

**Files:**
- Modify: `src/renderer/src/views/dashboard/DashboardPage.vue:210-530` (template + style)

- [ ] **Step 1: Replace template and style blocks**

Overwrite from line 210 onward (replace everything from `</script>` onward with the below, including the closing `</script>`, new `<template>`, and `<style scoped>`):

```vue
</script>

<template>
  <NSpin :show="usageLoading">
    <div class="dashboard-page">
      <!-- Hero card -->
      <NCard class="dashboard-hero" :bordered="false">
        <div class="dashboard-hero-top">
          <div>
            <div class="dashboard-hero-title">{{ t('pages.dashboard.hero.title') }}</div>
            <div class="dashboard-hero-subtitle">
              {{ t('pages.dashboard.hero.subtitle') }}
            </div>
          </div>
          <NSpace :size="8" wrap>
            <NTag :type="connectionType" round :bordered="false">{{ connectionLabel }}</NTag>
            <NTag type="info" round :bordered="false">{{ coverageText }}</NTag>
            <NTag round :bordered="false">{{ lastUpdatedText }}</NTag>
          </NSpace>
        </div>

        <NSpace :size="8" wrap class="dashboard-filters-row">
          <NButton size="small" :type="rangePreset === 'today' ? 'primary' : 'default'" secondary @click="setRangePreset('today')">{{ t('pages.dashboard.range.today') }}</NButton>
          <NButton size="small" :type="rangePreset === 'yesterday' ? 'primary' : 'default'" secondary @click="setRangePreset('yesterday')">{{ t('pages.dashboard.range.yesterday') }}</NButton>
          <NButton size="small" :type="rangePreset === '7d' ? 'primary' : 'default'" secondary @click="setRangePreset('7d')">{{ t('pages.dashboard.range.last7d') }}</NButton>
          <NButton size="small" :type="rangePreset === '15d' ? 'primary' : 'default'" secondary @click="setRangePreset('15d')">{{ t('pages.dashboard.range.last15d') }}</NButton>
          <NButton size="small" :type="rangePreset === '30d' ? 'primary' : 'default'" secondary @click="setRangePreset('30d')">{{ t('pages.dashboard.range.last30d') }}</NButton>
          <NButton size="small" :type="rangePreset === 'all' ? 'primary' : 'default'" secondary @click="setRangePreset('all')">{{ t('pages.dashboard.range.all') }}</NButton>

          <NButton type="primary" size="small" :loading="usageLoading || cronStore.loading" @click="handleRefresh">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('common.refresh') }}
          </NButton>
          <NButton secondary size="small" @click="goChat">
            <template #icon><NIcon :component="ChatboxEllipsesOutline" /></template>
            {{ t('routes.chat') }}
          </NButton>
          <NButton secondary size="small" @click="goSessions">{{ t('routes.sessions') }}</NButton>
          <NButton secondary size="small" @click="goCron">{{ t('routes.cron') }}</NButton>
        </NSpace>

        <NAlert v-if="usageError" type="warning" :bordered="false" style="margin-top: 10px;">
          {{ t('pages.dashboard.usage.error', { error: usageError }) }}
        </NAlert>
      </NCard>

      <!-- Stat row (4 cards) -->
      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem>
          <div class="stat-card">
            <NText depth="3" class="stat-label">{{ t('pages.dashboard.metrics.conversations') }}</NText>
            <div class="stat-value">{{ totalConversations }}</div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-card">
            <NText depth="3" class="stat-label">{{ t('pages.dashboard.metrics.cronJobs') }}</NText>
            <div class="stat-value">
              {{ totalJobs }}
              <NText type="success" class="stat-value-sub"> {{ enabledJobs }} {{ t('pages.dashboard.metrics.enabled') }}</NText>
            </div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-card">
            <NText depth="3" class="stat-label">{{ t('pages.dashboard.stats.modelsSeen') }}</NText>
            <div class="stat-value">{{ modelsSeen }}</div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-card">
            <NText depth="3" class="stat-label">{{ t('pages.dashboard.stats.totalTokens') }}</NText>
            <div class="stat-value">{{ formatTokens(totalTokens) }}</div>
          </div>
        </NGridItem>
      </NGrid>

      <!-- KPI grid -->
      <NCard :title="t('pages.dashboard.cards.kpis')" class="dashboard-card">
        <div class="kpi-grid">
          <div v-for="kpi in kpiCells" :key="kpi.key" class="kpi-card">
            <NText depth="3" class="kpi-label">{{ kpi.label }}</NText>
            <div class="kpi-value">{{ kpi.value }}</div>
            <NText depth="3" class="kpi-hint">{{ kpi.hint }}</NText>
          </div>
        </div>
      </NCard>

      <!-- Trend (2/3) + Structure (1/3) -->
      <NGrid cols="1 l:3" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem v-if="showDailyTrend" :span="2" class="usage-trend-item">
          <NCard :title="t('pages.dashboard.cards.trend')" class="dashboard-card usage-trend-card">
            <template #header-extra>
              <NSpace :size="8" align="center">
                <NTag size="small" :bordered="false" round>
                  {{ formatTokens(totalTokens) }}
                </NTag>
              </NSpace>
            </template>

            <div class="trend-chart-panel">
              <template v-if="trendGeometry.points.length">
                <div class="trend-chart-canvas">
                  <svg
                    ref="trendSvgRef"
                    class="trend-chart-svg"
                    :viewBox="`0 0 ${trendGeometry.width} ${trendGeometry.height}`"
                    preserveAspectRatio="none"
                    @mousemove="handleTrendMouseMove"
                    @mouseleave="clearTrendHover"
                  >
                    <g v-for="guide in trendGeometry.guides" :key="`guide-${guide.ratio}`">
                      <line
                        :x1="trendGeometry.left"
                        :y1="guide.y"
                        :x2="trendGeometry.left + trendGeometry.usableWidth"
                        :y2="guide.y"
                        class="trend-grid-line"
                      />
                      <text x="4" :y="guide.y + 4" class="trend-grid-label">
                        {{ formatTokens(guide.value) }}
                      </text>
                    </g>

                    <path v-if="trendGeometry.areaPath" class="trend-area" :d="trendGeometry.areaPath" />
                    <polyline v-if="trendGeometry.polyline" class="trend-line" :points="trendGeometry.polyline" />
                    <line
                      v-if="hoveredTrendPoint"
                      class="trend-hover-line"
                      :x1="hoveredTrendPoint.x"
                      :y1="trendGeometry.top"
                      :x2="hoveredTrendPoint.x"
                      :y2="trendGeometry.top + trendGeometry.usableHeight"
                    />
                    <circle
                      v-for="point in trendGeometry.points"
                      :key="`point-${point.date}`"
                      class="trend-point"
                      :class="{ 'trend-point-active': hoveredTrendPoint?.date === point.date }"
                      :cx="point.x"
                      :cy="point.y"
                      :r="hoveredTrendPoint?.date === point.date ? 6 : 3.5"
                    />
                  </svg>

                  <div v-if="hoveredTrendPoint && trendTooltipStyle" class="trend-tooltip" :style="trendTooltipStyle">
                    {{ hoveredTrendText }}
                  </div>
                </div>

                <div class="trend-axis-note">
                  <span>{{ trendAxisLabels.start }}</span>
                  <span>{{ trendAxisLabels.mid }}</span>
                  <span>{{ trendAxisLabels.end }}</span>
                </div>
              </template>
              <div v-else class="daily-empty">{{ t('pages.dashboard.trend.empty') }}</div>
            </div>
          </NCard>
        </NGridItem>

        <NGridItem :span="showDailyTrend ? 1 : 3" class="usage-structure-item">
          <NCard :title="t('pages.dashboard.cards.structure')" class="dashboard-card usage-structure-card">
            <NSpace justify="space-between" align="center" style="margin-bottom: 8px;">
              <NText depth="3">{{ t('pages.dashboard.usage.totalTokens') }}</NText>
              <NText strong>{{ formatTokens(totalTokens) }}</NText>
            </NSpace>

            <div class="segment-track">
              <div
                class="segment-item"
                :style="{ width: segmentWidth(inputTokens), background: '#60a5fa' }"
              />
              <div
                class="segment-item"
                :style="{ width: segmentWidth(outputTokens), background: '#4ade80' }"
              />
            </div>

            <div class="segment-list">
              <div class="segment-row">
                <div class="segment-row-label">
                  <span class="segment-dot" :style="{ background: '#60a5fa' }" />
                  <span>{{ t('pages.dashboard.usage.segments.input') }}</span>
                </div>
                <NText>{{ formatTokens(inputTokens) }}</NText>
              </div>
              <div class="segment-row">
                <div class="segment-row-label">
                  <span class="segment-dot" :style="{ background: '#4ade80' }" />
                  <span>{{ t('pages.dashboard.usage.segments.output') }}</span>
                </div>
                <NText>{{ formatTokens(outputTokens) }}</NText>
              </div>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Top Models (full width) -->
      <NCard :title="t('pages.dashboard.top.models')" class="dashboard-card">
        <div v-if="topModels.length" class="top-list">
          <div v-for="(item, index) in topModels" :key="`model-${index}`" class="top-row">
            <div class="top-row-main">
              <span>{{ item.model || '-' }}</span>
              <span>{{ formatTokens(item.totals.totalTokens) }}</span>
            </div>
            <div class="top-row-bar">
              <div
                class="top-row-bar-inner"
                :style="{ width: topBarWidth(item.totals.totalTokens, topModelMax) }"
              />
            </div>
          </div>
        </div>
        <div v-else class="top-empty">{{ t('common.empty') }}</div>
      </NCard>
    </div>
  </NSpin>
</template>

<style scoped>
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dashboard-card {
  border-radius: 10px;
}

.dashboard-hero {
  border-radius: 10px;
  background:
    radial-gradient(circle at 84% 16%, rgba(24, 160, 88, 0.22), transparent 36%),
    linear-gradient(120deg, var(--n-card-color, #ffffff), rgba(42, 127, 255, 0.08));
  border: 1px solid rgba(42, 127, 255, 0.18);
}

.dashboard-hero-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.dashboard-hero-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.dashboard-hero-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: var(--n-text-color-3, #999);
  line-height: 1.55;
}

.dashboard-filters-row {
  align-items: center;
}

.stat-card {
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--n-card-color);
}

.stat-label {
  font-size: 12px;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  margin-top: 6px;
  line-height: 1.2;
}

.stat-value-sub {
  font-size: 12px;
  font-weight: 400;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.kpi-card {
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  background: linear-gradient(130deg, rgba(42, 127, 255, 0.08), rgba(24, 160, 88, 0.06));
  padding: 10px 12px;
}

.kpi-label {
  font-size: 12px;
}

.kpi-value {
  margin: 4px 0;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

.kpi-hint {
  font-size: 12px;
}

.usage-trend-item,
.usage-structure-item {
  display: flex;
}

.usage-trend-card,
.usage-structure-card {
  width: 100%;
  height: 100%;
}

.usage-trend-card :deep(.n-card__content),
.usage-structure-card :deep(.n-card__content) {
  height: 100%;
}

.usage-structure-card :deep(.n-card__content) {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.trend-chart-panel {
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 10px;
  background: linear-gradient(180deg, rgba(42, 127, 255, 0.06), transparent 38%);
}

.trend-chart-canvas {
  position: relative;
}

.trend-chart-svg {
  width: 100%;
  height: 250px;
  cursor: crosshair;
}

.trend-grid-line {
  stroke: var(--n-border-color);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.trend-grid-label {
  fill: var(--n-text-color-3, #999);
  font-size: 11px;
}

.trend-area {
  fill: rgba(42, 127, 255, 0.2);
}

.trend-line {
  fill: none;
  stroke: #2a7fff;
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.trend-hover-line {
  stroke: rgba(42, 127, 255, 0.6);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.trend-point {
  fill: #18a058;
  stroke: rgba(24, 160, 88, 0.3);
  stroke-width: 3;
}

.trend-point-active {
  stroke: rgba(24, 160, 88, 0.45);
  stroke-width: 6;
}

.trend-tooltip {
  position: absolute;
  max-width: 340px;
  padding: 6px 10px;
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  background: var(--n-card-color);
  color: var(--n-text-color);
  font-size: 12px;
  line-height: 20px;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
}

.trend-axis-note {
  margin-top: 6px;
  display: flex;
  justify-content: space-between;
  color: var(--n-text-color-3, #999);
  font-size: 12px;
}

.daily-empty {
  font-size: 12px;
  color: var(--n-text-color-3, #999);
  padding: 10px 0;
  text-align: center;
}

.segment-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--n-color-embedded);
  display: flex;
}

.segment-item {
  min-width: 0;
  height: 100%;
}

.segment-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.segment-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.segment-row-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.segment-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.top-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.top-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.top-row-main {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.top-row-main span:first-child {
  max-width: 70%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-row-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--n-color-embedded);
  overflow: hidden;
}

.top-row-bar-inner {
  height: 100%;
  border-radius: 999px;
  min-width: 0;
  background: linear-gradient(90deg, rgba(42, 127, 255, 0.9), rgba(42, 127, 255, 0.45));
}

.top-empty {
  font-size: 12px;
  color: var(--n-text-color-3, #999);
  text-align: center;
  padding: 16px 0;
}

@media (max-width: 900px) {
  .dashboard-filters-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. If fails, inspect error; likely cause: missing i18n key → add to zh-CN.ts and en-US.ts.

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: `148 passed | 0 failed` (no test changes, data model unchanged).

- [ ] **Step 4: Manual visual verification**

Run `pnpm dev` and verify:
1. Dashboard loads without console errors.
2. Hero card shows title + subtitle + 3 tags (connection, coverage, last-updated).
3. 6 range preset pills work; clicking updates tags and trend chart.
4. 4 stat cards show correct counts.
5. 4 KPI cards populate (Messages, Total Tokens, Active Days, Last Used).
6. With preset other than `all`, trend chart shows SVG line + area + grid lines.
7. Hovering trend chart shows a dashed vertical guide + larger point + tooltip pinned inside card.
8. Structure card shows 2-segment bar sized by input/output proportion + legend rows.
9. Top Models card shows gradient bars sized by proportion.
10. Alert renders if fetchUsageData fails (e.g. disconnect Hermes and refresh).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/views/dashboard/DashboardPage.vue
git commit -m "feat(dashboard): rewrite to mirror openclaw-desktop layout

- Hero card with gradient + connection/coverage/last-updated tags
- 4-card stat row (conversations/cron/models-seen/total-tokens)
- 4-KPI grid (messages/total-tokens/active-days/last-used)
- SVG trend chart with hover tooltip (ported from openclaw)
- 2-segment structure bar (input/output only)
- Top Models card with gradient bars
- Dropped: Recent Conversations, Recent Cron Runs, Server Info

Refs: docs/superpowers/specs/2026-04-16-dashboard-openclaw-redesign-design.md"
```

---

### Task 4: Version bump + finish

**Files:**
- Modify: `package.json` (version field)
- Modify: `CHANGELOG.md` (if present; otherwise skip)

- [ ] **Step 1: Bump version**

Edit `package.json`: change `"version": "0.4.4"` to `"version": "0.5.0"`.

- [ ] **Step 2: Commit version bump**

```bash
git add package.json
git commit -m "chore: bump version to 0.5.0"
```

- [ ] **Step 3: Final verification**

Run: `pnpm typecheck && pnpm test`
Expected: Both pass.

- [ ] **Step 4: Handoff**

Report completion to user. Do NOT create a release automatically — user will review the visual changes first and trigger release manually.

---

## Self-review notes

**Spec coverage:** Each spec section (§3 layout, §4.1-4.6 components, §5 script changes, §6 i18n, §7 CSS) maps to at least one task step. ✅

**Placeholder scan:** No TBDs; all CSS blocks, code blocks, file paths are concrete.

**Type consistency:**
- `RangePreset` defined once in Task 2 Step 1.
- `usageData` typed as `SessionsUsageResult | null` — same as v0.4.4.
- `TokenUsageEntry.ts` read in Task 2 Step 1 `lastUsedMs` — matches type from `hermes-chat.ts` (already imported transitively via `HermesConversation`).
- `totalConversations`, `totalJobs`, `enabledJobs`, `modelsSeen`, `totalTokens`, `inputTokens`, `outputTokens`, `kpiCells`, `topModels`, `topModelMax`, `trendGeometry`, `trendSeries`, `trendAxisLabels`, `hoveredTrendPoint`, `hoveredTrendText` all defined in Task 2 Step 1 and referenced in Task 3 Step 1 template — names consistent.
- `handleRefresh`, `setRangePreset`, `handleTrendMouseMove`, `clearTrendHover`, `goChat`, `goSessions`, `goCron`, `formatTokens`, `segmentWidth`, `topBarWidth` — all defined Task 2, used Task 3. ✅

**Potentially missing imports:** `ChatboxEllipsesOutline` is imported in Task 2 Step 1 — confirmed vicons has it (openclaw uses it too).

**CSS var fallbacks:** Used `var(--n-border-color)`, `var(--n-text-color-3)`, `var(--n-card-color)`, `var(--n-color-embedded)` — these are the naive-ui runtime theme vars, which hermes uses elsewhere in scoped styles (verified by grepping existing scoped styles). Fallback values provided where openclaw used its own `--border-color` etc.

**Uses of `NTooltip` removed:** The old token-breakdown bar used `<NTooltip>` wrappers; new structure bar doesn't. Import list in Task 2 Step 1 omits `NTooltip` accordingly. ✅
