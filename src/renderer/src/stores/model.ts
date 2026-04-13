/**
 * Stub store — the full model store was removed during the Hermes Desktop fork.
 * Provides the minimal interface consumed by SessionsPage.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ModelInfo } from '@/api/types'

export const useModelStore = defineStore('model', () => {
  const models = ref<ModelInfo[]>([])

  async function fetchModels(): Promise<void> {
    // no-op stub
  }

  return { models, fetchModels }
})
