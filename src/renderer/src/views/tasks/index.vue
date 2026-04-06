<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard, NDataTable, NSpin, NButton, NAlert, NSpace,
  NSelect, NTag, type DataTableColumns
} from 'naive-ui'
import { useMonitorTasks } from '../../composables/useMonitorApi'
import { formatRelativeTime } from '../../utils/format'
import type { TaskExecution, TaskQueryParams, TaskStatus } from '../../api/types'

const { t } = useI18n()

const filterParams = ref<TaskQueryParams>({})
const { data: resp, loading, error, refresh } = useMonitorTasks(filterParams)

const tasks = computed<TaskExecution[]>(() => {
  const paginated = resp.value?.data as any
  return paginated?.data ?? []
})
const total = computed(() => {
  const paginated = resp.value?.data as any
  return paginated?.total ?? 0
})

const statusOptions = [
  { label: '全部', value: '' },
  { label: '运行中', value: 'running' },
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
  { label: '等待中', value: 'pending' },
  { label: '超时', value: 'timeout' },
  { label: '已取消', value: 'cancelled' }
]

function handleStatusChange(val: string) {
  filterParams.value = { ...filterParams.value, status: (val || undefined) as TaskStatus | undefined }
  refresh()
}

function statusTagType(status: string): 'success' | 'error' | 'warning' | 'info' | 'default' {
  switch (status) {
    case 'success': return 'success'
    case 'failed': case 'timeout': return 'error'
    case 'running': return 'warning'
    case 'pending': return 'info'
    default: return 'default'
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '等待中', running: '运行中', success: '成功',
    failed: '失败', timeout: '超时', cancelled: '已取消'
  }
  return map[status] || status
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

const columns = computed<DataTableColumns<TaskExecution>>(() => [
  {
    title: '任务名称',
    key: 'name',
    width: 180,
    ellipsis: { tooltip: true }
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row) => h(NTag, { type: statusTagType(row.status), size: 'small', bordered: false, round: true }, () => statusLabel(row.status))
  },
  {
    title: '技能',
    key: 'skill_name',
    width: 120,
    ellipsis: { tooltip: true },
    render: (row) => row.skill_name || '-'
  },
  {
    title: '模型',
    key: 'model_name',
    width: 120,
    ellipsis: { tooltip: true },
    render: (row) => row.model_name || '-'
  },
  {
    title: '来源',
    key: 'source',
    width: 100,
    ellipsis: { tooltip: true }
  },
  {
    title: '开始时间',
    key: 'started_at',
    width: 130,
    render: (row) => formatRelativeTime(row.started_at)
  },
  {
    title: '耗时',
    key: 'duration_ms',
    width: 100,
    render: (row) => formatDuration(row.duration_ms)
  }
])
</script>

<script lang="ts">
import { h } from 'vue'
export default { name: 'TasksPage' }
</script>

<template>
  <NCard :title="t('nav.tasks')">
    <template #header-extra>
      <NSpace>
        <NTag size="small" :bordered="false">共 {{ total }} 条</NTag>
        <NButton size="small" @click="refresh">刷新</NButton>
      </NSpace>
    </template>

    <NSpace style="margin-bottom: 12px">
      <NSelect
        :value="filterParams.status || ''"
        :options="statusOptions"
        size="small"
        style="width: 110px"
        placeholder="状态"
        @update:value="handleStatusChange"
      />
    </NSpace>

    <NAlert v-if="error" type="error" :show-icon="true" style="margin-bottom: 12px">
      {{ t('common.error') }}: {{ error.message }}
    </NAlert>

    <NSpin :show="loading && tasks.length === 0">
      <NDataTable
        :columns="columns"
        :data="tasks"
        :row-key="(row: TaskExecution) => row.id"
        :max-height="600"
        size="small"
        striped
      />
    </NSpin>
  </NCard>
</template>
