/**
 * Stub store — the full office store was removed during the Hermes Desktop fork.
 * Provides the minimal interface consumed by AgentChatPanel. Nothing writes to
 * these refs in the current fork (grepped: zero assignments), so at runtime
 * they stay `null` and all optional-chain accesses in AgentChatPanel short-
 * circuit. The types below exist to keep vue-tsc happy — they describe what
 * the dead paths would carry if they were ever wired back up.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AgentInfo } from '@/api/types'

export interface OfficeSelectedSession {
  key: string
  label?: string
  tokenUsage?: {
    totalInput: number
    totalOutput: number
  }
}

export const useOfficeStore = defineStore('office', () => {
  const selectedAgent = ref<AgentInfo | null>(null)
  const selectedSession = ref<OfficeSelectedSession | null>(null)
  const selectedSessionKey = ref<string | null>(null)
  const executionInProgress = ref(false)
  const activeTasks = ref<unknown[]>([])

  return { selectedAgent, selectedSession, selectedSessionKey, executionInProgress, activeTasks }
})
