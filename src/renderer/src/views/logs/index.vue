<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard, NDataTable, NSpin, NButton, NAlert, NSpace,
  NSelect, NInput, NTag, type DataTableColumns
} from 'naive-ui'
import { useMonitorLogs } from '../../composables/useMonitorApi'
import { formatDate } from '../../utils/format'
import type { LogEntry, LogQueryParams } from '../../api/types'

const { t } = useI18n()

const filterParams = ref<LogQueryParams>({})
const searchInput = ref('')
const { data: resp, loading, error, refresh } = useMonitorLogs(filterParams)

const logs = computed<LogEntry[]>(() => {
  const paginated = resp.value?.data as any
  return paginated?.data ?? []
})
const total = computed(() => {
  const paginated = resp.value?.data as any
  return paginated?.total ?? 0
})

const levelOptions = [
  { label: '全部', value: '' },
  { label: 'ERROR', value: 'error' },
  { label: 'WARN', value: 'warn' },
  { label: 'INFO', value: 'info' },
  { label: 'DEBUG', value: 'debug' }
]

function handleLevelChange(val: string) {
  filterParams.value = { ...filterParams.value, level: val || undefined }
  refresh()
}

function handleSearch() {
  filterParams.value = { ...filterParams.value, search: searchInput.value || undefined }
  refresh()
}

function levelTagType(level: string): 'error' | 'warning' | 'info' | 'default' {
  switch (level?.toLowerCase()) {
    case 'error': case 'fatal': return 'error'
    case 'warn': case 'warning': return 'warning'
    case 'info': return 'info'
    default: return 'default'
  }
}

const columns = computed<DataTableColumns<LogEntry>>(() => [
  {
    title: '时间',
    key: 'timestamp',
    width: 170,
    render: (row) => formatDate(row.timestamp)
  },
  {
    title: '级别',
    key: 'level',
    width: 80,
    render: (row) => h(NTag, { type: levelTagType(row.level), size: 'small', bordered: false }, () => row.level.toUpperCase())
  },
  {
    title: '服务',
    key: 'service_name',
    width: 120,
    ellipsis: { tooltip: true },
    render: (row) => row.service_name || '-'
  },
  {
    title: '消息',
    key: 'message',
    ellipsis: { tooltip: true }
  },
  {
    title: 'Trace',
    key: 'trace_id',
    width: 140,
    ellipsis: { tooltip: true },
    render: (row) => row.trace_id || '-'
  }
])
</script>

<script lang="ts">
import { h } from 'vue'
export default { name: 'LogsPage' }
</script>

<template>
  <NCard :title="t('nav.logs')">
    <template #header-extra>
      <NSpace>
        <NTag size="small" :bordered="false">共 {{ total }} 条</NTag>
        <NButton size="small" @click="refresh">刷新</NButton>
      </NSpace>
    </template>

    <NSpace style="margin-bottom: 12px">
      <NSelect
        :value="filterParams.level || ''"
        :options="levelOptions"
        size="small"
        style="width: 100px"
        placeholder="级别"
        @update:value="handleLevelChange"
      />
      <NInput
        v-model:value="searchInput"
        size="small"
        placeholder="搜索日志..."
        clearable
        style="width: 220px"
        @keyup.enter="handleSearch"
      />
      <NButton size="small" @click="handleSearch">搜索</NButton>
    </NSpace>

    <NAlert v-if="error" type="error" :show-icon="true" style="margin-bottom: 12px">
      {{ t('common.error') }}: {{ error.message }}
    </NAlert>

    <NSpin :show="loading && logs.length === 0">
      <NDataTable
        :columns="columns"
        :data="logs"
        :row-key="(row: any) => row.timestamp + row.message"
        :max-height="600"
        size="small"
        striped
      />
    </NSpin>
  </NCard>
</template>
