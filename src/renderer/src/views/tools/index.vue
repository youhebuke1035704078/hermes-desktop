<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue'
import { NCard, NDataTable, NButton, NSpace, NTag, NIcon, NInput, NGrid, NGridItem, NText } from 'naive-ui'
import { RefreshOutline, SearchOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useGatewayStore } from '../../stores/gateway'
import { useMonitorTools } from '../../composables/useMonitorApi'
import type { Tool, ToolMetric } from '../../api/types'

const gwStore = useGatewayStore()
const { t } = useI18n()
const tools = ref<Tool[]>([])
const loading = ref(false)
const searchQuery = ref('')

// Monitor metrics
const { data: metricsResp, refresh: refreshMetrics } = useMonitorTools()
const toolMetrics = computed<Record<string, ToolMetric>>(() => {
  const list = (metricsResp.value?.data as ToolMetric[] | null) ?? []
  const map: Record<string, ToolMetric> = {}
  for (const m of list) map[m.name] = m
  return map
})

// Merge admin tools with monitor metrics
const mergedTools = computed(() => {
  return tools.value.map(tool => ({
    ...tool,
    metrics: toolMetrics.value[tool.name] ?? null
  }))
})

const filteredTools = computed(() => {
  if (!searchQuery.value) return mergedTools.value
  const q = searchQuery.value.toLowerCase()
  return mergedTools.value.filter(
    (item) => item.name.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q)
  )
})

// Stats
const totalCalls = computed(() => {
  const list = (metricsResp.value?.data as ToolMetric[] | null) ?? []
  return list.reduce((sum, m) => sum + m.call_count, 0)
})
const availableCount = computed(() => {
  const list = (metricsResp.value?.data as ToolMetric[] | null) ?? []
  return list.filter(m => m.availability).length
})

const columns = computed(() => [
  { title: '工具名称', key: 'name', width: 180, ellipsis: { tooltip: true } },
  { title: '类型', key: 'type', width: 90, render: (row: any) => h(NTag, { size: 'small', bordered: false }, { default: () => row.type || '-' }) },
  { title: '描述', key: 'description', ellipsis: { tooltip: true }, render: (row: any) => row.description || '-' },
  { title: '来源', key: 'source', width: 90, render: (row: any) => row.source || '-' },
  {
    title: '可用',
    key: 'availability',
    width: 70,
    render: (row: any) => {
      if (!row.metrics) return '-'
      return h(NTag, {
        type: row.metrics.availability ? 'success' : 'error',
        size: 'small', bordered: false, round: true
      }, { default: () => row.metrics.availability ? '是' : '否' })
    }
  },
  {
    title: '调用次数',
    key: 'call_count',
    width: 90,
    render: (row: any) => row.metrics ? String(row.metrics.call_count) : '-',
    sorter: (a: any, b: any) => (a.metrics?.call_count ?? 0) - (b.metrics?.call_count ?? 0)
  },
  {
    title: '成功率',
    key: 'success_rate',
    width: 80,
    render: (row: any) => {
      if (!row.metrics) return '-'
      const rate = row.metrics.success_rate
      return h(NText, { type: rate >= 0.9 ? 'success' : rate >= 0.7 ? 'warning' : 'error' },
        { default: () => `${(rate * 100).toFixed(0)}%` })
    }
  }
])

async function fetchTools() {
  loading.value = true
  try {
    tools.value = (await gwStore.rpc.listTools()) as Tool[]
  } catch {
    tools.value = []
  } finally {
    loading.value = false
  }
}

function refreshAll() {
  fetchTools()
  refreshMetrics()
}

onMounted(fetchTools)
</script>

<template>
  <NSpace vertical :size="16">
    <NGrid cols="1 s:3" responsive="screen" :x-gap="12" :y-gap="12">
      <NGridItem>
        <NCard embedded :bordered="false" size="small">
          <NText depth="3" style="font-size: 12px">已注册工具</NText>
          <div style="font-size: 22px; font-weight: 600; margin-top: 4px">{{ tools.length }}</div>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard embedded :bordered="false" size="small">
          <NText depth="3" style="font-size: 12px">可用工具</NText>
          <div style="font-size: 22px; font-weight: 600; margin-top: 4px">{{ availableCount }}</div>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard embedded :bordered="false" size="small">
          <NText depth="3" style="font-size: 12px">总调用次数</NText>
          <div style="font-size: 22px; font-weight: 600; margin-top: 4px">{{ totalCalls.toLocaleString() }}</div>
        </NCard>
      </NGridItem>
    </NGrid>

    <NCard :title="t('nav.tools')">
      <template #header-extra>
        <NSpace :size="8">
          <NInput v-model:value="searchQuery" :placeholder="t('common.search')" size="small" clearable style="width: 200px">
            <template #prefix><NIcon :component="SearchOutline" /></template>
          </NInput>
          <NButton size="small" @click="refreshAll">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            刷新
          </NButton>
        </NSpace>
      </template>
      <NDataTable
        :columns="columns"
        :data="filteredTools"
        :loading="loading"
        :bordered="false"
        :pagination="{ pageSize: 20 }"
        :row-key="(row: any) => row.name"
        striped
        size="small"
      />
    </NCard>
  </NSpace>
</template>
