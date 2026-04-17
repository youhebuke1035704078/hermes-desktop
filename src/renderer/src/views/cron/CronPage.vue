<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
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

// ── State ──
const search = ref('')
const showModal = ref(false)
const editingJob = ref<CronJob | null>(null)

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

// ── Lifecycle ──
onMounted(() => {
  cronStore.fetchJobs()
})
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
