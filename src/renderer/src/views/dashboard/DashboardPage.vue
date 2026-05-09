<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NGrid,
  NGridItem,
  NText,
  NSpace,
  NButton,
  NIcon,
  NTag,
  NSpin,
  NAlert
} from 'naive-ui'
import { RefreshOutline, ChatboxEllipsesOutline } from '@vicons/ionicons5'
import { useHermesChatStore } from '@/stores/hermes-chat'
import { buildHermesRestUsageData, type UsageFilter } from '@/stores/hermes-rest-usage'
import { useCronStore } from '@/stores/cron'
import { useSkillStore } from '@/stores/skill'
import { useOpsStore } from '@/stores/ops'
import { useConnectionStore } from '@/stores/connection'
import { useWebSocketStore } from '@/stores/websocket'
import { hermesRestGet } from '@/api/hermes-rest-client'
import { formatRelativeTime } from '@/utils/format'
import type { CronJob, SessionsUsageResult } from '@/api/types'

type RangePreset = 'all' | 'today' | 'yesterday' | '7d' | '15d' | '30d'
type HealthType = 'success' | 'warning' | 'error' | 'info' | 'default'

const { t } = useI18n()
const router = useRouter()
const hermesChatStore = useHermesChatStore()
const cronStore = useCronStore()
const skillStore = useSkillStore()
const opsStore = useOpsStore()
const connectionStore = useConnectionStore()
const wsStore = useWebSocketStore()

// ── Basic state ──
const usageData = ref<SessionsUsageResult | null>(null)
const usageLoading = ref(false)
const usageError = ref<string | null>(null)
const lastUpdatedAt = ref<number | null>(null)
const rangePreset = ref<RangePreset>('all')
const usageSectionRef = ref<HTMLElement | null>(null)
const healthCheckRunning = ref(false)
const healthCheckAt = ref<number | null>(null)
const healthCheckSummary = ref('')

const isHermesRest = computed(() => connectionStore.serverType === 'hermes-rest')

// ── Stat row computeds ──
const totalConversations = computed(() =>
  isHermesRest.value && usageData.value
    ? usageData.value.sessions.length
    : hermesChatStore.conversations.length
)
const totalJobs = computed(() => cronStore.jobs.length)
const enabledJobs = computed(() => cronStore.jobs.filter((j) => j.enabled).length)

const modelsSeen = computed(() => {
  if (isHermesRest.value && usageData.value) {
    return new Set(
      (usageData.value.aggregates?.byModel || []).map((item) => item.model).filter(Boolean)
    ).size
  }
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
const cacheReadTokens = computed(() => usageData.value?.totals?.cacheRead || 0)
const cacheWriteTokens = computed(() => usageData.value?.totals?.cacheWrite || 0)

// ── Health center ──
const runningJobs = computed(() => cronStore.jobs.filter((j) => j.state?.runningAtMs))
const failedJobs = computed(() =>
  cronStore.jobs.filter((j) => j.enabled && j.state?.lastStatus === 'error')
)
const disabledJobs = computed(() => cronStore.jobs.filter((j) => !j.enabled))

const currentModelLabel = computed(
  () =>
    connectionStore.hermesRealModel ||
    (isHermesRest.value ? '未知模型' : wsStore.gatewayVersion || '未知模型')
)

const priceJobs = computed(() =>
  cronStore.jobs.filter((job) =>
    /jd-tongrentang-price-watch|tongrentang|cron-health/i.test(job.name)
  )
)

function connectionStatusText(): string {
  switch (connectionStore.status) {
    case 'connected':
      return t('pages.dashboard.connection.connected')
    case 'connecting':
      return t('pages.dashboard.connection.connecting')
    case 'error':
      return t('pages.dashboard.connection.failed')
    default:
      return t('pages.dashboard.connection.disconnected')
  }
}

function connectionStatusType(): HealthType {
  switch (connectionStore.status) {
    case 'connected':
      return 'success'
    case 'connecting':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'default'
  }
}

const priceIssueCount = computed(
  () =>
    priceJobs.value.filter(
      (job) =>
        !job.enabled || job.state?.lastStatus === 'error' || job.state?.lastStatus === 'skipped'
    ).length
)

function findPriceStageJob(key: string) {
  const jobs = priceJobs.value
  if (key === 'gate')
    return jobs.find((job) => /verification-gate|验证门控|gate|07:20|07：20/i.test(job.name))
  if (key === 'daily') {
    return jobs.find(
      (job) =>
        /jd-tongrentang-price-watch/i.test(job.name) &&
        !/verification-gate|gate|backfill|watchdog|evening|alarm|backup|health/i.test(job.name)
    )
  }
  if (key === 'watchdog') return jobs.find((job) => /watchdog|11:00|11：00/i.test(job.name))
  if (key === 'backfill') return jobs.find((job) => /backfill|补录|17:00|17：00/i.test(job.name))
  if (key === 'alarm') return jobs.find((job) => /evening|alarm|告警|17:30|17：30/i.test(job.name))
  if (key === 'health') return jobs.find((job) => /cron-health|health|健康/i.test(job.name))
  if (key === 'backup') return jobs.find((job) => /backup|备份/i.test(job.name))
  return undefined
}

function stageType(job?: CronJob): HealthType {
  if (!job) return 'default'
  if (!job.enabled) return 'default'
  if (job.state?.lastStatus === 'error') return 'error'
  if (job.state?.lastStatus === 'skipped') return 'warning'
  if (job.state?.lastStatus === 'ok') return 'success'
  return 'default'
}

function stageLabel(job?: CronJob): string {
  if (!job) return '未配置'
  if (!job.enabled) return '停用'
  if (job.state?.lastStatus === 'error') return '失败'
  if (job.state?.lastStatus === 'skipped') return '跳过'
  if (job.state?.lastStatus === 'ok') return 'OK'
  return '等待'
}

function stageDetail(job: ReturnType<typeof findPriceStageJob>, fallback: string): string {
  if (!job) return fallback
  if (job.state?.lastError) return job.state.lastError
  return job.state?.lastRunAtMs ? `上次 ${formatRelativeTime(job.state.lastRunAtMs)}` : fallback
}

const priceTimelineStages = computed(() => {
  const defs = [
    { key: 'gate', time: '07:20', name: '验证门控', fallback: '京东快速验证检测。' },
    { key: 'daily', time: '07:30', name: '价格获取', fallback: '主采集任务。' },
    { key: 'watchdog', time: '11:00', name: '巡检', fallback: '上午缺口检查。' },
    { key: 'backfill', time: '17:00', name: '补录', fallback: '失败数据补采。' },
    { key: 'alarm', time: '17:30', name: '告警', fallback: '晚间通知。' },
    { key: 'health', time: '23:00', name: '健康检查', fallback: 'Cron 状态巡检。' },
    { key: 'backup', time: '03:00', name: '数据备份', fallback: 'SQLite 自动备份。' }
  ]
  return defs.map((def) => {
    const job = findPriceStageJob(def.key)
    return {
      ...def,
      type: stageType(job),
      status: stageLabel(job),
      detail: stageDetail(job, def.fallback)
    }
  })
})

const overallHealthType = computed<HealthType>(() => {
  if (connectionStore.status === 'error' || failedJobs.value.length > 0) return 'error'
  if (
    connectionStore.status !== 'connected' ||
    usageError.value ||
    disabledJobs.value.length > 0 ||
    priceIssueCount.value > 0
  )
    return 'warning'
  return 'success'
})

const overallHealthLabel = computed(() => {
  if (overallHealthType.value === 'success') return '健康'
  if (overallHealthType.value === 'error') return '需要处理'
  return '需关注'
})

const controlTowerTitle = computed(() => {
  if (overallHealthType.value === 'success') return '系统可用\n价格监控完整'
  if (overallHealthType.value === 'error') return '需要处理\n请先排障'
  return '系统可用\n有事项需关注'
})

const healthItems = computed(() => [
  {
    key: 'connection',
    title: '连接',
    value: connectionStatusText(),
    detail: connectionStore.currentServer?.url || '未选择服务器',
    type: connectionStatusType()
  },
  {
    key: 'model',
    title: '主模型',
    value: currentModelLabel.value,
    detail: connectionStore.hermesRealModel ? '已从服务器识别实际模型' : '等待模型探测结果',
    type: connectionStore.hermesRealModel ? ('success' as HealthType) : ('warning' as HealthType)
  },
  {
    key: 'cron',
    title: '任务计划',
    value: `${enabledJobs.value}/${totalJobs.value} 启用`,
    detail: failedJobs.value.length
      ? `${failedJobs.value.length} 个任务失败`
      : runningJobs.value.length
        ? `${runningJobs.value.length} 个任务运行中`
        : 'Cron 状态正常',
    type: failedJobs.value.length ? ('error' as HealthType) : ('success' as HealthType)
  },
  {
    key: 'usage',
    title: '运营用量',
    value: formatTokens(totalTokens.value),
    detail: usageError.value ? '远端统计不可用，使用本地兜底' : '统计接口可用',
    type: usageError.value ? ('warning' as HealthType) : ('success' as HealthType)
  },
  {
    key: 'price',
    title: '价格监控',
    value: `${priceJobs.value.length} 个任务`,
    detail:
      priceJobs.value.length === 0
        ? '未发现同仁堂价格监控任务'
        : priceIssueCount.value
          ? `${priceIssueCount.value} 个环节需关注`
          : '闭环任务正常',
    type:
      priceJobs.value.length === 0
        ? ('warning' as HealthType)
        : priceIssueCount.value
          ? ('warning' as HealthType)
          : ('success' as HealthType)
  }
])

const healthIssues = computed(() => {
  const issues: string[] = []
  if (connectionStore.status !== 'connected') issues.push('Hermes 连接未处于 connected 状态')
  if (!connectionStore.hermesRealModel) issues.push('尚未识别服务器实际主模型')
  if (failedJobs.value.length)
    issues.push(`Cron 有 ${failedJobs.value.length} 个启用任务最近执行失败`)
  if (usageError.value) issues.push(`运营统计接口异常：${usageError.value}`)
  if (priceJobs.value.length === 0)
    issues.push('未发现 jd-tongrentang-price-watch 自建价格监控任务')
  return issues
})

const actionItems = computed(() => {
  const actions: Array<{
    key: string
    title: string
    detail: string
    type: HealthType
    actionText: string
    target: 'settings' | 'cron' | 'price' | 'usage' | 'chat' | 'logs'
  }> = []

  if (connectionStore.status !== 'connected') {
    actions.push({
      key: 'connection',
      title: '恢复 Hermes 连接',
      detail: connectionStore.currentServer?.url || '当前未连接到可用服务器',
      type: connectionStatusType(),
      actionText: '检查连接',
      target: 'settings'
    })
  }
  if (!connectionStore.hermesRealModel) {
    actions.push({
      key: 'model',
      title: '确认主模型与凭据',
      detail: '服务器实际模型尚未识别，建议运行模型与凭据诊断',
      type: 'warning',
      actionText: '打开诊断',
      target: 'settings'
    })
  }
  if (failedJobs.value.length) {
    actions.push({
      key: 'cron',
      title: '处理失败任务',
      detail: `${failedJobs.value.length} 个启用任务最近执行失败`,
      type: 'error',
      actionText: '查看任务',
      target: 'cron'
    })
  }
  if (priceJobs.value.length === 0 || priceIssueCount.value > 0) {
    actions.push({
      key: 'price',
      title: '检查价格监控闭环',
      detail:
        priceJobs.value.length === 0
          ? '未发现价格监控任务'
          : `${priceIssueCount.value} 个环节需关注`,
      type: 'warning',
      actionText: '查看闭环',
      target: 'price'
    })
  }
  if (usageError.value) {
    actions.push({
      key: 'usage',
      title: '核对运营统计接口',
      detail: usageError.value,
      type: 'warning',
      actionText: '看用量统计',
      target: 'usage'
    })
  }

  if (actions.length === 0) {
    actions.push({
      key: 'ready',
      title: '主流程可用',
      detail: '连接、任务、模型和用量统计目前没有阻断项',
      type: 'success',
      actionText: '进入对话',
      target: 'chat'
    })
  }

  return actions.slice(0, 5)
})

const usageScopeRows = computed(() => [
  {
    label: '统计范围',
    value: {
      all: '全部历史',
      today: '今天',
      yesterday: '昨天',
      '7d': '最近 7 天',
      '15d': '最近 15 天',
      '30d': '最近 30 天'
    }[rangePreset.value]
  },
  {
    label: '数据来源',
    value: isHermesRest.value
      ? usageError.value
        ? '本地会话兜底'
        : 'Hermes Agent insights API'
      : 'Gateway RPC'
  },
  {
    label: 'Token 口径',
    value: 'input + output + cache read/write，与运营洞察一致'
  }
])

// ── Hero card computeds ──
const connectionLabel = computed(() => {
  switch (connectionStore.status) {
    case 'connected':
      return t('pages.dashboard.connection.connected')
    case 'connecting':
      return t('pages.dashboard.connection.connecting')
    case 'error':
      return t('pages.dashboard.connection.failed')
    default:
      return t('pages.dashboard.connection.disconnected')
  }
})

const connectionType = computed<'success' | 'warning' | 'error' | 'default'>(() => {
  switch (connectionStore.status) {
    case 'connected':
      return 'success'
    case 'connecting':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'default'
  }
})

const coverageText = computed(() => {
  if (isHermesRest.value && usageData.value) {
    const total = usageData.value.sessions.length
    if (total === 0) return t('pages.dashboard.usage.coverage.none')
    return t('pages.dashboard.usage.coverage.text', { withUsage: total, total })
  }
  const total = hermesChatStore.conversations.length
  const withUsage = hermesChatStore.conversations.filter(
    (c) => (c.tokenUsage?.totalInput || 0) + (c.tokenUsage?.totalOutput || 0) > 0
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
  if (isHermesRest.value && usageData.value) {
    return Math.max(...usageData.value.sessions.map((item) => Number(item.updatedAt || 0)), 0)
  }
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
    hint: t('pages.dashboard.kpis.messages.hint', { days: activeDays.value })
  },
  {
    key: 'totalTokens',
    label: t('pages.dashboard.kpis.totalTokens.label'),
    value: formatTokens(totalTokens.value),
    hint: t('pages.dashboard.kpis.totalTokens.hint')
  },
  {
    key: 'activeDays',
    label: t('pages.dashboard.kpis.activeDays.label'),
    value: String(activeDays.value),
    hint: t('pages.dashboard.kpis.activeDays.hint', { days: activeDays.value })
  },
  {
    key: 'lastUsed',
    label: t('pages.dashboard.kpis.lastUsed.label'),
    value:
      lastUsedMs.value > 0
        ? formatRelativeTime(lastUsedMs.value)
        : t('pages.dashboard.kpis.lastUsed.never'),
    hint: t('pages.dashboard.kpis.lastUsed.hint')
  }
])

// ── Trend chart ──
const dailyTrend = computed(() => usageData.value?.aggregates?.daily || [])
const showDailyTrend = computed(() => !isHermesRest.value || dailyTrend.value.length > 0)

const trendSeries = computed(() =>
  dailyTrend.value.map((item) => ({
    date: item.date,
    value: item.tokens,
    messages: item.messages,
    errors: item.errors
  }))
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
  const maxValue = Math.max(...series.map((item) => item.value), 0, 1)

  const points = series.map((item, index) => {
    const x =
      series.length === 1
        ? left + usableWidth / 2
        : left + (index / (series.length - 1)) * usableWidth
    const y = top + usableHeight - (item.value / maxValue) * usableHeight
    return { ...item, x, y }
  })

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPath =
    points.length > 1
      ? `M ${points[0]!.x} ${top + usableHeight} L ${points.map((p) => `${p.x} ${p.y}`).join(' L ')} L ${points[points.length - 1]!.x} ${top + usableHeight} Z`
      : ''
  const guides = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    y: top + usableHeight - usableHeight * ratio,
    value: maxValue * ratio
  }))

  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    usableWidth,
    usableHeight,
    maxValue,
    points,
    polyline,
    areaPath,
    guides
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
    end: end?.date.slice(5) || '-'
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
    errors: p.errors
  })
})

function clearTrendHover() {
  trendHoverIndex.value = null
  trendTooltipStyle.value = null
}

function handleTrendMouseMove(event: MouseEvent) {
  const svg = trendSvgRef.value
  const points = trendGeometry.value.points
  if (!svg || points.length === 0) {
    clearTrendHover()
    return
  }
  const firstPoint = points[0]
  if (!firstPoint) {
    clearTrendHover()
    return
  }
  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    clearTrendHover()
    return
  }

  const svgX = ((event.clientX - rect.left) / rect.width) * trendGeometry.value.width
  const plotMin = trendGeometry.value.left
  const plotMax = trendGeometry.value.left + trendGeometry.value.usableWidth
  if (svgX < plotMin || svgX > plotMax) {
    clearTrendHover()
    return
  }

  let nearestIndex = 0
  let nearestDist = Math.abs(firstPoint.x - svgX)
  for (let i = 1; i < points.length; i++) {
    const cand = points[i]
    if (!cand) continue
    const d = Math.abs(cand.x - svgX)
    if (d < nearestDist) {
      nearestDist = d
      nearestIndex = i
    }
  }

  const point = points[nearestIndex]
  if (!point) {
    clearTrendHover()
    return
  }
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
  return [...models].sort((a, b) => b.totals.totalTokens - a.totals.totalTokens).slice(0, 5)
})

const topModelMax = computed(() => Math.max(...topModels.value.map((m) => m.totals.totalTokens), 0))

// ── Range preset logic (preserved from v0.4.4) ──
function buildFilterFromPreset(preset: RangePreset): UsageFilter | undefined {
  if (preset === 'all') return undefined
  const now = new Date()
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  ).getTime()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 24 * 60 * 60 * 1000
  switch (preset) {
    case 'today':
      return { startTs: startOfToday, endTs: endOfToday }
    case 'yesterday':
      return { startTs: startOfToday - day, endTs: startOfToday - 1 }
    case '7d':
      return { startTs: startOfToday - 6 * day, endTs: endOfToday }
    case '15d':
      return { startTs: startOfToday - 14 * day, endTs: endOfToday }
    case '30d':
      return { startTs: startOfToday - 29 * day, endTs: endOfToday }
  }
}

function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildServerRangeFromPreset(preset: RangePreset): { startDate?: string; endDate?: string } {
  if (preset === 'all') return {}
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = 24 * 60 * 60 * 1000
  switch (preset) {
    case 'today':
      return { startDate: dateToYmd(today), endDate: dateToYmd(today) }
    case 'yesterday': {
      const yesterday = new Date(today.getTime() - day)
      return { startDate: dateToYmd(yesterday), endDate: dateToYmd(yesterday) }
    }
    case '7d':
      return {
        startDate: dateToYmd(new Date(today.getTime() - 6 * day)),
        endDate: dateToYmd(today)
      }
    case '15d':
      return {
        startDate: dateToYmd(new Date(today.getTime() - 14 * day)),
        endDate: dateToYmd(today)
      }
    case '30d':
      return {
        startDate: dateToYmd(new Date(today.getTime() - 29 * day)),
        endDate: dateToYmd(today)
      }
  }
}

function setRangePreset(preset: RangePreset) {
  rangePreset.value = preset
  fetchUsageData().catch(() => {})
}

watch(
  () => [hermesChatStore.conversations.length, hermesChatStore.activeConversation?.updatedAt],
  () => {
    if (isHermesRest.value && usageError.value) {
      usageData.value = buildHermesRestUsageData(
        hermesChatStore.conversations,
        buildFilterFromPreset(rangePreset.value)
      )
      lastUpdatedAt.value = Date.now()
    }
  }
)

// ── Format helpers ──
function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function formatCompact(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    n || 0
  )
}

function tsToYmd(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function segmentWidth(value: number): string {
  const total =
    inputTokens.value + outputTokens.value + cacheReadTokens.value + cacheWriteTokens.value
  if (total <= 0 || value <= 0) return '0%'
  return `${(value / total) * 100}%`
}

function topBarWidth(value: number, max: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return '0%'
  return `${Math.min(Math.max((value / max) * 100, 8), 100)}%`
}

function noticeTagType(severity: string): HealthType {
  if (severity === 'critical') return 'error'
  if (severity === 'success') return 'success'
  if (severity === 'info') return 'info'
  if (severity === 'warning') return 'warning'
  return 'default'
}

// ── Actions ──
async function fetchUsageData() {
  usageLoading.value = true
  usageError.value = null
  try {
    const result = isHermesRest.value
      ? await hermesRestGet<SessionsUsageResult>('/v1/hermes/insights/sessions-usage', {
          limit: 1000,
          ...buildServerRangeFromPreset(rangePreset.value),
          includeContextWeight: true
        })
      : await wsStore.rpc.getSessionsUsage({ limit: 500 })
    usageData.value = result
    lastUpdatedAt.value = Date.now()
  } catch (e: any) {
    usageError.value = e?.message || 'Failed to fetch usage data'
    if (isHermesRest.value) {
      usageData.value = buildHermesRestUsageData(
        hermesChatStore.conversations,
        buildFilterFromPreset(rangePreset.value)
      )
      lastUpdatedAt.value = Date.now()
    }
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

async function runGlobalHealthCheck() {
  healthCheckRunning.value = true
  try {
    await Promise.allSettled([
      cronStore.fetchJobs(),
      skillStore.fetchSkills(),
      hermesChatStore.serverSyncAvailable ? hermesChatStore.loadFromServer() : Promise.resolve(),
      fetchUsageData()
    ])
    const issues = healthIssues.value
    healthCheckAt.value = Date.now()
    healthCheckSummary.value = issues.length
      ? issues.join('；')
      : '连接、模型、任务、Skill 和用量统计没有发现阻断项'
    opsStore.pushNotice({
      title: issues.length ? '一键体检发现需关注项' : '一键体检通过',
      detail: healthCheckSummary.value,
      severity: issues.length ? 'warning' : 'success',
      source: '健康中心'
    })
  } finally {
    healthCheckRunning.value = false
  }
}

function goCron() {
  router.push({ name: 'Cron' })
}
function goChat() {
  router.push({ name: 'Chat' })
}
function goSettings() {
  router.push({ name: 'Settings' })
}
function goPriceWorkflow() {
  router.push({ name: 'Cron', query: { focus: 'price-monitor' } })
}

function scrollToUsageSection() {
  usageSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function handleActionItem(target: 'settings' | 'cron' | 'price' | 'usage' | 'chat' | 'logs') {
  if (target === 'settings') goSettings()
  else if (target === 'cron') goCron()
  else if (target === 'price') goPriceWorkflow()
  else if (target === 'usage') scrollToUsageSection()
  else if (target === 'logs') router.push({ name: 'Logs' })
  else goChat()
}

onMounted(() => {
  if (cronStore.jobs.length === 0) cronStore.fetchJobs()
  fetchUsageData()
})
</script>

<template>
  <NSpin :show="usageLoading">
    <div class="dashboard-page">
      <!-- Control tower first screen -->
      <div class="control-tower-grid">
        <section class="control-status-panel">
          <NText depth="3" class="control-kicker">当前总览</NText>
          <h2>{{ controlTowerTitle }}</h2>
          <NText depth="3" class="control-note"
            >首页只回答一个问题：今天有没有需要你处理的事。</NText
          >
          <div class="control-status-strip">
            <div v-for="item in healthItems" :key="`strip-${item.key}`" class="control-mini">
              <NText depth="3" class="control-mini-label">{{ item.title }}</NText>
              <div class="control-mini-value">{{ item.value }}</div>
            </div>
          </div>
        </section>

        <section class="control-action-panel">
          <div class="control-section-head">
            <div>
              <div class="control-section-title">现在最该处理</div>
              <NText depth="3" class="control-note">控制塔只展示会阻塞今日工作的事项。</NText>
            </div>
            <NButton secondary size="small" @click="goCron">查看任务</NButton>
          </div>
          <div class="control-todo-list">
            <div
              v-for="item in actionItems.slice(0, 3)"
              :key="`todo-${item.key}`"
              class="control-todo-row"
            >
              <span class="control-severity" :class="`control-severity--${item.type}`" />
              <div class="control-todo-main">
                <NText strong>{{ item.title }}</NText>
                <NText depth="3" class="control-todo-detail">{{ item.detail }}</NText>
              </div>
              <NTag size="small" :type="item.type" round :bordered="false">
                {{ item.key === 'ready' ? 'OK' : '需处理' }}
              </NTag>
            </div>
          </div>
        </section>
      </div>

      <NCard class="dashboard-card control-price-card" :bordered="false">
        <template #header>
          <NSpace align="center" :size="8">
            <NText strong>业务闭环摘要</NText>
            <NTag :type="priceIssueCount ? 'warning' : 'success'" round :bordered="false">
              {{ priceIssueCount ? `${priceIssueCount} 项需关注` : '运行正常' }}
            </NTag>
          </NSpace>
        </template>
        <template #header-extra>
          <NButton size="small" secondary @click="goPriceWorkflow">打开任务闭环</NButton>
        </template>
        <div class="control-timeline">
          <div v-for="stage in priceTimelineStages" :key="stage.key" class="control-stage">
            <span class="control-stage-time">{{ stage.time }}</span>
            <div class="control-stage-name">{{ stage.name }}</div>
            <NText
              depth="3"
              class="control-stage-meta"
              :type="stage.type === 'error' ? 'error' : undefined"
            >
              {{ stage.detail }}
            </NText>
            <NTag size="small" :type="stage.type" round :bordered="false">{{ stage.status }}</NTag>
          </div>
        </div>
      </NCard>

      <!-- Usage controls -->
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
          <NButton
            size="small"
            :type="rangePreset === 'today' ? 'primary' : 'default'"
            secondary
            @click="setRangePreset('today')"
            >{{ t('pages.dashboard.range.today') }}</NButton
          >
          <NButton
            size="small"
            :type="rangePreset === 'yesterday' ? 'primary' : 'default'"
            secondary
            @click="setRangePreset('yesterday')"
            >{{ t('pages.dashboard.range.yesterday') }}</NButton
          >
          <NButton
            size="small"
            :type="rangePreset === '7d' ? 'primary' : 'default'"
            secondary
            @click="setRangePreset('7d')"
            >{{ t('pages.dashboard.range.last7d') }}</NButton
          >
          <NButton
            size="small"
            :type="rangePreset === '15d' ? 'primary' : 'default'"
            secondary
            @click="setRangePreset('15d')"
            >{{ t('pages.dashboard.range.last15d') }}</NButton
          >
          <NButton
            size="small"
            :type="rangePreset === '30d' ? 'primary' : 'default'"
            secondary
            @click="setRangePreset('30d')"
            >{{ t('pages.dashboard.range.last30d') }}</NButton
          >
          <NButton
            size="small"
            :type="rangePreset === 'all' ? 'primary' : 'default'"
            secondary
            @click="setRangePreset('all')"
            >{{ t('pages.dashboard.range.all') }}</NButton
          >

          <NButton
            type="primary"
            size="small"
            :loading="usageLoading || cronStore.loading"
            @click="handleRefresh"
          >
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('common.refresh') }}
          </NButton>
          <NButton secondary size="small" @click="goChat">
            <template #icon><NIcon :component="ChatboxEllipsesOutline" /></template>
            {{ t('routes.chat') }}
          </NButton>
          <NButton secondary size="small" @click="scrollToUsageSection">{{
            t('routes.insights')
          }}</NButton>
          <NButton secondary size="small" @click="goCron">{{ t('routes.cron') }}</NButton>
        </NSpace>

        <NAlert v-if="usageError" type="warning" :bordered="false" style="margin-top: 10px">
          {{ t('pages.dashboard.usage.error', { error: usageError }) }}
        </NAlert>
      </NCard>

      <!-- Global health center -->
      <NCard title="全局健康中心" class="dashboard-card">
        <template #header-extra>
          <NSpace align="center" :size="8">
            <NTag v-if="healthCheckAt" round :bordered="false">
              上次体检 {{ formatRelativeTime(healthCheckAt) }}
            </NTag>
            <NTag :type="overallHealthType" round :bordered="false">{{ overallHealthLabel }}</NTag>
            <NButton
              size="small"
              type="primary"
              secondary
              :loading="healthCheckRunning"
              @click="runGlobalHealthCheck"
            >
              <template #icon><NIcon :component="RefreshOutline" /></template>
              一键体检
            </NButton>
          </NSpace>
        </template>

        <div class="health-grid">
          <div v-for="item in healthItems" :key="item.key" class="health-card">
            <div class="health-card-head">
              <NText depth="3" class="health-title">{{ item.title }}</NText>
              <NTag size="small" :type="item.type" round :bordered="false">{{ item.value }}</NTag>
            </div>
            <NText depth="3" class="health-detail">{{ item.detail }}</NText>
            <NButton
              v-if="item.key === 'price'"
              size="tiny"
              secondary
              class="health-action"
              @click="goPriceWorkflow"
            >
              查看任务闭环
            </NButton>
          </div>
        </div>

        <NAlert
          v-if="healthIssues.length"
          type="warning"
          :bordered="false"
          style="margin-top: 12px"
        >
          <div class="health-issues">
            <div v-for="issue in healthIssues" :key="issue">{{ issue }}</div>
          </div>
        </NAlert>
        <NAlert
          v-else-if="healthCheckSummary"
          type="success"
          :bordered="false"
          style="margin-top: 12px"
        >
          {{ healthCheckSummary }}
        </NAlert>
      </NCard>

      <!-- Action queue -->
      <NGrid cols="1 l:2" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem>
          <NCard title="待办处置队列" class="dashboard-card">
            <div class="action-grid">
              <div v-for="item in actionItems" :key="item.key" class="action-card">
                <div class="action-card-main">
                  <div>
                    <NText strong>{{ item.title }}</NText>
                    <NText depth="3" class="action-detail">{{ item.detail }}</NText>
                  </div>
                  <NTag size="small" :type="item.type" round :bordered="false">{{
                    item.key === 'ready' ? '正常' : '待处理'
                  }}</NTag>
                </div>
                <NButton
                  size="tiny"
                  secondary
                  class="action-button"
                  @click="handleActionItem(item.target)"
                >
                  {{ item.actionText }}
                </NButton>
              </div>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard title="通知中心" class="dashboard-card">
            <template #header-extra>
              <NTag
                size="small"
                :type="opsStore.activeNotices.length ? 'warning' : 'success'"
                round
                :bordered="false"
              >
                {{ opsStore.activeNotices.length }} 条待处理
              </NTag>
            </template>
            <NSpace v-if="opsStore.recentNotices.length" vertical :size="8">
              <div
                v-for="notice in opsStore.recentNotices.slice(0, 5)"
                :key="notice.id"
                class="notice-row"
              >
                <div class="notice-row-main">
                  <NText strong>{{ notice.title }}</NText>
                  <NTag size="tiny" :type="noticeTagType(notice.severity)" round :bordered="false">
                    {{ notice.source }}
                  </NTag>
                </div>
                <NText depth="3" class="notice-detail">{{ notice.detail }}</NText>
                <NSpace justify="space-between" align="center">
                  <NText depth="3" style="font-size: 12px">{{
                    formatRelativeTime(notice.createdAt)
                  }}</NText>
                  <NButton
                    v-if="!notice.resolvedAt"
                    size="tiny"
                    secondary
                    @click="opsStore.resolveNotice(notice.id)"
                  >
                    标记已处理
                  </NButton>
                  <NTag v-else size="tiny" round :bordered="false">已处理</NTag>
                </NSpace>
              </div>
            </NSpace>
            <NText v-else depth="3">暂无通知。体检、Cron 告警和模型错误会沉淀在这里。</NText>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Stat row (4 cards) -->
      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem>
          <div class="stat-card">
            <NText depth="3" class="stat-label">{{
              t('pages.dashboard.metrics.conversations')
            }}</NText>
            <div class="stat-value">{{ totalConversations }}</div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-card">
            <NText depth="3" class="stat-label">{{ t('pages.dashboard.metrics.cronJobs') }}</NText>
            <div class="stat-value">
              {{ totalJobs }}
              <NText type="success" class="stat-value-sub">
                {{ enabledJobs }} {{ t('pages.dashboard.metrics.enabled') }}</NText
              >
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

      <div ref="usageSectionRef" class="dashboard-section-anchor">
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
      </div>

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

                    <path
                      v-if="trendGeometry.areaPath"
                      class="trend-area"
                      :d="trendGeometry.areaPath"
                    />
                    <polyline
                      v-if="trendGeometry.polyline"
                      class="trend-line"
                      :points="trendGeometry.polyline"
                    />
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

                  <div
                    v-if="hoveredTrendPoint && trendTooltipStyle"
                    class="trend-tooltip"
                    :style="trendTooltipStyle"
                  >
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
          <NCard
            :title="t('pages.dashboard.cards.structure')"
            class="dashboard-card usage-structure-card"
          >
            <NSpace justify="space-between" align="center" style="margin-bottom: 8px">
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
              <div
                class="segment-item"
                :style="{ width: segmentWidth(cacheReadTokens), background: '#f0a020' }"
              />
              <div
                class="segment-item"
                :style="{ width: segmentWidth(cacheWriteTokens), background: '#d03050' }"
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
              <div class="segment-row">
                <div class="segment-row-label">
                  <span class="segment-dot" :style="{ background: '#f0a020' }" />
                  <span>Cache Read</span>
                </div>
                <NText>{{ formatTokens(cacheReadTokens) }}</NText>
              </div>
              <div class="segment-row">
                <div class="segment-row-label">
                  <span class="segment-dot" :style="{ background: '#d03050' }" />
                  <span>Cache Write</span>
                </div>
                <NText>{{ formatTokens(cacheWriteTokens) }}</NText>
              </div>
            </div>

            <div class="usage-scope-list">
              <div v-for="row in usageScopeRows" :key="row.label" class="usage-scope-row">
                <NText depth="3">{{ row.label }}</NText>
                <NText>{{ row.value }}</NText>
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

.control-tower-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
  gap: 14px;
  align-items: stretch;
}

.control-status-panel,
.control-action-panel {
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  background: var(--n-card-color);
  padding: 16px;
  min-width: 0;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
}

.control-status-panel {
  background:
    linear-gradient(135deg, rgba(96, 215, 172, 0.09), rgba(120, 183, 255, 0.06)),
    var(--n-card-color);
}

.control-kicker,
.control-note,
.control-todo-detail,
.control-stage-meta {
  display: block;
  font-size: 12px;
  line-height: 1.45;
}

.control-status-panel h2 {
  margin: 8px 0 10px;
  font-size: clamp(30px, 4vw, 54px);
  line-height: 1.02;
  white-space: pre-line;
  letter-spacing: 0;
}

.control-status-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}

.control-mini {
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  padding: 10px 12px;
  min-width: 0;
}

.control-mini-label {
  font-size: 12px;
}

.control-mini-value {
  margin-top: 6px;
  font-size: 16px;
  font-weight: 760;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.control-section-title {
  font-size: 17px;
  font-weight: 760;
}

.control-todo-list {
  display: grid;
  gap: 0;
}

.control-todo-row {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 12px 0;
  border-bottom: 1px solid var(--n-border-color);
}

.control-todo-row:last-child {
  border-bottom: 0;
}

.control-severity {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  background: #63e2b7;
}

.control-severity--warning {
  background: #e2b85a;
}

.control-severity--error {
  background: #ef7d82;
}

.control-severity--info {
  background: #78b7ff;
}

.control-todo-main {
  min-width: 0;
}

.control-price-card {
  border-radius: 10px;
}

.control-timeline {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
}

.control-stage {
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  background: var(--n-card-color);
  padding: 10px 12px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.control-stage-time {
  color: #63e2b7;
  font-size: 13px;
  font-weight: 760;
}

.control-stage-name {
  margin-top: 6px;
  font-weight: 760;
}

.control-stage-meta {
  margin: 8px 0 12px;
  overflow-wrap: anywhere;
}

.dashboard-card {
  border-radius: 10px;
}

.dashboard-hero {
  border-radius: 10px;
  background: #000000;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.dashboard-hero :deep(.n-card__content) {
  color: #ffffff;
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
  color: #ffffff;
}

.dashboard-hero-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.68);
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

.health-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.health-card {
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--n-card-color);
  min-width: 0;
}

.health-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.health-title,
.health-detail {
  min-width: 0;
  overflow-wrap: anywhere;
}

.health-detail {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.45;
}

.health-issues {
  display: grid;
  gap: 4px;
  font-size: 13px;
}

.health-action {
  margin-top: 8px;
}

.action-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.action-card {
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 10px 12px;
  min-width: 0;
  background: var(--n-card-color);
}

.action-card-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.action-detail {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.action-button {
  margin-top: 10px;
}

.notice-row {
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 10px 12px;
}

.notice-row-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.notice-detail {
  display: block;
  margin: 6px 0 8px;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
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

.usage-scope-list {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--n-border-color);
  display: grid;
  gap: 6px;
}

.usage-scope-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  font-size: 12px;
}

.usage-scope-row :deep(.n-text:last-child) {
  text-align: right;
  overflow-wrap: anywhere;
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
  .control-tower-grid {
    grid-template-columns: 1fr;
  }

  .control-status-strip,
  .control-timeline {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-filters-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .health-grid,
  .action-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .control-status-strip,
  .control-timeline {
    grid-template-columns: 1fr;
  }

  .control-section-head {
    display: grid;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .health-grid,
  .action-grid {
    grid-template-columns: 1fr;
  }
}
</style>
