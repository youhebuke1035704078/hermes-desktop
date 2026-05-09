<script setup lang="ts">
import { ref, computed, onMounted, h, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  NCard, NSpace, NButton, NIcon, NTag, NDataTable, NInput,
  NModal, NForm, NFormItem, NSwitch, NAlert,
  NGrid, NGridItem, NPopconfirm, NText, NSpin, NTooltip,
  NDescriptions, NDescriptionsItem,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  AddOutline, RefreshOutline, PlayOutline, CreateOutline,
  TrashOutline, PauseCircleOutline, CalendarOutline,
  CheckmarkCircleOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useCronStore } from '@/stores/cron'
import type { CronJob } from '@/api/types'
import { formatRelativeTime, formatDate } from '@/utils/format'

const { t } = useI18n()
const message = useMessage()
const cronStore = useCronStore()
const route = useRoute()

type CronTone = 'success' | 'warning' | 'error' | 'info' | 'default'
type TaskGroupKey = 'price' | 'system' | 'alert' | 'backup' | 'other'

interface PriceWorkflowStage {
  key: string
  label: string
  hint: string
  job?: CronJob
  type: CronTone
  status: string
  detail: string
  nextRun: string
}

interface TaskGroupDefinition {
  key: TaskGroupKey
  label: string
  description: string
}

interface TaskGroupSummary extends TaskGroupDefinition {
  count: number
  issueCount: number
  statusType: CronTone
  nextRunText: string
}

// ── State ──
const search = ref('')
const showModal = ref(false)
const editingJob = ref<CronJob | null>(null)
const priceWorkflowSectionRef = ref<HTMLElement | null>(null)
const activeTaskGroup = ref<TaskGroupKey>('price')

const TASK_GROUP_DEFS: TaskGroupDefinition[] = [
  { key: 'price', label: '价格监控', description: '验证 / 采集 / 补录 / 告警' },
  { key: 'system', label: '系统巡检', description: 'Gateway / Cron / 版本健康' },
  { key: 'alert', label: '通知告警', description: '飞书推送与异常升级' },
  { key: 'backup', label: '数据备份', description: 'SQLite 备份与导出恢复' },
  { key: 'other', label: '其他任务', description: '低频维护与未归类任务' },
]

// Form
const form = ref({
  name: '',
  schedule: '',
  prompt: '',
  enabled: true,
})

// ── Computed ──
const filteredJobs = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return currentGroupJobs.value
  return currentGroupJobs.value.filter(j =>
    j.name.toLowerCase().includes(q) ||
    (j.description || '').toLowerCase().includes(q) ||
    (j.command || '').toLowerCase().includes(q)
  )
})

const enabledCount = computed(() => cronStore.jobs.filter(j => j.enabled).length)
const disabledCount = computed(() => cronStore.jobs.filter(j => !j.enabled).length)
const runningCount = computed(() => cronStore.jobs.filter(j => j.state?.runningAtMs).length)
const failedCount = computed(() => cronStore.jobs.filter(j => j.enabled && j.state?.lastStatus === 'error').length)
const failedJobs = computed(() => cronStore.jobs.filter(j => j.enabled && j.state?.lastStatus === 'error'))

function jobActivityMs(job: CronJob): number {
  return Number(job.state?.runningAtMs || job.state?.lastRunAtMs || job.updatedAtMs || job.createdAtMs || 0)
}

function cronStatusType(job: CronJob): CronTone {
  if (!job.enabled) return 'default'
  if (job.state?.runningAtMs) return 'info'
  if (job.state?.lastStatus === 'ok') return 'success'
  if (job.state?.lastStatus === 'error') return 'error'
  if (job.state?.lastStatus === 'skipped') return 'warning'
  return 'default'
}

function cronStatusLabel(job: CronJob): string {
  if (!job.enabled) return '已停用'
  if (job.state?.runningAtMs) return '运行中'
  if (job.state?.lastStatus === 'ok') return 'OK'
  if (job.state?.lastStatus === 'error') return '失败'
  if (job.state?.lastStatus === 'skipped') return '跳过'
  return '等待'
}

function cronRelativeTime(ms?: number): string {
  return ms && ms > 0 ? formatRelativeTime(ms) : '-'
}

const recentJobs = computed(() =>
  [...cronStore.jobs]
    .sort((a, b) => jobActivityMs(b) - jobActivityMs(a))
    .slice(0, 6),
)

function jobIndexText(job: CronJob): string {
  return `${job.name} ${job.description || ''} ${job.command || ''}`.toLowerCase()
}

function classifyTaskGroup(job: CronJob): TaskGroupKey {
  const text = jobIndexText(job)
  if (/jd-tongrentang-price-watch|tongrentang|price-watch|价格监控|同仁堂/.test(text)) return 'price'
  if (/backup|sqlite|restore|dump|export|备份|恢复|导出/.test(text)) return 'backup'
  if (/alarm|alert|notify|notification|feishu|webhook|飞书|通知|告警/.test(text)) return 'alert'
  if (/health|watchdog|gateway|mgmt|probe|diagnostic|version|update|巡检|健康|诊断|版本|网关/.test(text)) return 'system'
  return 'other'
}

function jobHasIssue(job: CronJob): boolean {
  return Boolean(job.enabled && (job.state?.lastStatus === 'error' || job.state?.lastStatus === 'skipped'))
}

const taskGroupSummaries = computed<TaskGroupSummary[]>(() =>
  TASK_GROUP_DEFS.map(def => {
    const jobs = cronStore.jobs.filter(job => classifyTaskGroup(job) === def.key)
    const issueCount = jobs.filter(jobHasIssue).length
    const next = jobs
      .filter(job => job.enabled && job.nextRun)
      .map(job => new Date(job.nextRun!).getTime())
      .filter(ms => Number.isFinite(ms))
      .sort((a, b) => a - b)[0]
    return {
      ...def,
      count: jobs.length,
      issueCount,
      statusType: issueCount ? 'error' : jobs.length ? 'success' : 'default',
      nextRunText: next ? formatDate(next) : '-',
    }
  }),
)

const currentTaskGroup = computed<TaskGroupSummary>(() =>
  taskGroupSummaries.value.find(group => group.key === activeTaskGroup.value) || taskGroupSummaries.value[0]!,
)

const currentGroupJobs = computed(() =>
  cronStore.jobs.filter(job => classifyTaskGroup(job) === activeTaskGroup.value),
)

const priceMonitorJobs = computed(() =>
  cronStore.jobs.filter(job => classifyTaskGroup(job) === 'price'),
)

function findPriceStageJob(key: string): CronJob | undefined {
  const jobs = priceMonitorJobs.value
  if (key === 'gate') return jobs.find(job => /verification-gate|验证门控|gate|07:20|07：20/i.test(job.name))
  if (key === 'daily') {
    return jobs.find(job =>
      /jd-tongrentang-price-watch/i.test(job.name) &&
      !/verification-gate|gate|backfill|watchdog|evening|alarm|backup|health/i.test(job.name),
    )
  }
  if (key === 'watchdog') return jobs.find(job => /watchdog|11:00|11：00/i.test(job.name))
  if (key === 'backfill') return jobs.find(job => /backfill|补录|17:00|17：00/i.test(job.name))
  if (key === 'alarm') return jobs.find(job => /evening|alarm|告警|17:30|17：30/i.test(job.name))
  if (key === 'health') return jobs.find(job => /cron-health|health|健康/i.test(job.name))
  if (key === 'backup') return jobs.find(job => /backup|备份/i.test(job.name))
  return undefined
}

function priceStageType(job?: CronJob): CronTone {
  if (!job) return 'default'
  return cronStatusType(job)
}

function priceStageStatus(job?: CronJob): string {
  if (!job) return '未配置'
  return cronStatusLabel(job)
}

function priceStageDetail(job: CronJob | undefined, hint: string): string {
  if (!job) return hint
  if (job.state?.lastError) return job.state.lastError
  const last = cronRelativeTime(job.state?.lastRunAtMs)
  const duration = job.state?.lastDurationMs != null ? ` · ${(job.state.lastDurationMs / 1000).toFixed(1)}s` : ''
  return `上次 ${last}${duration}`
}

function recoveryAdvice(job: CronJob): string {
  const text = `${job.name} ${job.state?.lastError || ''}`.toLowerCase()
  if (/verification|slider|captcha|验证|滑块/.test(text)) {
    return '疑似京东快速验证或风控拦截：先运行 07:20 验证门控，人工解锁后补跑采集/补录。'
  }
  if (/api key|401|unauthorized|credential|凭据|令牌/.test(text)) {
    return '疑似凭据失效：先到系统设置运行模型与凭据诊断，再补跑该任务。'
  }
  if (/timeout|connection|network|closed|超时|网络/.test(text)) {
    return '疑似网络或远端服务抖动：确认服务在线后可直接补跑。'
  }
  if (/utf-?8|decode|codec|编码/.test(text)) {
    return '疑似脚本输出编码异常：检查脚本日志编码和终端输出，再补跑验证。'
  }
  return '先展开错误详情确认失败阶段；如果是临时错误，可立即补跑。'
}

const priceWorkflowStages = computed<PriceWorkflowStage[]>(() => {
  const defs = [
    { key: 'gate', label: '07:20 验证门控', hint: '检测京东快速验证' },
    { key: 'daily', label: '07:30 价格获取', hint: '主采集任务' },
    { key: 'watchdog', label: '11:00 巡检', hint: '上午缺口检查' },
    { key: 'backfill', label: '17:00 补录', hint: '失败数据补采' },
    { key: 'alarm', label: '17:30 告警', hint: '晚间通知' },
    { key: 'health', label: '23:00 健康检查', hint: 'Cron 状态巡检' },
    { key: 'backup', label: '03:00 数据备份', hint: 'SQLite 备份' },
  ]
  return defs.map(def => {
    const job = findPriceStageJob(def.key)
    return {
      ...def,
      job,
      type: priceStageType(job),
      status: priceStageStatus(job),
      detail: priceStageDetail(job, def.hint),
      nextRun: job?.nextRun ? formatDate(job.nextRun) : '-',
    }
  })
})

// Soonest next run
const nextRunText = computed(() => {
  const upcoming = cronStore.jobs
    .filter(j => j.enabled && j.nextRun)
    .map(j => ({ name: j.name, time: new Date(j.nextRun!).getTime() }))
    .sort((a, b) => a.time - b.time)
  if (!upcoming.length) return '-'
  return formatRelativeTime(upcoming[0]!.time)
})

// ── Table columns ──
const columns = computed<DataTableColumns<CronJob>>(() => [
  {
    title: t('pages.cron.table.jobs.task'),
    key: 'name',
    minWidth: 180,
    render(row) {
      const desc = row.description
      return h('div', [
        h(NText, { strong: true }, { default: () => row.name }),
        desc
          ? h(NText, { depth: 3, style: 'display: block; font-size: 12px; margin-top: 2px;' }, { default: () => desc.length > 60 ? desc.slice(0, 60) + '...' : desc })
          : null,
      ])
    },
  },
  {
    title: t('pages.cron.table.jobs.schedule'),
    key: 'schedule',
    width: 160,
    render(row) {
      return h(NTag, { size: 'small', bordered: false, round: true }, { default: () => row.schedule || '-' })
    },
  },
  {
    title: t('pages.cron.table.jobs.nextRun'),
    key: 'nextRun',
    width: 180,
    render(row) {
      const nextRun = row.nextRun
      if (!nextRun) return h(NText, { depth: 3 }, { default: () => '-' })
      return h(NText, { depth: 2, style: 'font-size: 13px;' }, { default: () => formatDate(nextRun) })
    },
  },
  {
    title: t('pages.cron.table.jobs.lastRun'),
    key: 'lastRun',
    width: 160,
    render(row) {
      if (!row.state?.lastRunAtMs) return h(NText, { depth: 3 }, { default: () => '-' })
      return h(NText, { depth: 2, style: 'font-size: 13px;' }, {
        default: () => formatRelativeTime(row.state!.lastRunAtMs!),
      })
    },
  },
  {
    title: t('pages.cron.table.jobs.lastStatus'),
    key: 'lastStatus',
    width: 100,
    render(row) {
      const status = row.state?.lastStatus
      if (!status) return h(NText, { depth: 3 }, { default: () => '-' })
      const typeMap: Record<string, 'success' | 'error' | 'warning'> = {
        ok: 'success',
        error: 'error',
        skipped: 'warning',
      }
      const labelMap: Record<string, string> = { ok: 'OK', error: 'Error', skipped: 'Skipped' }
      return h(NTag, {
        type: typeMap[status] || 'default',
        size: 'small',
        bordered: false,
        round: true,
      }, { default: () => labelMap[status] || status })
    },
  },
  {
    title: t('pages.cron.table.jobs.status'),
    key: 'enabled',
    width: 100,
    render(row) {
      return h(NTag, {
        type: row.enabled ? 'success' : 'default',
        size: 'small',
        bordered: false,
        round: true,
      }, { default: () => row.enabled ? t('pages.cron.jobStatus.enabled') : t('pages.cron.jobStatus.disabled') })
    },
  },
  {
    title: t('pages.cron.table.jobs.actions'),
    key: 'actions',
    width: 160,
    fixed: 'right',
    render(row) {
      return h(NSpace, { size: 4 }, {
        default: () => [
          // Run now
          h(NTooltip, {}, {
            trigger: () => h(NButton, {
              size: 'tiny',
              quaternary: true,
              onClick: () => handleRun(row),
            }, { icon: () => h(NIcon, { component: PlayOutline }) }),
            default: () => t('pages.cron.actions.runNow'),
          }),
          // Toggle
          h(NTooltip, {}, {
            trigger: () => h(NButton, {
              size: 'tiny',
              quaternary: true,
              type: row.enabled ? 'warning' : 'success',
              onClick: () => handleToggle(row),
            }, { icon: () => h(NIcon, { component: row.enabled ? PauseCircleOutline : CheckmarkCircleOutline }) }),
            default: () => row.enabled ? t('pages.cron.actions.disable') : t('pages.cron.actions.enable'),
          }),
          // Edit
          h(NTooltip, {}, {
            trigger: () => h(NButton, {
              size: 'tiny',
              quaternary: true,
              onClick: () => handleEdit(row),
            }, { icon: () => h(NIcon, { component: CreateOutline }) }),
            default: () => t('pages.cron.actions.edit'),
          }),
          // Delete
          h(NPopconfirm, {
            onPositiveClick: () => handleDelete(row),
          }, {
            trigger: () => h(NButton, { size: 'tiny', quaternary: true, type: 'error' }, {
              icon: () => h(NIcon, { component: TrashOutline }),
            }),
            default: () => t('pages.cron.confirmDeleteJob'),
          }),
        ],
      })
    },
  },
])

// ── Expandable row ──
function renderExpand(row: CronJob) {
  if (!row.state?.lastRunAtMs) {
    return h('div', { style: 'text-align: center; padding: 16px;' },
      h(NText, { depth: 3 }, { default: () => t('pages.cron.expandedRow.noData') }),
    )
  }
  return h(NDescriptions, { labelPlacement: 'left', column: 1, bordered: true, size: 'small', style: 'max-width: 500px;' }, {
    default: () => [
      h(NDescriptionsItem, { label: t('pages.cron.expandedRow.lastRunTime') }, {
        default: () => row.state?.lastRunAtMs ? new Date(row.state.lastRunAtMs).toLocaleString() : '-',
      }),
      h(NDescriptionsItem, { label: t('pages.cron.expandedRow.duration') }, {
        default: () => row.state?.lastDurationMs != null
          ? `${(row.state.lastDurationMs / 1000).toFixed(1)}s`
          : '-',
      }),
      h(NDescriptionsItem, { label: t('pages.cron.expandedRow.consecutiveErrors') }, {
        default: () => h(NText, {
          type: (row.state?.consecutiveErrors || 0) > 0 ? 'error' : undefined,
          depth: (row.state?.consecutiveErrors || 0) > 0 ? undefined : 3,
        }, { default: () => String(row.state?.consecutiveErrors || 0) }),
      }),
      row.state?.lastStatus === 'error' && row.state?.lastError
        ? h(NDescriptionsItem, { label: t('pages.cron.expandedRow.errorDetail') }, {
            default: () => h(NAlert, { type: 'error', style: 'font-size: 12px;' }, { default: () => row.state?.lastError || '' }),
          })
        : null,
      h(NDescriptionsItem, { label: t('pages.cron.expandedRow.nextRunTime') }, {
        default: () => row.nextRun ? new Date(row.nextRun).toLocaleString() : '-',
      }),
    ].filter(Boolean),
  })
}

// ── Handlers ──
async function handleRefresh() {
  await cronStore.fetchJobs()
}

function handleCreate() {
  editingJob.value = null
  form.value = { name: '', schedule: '0 9 * * *', prompt: '', enabled: true }
  showModal.value = true
}

function handleEdit(job: CronJob) {
  editingJob.value = job
  form.value = {
    name: job.name,
    schedule: job.schedule || '',
    prompt: job.description || job.command || '',
    enabled: job.enabled,
  }
  showModal.value = true
}

async function handleSave() {
  if (!form.value.name.trim()) {
    message.warning(t('pages.cron.validation.nameRequired'))
    return
  }
  if (!form.value.schedule.trim()) {
    message.warning(t('pages.cron.validation.cronExprRequired'))
    return
  }
  if (!form.value.prompt.trim()) {
    message.warning(t('pages.cron.validation.payloadRequired'))
    return
  }

  if (editingJob.value) {
    const ok = await cronStore.updateJob(editingJob.value.id, {
      name: form.value.name,
      schedule: form.value.schedule,
      prompt: form.value.prompt,
      enabled: form.value.enabled,
    })
    if (ok) {
      message.success(t('pages.cron.messages.jobUpdated'))
      showModal.value = false
    } else {
      message.error(`${t('pages.cron.messages.updateFailed')}: ${cronStore.lastError}`)
    }
  } else {
    const job = await cronStore.createJob({
      name: form.value.name,
      schedule: form.value.schedule,
      prompt: form.value.prompt,
      enabled: form.value.enabled,
    })
    if (job) {
      message.success(t('pages.cron.messages.jobCreated'))
      showModal.value = false
    } else {
      message.error(`${t('pages.cron.messages.updateFailed')}: ${cronStore.lastError}`)
    }
  }
}

async function handleToggle(job: CronJob) {
  const ok = await cronStore.toggleJob(job.id, !job.enabled)
  if (ok) {
    message.success(job.enabled ? t('pages.cron.messages.jobDisabled') : t('pages.cron.messages.jobEnabled'))
  } else {
    message.error(`${t('pages.cron.messages.updateFailed')}: ${cronStore.lastError}`)
  }
}

async function handleRun(job: CronJob) {
  const ok = await cronStore.runJob(job.id)
  if (ok) {
    message.success(t('pages.cron.messages.jobTriggered'))
    await cronStore.fetchJobs()
  } else {
    message.error(`${t('pages.cron.messages.triggerFailed')}: ${cronStore.lastError}`)
  }
}

async function handleDelete(job: CronJob) {
  const ok = await cronStore.deleteJob(job.id)
  if (ok) {
    message.success(t('pages.cron.messages.jobDeleted'))
  } else {
    message.error(`${t('pages.cron.messages.deleteFailed')}: ${cronStore.lastError}`)
  }
}

function handleTemplate(template: { name: string; schedule: string; prompt: string }) {
  editingJob.value = null
  form.value = { ...template, enabled: true }
  showModal.value = true
}

function selectTaskGroup(key: TaskGroupKey) {
  activeTaskGroup.value = key
  search.value = ''
}

async function scrollToPriceWorkflowIfRequested(): Promise<void> {
  if (route.query.focus !== 'price-monitor') return
  activeTaskGroup.value = 'price'
  await nextTick()
  priceWorkflowSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── Lifecycle ──
onMounted(async () => {
  await cronStore.fetchJobs()
  await scrollToPriceWorkflowIfRequested()
})

watch(
  () => route.query.focus,
  () => {
    scrollToPriceWorkflowIfRequested()
  },
)
</script>

<template>
  <NSpace vertical :size="16">
    <!-- Header -->
    <NCard class="app-card">
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="CalendarOutline" size="18" />
          <span>{{ t('pages.cron.title') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NSpace :size="8">
          <NButton size="small" :loading="cronStore.loading" @click="handleRefresh">
            <template #icon><NIcon :component="RefreshOutline" /></template>
          </NButton>
          <NButton size="small" type="primary" @click="handleCreate">
            <template #icon><NIcon :component="AddOutline" /></template>
            {{ t('pages.cron.actions.createJob') }}
          </NButton>
        </NSpace>
      </template>

      <!-- Stats -->
      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="10" :y-gap="10" style="margin-bottom: 16px;">
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.cron.stats.totalJobs') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">{{ cronStore.jobs.length }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.cron.stats.enabledJobs') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              <NText :type="enabledCount > 0 ? 'success' : undefined">{{ enabledCount }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.cron.stats.disabledJobs') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              <NText :type="disabledCount > 0 ? 'warning' : undefined">{{ disabledCount }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.cron.stats.nextRun') }}</NText>
            <div style="font-size: 18px; font-weight: 700; margin-top: 6px;">
              <NText type="info">{{ nextRunText }}</NText>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Quick templates -->
      <NAlert :closable="false" type="default" style="margin-bottom: 16px;">
        <template #header>{{ t('pages.cron.quickTemplates') }}</template>
        <NSpace :size="8">
          <NButton
            size="small"
            @click="handleTemplate({ name: t('pages.cron.templates.morningReport.label'), schedule: '0 7 * * *', prompt: t('pages.cron.templates.morningReport.payloadText') })"
          >
            {{ t('pages.cron.templates.morningReport.label') }}
          </NButton>
          <NButton
            size="small"
            @click="handleTemplate({ name: t('pages.cron.templates.heartbeatCheck.label'), schedule: '*/30 * * * *', prompt: t('pages.cron.templates.heartbeatCheck.payloadText') })"
          >
            {{ t('pages.cron.templates.heartbeatCheck.label') }}
          </NButton>
          <NButton
            size="small"
            @click="handleTemplate({ name: t('pages.cron.templates.mainReminder.label'), schedule: '0 9,14,18 * * 1-5', prompt: t('pages.cron.templates.mainReminder.payloadText') })"
          >
            {{ t('pages.cron.templates.mainReminder.label') }}
          </NButton>
        </NSpace>
      </NAlert>

      <!-- Failure recovery -->
      <NCard v-if="failedJobs.length" embedded :bordered="false" size="small" style="border-radius: 10px; margin-bottom: 16px;">
        <template #header>
          <NSpace align="center" :size="8">
            <NText strong>失败恢复流程</NText>
            <NTag size="small" type="error" round :bordered="false">{{ failedJobs.length }} 个失败任务</NTag>
          </NSpace>
        </template>
        <div class="recovery-grid">
          <div v-for="job in failedJobs" :key="`recovery-${job.id}`" class="recovery-card">
            <div class="recovery-head">
              <NText strong>{{ job.name }}</NText>
              <NTag size="small" type="error" round :bordered="false">失败</NTag>
            </div>
            <NText type="error" class="recovery-error">{{ job.state?.lastError || '未知错误' }}</NText>
            <NText depth="3" class="recovery-advice">{{ recoveryAdvice(job) }}</NText>
            <NSpace :size="8">
              <NButton size="tiny" type="primary" secondary @click="handleRun(job)">
                <template #icon><NIcon :component="PlayOutline" /></template>
                一键补跑
              </NButton>
              <NButton size="tiny" secondary @click="search = job.name">
                定位任务
              </NButton>
            </NSpace>
          </div>
        </div>
      </NCard>

      <!-- Task workbench -->
      <div ref="priceWorkflowSectionRef" class="cron-section-anchor task-workbench">
        <div class="task-group-nav" role="tablist" aria-label="任务业务分组">
          <button
            v-for="group in taskGroupSummaries"
            :key="group.key"
            type="button"
            class="task-group-button"
            :class="{ 'task-group-button--active': activeTaskGroup === group.key }"
            role="tab"
            :aria-selected="activeTaskGroup === group.key"
            @click="selectTaskGroup(group.key)"
          >
            <span class="task-group-main">
              <span class="task-group-title">{{ group.label }}</span>
              <NTag size="small" :type="group.statusType" round :bordered="false">
                {{ group.issueCount ? `${group.issueCount} 异常` : group.count ? 'OK' : '空' }}
              </NTag>
            </span>
            <span class="task-group-desc">{{ group.description }}</span>
            <span class="task-group-meta">{{ group.count }} 个任务 · 下次 {{ group.nextRunText }}</span>
          </button>
        </div>

        <div class="task-group-panel" role="tabpanel">
          <div class="task-panel-head">
            <div>
              <NText strong class="task-panel-title">{{ currentTaskGroup.label }}</NText>
              <NText depth="3" class="task-panel-note">{{ currentTaskGroup.description }}</NText>
            </div>
            <NSpace :size="8">
              <NTag
                size="small"
                :type="currentTaskGroup.issueCount ? 'warning' : currentTaskGroup.count ? 'success' : 'default'"
                round
                :bordered="false"
              >
                {{ currentTaskGroup.issueCount ? `${currentTaskGroup.issueCount} 项需关注` : `${currentTaskGroup.count} 个任务` }}
              </NTag>
              <NButton
                v-if="activeTaskGroup === 'price' && priceMonitorJobs.length"
                size="small"
                secondary
                @click="search = 'jd-tongrentang'"
              >
                筛选任务
              </NButton>
            </NSpace>
          </div>

          <template v-if="activeTaskGroup === 'price'">
            <div class="price-workflow-grid">
              <div v-for="stage in priceWorkflowStages" :key="stage.key" class="price-workflow-card">
                <div class="price-workflow-head">
                  <NText strong>{{ stage.label }}</NText>
                  <NTag size="small" :type="stage.type" round :bordered="false">{{ stage.status }}</NTag>
                </div>
                <NText depth="3" class="price-workflow-hint">{{ stage.hint }}</NText>
                <NText class="price-workflow-detail" :type="stage.type === 'error' ? 'error' : undefined">
                  {{ stage.detail }}
                </NText>
                <NText depth="3" class="price-workflow-next">下次 {{ stage.nextRun }}</NText>
              </div>
            </div>

            <NAlert v-if="!priceMonitorJobs.length" type="warning" :closable="false" style="margin-top: 12px;">
              未发现 jd-tongrentang-price-watch 相关 Cron 任务。请先确认自建 skill 已同步，并检查 Cron jobs 配置。
            </NAlert>
          </template>

          <div v-else class="task-group-job-list">
            <div v-if="currentGroupJobs.length" class="task-group-jobs">
              <div v-for="job in currentGroupJobs" :key="`group-${job.id}`" class="cron-mini-row">
                <div class="cron-mini-main">
                  <NText strong class="cron-mini-name">{{ job.name }}</NText>
                  <NTag size="small" :type="cronStatusType(job)" round :bordered="false">{{ cronStatusLabel(job) }}</NTag>
                </div>
                <NText depth="3" class="cron-mini-detail">
                  下次 {{ job.nextRun ? formatDate(job.nextRun) : '-' }} · 上次 {{ cronRelativeTime(job.state?.lastRunAtMs) }}
                </NText>
                <NText v-if="job.state?.lastError" type="error" class="cron-mini-error">
                  {{ job.state.lastError }}
                </NText>
              </div>
            </div>
            <NAlert v-else type="default" :closable="false">
              当前分组暂无任务。新建任务后会按名称、描述和命令自动归类到这里。
            </NAlert>
          </div>
        </div>
      </div>

      <!-- Operational health -->
      <NGrid cols="1 l:2" responsive="screen" :x-gap="12" :y-gap="12" style="margin-bottom: 16px;">
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <template #header>
              <NSpace align="center" :size="8">
                <NText strong>最近执行</NText>
                <NTag size="small" :type="failedCount ? 'error' : runningCount ? 'info' : 'success'" round :bordered="false">
                  {{ failedCount ? `${failedCount} 个失败` : runningCount ? `${runningCount} 个运行中` : '正常' }}
                </NTag>
              </NSpace>
            </template>
            <NSpace v-if="recentJobs.length" vertical :size="8">
              <div v-for="job in recentJobs" :key="`recent-${job.id}`" class="cron-mini-row">
                <div class="cron-mini-main">
                  <NText strong class="cron-mini-name">{{ job.name }}</NText>
                  <NTag size="small" :type="cronStatusType(job)" round :bordered="false">{{ cronStatusLabel(job) }}</NTag>
                </div>
                <NText depth="3" class="cron-mini-detail">
                  上次 {{ cronRelativeTime(job.state?.lastRunAtMs) }}
                  <template v-if="job.state?.lastDurationMs != null">
                    · {{ (job.state.lastDurationMs / 1000).toFixed(1) }}s
                  </template>
                  <template v-if="job.state?.consecutiveErrors">
                    · 连续失败 {{ job.state.consecutiveErrors }} 次
                  </template>
                </NText>
                <NText v-if="job.state?.lastError" type="error" class="cron-mini-error">
                  {{ job.state.lastError }}
                </NText>
              </div>
            </NSpace>
            <NText v-else depth="3">暂无执行记录</NText>
          </NCard>
        </NGridItem>

        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <template #header>
              <NSpace align="center" :size="8">
                <NText strong>价格监控任务</NText>
                <NTag size="small" :type="priceMonitorJobs.length ? 'success' : 'warning'" round :bordered="false">
                  {{ priceMonitorJobs.length }} 个
                </NTag>
              </NSpace>
            </template>
            <NSpace v-if="priceMonitorJobs.length" vertical :size="8">
              <div v-for="job in priceMonitorJobs" :key="`price-${job.id}`" class="cron-mini-row">
                <div class="cron-mini-main">
                  <NText strong class="cron-mini-name">{{ job.name }}</NText>
                  <NTag size="small" :type="cronStatusType(job)" round :bordered="false">{{ cronStatusLabel(job) }}</NTag>
                </div>
                <NText depth="3" class="cron-mini-detail">
                  下次 {{ job.nextRun ? formatDate(job.nextRun) : '-' }} · 上次 {{ cronRelativeTime(job.state?.lastRunAtMs) }}
                </NText>
                <NText v-if="job.state?.lastError" type="error" class="cron-mini-error">
                  {{ job.state.lastError }}
                </NText>
              </div>
            </NSpace>
            <NAlert v-else type="warning" :closable="false">
              未发现 jd-tongrentang-price-watch 相关任务，请检查自建 skill 和 Cron 配置是否已同步。
            </NAlert>
          </NCard>
        </NGridItem>
      </NGrid>

      <div class="table-context">
        <div>
          <NText strong>{{ currentTaskGroup.label }}技术表</NText>
          <NText depth="3" class="table-context-note">用于查看和编辑当前业务分组下的 Cron 原始配置。</NText>
        </div>
        <NButton v-if="activeTaskGroup !== 'price'" size="small" secondary @click="selectTaskGroup('price')">
          回到价格监控
        </NButton>
      </div>

      <!-- Search -->
      <NInput
        v-model:value="search"
        :placeholder="`${currentTaskGroup.label}内搜索任务`"
        clearable
        size="small"
        style="margin-bottom: 12px;"
      />

      <!-- Jobs table -->
      <NSpin :show="cronStore.loading">
        <NDataTable
          :columns="columns"
          :data="filteredJobs"
          :row-key="(row: CronJob) => row.id"
          :render-expand="renderExpand"
          :bordered="false"
          :single-line="false"
          size="small"
          :scroll-x="980"
        />
        <NText v-if="!cronStore.loading && cronStore.jobs.length === 0" depth="3" style="display: block; text-align: center; padding: 24px 0;">
          {{ t('pages.cron.jobs.emptyHint') }}
        </NText>
      </NSpin>

      <!-- Error -->
      <NAlert v-if="cronStore.lastError" type="error" :closable="true" style="margin-top: 12px;">
        {{ t('pages.cron.requestFailed', { error: cronStore.lastError }) }}
      </NAlert>
    </NCard>

    <!-- Create / Edit Modal -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="editingJob ? t('pages.cron.modal.editTitle') : t('pages.cron.modal.createTitle')"
      style="max-width: 520px;"
      :mask-closable="false"
    >
      <NForm ref="formRef" :model="form" label-placement="left" label-width="100">
        <NFormItem :label="t('pages.cron.form.name')" path="name">
          <NInput v-model:value="form.name" :placeholder="t('pages.cron.form.namePlaceholder')" />
        </NFormItem>
        <NFormItem :label="t('pages.cron.form.cronExpr')" path="schedule">
          <NInput v-model:value="form.schedule" :placeholder="t('pages.cron.form.cronExprPlaceholder')" />
        </NFormItem>
        <NFormItem :label="t('pages.cron.detail.payload')" path="prompt">
          <NInput
            v-model:value="form.prompt"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 8 }"
            :placeholder="t('pages.cron.form.payloadTextPlaceholders.agentTurn')"
          />
        </NFormItem>
        <NFormItem :label="t('pages.cron.form.enabled')" path="enabled">
          <NSwitch v-model:value="form.enabled" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end" :size="8">
          <NButton @click="showModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="cronStore.saving" @click="handleSave">
            {{ editingJob ? t('pages.cron.actions.saveChanges') : t('pages.cron.actions.createJob') }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </NSpace>
</template>

<style scoped>
.cron-section-anchor {
  scroll-margin-top: 16px;
}

.task-workbench {
  display: grid;
  grid-template-columns: 218px minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 16px;
  align-items: start;
}

.task-group-nav {
  display: grid;
  gap: 8px;
}

.task-group-button {
  appearance: none;
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  background: var(--n-card-color);
  color: var(--n-text-color);
  padding: 12px;
  text-align: left;
  display: grid;
  gap: 6px;
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
}

.task-group-button:hover {
  border-color: rgba(99, 226, 183, 0.42);
  background: rgba(99, 226, 183, 0.06);
}

.task-group-button--active {
  border-color: rgba(99, 226, 183, 0.64);
  background: rgba(99, 226, 183, 0.12);
}

.task-group-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.task-group-title {
  font-size: 14px;
  font-weight: 700;
  min-width: 0;
}

.task-group-desc,
.task-group-meta {
  display: block;
  color: var(--n-text-color-3);
  font-size: 12px;
  line-height: 1.35;
}

.task-group-panel {
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  background: var(--n-card-color);
  padding: 14px;
  min-width: 0;
}

.task-panel-head,
.table-context {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.task-panel-title,
.task-panel-note,
.table-context-note {
  display: block;
}

.task-panel-note,
.table-context-note {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
}

.task-group-job-list {
  min-width: 0;
}

.task-group-jobs {
  display: grid;
  gap: 2px;
}

.price-workflow-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.recovery-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.recovery-card {
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 10px 12px;
  min-width: 0;
}

.recovery-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.recovery-error,
.recovery-advice {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.recovery-advice {
  margin-bottom: 10px;
}

.price-workflow-card {
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 10px 12px;
  min-width: 0;
  background: var(--n-card-color);
}

.price-workflow-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.price-workflow-hint,
.price-workflow-detail,
.price-workflow-next {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.cron-mini-row {
  padding: 8px 0;
  border-bottom: 1px solid var(--n-border-color);
  min-width: 0;
}

.cron-mini-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.cron-mini-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.cron-mini-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cron-mini-detail,
.cron-mini-error {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .task-workbench {
    grid-template-columns: 1fr;
  }

  .price-workflow-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .recovery-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .price-workflow-grid {
    grid-template-columns: 1fr;
  }

  .task-panel-head,
  .table-context {
    display: grid;
  }
}
</style>
