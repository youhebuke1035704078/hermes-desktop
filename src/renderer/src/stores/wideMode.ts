/**
 * Stub store — the full wideMode store was removed during the Hermes Desktop fork.
 * Provides the minimal interface consumed by AppHeader.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useWideModeStore = defineStore('wideMode', () => {
  const isWideMode = ref(false)

  function toggle() {
    isWideMode.value = !isWideMode.value
  }

  return { isWideMode, toggle }
})
