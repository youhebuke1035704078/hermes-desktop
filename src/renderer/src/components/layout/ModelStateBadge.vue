<script setup lang="ts">
/**
 * Header model-state badge. Shows the effective model and fallback
 * state (normal / fallback / exhausted / stale / unknown) with
 * colour-coded paint. Clicking opens a popover with the resolved
 * chain and switch reason.
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.3
 * and Task G1 of the implementation plan.
 */
import { computed } from 'vue'
import { NPopover } from 'naive-ui'
import { useModelStore } from '@/stores/model'
import ModelDropdown from './ModelDropdown.vue'

const modelStore = useModelStore()

const kind = computed(() => modelStore.state.kind)

const badgeContent = computed(() => {
  const s = modelStore.state
  switch (s.kind) {
    case 'normal':
      return { icon: '●', prefix: '主模型', main: s.currentModel ?? 'unknown', sub: null }
    case 'fallback':
      return {
        icon: '⚠',
        prefix: '备用',
        main: s.currentModel ?? 'unknown',
        sub: s.fallbackFrom ? `via ${s.fallbackFrom}` : null
      }
    case 'exhausted':
      return {
        icon: '⚠',
        prefix: '',
        main: `all ${s.attemptedModels.length} models failed`,
        sub: null
      }
    case 'stale':
      return { icon: '', prefix: '模型', main: s.currentModel ?? 'unknown', sub: null }
    case 'unknown':
    default:
      return { icon: '?', prefix: '', main: 'unknown', sub: null }
  }
})

const tooltipText = computed(() => {
  const s = modelStore.state
  if (s.kind === 'stale') return `${s.currentModel ?? 'unknown'} (stale)`
  if (s.kind === 'fallback' && s.reasonText) {
    return `${s.reasonText} — click for details`
  }
  return 'click for details'
})
</script>

<template>
  <NPopover placement="bottom-end" trigger="click" :show-arrow="false">
    <template #trigger>
      <button class="model-state-badge" :class="`is-${kind}`" :title="tooltipText" type="button">
        <span v-if="badgeContent.icon" class="badge-icon">{{ badgeContent.icon }}</span>
        <span v-if="badgeContent.prefix" class="badge-prefix">{{ badgeContent.prefix }}</span>
        <span class="badge-main">{{ badgeContent.main }}</span>
        <span v-if="badgeContent.sub" class="badge-sub">{{ badgeContent.sub }}</span>
      </button>
    </template>
    <ModelDropdown />
  </NPopover>
</template>

<style scoped>
.model-state-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  font-family: -apple-system, system-ui, sans-serif;
  border: 1px solid transparent;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
  transition: background 0.15s ease;
}
.model-state-badge:hover {
  background: rgba(255, 255, 255, 0.08);
}
.model-state-badge.is-normal {
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.25);
}
.model-state-badge.is-fallback {
  background: rgba(245, 158, 11, 0.14);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.3);
}
.model-state-badge.is-exhausted {
  background: rgba(239, 68, 68, 0.14);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.3);
}
.model-state-badge.is-stale {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.4);
  border-color: rgba(255, 255, 255, 0.1);
}
.badge-icon {
  font-size: 8px;
}
.badge-main {
  font-weight: 500;
}
.badge-prefix {
  opacity: 0.82;
}
.badge-sub {
  font-size: 9px;
  opacity: 0.7;
}
</style>
