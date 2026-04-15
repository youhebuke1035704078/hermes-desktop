<script setup lang="ts">
/**
 * Per-message fallback indicator chip. Rendered inline with the
 * chat-bubble-meta row on assistant messages where fromFallback is
 * true. Style A from spec §4.6: small amber pill carrying the
 * primary model name, with the full reason text exposed via the
 * title attribute (native browser tooltip).
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.6
 * and Task G3 of the implementation plan.
 */
import { computed } from 'vue'

const props = defineProps<{
  model?: string
  from?: string
  reasonText?: string
}>()

const labelText = computed(() => {
  if (props.from) return `via ${props.from}`
  return 'fallback'
})

const tooltip = computed(() => {
  const parts: string[] = []
  if (props.model) parts.push(`Model: ${props.model}`)
  if (props.from) parts.push(`Primary was: ${props.from}`)
  if (props.reasonText) parts.push(`Reason: ${props.reasonText}`)
  return parts.join(' · ')
})
</script>

<template>
  <span class="fallback-chip" :title="tooltip">
    <span class="chip-icon">⚠</span>
    <span class="chip-text">{{ labelText }}</span>
  </span>
</template>

<style scoped>
.fallback-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.28);
  color: #fbbf24;
  font-size: 10px;
  font-weight: 500;
  cursor: help;
  font-family: -apple-system, system-ui, sans-serif;
}
.chip-icon {
  font-size: 9px;
}
.chip-text {
  white-space: nowrap;
}
</style>
