<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard, NDataTable, NSpin, NButton, NAlert,
  NSpace, NTag, type DataTableColumns
} from 'naive-ui'
import StatusBadge from '../../components/ui/StatusBadge.vue'
import { useServices } from '../../composables/useMonitorApi'
import type { Service } from '../../api/types'

const { t } = useI18n()
const { data: resp, loading, error, refresh } = useServices()

const services = computed<Service[]>(() => (resp.value?.data as Service[] | null) ?? [])

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    main: '主服务', worker: 'Worker', scheduler: '调度器',
    mcp: 'MCP', database: '数据库', cache: '缓存',
    queue: '队列', api_gateway: 'API 网关', other: '其他'
  }
  return map[type] || type
}

function typeTagType(type: string): 'info' | 'success' | 'warning' | 'error' | 'default' {
  switch (type) {
    case 'main': return 'success'
    case 'database': case 'cache': return 'warning'
    case 'mcp': return 'info'
    default: return 'default'
  }
}

const columns = computed<DataTableColumns<Service>>(() => [
  {
    title: '服务名称',
    key: 'name',
    width: 160,
    ellipsis: { tooltip: true }
  },
  {
    title: '类型',
    key: 'type',
    width: 100,
    render: (row) => h(NTag, { type: typeTagType(row.type), size: 'small', bordered: false, round: true }, () => typeLabel(row.type))
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (row) => h(StatusBadge, { status: row.status }, () => t(`status.${row.status}`))
  },
  {
    title: 'CPU',
    key: 'cpu_percent',
    width: 80,
    render: (row) => `${row.cpu_percent.toFixed(1)}%`
  },
  {
    title: '内存',
    key: 'memory_mb',
    width: 90,
    render: (row) => `${row.memory_mb.toFixed(0)} MB`
  },
  {
    title: '错误率',
    key: 'error_rate',
    width: 80,
    render: (row) => `${(row.error_rate * 100).toFixed(2)}%`
  },
  {
    title: '延迟',
    key: 'avg_latency_ms',
    width: 80,
    render: (row) => `${row.avg_latency_ms.toFixed(0)} ms`
  },
  {
    title: '运行时间',
    key: 'uptime_seconds',
    width: 110,
    render: (row) => formatUptime(row.uptime_seconds)
  }
])
</script>

<script lang="ts">
import { h } from 'vue'
export default { name: 'ServicesPage' }
</script>

<template>
  <NCard :title="t('nav.services')">
    <template #header-extra>
      <NSpace>
        <NTag size="small" :bordered="false">{{ services.length }} 个服务</NTag>
        <NButton size="small" @click="refresh">刷新</NButton>
      </NSpace>
    </template>

    <NAlert v-if="error" type="error" :show-icon="true" style="margin-bottom: 12px">
      {{ t('common.error') }}: {{ error.message }}
    </NAlert>

    <NSpin :show="loading && services.length === 0">
      <NDataTable
        :columns="columns"
        :data="services"
        :row-key="(row: Service) => row.id"
        :max-height="600"
        size="small"
        striped
      />
    </NSpin>
  </NCard>
</template>
