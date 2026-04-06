<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard, NDataTable, NSpin, NButton, NAlert, NSpace,
  NSelect, NTag, type DataTableColumns
} from 'naive-ui'
import { useAlerts } from '../../composables/useMonitorApi'
import { formatRelativeTime } from '../../utils/format'
import type { AlertEvent, AlertQueryParams, AlertSeverity, AlertState } from '../../api/types'

const { t } = useI18n()

const filterParams = ref<AlertQueryParams>({})
const { data: resp, loading, error, refresh } = useAlerts(filterParams)

const alerts = computed<AlertEvent[]>(() => {
  const paginated = resp.value?.data as any
  return paginated?.data ?? []
})
const total = computed(() => {
  const paginated = resp.value?.data as any
  return paginated?.total ?? 0
})

const severityOptions = [
  { label: '全部', value: '' },
  { label: '严重', value: 'critical' },
  { label: '警告', value: 'warning' },
  { label: '信息', value: 'info' }
]

const stateOptions = [
  { label: '全部', value: '' },
  { label: '活跃', value: 'active' },
  { label: '已解决', value: 'resolved' },
  { label: '已静默', value: 'silenced' }
]

function handleSeverityChange(val: string) {
  filterParams.value = { ...filterParams.value, severity: (val || undefined) as AlertSeverity | undefined }
  refresh()
}

function handleStateChange(val: string) {
  filterParams.value = { ...filterParams.value, state: (val || undefined) as AlertState | undefined }
  refresh()
}

function severityColor(severity: string): 'error' | 'warning' | 'info' {
  switch (severity) {
    case 'critical': return 'error'
    case 'warning': return 'warning'
    default: return 'info'
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case 'critical': return '严重'
    case 'warning': return '警告'
    default: return '信息'
  }
}

function stateLabel(state: string): string {
  switch (state) {
    case 'active': return '活跃'
    case 'resolved': return '已解决'
    case 'silenced': return '已静默'
    default: return state
  }
}

const columns = computed<DataTableColumns<AlertEvent>>(() => [
  {
    title: '级别',
    key: 'severity',
    width: 80,
    render: (row) => h(NTag, { type: severityColor(row.severity), size: 'small', bordered: false, round: true }, () => severityLabel(row.severity))
  },
  {
    title: '标题',
    key: 'title',
    width: 200,
    ellipsis: { tooltip: true }
  },
  {
    title: '消息',
    key: 'message',
    ellipsis: { tooltip: true }
  },
  {
    title: '来源',
    key: 'source',
    width: 120,
    ellipsis: { tooltip: true }
  },
  {
    title: '状态',
    key: 'state',
    width: 80,
    render: (row) => stateLabel(row.state)
  },
  {
    title: '时间',
    key: 'created_at',
    width: 130,
    render: (row) => formatRelativeTime(row.created_at)
  }
])
</script>

<script lang="ts">
import { h } from 'vue'
export default { name: 'AlertsPage' }
</script>

<template>
  <NCard :title="t('nav.alerts')">
    <template #header-extra>
      <NSpace>
        <NTag size="small" :bordered="false">共 {{ total }} 条</NTag>
        <NButton size="small" @click="refresh">刷新</NButton>
      </NSpace>
    </template>

    <NSpace style="margin-bottom: 12px">
      <NSelect
        :value="filterParams.severity || ''"
        :options="severityOptions"
        size="small"
        style="width: 100px"
        placeholder="级别"
        @update:value="handleSeverityChange"
      />
      <NSelect
        :value="filterParams.state || ''"
        :options="stateOptions"
        size="small"
        style="width: 100px"
        placeholder="状态"
        @update:value="handleStateChange"
      />
    </NSpace>

    <NAlert v-if="error" type="error" :show-icon="true" style="margin-bottom: 12px">
      {{ t('common.error') }}: {{ error.message }}
    </NAlert>

    <NSpin :show="loading && alerts.length === 0">
      <NDataTable
        :columns="columns"
        :data="alerts"
        :row-key="(row: AlertEvent) => row.id"
        :max-height="600"
        size="small"
        striped
      />
    </NSpin>
  </NCard>
</template>
