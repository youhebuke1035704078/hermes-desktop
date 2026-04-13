/**
 * Stub store — the full skill store was removed during the Hermes Desktop fork.
 * Provides the minimal interface consumed by ChatPage and AgentChatPanel.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Skill } from '@/api/types'

export const useSkillStore = defineStore('skill', () => {
  const skills = ref<Skill[]>([])
  const loading = ref(false)

  async function fetchSkills(): Promise<void> {
    // no-op stub
  }

  function isSkillVisibleInChat(_name: string): boolean {
    return true
  }

  return { skills, loading, fetchSkills, isSkillVisibleInChat }
})
