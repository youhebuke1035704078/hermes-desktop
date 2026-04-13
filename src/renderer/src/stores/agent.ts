/**
 * Stub store — the full agent store was removed during the Hermes Desktop fork.
 * Provides the minimal interface consumed by SessionsPage.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AgentInfo } from '@/api/types'

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<AgentInfo[]>([])

  async function fetchAgents(): Promise<void> {
    // no-op stub
  }

  return { agents, fetchAgents }
})
