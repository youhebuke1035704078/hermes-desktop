/**
 * Composable that wires live hermes.model.* lifecycle events into the
 * model store and surfaces transient toasts through the notification
 * store.
 *
 * Data sources (bridged by the same routeLifecycle helper):
 *   1. main-process SSE  → window.api.onHermesLifecycle   (hermes-rest path)
 *   2. ACP WebSocket     → useWebSocketStore().subscribe  (acp-ws path)
 *
 * Bootstrap strategy:
 *   - On transition to 'connected', read ~/.hermes/config.yaml via
 *     window.api.hermesConfig() (only meaningful for hermes-rest /
 *     localhost) and prime useModelStore with the static chain.
 *   - On transition to 'disconnected', mark the store 'stale'.
 *
 * Toast debouncing: the same (event-name, from, to, reason_code) tuple
 * must not spawn more than one toast within DEBOUNCE_MS.  A previous
 * session's suppression window is cleared on every fresh 'connected'.
 *
 * Test hooks: __routeLifecycleForTest / __resetDebounceForTest let unit
 * tests exercise the routing logic without mounting anything.
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.5
 * and Task F1 of the implementation plan.
 */
import { watch, onUnmounted } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useModelStore } from '@/stores/model'
import { useNotificationStore } from '@/stores/notification'
import { useWebSocketStore } from '@/stores/websocket'
import type {
  FallbackActivatedPayload,
  PrimaryRestoredPayload,
  ChainExhaustedPayload,
} from '@/api/types'

const DEBOUNCE_MS = 60_000
const FALLBACK_TOAST_MS = 3_000
/**
 * Bug 6 (post-merge): the original spec set this to 5_000 ms, but real
 * acceptance testing showed that 5 s is not enough to read the
 * attempted-models list and the last error before a terminal error
 * toast vanishes.  chain_exhausted is a hard failure mode — the user
 * has to open config.yaml or their .env to fix it — so we now emit the
 * toast as persistent (durationMs = 0 means "no auto-dismiss"). The
 * toast still has a × close button so the user can clear it at will.
 */
const EXHAUSTED_TOAST_MS = 0

/**
 * Module-level debounce map. Keyed by a stable event signature (see
 * toastKey helpers). A test-only reset hook clears it between tests.
 */
const lastToastKey = new Map<string, number>()

// ---------------------------------------------------------------------
// Pure routing helpers (exported for unit testing)
// ---------------------------------------------------------------------

export function __routeLifecycleForTest(name: string, payload: unknown): void {
  routeLifecycle(name, payload)
}

export function __resetDebounceForTest(): void {
  lastToastKey.clear()
}

function routeLifecycle(name: string, payload: unknown): void {
  const modelStore = useModelStore()
  switch (name) {
    case 'hermes.model.fallback_activated': {
      const p = payload as FallbackActivatedPayload
      modelStore.applyFallbackActivated(p)
      triggerFallbackToast(p)
      break
    }
    case 'hermes.model.primary_restored': {
      const p = payload as PrimaryRestoredPayload
      modelStore.applyPrimaryRestored(p)
      // No toast on restore — avoid nagging the user once things are fine.
      break
    }
    case 'hermes.model.chain_exhausted': {
      const p = payload as ChainExhaustedPayload
      modelStore.applyChainExhausted(p)
      triggerExhaustedToast(p)
      break
    }
    default:
      console.debug('[lifecycle] unknown event', name)
  }
}

function triggerFallbackToast(p: FallbackActivatedPayload): void {
  const key = `fallback:${p.from_model}->${p.to_model}:${p.reason_code}`
  if (!shouldEmitToast(key)) return
  useNotificationStore().push({
    kind: 'fallback',
    payload: p,
    durationMs: FALLBACK_TOAST_MS,
  })
}

function triggerExhaustedToast(p: ChainExhaustedPayload): void {
  const key = `exhausted:${p.last_error_code}`
  if (!shouldEmitToast(key)) return
  useNotificationStore().push({
    kind: 'exhausted',
    payload: p,
    durationMs: EXHAUSTED_TOAST_MS,
  })
}

function shouldEmitToast(key: string): boolean {
  const now = Date.now()
  const last = lastToastKey.get(key) ?? 0
  if (now - last < DEBOUNCE_MS) return false
  lastToastKey.set(key, now)
  return true
}

// ---------------------------------------------------------------------
// The composable
// ---------------------------------------------------------------------

export function useModelStoreBootstrap(): void {
  const connectionStore = useConnectionStore()
  const modelStore = useModelStore()
  const wsStore = useWebSocketStore()

  // 1. Re-bootstrap on connection transitions
  const stopWatch = watch(
    () => connectionStore.status,
    async (status, prev) => {
      if (status === 'connected' && prev !== 'connected') {
        lastToastKey.clear()
        await runBootstrap()
      } else if (status === 'disconnected') {
        modelStore.markStale()
      }
    },
    { flush: 'sync' },
  )

  // 2. Subscribe to live events
  const lifecycleUnsub = subscribeLifecycle()

  onUnmounted(() => {
    stopWatch()
    lifecycleUnsub()
  })

  async function runBootstrap(): Promise<void> {
    if (connectionStore.serverType === 'hermes-rest') {
      if (!window.api?.hermesConfig) return
      try {
        const config = await window.api.hermesConfig()
        modelStore.bootstrap({
          primary: config.primary,
          fallbackChain: config.fallback_chain,
        })
      } catch (err) {
        console.warn('[lifecycle] hermesConfig bootstrap failed', err)
      }
    }
    // acp-ws path: no static bootstrap available (the gateway doesn't
    // expose ~/.hermes/config.yaml). Live events via WebSocket populate
    // the store as they arrive — see subscribeLifecycle() below.
  }

  function subscribeLifecycle(): () => void {
    const unsubscribers: Array<() => void> = []

    // hermes-rest path: main-process SSE → IPC
    if (window.api?.onHermesLifecycle) {
      unsubscribers.push(
        window.api.onHermesLifecycle((event) => {
          routeLifecycle(event.name, event.payload)
        }),
      )
    }

    // acp-ws path: gateway emits event:hermes.model.* frames via the
    // existing WebSocket channel.
    unsubscribers.push(
      wsStore.subscribe('event:hermes.model.fallback_activated', (payload: unknown) => {
        routeLifecycle('hermes.model.fallback_activated', payload)
      }),
      wsStore.subscribe('event:hermes.model.primary_restored', (payload: unknown) => {
        routeLifecycle('hermes.model.primary_restored', payload)
      }),
      wsStore.subscribe('event:hermes.model.chain_exhausted', (payload: unknown) => {
        routeLifecycle('hermes.model.chain_exhausted', payload)
      }),
    )

    return () => {
      for (const off of unsubscribers) {
        try {
          off()
        } catch (err) {
          console.warn('[lifecycle] unsubscribe failed', err)
        }
      }
    }
  }
}
