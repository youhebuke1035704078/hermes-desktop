import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { safeGet, safeSet } from '@/utils/safe-storage'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'hermes_theme'

export const useThemeStore = defineStore('theme', () => {
  const stored = safeGet(STORAGE_KEY) as ThemeMode | null
  const mode = ref<ThemeMode>(stored === 'light' || stored === 'dark' ? stored : 'dark')

  watch(mode, (val) => {
    safeSet(STORAGE_KEY, val)
    document.documentElement.setAttribute('data-theme', val)
  }, { immediate: true })

  function toggle() {
    mode.value = mode.value === 'light' ? 'dark' : 'light'
  }

  function setMode(m: ThemeMode) {
    mode.value = m
  }

  return { mode, toggle, setMode }
})
