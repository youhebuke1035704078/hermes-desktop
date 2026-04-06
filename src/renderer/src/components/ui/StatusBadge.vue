<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ status: string }>()

const color = computed(() => {
  switch (props.status) {
    case 'online': case 'healthy': case 'connected': case 'success': return '#18a058'
    case 'degraded': case 'warning': case 'starting': return '#f0a020'
    case 'down': case 'offline': case 'error': case 'failed': case 'critical': return '#d03050'
    default: return '#999'
  }
})
</script>

<template>
  <span class="status-badge">
    <span class="status-dot" :style="{ background: color }" />
    <slot>{{ status }}</slot>
  </span>
</template>

<style scoped>
.status-badge { display: inline-flex; align-items: center; gap: 6px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
</style>
