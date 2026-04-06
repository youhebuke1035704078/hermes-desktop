<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard, NGrid, NGridItem, NSpin, NButton, NAlert, NSpace,
  NTag, NProgress, NDataTable, NEmpty, type DataTableColumns
} from 'naive-ui'
import { useNoiseLogs, useNoiseOutputs, useNoiseAlerts } from '../../composables/useMonitorApi'
import { formatRelativeTime } from '../../utils/format'
import type { NoiseAlert } from '../../api/types'

const { t } = useI18n()

const { data: logResp, loading: logLoading, error: logError, refresh: refreshLogs } = useNoiseLogs()
const { data: outputResp, loading: outputLoading, error: outputError, refresh: refreshOutputs } = useNoiseOutputs()
const { data: alertResp, loading: alertLoading, error: alertError, refresh: refreshAlerts } = useNoiseAlerts()

const logReport = computed(() => logResp.value?.data ?? null)
const outputReport = computed(() => outputResp.value?.data ?? null)
const noiseAlerts = computed<NoiseAlert[]>(() => (alertResp.value?.data as NoiseAlert[] | null) ?? [])

function noiseColor(ratio: number): 'success' | 'warning' | 'error' {
  if (ratio < 0.3) return 'success'
  if (ratio < 0.6) return 'warning'
  return 'error'
}

function qualityColor(score: number): 'success' | 'warning' | 'error' {
  if (score >= 70) return 'success'
  if (score >= 40) return 'warning'
  return 'error'
}

function severityTagType(severity: string): 'error' | 'warning' | 'info' {
  switch (severity) {
    case 'critical': return 'error'
    case 'warning': return 'warning'
    default: return 'info'
  }
}

const alertColumns = computed<DataTableColumns<NoiseAlert>>(() => [
  {
    title: '级别',
    key: 'severity',
    width: 80,
    render: (row) => h(NTag, { type: severityTagType(row.severity), size: 'small', bordered: false, round: true }, () => {
      const map: Record<string, string> = { critical: '严重', warning: '警告', info: '信息' }
      return map[row.severity] || row.severity
    })
  },
  {
    title: '类型',
    key: 'type',
    width: 100
  },
  {
    title: '消息',
    key: 'message',
    ellipsis: { tooltip: true }
  },
  {
    title: '时间',
    key: 'timestamp',
    width: 130,
    render: (row) => formatRelativeTime(row.timestamp)
  },
  {
    title: '状态',
    key: 'resolved',
    width: 70,
    render: (row) => row.resolved ? '已解决' : '活跃'
  }
])

function refreshAll() {
  refreshLogs()
  refreshOutputs()
  refreshAlerts()
}
</script>

<script lang="ts">
import { h } from 'vue'
export default { name: 'NoisePage' }
</script>

<template>
  <NSpace vertical :size="16">
    <NSpace justify="space-between" align="center">
      <h3 style="margin: 0">{{ t('nav.noise') }}</h3>
      <NButton size="small" @click="refreshAll">全部刷新</NButton>
    </NSpace>

    <NGrid cols="1 m:2" responsive="screen" :x-gap="16" :y-gap="16">
      <!-- Log Noise Panel -->
      <NGridItem>
        <NCard title="日志噪声分析" size="small">
          <NAlert v-if="logError" type="error" :show-icon="true" style="margin-bottom: 12px">
            {{ logError.message }}
          </NAlert>

          <NSpin :show="logLoading && !logReport">
            <template v-if="logReport">
              <NSpace vertical :size="12">
                <NSpace justify="space-between" align="center">
                  <span>噪声比例</span>
                  <NTag :type="noiseColor(logReport.noiseRatio)" size="small" :bordered="false" round>
                    {{ (logReport.noiseRatio * 100).toFixed(1) }}%
                  </NTag>
                </NSpace>
                <NProgress
                  type="line"
                  :percentage="Math.round(logReport.noiseRatio * 100)"
                  :status="noiseColor(logReport.noiseRatio)"
                  :show-indicator="false"
                />
                <NSpace justify="space-between">
                  <span style="font-size: 12px; color: var(--text-color-3)">
                    总行数: {{ logReport.totalLines.toLocaleString() }}
                  </span>
                  <span style="font-size: 12px; color: var(--text-color-3)">
                    噪声行: {{ logReport.noisyLines.toLocaleString() }}
                  </span>
                </NSpace>

                <div v-if="logReport.patterns.length > 0">
                  <div style="font-size: 12px; color: var(--text-color-3); margin-bottom: 6px">Top 噪声模式</div>
                  <div
                    v-for="(p, i) in logReport.patterns.slice(0, 5)"
                    :key="i"
                    style="font-size: 12px; padding: 4px 0; border-bottom: 1px solid var(--divider-color)"
                  >
                    <NSpace justify="space-between">
                      <span style="font-family: monospace; word-break: break-all">{{ p.pattern }}</span>
                      <NTag size="tiny" :bordered="false">{{ p.count }}x</NTag>
                    </NSpace>
                  </div>
                </div>
              </NSpace>
            </template>
            <NEmpty v-else description="暂无数据" />
          </NSpin>
        </NCard>
      </NGridItem>

      <!-- Output Quality Panel -->
      <NGridItem>
        <NCard title="输出质量分析" size="small">
          <NAlert v-if="outputError" type="error" :show-icon="true" style="margin-bottom: 12px">
            {{ outputError.message }}
          </NAlert>

          <NSpin :show="outputLoading && !outputReport">
            <template v-if="outputReport">
              <NSpace vertical :size="12">
                <NSpace justify="space-between" align="center">
                  <span>质量评分</span>
                  <NTag :type="qualityColor(outputReport.qualityScore)" size="small" :bordered="false" round>
                    {{ outputReport.qualityScore.toFixed(0) }}
                  </NTag>
                </NSpace>
                <NProgress
                  type="line"
                  :percentage="Math.round(outputReport.qualityScore)"
                  :status="qualityColor(outputReport.qualityScore)"
                  :show-indicator="false"
                />
                <span style="font-size: 12px; color: var(--text-color-3)">
                  总输出数: {{ outputReport.totalOutputs }}
                </span>

                <div v-if="outputReport.hollowPatterns.length > 0">
                  <div style="font-size: 12px; color: var(--text-color-3); margin-bottom: 6px">空洞模式</div>
                  <div
                    v-for="(p, i) in outputReport.hollowPatterns.slice(0, 5)"
                    :key="i"
                    style="font-size: 12px; padding: 4px 0; border-bottom: 1px solid var(--divider-color)"
                  >
                    <NSpace justify="space-between">
                      <span>{{ p.pattern }}</span>
                      <NTag size="tiny" :bordered="false">{{ p.count }}x</NTag>
                    </NSpace>
                  </div>
                </div>

                <div v-if="outputReport.repetitionPairs.length > 0">
                  <div style="font-size: 12px; color: var(--text-color-3); margin-bottom: 6px">重复内容</div>
                  <div
                    v-for="(pair, i) in outputReport.repetitionPairs.slice(0, 3)"
                    :key="i"
                    style="font-size: 11px; padding: 4px 0; border-bottom: 1px solid var(--divider-color)"
                  >
                    相似度: {{ (pair.similarity * 100).toFixed(0) }}%
                  </div>
                </div>
              </NSpace>
            </template>
            <NEmpty v-else description="暂无数据" />
          </NSpin>
        </NCard>
      </NGridItem>
    </NGrid>

    <!-- Noise Alerts -->
    <NCard title="噪声告警" size="small">
      <template #header-extra>
        <NTag size="small" :bordered="false">{{ noiseAlerts.length }} 条</NTag>
      </template>

      <NAlert v-if="alertError" type="error" :show-icon="true" style="margin-bottom: 12px">
        {{ alertError.message }}
      </NAlert>

      <NSpin :show="alertLoading && noiseAlerts.length === 0">
        <NDataTable
          v-if="noiseAlerts.length > 0"
          :columns="alertColumns"
          :data="noiseAlerts"
          :row-key="(row: NoiseAlert) => row.id"
          :max-height="400"
          size="small"
          striped
        />
        <NEmpty v-else description="暂无噪声告警" />
      </NSpin>
    </NCard>
  </NSpace>
</template>
