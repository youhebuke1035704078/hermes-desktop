import { onUnmounted } from 'vue'
import { useWebSocketStore } from '@/stores/websocket'

/**
 * Subscribes to SSE events from the gateway and calls refresh callbacks
 * when relevant events arrive, reducing polling and providing real-time updates.
 *
 * Event types emitted by Admin server SSE:
 * - gatewayState: Gateway connect/disconnect
 * - alert / alert.new / alert.resolved: Alert changes
 * - service.status: Service state changed
 * - cron.run: Cron job started/completed
 * - session.new / session.end: Session lifecycle
 * - config.changed: Configuration was modified
 */

type EventHandler = (data: unknown) => void

interface SSERefreshOptions {
  /** Map of SSE event types to refresh callbacks */
  handlers: Record<string, EventHandler>
}

export function useSSERefresh(options: SSERefreshOptions) {
  const wsStore = useWebSocketStore()
  const unsubscribers: (() => void)[] = []

  for (const [eventType, handler] of Object.entries(options.handlers)) {
    const unsub = wsStore.subscribe(eventType, handler)
    unsubscribers.push(unsub)
  }

  onUnmounted(() => {
    for (const unsub of unsubscribers) {
      unsub()
    }
  })
}

/**
 * Convenience: subscribe to common events and auto-refresh the provided functions.
 * Debounces rapid events to avoid hammering the API.
 */
export function useSSEAutoRefresh(refreshMap: {
  services?: () => void
  alerts?: () => void
  tasks?: () => void
  sessions?: () => void
  config?: () => void
  summary?: () => void
}) {
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function debounced(key: string, fn: () => void, delay = 2000) {
    const existing = debounceTimers.get(key)
    if (existing) clearTimeout(existing)
    debounceTimers.set(key, setTimeout(() => {
      debounceTimers.delete(key)
      fn()
    }, delay))
  }

  const handlers: Record<string, EventHandler> = {}

  if (refreshMap.services) {
    const fn = refreshMap.services
    handlers['service.status'] = () => debounced('services', fn)
    handlers['gatewayState'] = () => debounced('services', fn)
  }

  if (refreshMap.alerts) {
    const fn = refreshMap.alerts
    handlers['alert'] = () => debounced('alerts', fn)
    handlers['alert.new'] = () => debounced('alerts', fn)
    handlers['alert.resolved'] = () => debounced('alerts', fn)
  }

  if (refreshMap.tasks) {
    const fn = refreshMap.tasks
    handlers['cron.run'] = () => debounced('tasks', fn)
  }

  if (refreshMap.sessions) {
    const fn = refreshMap.sessions
    handlers['session.new'] = () => debounced('sessions', fn)
    handlers['session.end'] = () => debounced('sessions', fn)
  }

  if (refreshMap.config) {
    const fn = refreshMap.config
    handlers['config.changed'] = () => debounced('config', fn, 1000)
  }

  if (refreshMap.summary) {
    const fn = refreshMap.summary
    // Summary should refresh on many events
    handlers['gatewayState'] = () => debounced('summary', fn)
    if (!handlers['alert.new']) handlers['alert.new'] = () => debounced('summary', fn)
  }

  useSSERefresh({ handlers })

  onUnmounted(() => {
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer)
    }
  })
}
