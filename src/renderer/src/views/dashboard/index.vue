<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NCard, NGrid, NGridItem, NSpace, NSpin, NSelect, NAlert } from 'naive-ui'
import StatusBadge from '../../components/ui/StatusBadge.vue'
import MetricCard from '../../components/ui/MetricCard.vue'
import TrendChart from '../../components/charts/TrendChart.vue'
import { useSummary, useTrends } from '../../composables/useMonitorApi'

const { t } = useI18n()

const { data: summaryResp, loading: summaryLoading, error: summaryError } = useSummary()
const trendWindow = ref('24h')
const { data: trendResp, loading: trendLoading, refresh: refreshTrends } = useTrends(trendWindow)

const summary = computed(() => summaryResp.value?.data ?? null)
const trendPoints = computed(() => trendResp.value?.data?.points ?? [])

const windowOptions = [
  { label: '1 小时', value: '1h' },
  { label: '6 小时', value: '6h' },
  { label: '12 小时', value: '12h' },
  { label: '24 小时', value: '24h' },
  { label: '7 天', value: '7d' }
]

function handleWindowChange(val: string) {
  trendWindow.value = val
  refreshTrends()
}
</script>

<template>
  <NSpace vertical :size="16">
    <!-- System status header -->
    <NCard :title="t('dashboard.title')">
      <template #header-extra>
        <StatusBadge v-if="summary" :status="summary.status">
          {{ t(`status.${summary.status}`) }}
        </StatusBadge>
      </template>

      <NAlert v-if="summaryError" type="error" :show-icon="true" style="margin-bottom: 16px">
        {{ t('common.error') }}: {{ summaryError.message }}
      </NAlert>

      <NSpin :show="summaryLoading && !summary">
        <NGrid cols="2 s:3 m:4" responsive="screen" :x-gap="12" :y-gap="12">
          <NGridItem>
            <MetricCard
              :title="t('dashboard.totalServices')"
              :value="summary?.total_services ?? '-'"
            />
          </NGridItem>
          <NGridItem>
            <MetricCard
              :title="t('dashboard.onlineServices')"
              :value="summary?.online_services ?? '-'"
            />
          </NGridItem>
          <NGridItem>
            <MetricCard
              :title="t('dashboard.activeTasks')"
              :value="summary?.active_tasks_24h ?? '-'"
            />
          </NGridItem>
          <NGridItem>
            <MetricCard
              :title="t('dashboard.activeAlerts')"
              :value="summary?.active_alerts ?? '-'"
            />
          </NGridItem>
          <NGridItem>
            <MetricCard
              :title="t('dashboard.requests24h')"
              :value="summary?.requests_24h?.toLocaleString() ?? '-'"
            />
          </NGridItem>
          <NGridItem>
            <MetricCard
              :title="t('dashboard.errorRate')"
              :value="summary ? `${(summary.error_rate_24h * 100).toFixed(2)}` : '-'"
              suffix="%"
            />
          </NGridItem>
          <NGridItem>
            <MetricCard
              :title="t('dashboard.avgResponseTime')"
              :value="summary?.avg_response_time_ms?.toFixed(0) ?? '-'"
              suffix="ms"
            />
          </NGridItem>
        </NGrid>
      </NSpin>
    </NCard>

    <!-- Trend chart -->
    <NCard :title="t('dashboard.trends')">
      <template #header-extra>
        <NSelect
          :value="trendWindow"
          :options="windowOptions"
          size="small"
          style="width: 120px"
          @update:value="handleWindowChange"
        />
      </template>

      <TrendChart :data="trendPoints" :loading="trendLoading" />
    </NCard>
  </NSpace>
</template>
