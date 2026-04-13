/**
 * Stub store — the full monitor store was removed during the Hermes Desktop fork.
 * Provides the minimal interface consumed by useEventStream.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AgentEvent } from '@/api/types'

export const useMonitorStore = defineStore('monitor', () => {
  const events = ref<AgentEvent[]>([])
  const paused = ref(false)

  function addEvent(event: AgentEvent) {
    if (paused.value) return
    events.value.push(event)
    if (events.value.length > 500) {
      events.value = events.value.slice(-500)
    }
  }

  function clearEvents() {
    events.value = []
  }

  return { events, paused, addEvent, clearEvents }
})
