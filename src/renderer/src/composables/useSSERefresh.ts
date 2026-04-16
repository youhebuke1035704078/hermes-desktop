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
    // gatewayState may also be needed by 'summary' — build it after all
    // blocks so we can compose rather than overwrite (see below).
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
    if (!handlers['alert.new']) handlers['alert.new'] = () => debounced('summary', fn)
  }

  // Build a single gatewayState handler that fans out to every subscriber.
  // Previously, assigning handlers['gatewayState'] twice (once for 'services',
  // once for 'summary') meant the second assignment silently dropped the first.
  {
    const servicesFn = refreshMap.services
    const summaryFn = refreshMap.summary
    if (servicesFn || summaryFn) {
      handlers['gatewayState'] = () => {
        if (servicesFn) debounced('services', servicesFn)
        if (summaryFn) debounced('summary', summaryFn)
      }
    }
  }

  useSSERefresh({ handlers })

  onUnmounted(() => {
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer)
    }
  })
}
