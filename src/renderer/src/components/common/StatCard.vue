<script setup lang="ts">
import { NCard, NStatistic, NIcon } from 'naive-ui'

defineProps<{
  title: string
  value: number | string
  icon: unknown
  color?: string
}>()
</script>

<template>
  <NCard :bordered="true" class="stat-card-shell">
    <div class="stat-card-inner">
      <NStatistic :label="title" :value="value" />
      <div
        class="stat-card-icon"
        :style="{ backgroundColor: (color || '#18a058') + '15', color: color || '#18a058' }"
      >
        <NIcon :size="22" :component="icon as any" />
      </div>
    </div>
  </NCard>
</template>

<style scoped>
.stat-card-shell {
  border-radius: var(--radius);
}

.stat-card-inner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--ui-gap);
}

.stat-card-shell :deep(.n-statistic .n-statistic__label) {
  font-size: var(--font-kicker);
}

.stat-card-shell :deep(.n-statistic .n-statistic-value) {
  font-size: var(--font-metric);
  line-height: var(--line-tight);
}

.stat-card-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
