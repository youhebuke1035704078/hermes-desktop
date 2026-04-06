<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, ToolboxComponent
} from 'echarts/components'

use([CanvasRenderer, LineChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, ToolboxComponent])

const props = defineProps<{
  data: Array<{ timestamp: string; requests: number; error_rate: number; avg_latency_ms: number }>
  loading?: boolean
}>()

const option = computed(() => {
  const timestamps = props.data.map(d => {
    const date = new Date(d.timestamp)
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  })

  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['请求数', '错误率 (%)', '延迟 (ms)'] },
    grid: { left: 60, right: 60, bottom: 30, top: 50 },
    xAxis: { type: 'category', data: timestamps },
    yAxis: [
      { type: 'value', name: '请求数', position: 'left' },
      { type: 'value', name: '延迟 (ms)', position: 'right' }
    ],
    series: [
      {
        name: '请求数',
        type: 'line',
        data: props.data.map(d => d.requests),
        smooth: true,
        yAxisIndex: 0
      },
      {
        name: '错误率 (%)',
        type: 'line',
        data: props.data.map(d => +(d.error_rate * 100).toFixed(2)),
        smooth: true,
        yAxisIndex: 0,
        lineStyle: { color: '#d03050' },
        itemStyle: { color: '#d03050' }
      },
      {
        name: '延迟 (ms)',
        type: 'line',
        data: props.data.map(d => d.avg_latency_ms),
        smooth: true,
        yAxisIndex: 1,
        lineStyle: { color: '#f0a020' },
        itemStyle: { color: '#f0a020' }
      }
    ]
  }
})
</script>

<template>
  <VChart :option="option" :loading="loading" style="height: 320px" autoresize />
</template>
