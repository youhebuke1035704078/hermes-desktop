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

// ── State ──
const search = ref('')
const showModal = ref(false)
const editingJob = ref<CronJob | null>(null)
const priceWorkflowSectionRef = ref<HTMLElement | null>(null)

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
  if (!q) return cronStore.jobs
  return cronStore.jobs.filter(j =>
    j.name.toLowerCase().includes(q) ||
    (j.description || '').toLowerCase().includes(q) ||
    (j.command || '').toLowerCase().includes(q)
  )
})

const enabledCount = computed(() => cronStore.jobs.filter(j => j.enabled).length)
const disabledCount = computed(() => cronStore.jobs.filter(j => !j.enabled).length)
const runningCount = computed(() => cronStore.jobs.filter(j => j.state?.runningAtMs).length)
const failedCount = computed(() => cronStore.jobs.filter(j => j.enabled && j.state?.lastStatus === 'error').length)

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

const priceMonitorJobs = computed(() =>
  cronStore.jobs.filter(job => /jd-tongrentang-price-watch|tongrentang|cron-health/i.test(job.name)),
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

const priceWorkflowIssueCount = computed(() =>
  priceWorkflowStages.value.filter(stage => stage.type === 'error' || stage.type === 'warning' || !stage.job).length,
)

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

async function scrollToPriceWorkflowIfRequested(): Promise<void> {
  if (route.query.focus !== 'price-monitor') return
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

      <!-- Price monitor workflow -->
      <div ref="priceWorkflowSectionRef" class="cron-section-anchor">
        <NCard embedded :bordered="false" size="small" style="border-radius: 10px; margin-bottom: 16px;">
          <template #header>
            <NSpace align="center" :size="8">
              <NText strong>价格监控闭环</NText>
              <NTag
                size="small"
                :type="priceWorkflowIssueCount ? 'warning' : 'success'"
                round
                :bordered="false"
              >
                {{ priceWorkflowIssueCount ? `${priceWorkflowIssueCount} 项需关注` : '运行正常' }}
              </NTag>
            </NSpace>
          </template>
          <template #header-extra>
            <NButton
              v-if="priceMonitorJobs.length"
              size="small"
              secondary
              @click="search = 'jd-tongrentang'"
            >
              筛选任务
            </NButton>
          </template>

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
        </NCard>
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

      <!-- Search -->
      <NInput
        v-model:value="search"
        :placeholder="t('pages.cron.jobs.searchPlaceholder')"
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

.price-workflow-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
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
  .price-workflow-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .price-workflow-grid {
    grid-template-columns: 1fr;
  }
}
</style>
