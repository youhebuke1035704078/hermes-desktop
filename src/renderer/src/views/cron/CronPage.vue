<script setup lang="ts">
import { ref, computed, onMounted, h, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  NSpace,
  NButton,
  NIcon,
  NTag,
  NDataTable,
  NInput,
  NModal,
  NForm,
  NFormItem,
  NSwitch,
  NAlert,
  NPopconfirm,
  NPopover,
  NText,
  NSpin,
  NTooltip,
  NDescriptions,
  NDescriptionsItem,
  useMessage
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  AddOutline,
  RefreshOutline,
  PlayOutline,
  CreateOutline,
  TrashOutline,
  PauseCircleOutline,
  CheckmarkCircleOutline
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
const technicalDetailsRef = ref<HTMLElement | null>(null)
const technicalDetailsOpen = ref(false)
const activeTaskGroup = ref<TaskGroupKey>('price')

const TASK_GROUP_DEFS: TaskGroupDefinition[] = [
  { key: 'price', label: '价格监控', description: '验证 / 采集 / 补录 / 告警' },
  { key: 'system', label: '系统巡检', description: 'Gateway / Cron / 版本健康' },
  { key: 'alert', label: '通知告警', description: '飞书推送与异常升级' },
  { key: 'backup', label: '数据备份', description: 'SQLite 备份与导出恢复' },
  { key: 'other', label: '其他任务', description: '低频维护与未归类任务' }
]

// Form
const form = ref({
  name: '',
  schedule: '',
  prompt: '',
  enabled: true
})

// ── Computed ──
const filteredJobs = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return currentGroupJobs.value
  return currentGroupJobs.value.filter(
    (j) =>
      j.name.toLowerCase().includes(q) ||
      (j.description || '').toLowerCase().includes(q) ||
      (j.command || '').toLowerCase().includes(q)
  )
})

const enabledCount = computed(() => cronStore.jobs.filter((j) => j.enabled).length)

function jobActivityMs(job: CronJob): number {
  return Number(
    job.state?.runningAtMs || job.state?.lastRunAtMs || job.updatedAtMs || job.createdAtMs || 0
  )
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
  [...cronStore.jobs].sort((a, b) => jobActivityMs(b) - jobActivityMs(a)).slice(0, 6)
)

function jobIndexText(job: CronJob): string {
  return `${job.name} ${job.description || ''} ${job.command || ''} ${job.schedule || ''}`.toLowerCase()
}

function isPriceWorkflowText(text: string): boolean {
  if (/jd-tongrentang-price-watch|tongrentang|price-watch|价格监控|同仁堂/.test(text)) {
    return true
  }
  return Boolean(
    /(07:20|07：20|07:30|07：30|11:00|11：00|17:00|17：00|17:30|17：30|23:00|23：00|03:00|03：00)/.test(
      text
    ) &&
    /验证门控|快速验证|价格获取|价格采集|主采集|上午缺口|失败数据补采|补录|晚间通知|健康检查|数据备份/.test(
      text
    )
  )
}

function classifyTaskGroup(job: CronJob): TaskGroupKey {
  const text = jobIndexText(job)
  if (isPriceWorkflowText(text)) return 'price'
  if (/backup|sqlite|restore|dump|export|备份|恢复|导出/.test(text)) return 'backup'
  if (/alarm|alert|notify|notification|feishu|webhook|飞书|通知|告警/.test(text)) return 'alert'
  if (
    /health|watchdog|gateway|mgmt|probe|diagnostic|version|update|巡检|健康|诊断|版本|网关/.test(
      text
    )
  )
    return 'system'
  return 'other'
}

function jobHasIssue(job: CronJob): boolean {
  return Boolean(
    job.enabled && (job.state?.lastStatus === 'error' || job.state?.lastStatus === 'skipped')
  )
}

const issueJobs = computed(() => cronStore.jobs.filter(jobHasIssue))
const attentionJob = computed(() => issueJobs.value[0] || null)
const issueCount = computed(() => issueJobs.value.length)

const taskGroupSummaries = computed<TaskGroupSummary[]>(() =>
  TASK_GROUP_DEFS.map((def) => {
    const jobs = cronStore.jobs.filter((job) => classifyTaskGroup(job) === def.key)
    const issueCount = jobs.filter(jobHasIssue).length
    const next = jobs
      .filter((job) => job.enabled && job.nextRun)
      .map((job) => new Date(job.nextRun!).getTime())
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => a - b)[0]
    return {
      ...def,
      count: jobs.length,
      issueCount,
      statusType: issueCount ? 'error' : jobs.length ? 'success' : 'default',
      nextRunText: next ? formatDate(next) : '-'
    }
  })
)

const currentTaskGroup = computed<TaskGroupSummary>(
  () =>
    taskGroupSummaries.value.find((group) => group.key === activeTaskGroup.value) ||
    taskGroupSummaries.value[0]!
)

const currentGroupJobs = computed(() =>
  cronStore.jobs.filter((job) => classifyTaskGroup(job) === activeTaskGroup.value)
)

function formatShortDateTime(value: number | string | Date): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const nextDay =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  if (sameDay) return `今天 ${hh}:${mm}`
  if (nextDay) return `明天 ${hh}:${mm}`
  return `${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`
}

function findPriceStageJob(key: string): CronJob | undefined {
  const jobs = cronStore.jobs
  if (key === 'gate')
    return jobs.find((job) =>
      /verification-gate|验证门控|快速验证|gate|07:20|07：20/i.test(jobIndexText(job))
    )
  if (key === 'daily') {
    return jobs.find(
      (job) =>
        (/jd-tongrentang-price-watch/i.test(jobIndexText(job)) ||
          /价格获取|价格采集|主采集|07:30|07：30/i.test(jobIndexText(job))) &&
        !/verification-gate|gate|backfill|watchdog|audit|evening|alarm|backup|health|07:20|07：20|11:00|11：00|17:00|17：00|17:30|17：30|23:00|23：00|03:00|03：00|验证门控|快速验证|巡检|上午缺口|补录|告警|健康|备份/i.test(
          jobIndexText(job)
        )
    )
  }
  if (key === 'watchdog')
    return jobs.find((job) => /watchdog|巡检|上午缺口|11:00|11：00/i.test(jobIndexText(job)))
  if (key === 'backfill')
    return jobs.find((job) => /backfill|失败数据补采|补录|17:00|17：00/i.test(jobIndexText(job)))
  if (key === 'alarm')
    return jobs.find((job) => /evening|alarm|晚间通知|告警|17:30|17：30/i.test(jobIndexText(job)))
  if (key === 'health')
    return jobs.find((job) => /cron-health|health|状态巡检|健康检查|健康/i.test(jobIndexText(job)))
  if (key === 'backup')
    return jobs.find((job) => /backup|sqlite 备份|数据备份|备份/i.test(jobIndexText(job)))
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
  const duration =
    job.state?.lastDurationMs != null ? ` · ${(job.state.lastDurationMs / 1000).toFixed(1)}s` : ''
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
    { key: 'backup', label: '03:00 数据备份', hint: 'SQLite 备份' }
  ]
  return defs.map((def) => {
    const job = findPriceStageJob(def.key)
    return {
      ...def,
      job,
      type: priceStageType(job),
      status: priceStageStatus(job),
      detail: priceStageDetail(job, def.hint),
      nextRun: job?.nextRun ? formatShortDateTime(job.nextRun) : '-'
    }
  })
})

const configuredPriceStageCount = computed(
  () => priceWorkflowStages.value.filter((stage) => stage.job).length
)

// Soonest next run
const nextRunText = computed(() => {
  const upcoming = cronStore.jobs
    .filter((j) => j.enabled && j.nextRun)
    .map((j) => ({ name: j.name, time: new Date(j.nextRun!).getTime() }))
    .sort((a, b) => a.time - b.time)
  if (!upcoming.length) return '-'
  return formatShortDateTime(upcoming[0]!.time)
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
          ? h(
              NText,
              { depth: 3, style: 'display: block; font-size: 12px; margin-top: 2px;' },
              { default: () => (desc.length > 60 ? desc.slice(0, 60) + '...' : desc) }
            )
          : null
      ])
    }
  },
  {
    title: t('pages.cron.table.jobs.schedule'),
    key: 'schedule',
    width: 160,
    render(row) {
      return h(
        NTag,
        { size: 'small', bordered: false, round: true },
        { default: () => row.schedule || '-' }
      )
    }
  },
  {
    title: t('pages.cron.table.jobs.nextRun'),
    key: 'nextRun',
    width: 180,
    render(row) {
      const nextRun = row.nextRun
      if (!nextRun) return h(NText, { depth: 3 }, { default: () => '-' })
      return h(
        NText,
        { depth: 2, style: 'font-size: 13px;' },
        { default: () => formatDate(nextRun) }
      )
    }
  },
  {
    title: t('pages.cron.table.jobs.lastRun'),
    key: 'lastRun',
    width: 160,
    render(row) {
      if (!row.state?.lastRunAtMs) return h(NText, { depth: 3 }, { default: () => '-' })
      return h(
        NText,
        { depth: 2, style: 'font-size: 13px;' },
        {
          default: () => formatRelativeTime(row.state!.lastRunAtMs!)
        }
      )
    }
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
        skipped: 'warning'
      }
      const labelMap: Record<string, string> = { ok: 'OK', error: 'Error', skipped: 'Skipped' }
      return h(
        NTag,
        {
          type: typeMap[status] || 'default',
          size: 'small',
          bordered: false,
          round: true
        },
        { default: () => labelMap[status] || status }
      )
    }
  },
  {
    title: t('pages.cron.table.jobs.status'),
    key: 'enabled',
    width: 100,
    render(row) {
      return h(
        NTag,
        {
          type: row.enabled ? 'success' : 'default',
          size: 'small',
          bordered: false,
          round: true
        },
        {
          default: () =>
            row.enabled ? t('pages.cron.jobStatus.enabled') : t('pages.cron.jobStatus.disabled')
        }
      )
    }
  },
  {
    title: t('pages.cron.table.jobs.actions'),
    key: 'actions',
    width: 160,
    fixed: 'right',
    render(row) {
      return h(
        NSpace,
        { size: 4 },
        {
          default: () => [
            // Run now
            h(
              NTooltip,
              {},
              {
                trigger: () =>
                  h(
                    NButton,
                    {
                      size: 'tiny',
                      quaternary: true,
                      onClick: () => handleRun(row)
                    },
                    { icon: () => h(NIcon, { component: PlayOutline }) }
                  ),
                default: () => t('pages.cron.actions.runNow')
              }
            ),
            // Toggle
            h(
              NTooltip,
              {},
              {
                trigger: () =>
                  h(
                    NButton,
                    {
                      size: 'tiny',
                      quaternary: true,
                      type: row.enabled ? 'warning' : 'success',
                      onClick: () => handleToggle(row)
                    },
                    {
                      icon: () =>
                        h(NIcon, {
                          component: row.enabled ? PauseCircleOutline : CheckmarkCircleOutline
                        })
                    }
                  ),
                default: () =>
                  row.enabled ? t('pages.cron.actions.disable') : t('pages.cron.actions.enable')
              }
            ),
            // Edit
            h(
              NTooltip,
              {},
              {
                trigger: () =>
                  h(
                    NButton,
                    {
                      size: 'tiny',
                      quaternary: true,
                      onClick: () => handleEdit(row)
                    },
                    { icon: () => h(NIcon, { component: CreateOutline }) }
                  ),
                default: () => t('pages.cron.actions.edit')
              }
            ),
            // Delete
            h(
              NPopconfirm,
              {
                onPositiveClick: () => handleDelete(row)
              },
              {
                trigger: () =>
                  h(
                    NButton,
                    { size: 'tiny', quaternary: true, type: 'error' },
                    {
                      icon: () => h(NIcon, { component: TrashOutline })
                    }
                  ),
                default: () => t('pages.cron.confirmDeleteJob')
              }
            )
          ]
        }
      )
    }
  }
])

// ── Expandable row ──
function renderExpand(row: CronJob) {
  if (!row.state?.lastRunAtMs) {
    return h(
      'div',
      { style: 'text-align: center; padding: 16px;' },
      h(NText, { depth: 3 }, { default: () => t('pages.cron.expandedRow.noData') })
    )
  }
  return h(
    NDescriptions,
    {
      labelPlacement: 'left',
      column: 1,
      bordered: true,
      size: 'small',
      style: 'max-width: 500px;'
    },
    {
      default: () =>
        [
          h(
            NDescriptionsItem,
            { label: t('pages.cron.expandedRow.lastRunTime') },
            {
              default: () =>
                row.state?.lastRunAtMs ? new Date(row.state.lastRunAtMs).toLocaleString() : '-'
            }
          ),
          h(
            NDescriptionsItem,
            { label: t('pages.cron.expandedRow.duration') },
            {
              default: () =>
                row.state?.lastDurationMs != null
                  ? `${(row.state.lastDurationMs / 1000).toFixed(1)}s`
                  : '-'
            }
          ),
          h(
            NDescriptionsItem,
            { label: t('pages.cron.expandedRow.consecutiveErrors') },
            {
              default: () =>
                h(
                  NText,
                  {
                    type: (row.state?.consecutiveErrors || 0) > 0 ? 'error' : undefined,
                    depth: (row.state?.consecutiveErrors || 0) > 0 ? undefined : 3
                  },
                  { default: () => String(row.state?.consecutiveErrors || 0) }
                )
            }
          ),
          row.state?.lastStatus === 'error' && row.state?.lastError
            ? h(
                NDescriptionsItem,
                { label: t('pages.cron.expandedRow.errorDetail') },
                {
                  default: () =>
                    h(
                      NAlert,
                      { type: 'error', style: 'font-size: 12px;' },
                      { default: () => row.state?.lastError || '' }
                    )
                }
              )
            : null,
          h(
            NDescriptionsItem,
            { label: t('pages.cron.expandedRow.nextRunTime') },
            {
              default: () => (row.nextRun ? new Date(row.nextRun).toLocaleString() : '-')
            }
          )
        ].filter(Boolean)
    }
  )
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
    enabled: job.enabled
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
      enabled: form.value.enabled
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
      enabled: form.value.enabled
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
    message.success(
      job.enabled ? t('pages.cron.messages.jobDisabled') : t('pages.cron.messages.jobEnabled')
    )
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

async function focusJobInTechnicalDetails(job: CronJob) {
  search.value = job.name
  technicalDetailsOpen.value = true
  await nextTick()
  technicalDetailsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function handleStageAction(stage: PriceWorkflowStage) {
  if (!stage.job) return
  if (stage.type === 'success') {
    focusJobInTechnicalDetails(stage.job)
    return
  }
  handleRun(stage.job)
}

function stageActionLabel(stage: PriceWorkflowStage): string {
  if (!stage.job) return '未配置'
  if (stage.type === 'success') return stage.key === 'gate' ? '运行' : '详情'
  return stage.key === 'gate' ? '运行' : '补跑'
}

function syncTechnicalDetailsOpen(event: Event) {
  technicalDetailsOpen.value = (event.target as HTMLDetailsElement).open
}

function focusAttentionJob() {
  if (attentionJob.value) focusJobInTechnicalDetails(attentionJob.value)
}

function runAttentionJob() {
  if (attentionJob.value) handleRun(attentionJob.value)
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
  }
)
</script>

<template>
  <div class="cron-page">
    <section class="cron-hero">
      <div>
        <div class="cron-eyebrow">任务计划</div>
        <h1>按业务流处理任务</h1>
        <p>闭环状态、下一步动作和技术细节集中在一页处理。</p>
      </div>
      <div class="cron-hero-actions">
        <NButton :loading="cronStore.loading" secondary @click="handleRefresh">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          刷新
        </NButton>
        <NPopover trigger="click" placement="bottom-end" :show-arrow="false">
          <template #trigger>
            <NButton type="primary">
              <template #icon><NIcon :component="AddOutline" /></template>
              新建任务
            </NButton>
          </template>
          <div class="template-menu">
            <div class="template-menu-title">选择模板</div>
            <button
              type="button"
              class="template-row"
              @click="
                handleTemplate({
                  name: t('pages.cron.templates.morningReport.label'),
                  schedule: '0 7 * * *',
                  prompt: t('pages.cron.templates.morningReport.payloadText')
                })
              "
            >
              <span>
                <strong>{{ t('pages.cron.templates.morningReport.label') }}</strong>
                <small>07:00 触发，适合固定摘要。</small>
              </span>
              <span class="template-use">使用</span>
            </button>
            <button
              type="button"
              class="template-row"
              @click="
                handleTemplate({
                  name: t('pages.cron.templates.heartbeatCheck.label'),
                  schedule: '*/30 * * * *',
                  prompt: t('pages.cron.templates.heartbeatCheck.payloadText')
                })
              "
            >
              <span>
                <strong>{{ t('pages.cron.templates.heartbeatCheck.label') }}</strong>
                <small>每 30 分钟检查服务可用性。</small>
              </span>
              <span class="template-use">使用</span>
            </button>
            <button
              type="button"
              class="template-row"
              @click="
                handleTemplate({
                  name: t('pages.cron.templates.mainReminder.label'),
                  schedule: '0 9,14,18 * * 1-5',
                  prompt: t('pages.cron.templates.mainReminder.payloadText')
                })
              "
            >
              <span>
                <strong>{{ t('pages.cron.templates.mainReminder.label') }}</strong>
                <small>工作日 09:00 / 14:00 / 18:00。</small>
              </span>
              <span class="template-use">使用</span>
            </button>
            <NButton block secondary size="small" @click="handleCreate">自定义任务</NButton>
          </div>
        </NPopover>
      </div>
    </section>

    <section class="cron-summary-strip" aria-label="任务状态摘要">
      <div class="cron-metric">
        <span>业务分组</span>
        <strong>{{ TASK_GROUP_DEFS.length }}</strong>
      </div>
      <div class="cron-metric">
        <span>启用任务</span>
        <strong>{{ enabledCount }}</strong>
      </div>
      <div class="cron-metric">
        <span>需处理</span>
        <strong :class="{ 'metric-warning': issueCount }">{{ issueCount }}</strong>
      </div>
      <div class="cron-metric">
        <span>下次运行</span>
        <strong class="metric-time">{{ nextRunText }}</strong>
      </div>
    </section>

    <section v-if="attentionJob" class="cron-attention" aria-label="待处理任务">
      <div class="attention-copy">
        <div class="attention-title">{{ attentionJob.name }} 需要确认</div>
        <p>{{ attentionJob.state?.lastError || recoveryAdvice(attentionJob) }}</p>
      </div>
      <div class="attention-actions">
        <NButton secondary @click="focusAttentionJob">定位日志</NButton>
        <NButton type="primary" @click="runAttentionJob">
          <template #icon><NIcon :component="PlayOutline" /></template>
          一键补跑
        </NButton>
      </div>
    </section>

    <section ref="priceWorkflowSectionRef" class="cron-section-anchor task-workbench">
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
          <span class="task-group-meta"
            >{{ group.count }} 个任务 · 下次 {{ group.nextRunText }}</span
          >
        </button>
      </div>

      <div class="task-group-panel" role="tabpanel">
        <div class="task-panel-head">
          <div>
            <NText strong class="task-panel-title">
              {{ activeTaskGroup === 'price' ? '价格监控闭环' : currentTaskGroup.label }}
            </NText>
            <NText depth="3" class="task-panel-note">
              {{
                activeTaskGroup === 'price'
                  ? '验证、采集、补录、告警和健康检查集中处理。'
                  : currentTaskGroup.description
              }}
            </NText>
          </div>
          <NTag
            size="small"
            :type="
              currentTaskGroup.issueCount
                ? 'warning'
                : currentTaskGroup.count
                  ? 'success'
                  : 'default'
            "
            round
            :bordered="false"
          >
            {{
              currentTaskGroup.issueCount
                ? `${currentTaskGroup.issueCount} 项需关注`
                : `${currentTaskGroup.count} 个任务`
            }}
          </NTag>
        </div>

        <template v-if="activeTaskGroup === 'price'">
          <div class="workflow-list">
            <div v-for="stage in priceWorkflowStages" :key="stage.key" class="workflow-row">
              <div class="workflow-copy">
                <NText strong class="workflow-title">{{ stage.label }}</NText>
                <NText depth="3" class="workflow-hint">{{ stage.hint }}</NText>
                <NText
                  v-if="stage.detail"
                  class="workflow-detail"
                  :type="stage.type === 'error' ? 'error' : undefined"
                >
                  {{ stage.detail }}
                </NText>
              </div>
              <NTag class="workflow-status" size="small" :type="stage.type" round :bordered="false">
                {{ stage.status }}
              </NTag>
              <NText depth="3" class="workflow-time">{{ stage.nextRun }}</NText>
              <NButton
                size="small"
                :type="stage.type === 'error' || stage.type === 'warning' ? 'primary' : 'default'"
                :secondary="stage.type === 'success'"
                :disabled="!stage.job"
                @click="handleStageAction(stage)"
              >
                <template #icon><NIcon :component="PlayOutline" /></template>
                {{ stageActionLabel(stage) }}
              </NButton>
            </div>
          </div>

          <NAlert
            v-if="!configuredPriceStageCount"
            type="warning"
            :closable="false"
            style="margin-top: 12px"
          >
            未发现 jd-tongrentang-price-watch 相关 Cron 任务。请先确认自建 skill 已同步，并检查 Cron
            jobs 配置。
          </NAlert>
        </template>

        <div v-else class="workflow-list">
          <div v-for="job in currentGroupJobs" :key="`group-${job.id}`" class="workflow-row">
            <div class="workflow-copy">
              <NText strong class="workflow-title">{{ job.name }}</NText>
              <NText depth="3" class="workflow-hint">
                {{ job.description || job.command || '未填写说明' }}
              </NText>
              <NText v-if="job.state?.lastError" type="error" class="workflow-detail">
                {{ job.state.lastError }}
              </NText>
            </div>
            <NTag
              class="workflow-status"
              size="small"
              :type="cronStatusType(job)"
              round
              :bordered="false"
            >
              {{ cronStatusLabel(job) }}
            </NTag>
            <NText depth="3" class="workflow-time">
              {{ job.nextRun ? formatShortDateTime(job.nextRun) : '-' }}
            </NText>
            <NButton
              size="small"
              secondary
              @click="jobHasIssue(job) ? handleRun(job) : focusJobInTechnicalDetails(job)"
            >
              <template #icon
                ><NIcon :component="jobHasIssue(job) ? PlayOutline : CreateOutline"
              /></template>
              {{ jobHasIssue(job) ? '补跑' : '详情' }}
            </NButton>
          </div>
          <NAlert v-if="!currentGroupJobs.length" type="default" :closable="false">
            当前分组暂无任务。新建任务后会按名称、描述和命令自动归类到这里。
          </NAlert>
        </div>
      </div>
    </section>

    <details
      ref="technicalDetailsRef"
      class="cron-advanced"
      :open="technicalDetailsOpen"
      @toggle="syncTechnicalDetailsOpen"
    >
      <summary>
        <span>Cron 技术表与最近执行</span>
        <span class="advanced-label">高级明细</span>
      </summary>
      <div class="advanced-body">
        <div v-if="recentJobs.length" class="recent-strip">
          <div v-for="job in recentJobs" :key="`recent-${job.id}`" class="recent-item">
            <div class="recent-main">
              <NText strong>{{ job.name }}</NText>
              <NTag size="small" :type="cronStatusType(job)" round :bordered="false">
                {{ cronStatusLabel(job) }}
              </NTag>
            </div>
            <NText depth="3" class="recent-meta">
              上次 {{ cronRelativeTime(job.state?.lastRunAtMs) }}
              <template v-if="job.state?.lastDurationMs != null">
                · {{ (job.state.lastDurationMs / 1000).toFixed(1) }}s
              </template>
            </NText>
          </div>
        </div>

        <div class="tech-toolbar">
          <NInput
            v-model:value="search"
            :placeholder="`${currentTaskGroup.label}内搜索 Cron 任务`"
            clearable
            size="small"
          />
          <NButton size="small" secondary @click="search = ''">清空筛选</NButton>
        </div>

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
          <NText
            v-if="!cronStore.loading && cronStore.jobs.length === 0"
            depth="3"
            style="display: block; text-align: center; padding: 24px 0"
          >
            {{ t('pages.cron.jobs.emptyHint') }}
          </NText>
        </NSpin>
      </div>
    </details>

    <NAlert v-if="cronStore.lastError" type="error" :closable="true" style="margin-top: 12px">
      {{ t('pages.cron.requestFailed', { error: cronStore.lastError }) }}
    </NAlert>

    <!-- Create / Edit Modal -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="editingJob ? t('pages.cron.modal.editTitle') : t('pages.cron.modal.createTitle')"
      style="max-width: 520px"
      :mask-closable="false"
    >
      <NForm ref="formRef" :model="form" label-placement="left" label-width="100">
        <NFormItem :label="t('pages.cron.form.name')" path="name">
          <NInput v-model:value="form.name" :placeholder="t('pages.cron.form.namePlaceholder')" />
        </NFormItem>
        <NFormItem :label="t('pages.cron.form.cronExpr')" path="schedule">
          <NInput
            v-model:value="form.schedule"
            :placeholder="t('pages.cron.form.cronExprPlaceholder')"
          />
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
            {{
              editingJob ? t('pages.cron.actions.saveChanges') : t('pages.cron.actions.createJob')
            }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.cron-page {
  font-size: var(--font-body);
  display: grid;
  gap: var(--ui-gap);
}

.cron-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--ui-gap);
  align-items: start;
}

.cron-eyebrow {
  color: var(--n-text-color-3);
  font-size: var(--font-body-sm);
  font-weight: 700;
  margin-bottom: 8px;
}

.cron-hero h1 {
  margin: 0;
  font-size: clamp(32px, 4vw, 48px);
  line-height: 1.05;
  letter-spacing: 0;
}

.cron-hero p {
  margin: 12px 0 0;
  color: var(--n-text-color-3);
  font-size: var(--font-body);
  line-height: 1.7;
}

.cron-hero-actions,
.attention-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-gap-sm);
}

.template-menu {
  width: 320px;
  max-width: calc(100vw - 48px);
}

.template-menu-title {
  font-weight: 800;
  margin-bottom: var(--ui-gap-sm);
}

.template-row {
  appearance: none;
  width: 100%;
  border: 1px solid var(--n-border-color);
  border-radius: var(--radius);
  background: transparent;
  color: var(--n-text-color);
  padding: 10px;
  margin-bottom: var(--ui-gap-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-gap-sm);
  text-align: left;
  cursor: pointer;
}

.template-row:hover {
  border-color: rgba(99, 226, 183, 0.44);
  background: rgba(99, 226, 183, 0.08);
}

.template-row strong,
.template-row small {
  display: block;
}

.template-row small {
  color: var(--n-text-color-3);
  margin-top: 3px;
  line-height: 1.35;
}

.template-use {
  color: var(--n-primary-color);
  font-weight: 700;
  white-space: nowrap;
}

.cron-summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-gap-sm);
}

.cron-metric {
  border: 1px solid var(--n-border-color);
  border-radius: var(--radius);
  background: var(--n-card-color);
  padding: var(--ui-panel-padding-sm) 14px;
  min-width: 0;
}

.cron-metric span {
  display: block;
  color: var(--n-text-color-3);
  font-size: var(--font-body-sm);
  font-weight: 700;
}

.cron-metric strong {
  display: block;
  margin-top: 8px;
  font-size: var(--font-section-title);
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-warning {
  color: #f2c66d;
}

.metric-time {
  font-size: var(--font-card-title) !important;
}

.cron-attention {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-gap);
  border: 1px solid rgba(242, 198, 109, 0.55);
  border-radius: var(--radius);
  background: rgba(242, 198, 109, 0.13);
  padding: var(--ui-panel-padding-sm) 14px;
}

.attention-copy {
  min-width: 0;
}

.attention-title {
  font-size: var(--font-card-title);
  font-weight: 800;
}

.attention-copy p {
  margin: 6px 0 0;
  color: var(--n-text-color-3);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.cron-section-anchor {
  scroll-margin-top: 16px;
}

.task-workbench {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: var(--ui-gap);
  margin-bottom: var(--ui-gap);
  align-items: start;
}

.task-group-nav {
  display: grid;
  gap: var(--ui-gap-sm);
}

.task-group-button {
  appearance: none;
  border: 1px solid var(--n-border-color);
  border-radius: var(--radius);
  background: var(--n-card-color);
  color: var(--n-text-color);
  padding: 12px;
  text-align: left;
  display: grid;
  gap: 6px;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.task-group-button:hover {
  border-color: rgba(99, 226, 183, 0.42);
  background: rgba(99, 226, 183, 0.06);
}

.task-group-button--active {
  border-color: rgba(99, 226, 183, 0.64);
  background: rgba(99, 226, 183, 0.14);
}

.task-group-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.task-group-title {
  font-size: var(--font-card-title);
  font-weight: 700;
  min-width: 0;
}

.task-group-desc,
.task-group-meta {
  display: block;
  color: var(--n-text-color-3);
  font-size: var(--font-body-sm);
  line-height: 1.35;
}

.task-group-panel {
  border: 1px solid var(--n-border-color);
  border-radius: var(--radius);
  background: var(--n-card-color);
  padding: var(--ui-panel-padding);
  min-width: 0;
}

.task-panel-head,
.recent-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: var(--ui-gap);
}

.task-panel-title,
.task-panel-note {
  display: block;
}

.task-panel-title {
  font-size: var(--font-section-title);
}

.task-panel-note {
  margin-top: 4px;
  font-size: var(--font-body-sm);
  line-height: 1.4;
}

.workflow-list {
  display: grid;
  gap: var(--ui-gap-sm);
}

.workflow-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: var(--ui-gap);
  border: 1px solid var(--n-border-color);
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.12);
  padding: 12px;
  min-width: 0;
}

.workflow-copy {
  min-width: 0;
}

.workflow-title,
.workflow-hint,
.workflow-detail {
  display: block;
}

.workflow-title {
  font-size: var(--font-card-title);
}

.workflow-hint,
.workflow-detail {
  margin-top: 4px;
  font-size: var(--font-body-sm);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.workflow-status {
  min-width: 58px;
  justify-content: center;
}

.workflow-time {
  white-space: nowrap;
  min-width: 74px;
}

.cron-advanced {
  border: 1px solid var(--n-border-color);
  border-radius: var(--radius);
  background: var(--n-card-color);
  overflow: hidden;
  scroll-margin-top: 16px;
}

.cron-advanced summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-gap);
  padding: 14px var(--ui-panel-padding);
  font-weight: 800;
}

.cron-advanced summary::-webkit-details-marker {
  display: none;
}

.advanced-label {
  color: var(--n-text-color-3);
  font-size: var(--font-body-sm);
  font-weight: 600;
}

.advanced-body {
  border-top: 1px solid var(--n-border-color);
  padding: var(--ui-panel-padding);
}

.recent-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-gap-sm);
  margin-bottom: var(--ui-gap);
}

.recent-item {
  border: 1px solid var(--n-border-color);
  border-radius: var(--radius);
  padding: 10px;
  min-width: 0;
}

.recent-main {
  align-items: center;
  margin-bottom: 5px;
}

.recent-main :deep(.n-text) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-meta {
  display: block;
  font-size: var(--font-body-sm);
  line-height: 1.45;
}

.tech-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ui-gap-sm);
  margin-bottom: var(--ui-gap-sm);
}

.cron-mini-row {
  padding: 7px 0;
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
  font-size: var(--font-body-sm);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .cron-hero,
  .task-workbench {
    grid-template-columns: 1fr;
  }

  .cron-hero-actions,
  .attention-actions {
    justify-content: flex-start;
  }

  .cron-summary-strip,
  .recent-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cron-attention,
  .workflow-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .workflow-time {
    white-space: normal;
  }
}

@media (max-width: 560px) {
  .cron-summary-strip,
  .recent-strip {
    grid-template-columns: 1fr;
  }

  .task-panel-head,
  .tech-toolbar,
  .cron-hero-actions,
  .attention-actions {
    display: grid;
  }

  .cron-hero-actions :deep(.n-button),
  .attention-actions :deep(.n-button),
  .tech-toolbar :deep(.n-button) {
    width: 100%;
  }
}
</style>
