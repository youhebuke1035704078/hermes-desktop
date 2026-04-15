<script setup lang="ts">
/**
 * D-B fallback-chain popover content. Rendered inside the ModelStateBadge
 * NPopover. Shows the resolved chain (primary first, then fallbacks) with
 * per-item status paint, plus the current switch reason when in fallback
 * or exhausted states.
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.3
 * and Task G1 of the implementation plan.
 */
import { computed } from 'vue'
import { useModelStore } from '@/stores/model'
import { formatDistanceToNow } from 'date-fns'

const modelStore = useModelStore()

const chainItems = computed(() => {
  const chain = modelStore.state.fallbackChain
  const current = modelStore.state.currentModel
  return chain.map((model) => ({
    model,
    isCurrent: model === current,
    isFallback: modelStore.state.kind === 'fallback' && model === current,
    isFailed:
      modelStore.state.kind === 'exhausted' &&
      modelStore.state.attemptedModels.includes(model),
  }))
})

const reasonLabel = computed(() => {
  const code = modelStore.state.reasonCode
  if (!code) return null
  return code.replace(/_/g, ' ')
})

const switchedAgo = computed(() => {
  const ts = modelStore.state.switchedAt
  if (!ts) return null
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true })
  } catch {
    return null
  }
})
</script>

<template>
  <div class="model-dropdown">
    <!-- Fallback chain -->
    <div class="dd-section">
      <div class="dd-label">Fallback Chain</div>
      <div class="dd-chain">
        <template v-for="(item, idx) in chainItems" :key="item.model">
          <span
            class="dd-chain-item"
            :class="{
              'is-current-normal': item.isCurrent && modelStore.state.kind === 'normal',
              'is-current-fallback': item.isFallback,
              'is-failed': item.isFailed,
            }"
          >
            {{ item.model }}
          </span>
          <span v-if="idx < chainItems.length - 1" class="dd-arrow">→</span>
        </template>
      </div>
      <div class="dd-subnote">from ~/.hermes/config.yaml</div>
    </div>

    <!-- Reason (only when fallback or exhausted) -->
    <div
      v-if="modelStore.state.kind === 'fallback' || modelStore.state.kind === 'exhausted'"
      class="dd-section"
    >
      <div class="dd-label">
        {{ modelStore.state.kind === 'fallback' ? 'Switch Reason' : 'Failure Reason' }}
      </div>
      <div class="dd-reason-code">{{ reasonLabel }}</div>
      <div class="dd-reason-text">{{ modelStore.state.reasonText }}</div>
      <div v-if="switchedAgo" class="dd-subnote">{{ switchedAgo }}</div>
    </div>
  </div>
</template>

<style scoped>
.model-dropdown {
  width: 280px;
  padding: 4px 0;
  font-family: -apple-system, system-ui, sans-serif;
  color: rgba(255, 255, 255, 0.85);
}
.dd-section {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.dd-section:last-child {
  border-bottom: none;
}
.dd-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 6px;
}
.dd-chain {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.dd-chain-item {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.55);
  border: 1px solid transparent;
}
.dd-chain-item.is-current-normal {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.3);
}
.dd-chain-item.is-current-fallback {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.3);
}
.dd-chain-item.is-failed {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.25);
  text-decoration: line-through;
}
.dd-arrow {
  color: rgba(255, 255, 255, 0.3);
  font-size: 10px;
}
.dd-reason-code {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 3px;
}
.dd-reason-text {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.4;
  word-break: break-word;
}
.dd-subnote {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 4px;
}
</style>
