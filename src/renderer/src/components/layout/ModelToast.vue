<script setup lang="ts">
/**
 * Single transient toast for a lifecycle event (fallback_activated or
 * chain_exhausted).  Rendered by NotificationLayer once per queued
 * notification item.  The toast auto-dismisses after its configured
 * duration (enforced by the notification store) and can be dismissed
 * manually via the close button.
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.3
 * and Task G2 of the implementation plan.
 */
import { computed } from 'vue'
import type { NotificationItem } from '@/stores/notification'
import { useNotificationStore } from '@/stores/notification'
import type {
  FallbackActivatedPayload,
  ChainExhaustedPayload,
} from '@/api/types'

const props = defineProps<{
  item: NotificationItem
}>()

const notif = useNotificationStore()

const title = computed(() => {
  if (props.item.kind === 'fallback') return '⚠ Switched to fallback model'
  return '⚠ All models unavailable'
})

const body1 = computed(() => {
  if (props.item.kind === 'fallback') {
    const p = props.item.payload as FallbackActivatedPayload
    return `${p.from_model} returned ${p.reason_code}: ${p.reason_text}`
  }
  const p = props.item.payload as ChainExhaustedPayload
  return `Attempted: ${p.attempted_models.join(', ')}`
})

const body2 = computed(() => {
  if (props.item.kind === 'fallback') {
    const p = props.item.payload as FallbackActivatedPayload
    return `now using ${p.to_model}`
  }
  const p = props.item.payload as ChainExhaustedPayload
  // last_error_text is optional — guard against rendering the literal "undefined"
  return p.last_error_text || ''
})

function close(): void {
  notif.dismiss(props.item.id)
}
</script>

<template>
  <div class="model-toast" :class="`kind-${item.kind}`">
    <div class="toast-close" @click="close">×</div>
    <div class="toast-title">{{ title }}</div>
    <div class="toast-body">{{ body1 }}</div>
    <div class="toast-body">{{ body2 }}</div>
  </div>
</template>

<style scoped>
.model-toast {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 8px;
  padding: 10px 28px 10px 14px;
  color: #fbbf24;
  font-size: 11px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  max-width: 260px;
  position: relative;
  animation: slideIn 0.3s ease;
  font-family: -apple-system, system-ui, sans-serif;
}
.model-toast.kind-exhausted {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.35);
  color: #f87171;
}
.toast-close {
  position: absolute;
  top: 4px;
  right: 8px;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
}
.toast-close:hover {
  opacity: 1;
}
.toast-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.toast-body {
  font-size: 10px;
  opacity: 0.85;
  line-height: 1.4;
  word-break: break-word;
}
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
