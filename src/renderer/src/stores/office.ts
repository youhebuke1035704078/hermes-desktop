/**
 * Stub store — the full office store was removed during the Hermes Desktop fork.
 * Provides the minimal interface consumed by AgentChatPanel.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useOfficeStore = defineStore('office', () => {
  const selectedAgent = ref<string | null>(null)
  const selectedSession = ref<unknown>(null)
  const selectedSessionKey = ref<string | null>(null)
  const executionInProgress = ref(false)
  const activeTasks = ref<unknown[]>([])

  return { selectedAgent, selectedSession, selectedSessionKey, executionInProgress, activeTasks }
})
