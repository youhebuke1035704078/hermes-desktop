import { ref, onUnmounted, type Ref } from 'vue'
import { monitorApi } from '../api/monitor-client'
import type {
  AlertQueryParams,
  LogQueryParams,
  TaskQueryParams
} from '../api/types'

export function useMonitorApi<T>(
  fetcher: () => Promise<T>,
  options: { interval?: number; immediate?: boolean } = {}
) {
  const { interval = 30000, immediate = true } = options
  const data = ref<T>() as Ref<T | undefined>
  const loading = ref(false)
  const error = ref<Error>()

  async function refresh() {
    loading.value = true
    error.value = undefined
    try {
      data.value = await fetcher()
    } catch (e) {
      error.value = e as Error
    } finally {
      loading.value = false
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null

  function start() {
    if (immediate) refresh()
    timer = setInterval(refresh, interval)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  start()
  onUnmounted(stop)

  return { data, loading, error, refresh, stop }
}

// Convenience wrappers
export function useSummary() {
  return useMonitorApi(() => monitorApi.getSummary())
}

export function useTrends(window: Ref<string> | string = '24h') {
  const w = typeof window === 'string' ? ref(window) : window
  return useMonitorApi(() => monitorApi.getTrends(w.value))
}

export function useServices() {
  return useMonitorApi(() => monitorApi.getServices())
}

export function useAlerts(params?: Ref<AlertQueryParams>) {
  return useMonitorApi(() =>
    monitorApi.getAlerts(params?.value)
  )
}

export function useMonitorModels() {
  return useMonitorApi(() => monitorApi.getModels())
}

export function useMonitorSkills() {
  return useMonitorApi(() => monitorApi.getSkills())
}

export function useMonitorTools(type?: string) {
  return useMonitorApi(() => monitorApi.getTools(type))
}

export function useMonitorTasks(params?: Ref<TaskQueryParams>) {
  return useMonitorApi(() =>
    monitorApi.getTasks(params?.value)
  )
}

export function useMonitorLogs(params?: Ref<LogQueryParams>) {
  return useMonitorApi(() =>
    monitorApi.getLogs(params?.value)
  )
}

export function useNoiseLogs() {
  return useMonitorApi(() => monitorApi.getNoiseLogs(), { interval: 60000 })
}

export function useNoiseOutputs() {
  return useMonitorApi(() => monitorApi.getNoiseOutputs(), { interval: 60000 })
}

export function useNoiseAlerts() {
  return useMonitorApi(() => monitorApi.getNoiseAlerts())
}

export function useService(id: Ref<string> | string) {
  const sid = typeof id === 'string' ? ref(id) : id
  return useMonitorApi(() => monitorApi.getService(sid.value))
}

export function useVersionCheck() {
  return useMonitorApi(() => monitorApi.getVersion(), { interval: 3600000 })
}
