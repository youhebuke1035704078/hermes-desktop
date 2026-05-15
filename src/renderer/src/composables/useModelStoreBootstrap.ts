/**
 * Composable that wires live hermes.model.* lifecycle events into the
 * model store and surfaces transient toasts through the notification
 * store.
 *
 * Data sources (bridged by the same routeLifecycle helper):
 *   1. main-process SSE  → window.api.onHermesLifecycle   (hermes-rest path)
 *   2. ACP WebSocket     → useWebSocketStore().subscribe  (acp-ws path)
 *
 * Bootstrap strategy (tried in order, Bug 7 post-v0.4.0):
 *   1. **Remote REST** — GET /v1/hermes/config on the connected server.
 *      Future-compatible with a hermes-agent endpoint (NousResearch/
 *      hermes-agent, not yet merged at the time of writing) that
 *      exposes the server's parsed ~/.hermes/config.yaml. This is the
 *      only accurate source for remote hermes-rest clients (e.g.
 *      Tailscale Windows → Mac mini). A 404 or network failure cleanly
 *      falls through to the next strategy.
 *   2. **Local IPC** — read the *client*'s ~/.hermes/config.yaml via
 *      window.api.hermesConfig(). Meaningful only when hermes and the
 *      desktop run on the same machine. For remote clients the file
 *      usually doesn't exist and this step returns null.
 *   3. **Real model fallback** — use connectionStore.hermesRealModel
 *      (populated by connection.ts:fetchHermesModel() via GET /v1/models)
 *      as a one-entry chain. Less accurate (advertises API_SERVER_MODEL_NAME,
 *      which may not match the actual primary), but matches what the
 *      ChatPage already displays, and is better than leaving the badge
 *      as "unknown". A separate watcher re-runs this step when
 *      hermesRealModel resolves *after* the initial bootstrap finishes.
 *
 * On transition to 'disconnected', mark the store 'stale'.
 *
 * Toast debouncing: the same (event-name, from, to, reason_code) tuple
 * must not spawn more than one toast within DEBOUNCE_MS.  A previous
 * session's suppression window is cleared on every fresh 'connected'.
 *
 * Test hooks: __routeLifecycleForTest / __resetDebounceForTest let unit
 * tests exercise the routing logic without mounting anything. The pure
 * bootstrap resolver (resolveBootstrap) and bootstrapFromRealModelIfUnknown
 * are also exported directly for unit testing.
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.5
 * and Task F1 of the implementation plan.
 */
import { watch, onUnmounted } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useModelStore } from '@/stores/model'
import { useNotificationStore } from '@/stores/notification'
import { useWebSocketStore } from '@/stores/websocket'
import { parseHermesConfigSummary } from '@/utils/hermes-config-parser'
import type {
  FallbackActivatedPayload,
  PrimaryRestoredPayload,
  ChainExhaustedPayload
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

// ---------------------------------------------------------------------
// Bootstrap resolution (Bug 7 post-v0.4.0)
// ---------------------------------------------------------------------

/** Shape returned by any config source. Primary is null if unresolvable. */
export interface BootstrapResult {
  primary: string | null
  fallback_chain: string[]
}

/**
 * Pluggable dependencies for resolveBootstrap. Each source returns a
 * non-null BootstrapResult on success, or null to indicate "this source
 * has nothing for you, try the next one." Exceptions are the caller's
 * responsibility to convert — resolveBootstrap assumes these never throw.
 */
export interface BootstrapSources {
  fetchRemote: () => Promise<BootstrapResult | null>
  fetchLocal: () => Promise<BootstrapResult | null>
  getRealModel: () => string | null
}

/**
 * Pure resolver: tries remote REST, then local IPC, then falls back to
 * the real model from /v1/models. Returns { primary: null, fallback_chain: [] }
 * only when every source comes up empty. Kept free of window.api / pinia
 * so it's trivially unit-testable.
 */
export async function resolveBootstrap(sources: BootstrapSources): Promise<BootstrapResult> {
  const remote = await sources.fetchRemote()
  if (remote && remote.primary) return remote

  const local = await sources.fetchLocal()
  if (local && local.primary) return local

  const realModel = sources.getRealModel()
  if (realModel) return { primary: realModel, fallback_chain: [] }

  return { primary: null, fallback_chain: [] }
}

/**
 * Promote the model store from 'unknown' to 'normal' using a real-model
 * name. No-op if the store is already in any other state (normal,
 * fallback, exhausted, stale) — we never clobber richer information
 * with this thin fallback.
 *
 * Used both in runBootstrap (final strategy) and in a dedicated watcher
 * on connectionStore.hermesRealModel, so a real model arriving *after*
 * the initial bootstrap (common — /v1/models fetch races with the
 * status transition) still lights up the badge.
 */
export function bootstrapFromRealModelIfUnknown(realModel: string | null): void {
  if (!realModel) return
  const modelStore = useModelStore()
  if (modelStore.state.kind !== 'unknown') return
  modelStore.bootstrap({ primary: realModel, fallbackChain: [] })
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
    durationMs: FALLBACK_TOAST_MS
  })
}

function triggerExhaustedToast(p: ChainExhaustedPayload): void {
  const key = `exhausted:${p.last_error_code}`
  if (!shouldEmitToast(key)) return
  useNotificationStore().push({
    kind: 'exhausted',
    payload: p,
    durationMs: EXHAUSTED_TOAST_MS
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
      try {
        if (status === 'connected' && prev !== 'connected') {
          lastToastKey.clear()
          await runBootstrap()
        } else if (status === 'disconnected') {
          modelStore.markStale()
        }
      } catch (err) {
        console.error('[useModelStoreBootstrap] watcher error', err)
      }
    },
    { flush: 'sync' }
  )

  // 2. Late-arriving realModel promotion (Bug 7 post-v0.4.0).
  //
  // runBootstrap races with connection.ts:fetchHermesModel() — the
  // connect() flow fires fetchHermesModel as a non-blocking side-effect
  // right after setting status = 'connected', so hermesRealModel is
  // usually still null when the status watcher fires above. When /v1/models
  // eventually resolves, this watcher catches the update and promotes
  // the store from 'unknown' → 'normal' using the real model name.
  const stopRealModelWatch = watch(
    () => connectionStore.hermesRealModel,
    (realModel) => bootstrapFromRealModelIfUnknown(realModel)
  )

  // 3. Subscribe to live events
  const lifecycleUnsub = subscribeLifecycle()

  onUnmounted(() => {
    stopWatch()
    stopRealModelWatch()
    lifecycleUnsub()
  })

  async function runBootstrap(): Promise<void> {
    if (connectionStore.serverType !== 'hermes-rest') return
    // acp-ws path: no static bootstrap available (the gateway doesn't
    // expose ~/.hermes/config.yaml). Live events via WebSocket populate
    // the store as they arrive — see subscribeLifecycle() below.

    const result = await resolveBootstrap({
      fetchRemote: fetchRemoteHermesConfig,
      fetchLocal: fetchLocalHermesConfig,
      getRealModel: () => connectionStore.hermesRealModel
    })

    modelStore.bootstrap({
      primary: result.primary,
      fallbackChain: result.fallback_chain
    })
  }

  /**
   * Strategy 1: GET /v1/hermes/config on the connected server. Forward-
   * compatible with a hermes-agent endpoint that isn't merged yet — if
   * the server responds 404 or the request throws, returns null and
   * resolveBootstrap falls through to the local IPC strategy.
   */
  async function fetchRemoteHermesConfig(): Promise<BootstrapResult | null> {
    const serverUrl = connectionStore.currentServer?.url
    if (!serverUrl || !window.api?.httpFetch) return null

    const headers: Record<string, string> = {}
    if (connectionStore.hermesAuthToken) {
      headers['Authorization'] = `Bearer ${connectionStore.hermesAuthToken}`
    }

    try {
      const resp = await window.api.httpFetch(`${serverUrl}/v1/hermes/config`, { headers })
      if (resp.ok) {
        const data = JSON.parse(typeof resp.body === 'string' ? resp.body : '{}') as {
          primary?: unknown
          fallback_chain?: unknown
        }
        if (typeof data.primary === 'string' && data.primary.length > 0) {
          const chain = Array.isArray(data.fallback_chain)
            ? data.fallback_chain.filter((x): x is string => typeof x === 'string')
            : []
          return { primary: data.primary, fallback_chain: chain }
        }
      }
    } catch {
      /* fall through to YAML config endpoints */
    }

    const yamlConfig =
      (await fetchRemoteConfigYaml(`${serverUrl}/v1/hermes/settings/config/yaml`, headers)) ||
      (await fetchLegacyMgmtConfigYaml(serverUrl, headers))
    if (!yamlConfig) return null

    const parsed = parseHermesConfigSummary(yamlConfig)
    if (!parsed.primary) return null
    return parsed
  }

  async function fetchRemoteConfigYaml(
    url: string,
    headers: Record<string, string>
  ): Promise<string | null> {
    try {
      const resp = await window.api?.httpFetch(url, { headers })
      if (!resp?.ok) return null
      const data = JSON.parse(typeof resp.body === 'string' ? resp.body : '{}') as {
        ok?: unknown
        content?: unknown
      }
      if (data.ok === false) return null
      return typeof data.content === 'string' ? data.content : null
    } catch {
      return null
    }
  }

  async function fetchLegacyMgmtConfigYaml(
    serverUrl: string,
    headers: Record<string, string>
  ): Promise<string | null> {
    try {
      const u = new URL(serverUrl)
      u.port = '8643'
      return await fetchRemoteConfigYaml(`${u.origin}/config/yaml`, headers)
    } catch {
      return null
    }
  }

  /**
   * Strategy 2: read the *client*'s ~/.hermes/config.yaml via IPC.
   * This is the pre-Bug-7 path; kept unchanged except that it now
   * returns null (rather than calling modelStore.bootstrap directly)
   * so resolveBootstrap can decide whether to fall through.
   */
  async function fetchLocalHermesConfig(): Promise<BootstrapResult | null> {
    if (!window.api?.hermesConfig) return null
    try {
      const config = await window.api.hermesConfig()
      if (!config.primary) return null
      return {
        primary: config.primary,
        // Validate fallback_chain: the IPC result is untyped at runtime,
        // so guard against undefined / non-array values.
        fallback_chain: Array.isArray(config.fallback_chain) ? config.fallback_chain : []
      }
    } catch (err) {
      console.warn('[lifecycle] hermesConfig bootstrap failed', err)
      return null
    }
  }

  function subscribeLifecycle(): () => void {
    const unsubscribers: Array<() => void> = []

    // hermes-rest path: main-process SSE → IPC
    if (window.api?.onHermesLifecycle) {
      unsubscribers.push(
        window.api.onHermesLifecycle((event) => {
          routeLifecycle(event.name, event.payload)
        })
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
      })
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
