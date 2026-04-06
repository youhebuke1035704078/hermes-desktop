import { ref } from 'vue'

const globalError = ref<string | null>(null)
const errorHistory = ref<Array<{ message: string; timestamp: number }>>([])

const MAX_HISTORY = 50

export function useGlobalError() {
  function setError(message: string) {
    globalError.value = message
    errorHistory.value.unshift({ message, timestamp: Date.now() })
    if (errorHistory.value.length > MAX_HISTORY) {
      errorHistory.value.pop()
    }
  }

  function clearError() {
    globalError.value = null
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
