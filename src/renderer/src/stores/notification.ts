/**
 * Transient notification / toast store for lifecycle events.
 *
 * Dedicated Pinia store that queues short-lived notifications (fallback
 * activated, chain exhausted) and auto-dismisses them after a configured
 * duration.  Consumed by the NotificationLayer component mounted in
 * App.vue.
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.3
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FallbackActivatedPayload, ChainExhaustedPayload } from '@/api/types'

export type NotificationKind = 'fallback' | 'exhausted'

export interface NotificationItem {
  id: string
  kind: NotificationKind
  payload: FallbackActivatedPayload | ChainExhaustedPayload
  durationMs: number
  createdAt: number
}

export const useNotificationStore = defineStore('notification', () => {
  const items = ref<NotificationItem[]>([])

  /**
   * Push a new notification onto the queue and schedule its auto-dismiss.
   * Returns the generated id so the caller can dismiss manually if needed.
   *
   * Bug 6 (post-merge): `durationMs <= 0` is treated as "persistent" —
   * no auto-dismiss timer is scheduled, so the toast stays until the
   * user clicks the × button (or the store is manually cleared).  Used
   * for chain_exhausted notifications, where the 5 s auto-dismiss in
   * the original spec turned out to be too short during acceptance
   * testing for a terminal error state.
   */
  function push(input: {
    kind: NotificationKind
    payload: FallbackActivatedPayload | ChainExhaustedPayload
    durationMs: number
  }): string {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    items.value.push({
      id,
      kind: input.kind,
      payload: input.payload,
      durationMs: input.durationMs,
      createdAt: Date.now(),
    })
    // Auto-dismiss — filter tolerates the id already being gone
    // (manual dismiss before the timer fires), so no extra bookkeeping
    // is required.  `durationMs <= 0` opts out entirely: the toast is
    // persistent and only goes away on manual dismiss / clear.
    if (input.durationMs > 0) {
      setTimeout(() => dismiss(id), input.durationMs)
    }
    return id
  }

  /**
   * Remove a notification by id.  No-op if the id is unknown (manual
   * dismiss racing with auto-dismiss, unknown handle, etc.).
   */
  function dismiss(id: string): void {
    items.value = items.value.filter((item) => item.id !== id)
  }

  /**
   * Drop every queued notification.  Used on logout / server swap.
   */
  function clear(): void {
    items.value = []
  }

  return { items, push, dismiss, clear }
})
