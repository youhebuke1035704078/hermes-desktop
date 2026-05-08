import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { SkillMeta } from '@/api/types'
import { useConnectionStore } from './connection'

type SkillSourceKind = 'server' | 'local'

interface SkillsPayload {
  ok: boolean
  skills?: SkillMeta[]
  disabled?: string[]
  configValues?: Record<string, unknown>
  externalDirs?: string[]
  source?: SkillSourceKind
  rootDir?: string
  error?: string
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function normalizeSkill(skill: Partial<SkillMeta>): SkillMeta {
  return {
    name: typeof skill.name === 'string' ? skill.name : '',
    description: typeof skill.description === 'string' ? skill.description : '',
    version: typeof skill.version === 'string' ? skill.version : '',
    author: typeof skill.author === 'string' ? skill.author : '',
    category: typeof skill.category === 'string' && skill.category ? skill.category : 'uncategorized',
    platforms: ensureArray<string>(skill.platforms),
    prerequisites:
      skill.prerequisites && typeof skill.prerequisites === 'object' ? skill.prerequisites : undefined,
    configVars: ensureArray<NonNullable<SkillMeta['configVars']>[number]>(skill.configVars),
    tags: ensureArray<string>(skill.tags),
    license: typeof skill.license === 'string' ? skill.license : undefined,
    dirPath: typeof skill.dirPath === 'string' ? skill.dirPath : '',
    relatedSkills: ensureArray<string>(skill.relatedSkills),
    homepage: typeof skill.homepage === 'string' ? skill.homepage : undefined,
  }
}

export const useSkillStore = defineStore('skill', () => {
  const skills = ref<SkillMeta[]>([])
  const disabled = ref<string[]>([])
  const configValues = ref<Record<string, unknown>>({})
  const externalDirs = ref<string[]>([])
  const loading = ref(false)
  const selectedSkillName = ref<string | null>(null)
  const source = ref<SkillSourceKind>('local')
  const rootDir = ref<string>('')
  const sourceError = ref<string | null>(null)

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

  function remoteSkillsBase(): string | null {
    const connectionStore = useConnectionStore()
    if (connectionStore.serverType !== 'hermes-rest') return null
    const url = connectionStore.currentServer?.url
    return url ? url.replace(/\/+$/, '') : null
  }

  function remoteHeaders(): Record<string, string> {
    const connectionStore = useConnectionStore()
    const headers: Record<string, string> = {}
    if (connectionStore.hermesAuthToken) {
      headers.Authorization = `Bearer ${connectionStore.hermesAuthToken}`
    }
    return headers
  }

  async function fetchRemoteSkills(): Promise<SkillsPayload> {
    const base = remoteSkillsBase()
    if (!base || !window.api?.httpFetch) {
      return { ok: false, error: 'Hermes REST server is not connected' }
    }
    const response = await window.api.httpFetch(`${base}/v1/hermes/skills`, {
      headers: remoteHeaders(),
    })
    if (!response.ok) {
      return {
        ok: false,
        error: response.body || `/v1/hermes/skills returned HTTP ${response.status}`,
      }
    }
    const payload = JSON.parse(response.body) as SkillsPayload
    return payload.ok ? payload : { ok: false, error: payload.error || 'Invalid skills response' }
  }

  async function updateRemoteSkillsConfig(
    action: string,
    payload: unknown
  ): Promise<{ ok: boolean; error?: string }> {
    const base = remoteSkillsBase()
    if (!base || !window.api?.httpFetch) {
      return { ok: false, error: 'Hermes REST server is not connected' }
    }
    const response = await window.api.httpFetch(`${base}/v1/hermes/skills/config`, {
      method: 'POST',
      headers: {
        ...remoteHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, payload }),
    })
    if (!response.ok) {
      return { ok: false, error: response.body || `HTTP ${response.status}` }
    }
    try {
      return JSON.parse(response.body) as { ok: boolean; error?: string }
    } catch {
      return { ok: false, error: 'Invalid skills config response' }
    }
  }

  function applySkillsPayload(result: SkillsPayload, nextSource: SkillSourceKind): void {
    skills.value = ensureArray<SkillMeta>(result.skills).map((skill) => normalizeSkill(skill))
    disabled.value = ensureArray<string>(result.disabled)
    configValues.value =
      result.configValues && typeof result.configValues === 'object' ? result.configValues : {}
    externalDirs.value = ensureArray<string>(result.externalDirs)
    source.value = nextSource
    rootDir.value = typeof result.rootDir === 'string' ? result.rootDir : ''
  }

  function setLocalConfigValue(key: string, value: unknown): void {
    const keys = key.split('.')
    let target: Record<string, unknown> = configValues.value
    for (let i = 0; i < keys.length - 1; i++) {
      const segment = keys[i]!
      const next = target[segment]
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        target[segment] = {}
      }
      target = target[segment] as Record<string, unknown>
    }
    target[keys[keys.length - 1]!] = value
  }

  // ── Actions ──
  async function fetchSkills(): Promise<void> {
    loading.value = true
    sourceError.value = null
    try {
      const connectionStore = useConnectionStore()
      if (connectionStore.serverType === 'hermes-rest' && connectionStore.currentServer?.url) {
        try {
          const remoteResult = await fetchRemoteSkills()
          if (remoteResult.ok) {
            applySkillsPayload(remoteResult, 'server')
            return
          }
          sourceError.value = remoteResult.error || 'Failed to fetch server skills'
        } catch (e) {
          sourceError.value = e instanceof Error ? e.message : String(e)
        }
      }

      const result = await window.api.hermesSkills()
      if (result.ok) {
        applySkillsPayload(result, 'local')
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
      const result =
        source.value === 'server'
          ? await updateRemoteSkillsConfig('toggle', { name, disabled: willDisable })
          : await window.api.hermesSkillsConfig('toggle', { name, disabled: willDisable })
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

  async function setConfigValue(key: string, value: unknown): Promise<boolean> {
    try {
      const result =
        source.value === 'server'
          ? await updateRemoteSkillsConfig('setConfigValue', { key, value })
          : await window.api.hermesSkillsConfig('setConfigValue', { key, value })
      if (result.ok) {
        setLocalConfigValue(key, value)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function addExternalDir(path: string): Promise<boolean> {
    try {
      const result =
        source.value === 'server'
          ? await updateRemoteSkillsConfig('addExternalDir', { path })
          : await window.api.hermesSkillsConfig('addExternalDir', { path })
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
      const result =
        source.value === 'server'
          ? await updateRemoteSkillsConfig('removeExternalDir', { path })
          : await window.api.hermesSkillsConfig('removeExternalDir', { path })
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
    skills, disabled, configValues, externalDirs, loading, selectedSkillName, source, rootDir, sourceError,
    enabledCount, disabledCount, configVarCount, categories, selectedSkill,
    isDisabled, isSkillVisibleInChat,
    fetchSkills, toggleSkill, setConfigValue, addExternalDir, removeExternalDir,
  }
})
