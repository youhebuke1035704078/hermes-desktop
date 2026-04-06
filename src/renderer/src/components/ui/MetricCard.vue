<script setup lang="ts">
import { NCard, NStatistic } from 'naive-ui'

defineProps<{
  title: string
  value: string | number
  suffix?: string
}>()
</script>

<template>
  <NCard size="small">
    <NStatistic :label="title" :value="value">
      <template v-if="suffix" #suffix>{{ suffix }}</template>
    </NStatistic>
  </NCard>
</template>
