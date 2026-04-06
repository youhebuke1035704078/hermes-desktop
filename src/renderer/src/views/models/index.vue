<script setup lang="ts">
import { onMounted, computed, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard, NDataTable, NButton, NSpace, NTag, NIcon, NGrid, NGridItem,
  NText, NSpin, NAlert, type DataTableColumns
} from 'naive-ui'
import { RefreshOutline } from '@vicons/ionicons5'
import { useModelStore } from '../../stores/model'
import { useMonitorModels } from '../../composables/useMonitorApi'
import type { ModelMetric } from '../../api/types'

const { t } = useI18n()
const modelStore = useModelStore()

// Admin models
onMounted(() => modelStore.fetchModels())

// Monitor metrics
const { data: metricsResp, error: metricsError, refresh: refreshMetrics } = useMonitorModels()

const modelMetrics = computed<ModelMetric[]>(() =>
  (metricsResp.value?.data as ModelMetric[] | null) ?? []
)

// Merge admin + monitor data
const mergedModels = computed(() => {
  const adminModels = (modelStore.models as any[]) || []
  const metricsMap = new Map<string, ModelMetric>()
  for (const m of modelMetrics.value) {
    metricsMap.set(`${m.provider}/${m.model}`, m)
  }

  // Start with admin models, enrich with metrics
  const result = adminModels.map((am: any) => {
    const key = `${am.provider || ''}/${am.model || am.name || ''}`
    const metrics = metricsMap.get(key) || null
    metricsMap.delete(key) // mark as matched
    return { ...am, metrics }
  })

  // Add monitor-only models not in admin
  for (const [, m] of metricsMap) {
    result.push({
      id: `${m.provider}/${m.model}`,
      provider: m.provider,
      name: m.model,
      model: m.model,
      enabled: true,
      metrics: m
    })
  }

  return result
})

// Stats
const totalCalls = computed(() => modelMetrics.value.reduce((sum, m) => sum + m.total_calls, 0))
const totalCost = computed(() => modelMetrics.value.reduce((sum, m) => sum + m.cost_estimate_usd, 0))
const totalTokens = computed(() =>
  modelMetrics.value.reduce((sum, m) => sum + m.total_input_tokens + m.total_output_tokens, 0)
)

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`
  return `${(n / 1_000_000).toFixed(2)}M`
}

const columns = computed<DataTableColumns>(() => [
  {
    title: '模型',
    key: 'name',
    width: 200,
    ellipsis: { tooltip: true },
    render: (row: any) => row.model || row.name || '-'
  },
  {
    title: '供应商',
    key: 'provider',
    width: 120,
    render: (row: any) => h(NTag, { size: 'small', bordered: false }, { default: () => row.provider || '-' })
  },
  {
    title: '状态',
    key: 'enabled',
    width: 70,
    render: (row: any) => h(NTag, {
      type: row.enabled !== false ? 'success' : 'default',
      size: 'small', bordered: false, round: true
    }, { default: () => row.enabled !== false ? '启用' : '禁用' })
  },
  {
    title: '调用次数',
    key: 'total_calls',
    width: 100,
    render: (row: any) => row.metrics ? row.metrics.total_calls.toLocaleString() : '-',
    sorter: (a: any, b: any) => (a.metrics?.total_calls ?? 0) - (b.metrics?.total_calls ?? 0)
  },
  {
    title: '输入 Token',
    key: 'input_tokens',
    width: 110,
    render: (row: any) => row.metrics ? formatTokens(row.metrics.total_input_tokens) : '-'
  },
  {
    title: '输出 Token',
    key: 'output_tokens',
    width: 110,
    render: (row: any) => row.metrics ? formatTokens(row.metrics.total_output_tokens) : '-'
  },
  {
    title: '平均延迟',
    key: 'avg_latency_ms',
    width: 90,
    render: (row: any) => row.metrics ? `${row.metrics.avg_latency_ms.toFixed(0)} ms` : '-'
  },
  {
    title: '预估费用',
    key: 'cost',
    width: 100,
    render: (row: any) => row.metrics ? `$${row.metrics.cost_estimate_usd.toFixed(4)}` : '-',
    sorter: (a: any, b: any) => (a.metrics?.cost_estimate_usd ?? 0) - (b.metrics?.cost_estimate_usd ?? 0)
  }
])

function refreshAll() {
  modelStore.fetchModels()
  refreshMetrics()
}
</script>

<template>
  <NSpace vertical :size="16">
    <NGrid cols="1 s:3" responsive="screen" :x-gap="12" :y-gap="12">
      <NGridItem>
        <NCard embedded :bordered="false" size="small">
          <NText depth="3" style="font-size: 12px">总调用次数</NText>
          <div style="font-size: 22px; font-weight: 600; margin-top: 4px">{{ totalCalls.toLocaleString() }}</div>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard embedded :bordered="false" size="small">
          <NText depth="3" style="font-size: 12px">Token 消耗</NText>
          <div style="font-size: 22px; font-weight: 600; margin-top: 4px">{{ formatTokens(totalTokens) }}</div>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard embedded :bordered="false" size="small">
          <NText depth="3" style="font-size: 12px">预估总费用</NText>
          <div style="font-size: 22px; font-weight: 600; margin-top: 4px">${{ totalCost.toFixed(4) }}</div>
        </NCard>
      </NGridItem>
    </NGrid>

    <NCard :title="t('nav.models')">
      <template #header-extra>
        <NSpace>
          <NTag size="small" :bordered="false">{{ mergedModels.length }} 个模型</NTag>
          <NButton size="small" @click="refreshAll">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            刷新
          </NButton>
        </NSpace>
      </template>

      <NAlert v-if="metricsError" type="warning" :show-icon="true" style="margin-bottom: 12px">
        监控数据加载失败: {{ metricsError.message }}
      </NAlert>

      <NSpin :show="modelStore.loading && mergedModels.length === 0">
        <NDataTable
          :columns="columns"
          :data="mergedModels"
          :row-key="(row: any) => row.id || `${row.provider}/${row.name}`"
          :max-height="600"
          :bordered="false"
          :pagination="{ pageSize: 20 }"
          size="small"
          striped
        />
      </NSpin>
    </NCard>
  </NSpace>
</template>
