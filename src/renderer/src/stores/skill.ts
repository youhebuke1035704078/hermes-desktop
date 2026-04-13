import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { SkillMeta } from '@/api/types'

export const useSkillStore = defineStore('skill', () => {
  const skills = ref<SkillMeta[]>([])
  const disabled = ref<string[]>([])
  const configValues = ref<Record<string, any>>({})
  const externalDirs = ref<string[]>([])
  const loading = ref(false)
  const selectedSkillName = ref<string | null>(null)

  // ── Getters ──
  const enabledCount = computed(() => skills.value.filter((s) => !disabled.value.includes(s.name)).length)
  const disabledCount = computed(() => skills.value.filter((s) => disabled.value.includes(s.name)).length)
  const configVarCount = computed(() =>
    skills.value.reduce((sum, s) => sum + (s.configVars?.length || 0), 0)
  )
  const categories = computed(() => [...new Set(skills.value.map((s) => s.category))].sort())
  const selectedSkill = computed(() =>
    skills.value.find((s) => s.name === selectedSkillName.value) || null
  )

  function isDisabled(name: string): boolean {
    return disabled.value.includes(name)
  }

  /** Backward compat: used by ChatPage.vue */
  function isSkillVisibleInChat(name: string): boolean {
    return !isDisabled(name)
  }

  // ── Actions ──
  async function fetchSkills(): Promise<void> {
    loading.value = true
    try {
      const result = await window.api.hermesSkills()
      if (result.ok) {
        skills.value = result.skills
        disabled.value = result.disabled
        configValues.value = result.configValues
        externalDirs.value = result.externalDirs
      }
    } catch (e) {
      console.error('[skill store] fetchSkills failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function toggleSkill(name: string): Promise<boolean> {
    const willDisable = !isDisabled(name)
    // Optimistic update
    if (willDisable) {
      disabled.value = [...disabled.value, name]
    } else {
      disabled.value = disabled.value.filter((n) => n !== name)
    }
    try {
      const result = await window.api.hermesSkillsConfig('toggle', { name, disabled: willDisable })
      if (!result.ok) {
        // Rollback
        if (willDisable) {
          disabled.value = disabled.value.filter((n) => n !== name)
        } else {
          disabled.value = [...disabled.value, name]
        }
        return false
      }
      return true
    } catch {
      // Rollback
      if (willDisable) {
        disabled.value = disabled.value.filter((n) => n !== name)
      } else {
        disabled.value = [...disabled.value, name]
      }
      return false
    }
  }

  async function setConfigValue(key: string, value: any): Promise<boolean> {
    try {
      const result = await window.api.hermesSkillsConfig('setConfigValue', { key, value })
      if (result.ok) {
        // Update local state
        const keys = key.split('.')
        let target = configValues.value as any
        for (let i = 0; i < keys.length - 1; i++) {
          if (typeof target[keys[i]!] !== 'object') target[keys[i]!] = {}
          target = target[keys[i]!]
        }
        target[keys[keys.length - 1]!] = value
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function addExternalDir(path: string): Promise<boolean> {
    try {
      const result = await window.api.hermesSkillsConfig('addExternalDir', { path })
      if (result.ok) {
        await fetchSkills() // Re-fetch to pick up new skills
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function removeExternalDir(path: string): Promise<boolean> {
    try {
      const result = await window.api.hermesSkillsConfig('removeExternalDir', { path })
      if (result.ok) {
        await fetchSkills() // Re-fetch to reflect removed skills
        return true
      }
      return false
    } catch {
      return false
    }
  }

  return {
    skills, disabled, configValues, externalDirs, loading, selectedSkillName,
    enabledCount, disabledCount, configVarCount, categories, selectedSkill,
    isDisabled, isSkillVisibleInChat,
    fetchSkills, toggleSkill, setConfigValue, addExternalDir, removeExternalDir,
  }
})
