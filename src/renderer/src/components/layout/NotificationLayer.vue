<script setup lang="ts">
/**
 * Teleport-to-body wrapper that renders one ModelToast per queued
 * notification item.  Mounted once (in App.vue) alongside the global
 * router view — the notifications themselves live in the Pinia
 * notification store so any part of the app can push toasts without
 * worrying about mount order.
 *
 * Position: fixed top-right, stacked vertically.  Pointer-events are
 * disabled on the wrapper itself so the transparent gaps between
 * toasts don't swallow clicks that belong to the underlying UI.
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.3
 * and Task G2 of the implementation plan.
 */
import { useNotificationStore } from '@/stores/notification'
import ModelToast from './ModelToast.vue'

const notif = useNotificationStore()
</script>

<template>
  <Teleport to="body">
    <div class="notification-layer">
      <TransitionGroup name="toast-list">
        <ModelToast v-for="item in notif.items" :key="item.id" :item="item" />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.notification-layer {
  position: fixed;
  top: 50px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
  pointer-events: none;
}
.notification-layer > :deep(*) {
  pointer-events: auto;
}
.toast-list-enter-active,
.toast-list-leave-active {
  transition: all 0.3s ease;
}
.toast-list-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
