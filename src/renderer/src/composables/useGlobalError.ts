import { ref } from 'vue'

const globalError = ref<string | null>(null)
const errorHistory = ref<Array<{ message: string; timestamp: number }>>([])
let autoClearTimer: ReturnType<typeof setTimeout> | null = null

const MAX_HISTORY = 50

export function useGlobalError() {
  function setError(message: string) {
    globalError.value = message
    errorHistory.value.unshift({ message, timestamp: Date.now() })
    if (errorHistory.value.length > MAX_HISTORY) {
      errorHistory.value.pop()
    }
    // Auto-clear after 5 seconds
    if (autoClearTimer) clearTimeout(autoClearTimer)
    autoClearTimer = setTimeout(() => {
      globalError.value = null
      autoClearTimer = null
    }, 5000)
  }

  function clearError() {
    globalError.value = null
    if (autoClearTimer) { clearTimeout(autoClearTimer); autoClearTimer = null }
  }

  function clearHistory() {
    errorHistory.value = []
  }

  return {
    globalError,
    errorHistory,
    setError,
    clearError,
    clearHistory
  }
}
