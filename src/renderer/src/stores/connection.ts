import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { setBaseURL, clearAuthToken } from '@/api/desktop-http-client'
import { ConnectionState } from '@/api/types'
import { useAuthStore } from './auth'
import { useWebSocketStore } from './websocket'
import { useModelStore } from '@/stores/model'
import { safeGet, safeSet } from '@/utils/safe-storage'

export interface ServerConfig {
  id: string
  name: string
  url: string
  username: string
}

/** Categorised connection error types for UI display */
export type ConnectionErrorType = 'network' | 'auth' | 'timeout' | 'server' | 'unknown'

export class ConnectionError extends Error {
  type: ConnectionErrorType
  constructor(type: ConnectionErrorType, message: string) {
    super(message)
    this.name = 'ConnectionError'
    this.type = type
  }
}

/** Maximum time (ms) for the entire connect flow before we abort */
const CONNECT_TIMEOUT = 15_000
/** Shorter timeout for auto-connect to local server (snappier UX) */
const LOCAL_CONNECT_TIMEOUT = 5_000

/** Default local Hermes server — no saved config / IPC needed */
const LOCAL_SERVER: ServerConfig = {
  id: '__local__',
  name: '本地 Hermes',
  url: 'http://localhost:8642',
  username: '_noauth_'
}

export const useConnectionStore = defineStore('connection', () => {
  const currentServer = ref<ServerConfig | null>(null)
  const status = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const servers = ref<ServerConfig[]>([])
  /**
   * Server type: 'hermes-rest' for Hermes Agent REST API, 'acp-ws' for ACP WebSocket gateway.
   * Determined automatically during connection by probing /health endpoint.
   */
  const serverType = ref<'hermes-rest' | 'acp-ws' | null>(null)
  /** Actual underlying model name from ~/.hermes/config.yaml (e.g. "gpt-5.4") */
  const hermesRealModel = ref<string | null>(null)
  /** API auth token for Hermes REST servers (API_SERVER_KEY) */
  const hermesAuthToken = ref<string | null>(null)
  /** Stops the watcher that syncs status with wsStore.state after initial connect */
  let stopStateSync: (() => void) | null = null
  let connectionAttemptId = 0

  function nextConnectionAttempt(): number {
    connectionAttemptId += 1
    return connectionAttemptId
  }

  function isCurrentAttempt(attemptId: number): boolean {
    return attemptId === connectionAttemptId
  }

  function assertCurrentAttempt(attemptId: number): void {
    if (!isCurrentAttempt(attemptId)) {
      throw new Error('Connection superseded')
    }
  }

  /** Check whether a URL points to the local machine */
  function isLocalUrl(url: string): boolean {
    try {
      const host = new URL(url).hostname
      return host === 'localhost' || host === '127.0.0.1' || host === '::1'
    } catch {
      return false
    }
  }

  async function fetchHermesModels(serverUrl: string, token: string | null) {
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    return window.api
      ? await window.api.httpFetch(`${serverUrl}/v1/models`, { headers })
      : await fetch(`${serverUrl}/v1/models`, { headers, signal: AbortSignal.timeout(3000) }).then(
          async (r) => ({ ok: r.ok, status: r.status, body: await r.text() })
        )
  }

  function modelIdFromModelsResponse(body: string): string | null {
    if (!body) return null
    try {
      const data = JSON.parse(body)
      const modelId = data?.data?.[0]?.id
      return typeof modelId === 'string' && modelId ? modelId : null
    } catch {
      return null
    }
  }

  /**
   * Validate Hermes REST auth before marking the app connected.
   *
   * /health is intentionally public in hermes-agent, so a stale or wrong
   * API_SERVER_KEY previously produced a false "connected" state and only
   * failed later in 在线对话 with HTTP 401. Probing /v1/models here turns
   * that into an immediate connection/auth error and gives the user a clear
   * chance to update the saved token.
   */
  async function validateHermesRestAuth(
    serverUrl: string,
    token: string | null
  ): Promise<string | null> {
    const resp = await fetchHermesModels(serverUrl, token)
    if (resp.status === 401 || resp.status === 403) {
      throw new ConnectionError(
        'auth',
        token
          ? 'API_SERVER_KEY 无效或已过期，请在连接服务器里更新该服务器的访问令牌'
          : '该 Hermes REST API 需要 API_SERVER_KEY，请在连接服务器里填写访问令牌'
      )
    }
    if (!resp.ok) {
      if (resp.status === 0) {
        throw new ConnectionError('network', '无法连接到 Hermes REST API，请检查服务器地址和网络')
      }
      throw new ConnectionError('server', `/v1/models 返回 HTTP ${resp.status}`)
    }

    const modelId = modelIdFromModelsResponse(resp.body)
    return modelId && modelId !== 'hermes-agent' ? modelId : null
  }

  /**
   * Fetch the actual underlying model name for a Hermes REST server.
   * Strategy:
   *  1. GET /v1/models (with auth) — works for local and remote; returns
   *     the model name advertised by Hermes Agent (API_SERVER_MODEL_NAME).
   *     If the name differs from 'hermes-agent', use it directly.
   *  2. For local servers only: read ~/.hermes/config.yaml via IPC
   *  3. Graceful fallback: hermesRealModel stays null → UI shows proxy model name
   */
  async function fetchHermesModel() {
    const serverUrl = currentServer.value?.url
    if (!serverUrl) return

    // Strategy 1: Fetch /v1/models (works for both local and remote)
    try {
      const modelsResp = await fetchHermesModels(serverUrl, hermesAuthToken.value)
      if (modelsResp.ok) {
        const modelId = modelIdFromModelsResponse(modelsResp.body)
        if (modelId && modelId !== 'hermes-agent') {
          // Guard against disconnect() racing with this non-blocking fetch.
          // Only update if still connected to the same server.
          if (currentServer.value?.url === serverUrl) {
            hermesRealModel.value = modelId
          }
          return
        }
      }
    } catch {
      /* fall through */
    }

    // Strategy 2: Read local config file (only for localhost)
    if (isLocalUrl(serverUrl) && window.api?.hermesConfig) {
      try {
        const result = await window.api.hermesConfig()
        if (result.ok && result.model) {
          if (currentServer.value?.url === serverUrl) {
            hermesRealModel.value = result.model
          }
          return
        }
      } catch {
        /* config read failed */
      }
    }

    // Strategy 3: Fallback — hermesRealModel remains null
  }

  async function loadServers() {
    if (!window.api) {
      console.warn('[connection] window.api not available (not in Electron)')
      return
    }
    servers.value = await window.api.getServers()
  }

  async function addServer(server: {
    id: string
    name: string
    url: string
    username: string
    password: string
  }) {
    if (!window.api) {
      throw new Error('window.api not available')
    }
    // Must send plain object through IPC (Vue Proxy can't be cloned)
    await window.api.saveServer({ ...server })
    await loadServers()
  }

  async function deleteServer(id: string) {
    if (!window.api) return
    // Disconnect first if this is the active server
    if (currentServer.value?.id === id) {
      try {
        await disconnect()
      } catch (e) {
        console.warn('Failed to disconnect before delete:', e)
      }
    }
    await window.api.removeServer(id)
    await loadServers()
  }

  async function connect(serverId: string) {
    // If already connected to another server, clean up first
    if (currentServer.value && currentServer.value.id !== serverId) {
      try {
        await disconnect()
      } catch {
        /* best-effort */
      }
    }

    const attemptId = nextConnectionAttempt()
    status.value = 'connecting'
    // Clear stale token from previous server before doing anything
    clearAuthToken()

    const password = window.api ? await window.api.decryptPassword(serverId) : null
    if (!isCurrentAttempt(attemptId)) return
    const server = servers.value.find((s) => s.id === serverId)
    if (!server || !password) {
      status.value = 'error'
      throw new ConnectionError('unknown', '找不到服务器配置或无法解密密码')
    }

    // Set base URL for all API calls (desktop-http-client)
    setBaseURL(server.url)
    const authStore = useAuthStore()

    // Wrap the entire connect flow with a timeout to avoid hanging in "connecting" state
    const connectFlow = async () => {
      const isNoAuth = server.username === '_noauth_' && password === '_noauth_'

      if (isNoAuth) {
        authStore.authEnabled = false
      } else {
        authStore.authEnabled = true
        authStore.setToken(password)
      }

      // Probe /health to auto-detect Hermes Agent REST API server.
      // If the health endpoint returns { status: 'ok' }, treat it as Hermes REST
      // and skip WebSocket entirely. ACP gateways don't expose /health.
      let isHermesRest = false
      try {
        const healthResp = window.api
          ? await window.api.httpFetch(`${server.url}/health`)
          : await fetch(`${server.url}/health`, { signal: AbortSignal.timeout(5000) }).then(
              (r) => ({ ok: r.ok, status: r.status, body: '' })
            )
        if (healthResp.ok) {
          const data =
            typeof healthResp.body === 'string' && healthResp.body
              ? JSON.parse(healthResp.body)
              : {}
          if (data?.status === 'ok') isHermesRest = true
        }
      } catch {
        /* health probe failed — fall through to WebSocket */
      }

      if (isHermesRest) {
        // Hermes Agent REST API — no WebSocket needed
        const modelId = await validateHermesRestAuth(server.url, isNoAuth ? null : password)
        assertCurrentAttempt(attemptId)
        serverType.value = 'hermes-rest'
        hermesAuthToken.value = isNoAuth ? null : password
        if (modelId) hermesRealModel.value = modelId
        currentServer.value = server
        status.value = 'connected'
        safeSet('lastConnectedServerId', serverId)
        if (!modelId) fetchHermesModel() // non-blocking fallback for local config/model name
        return
      }

      // ACP WebSocket gateway path
      serverType.value = 'acp-ws'

      // Start native WebSocket connection and wait for protocol v3 handshake
      const wsStore = useWebSocketStore()
      await wsStore.connect(server.url)
      if (!isCurrentAttempt(attemptId)) {
        wsStore.disconnect()
        throw new Error('Connection superseded')
      }

      currentServer.value = server
      status.value = 'connected'

      // Remember last connected server for auto-reconnect after app restart (e.g. update)
      safeSet('lastConnectedServerId', serverId)

      // Keep connectionStore.status in sync with wsStore.state for post-connect
      // state changes (e.g. WS drop → reconnecting → reconnected / failed)
      stopStateSync?.()
      stopStateSync = watch(
        () => wsStore.state,
        (wsState) => {
          switch (wsState) {
            case ConnectionState.CONNECTED:
              status.value = 'connected'
              break
            case ConnectionState.FAILED:
              status.value = 'error'
              break
            case ConnectionState.RECONNECTING:
            case ConnectionState.CONNECTING:
              status.value = 'connecting'
              break
            case ConnectionState.DISCONNECTED:
              status.value = 'disconnected'
              break
          }
        }
      )
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new ConnectionError('timeout', '连接超时，请检查服务器是否可达')),
        CONNECT_TIMEOUT
      )
    })

    try {
      await Promise.race([connectFlow(), timeout])
    } catch (e) {
      // If a newer connect() call superseded this one, don't touch shared state
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'Connection superseded') return
      if (!isCurrentAttempt(attemptId)) return
      nextConnectionAttempt()

      status.value = 'error'
      // Clean up any watcher that may have been installed by a previous
      // successful connection (or by connectFlow before the timeout fired).
      stopStateSync?.()
      stopStateSync = null
      // Stop background reconnect attempts on failure / timeout
      const wsStore = useWebSocketStore()
      wsStore.disconnect()
      if (e instanceof ConnectionError) throw e
      throw new ConnectionError('unknown', msg || '连接失败')
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async function disconnect() {
    nextConnectionAttempt()
    stopStateSync?.()
    stopStateSync = null
    const wsStore = useWebSocketStore()
    wsStore.disconnect()
    const authStore = useAuthStore()
    if (authStore.authEnabled) {
      await authStore.logout()
    }
    clearAuthToken()
    authStore.authEnabled = true // Reset to default
    serverType.value = null
    hermesRealModel.value = null
    hermesAuthToken.value = null
    currentServer.value = null
    status.value = 'disconnected'
    // Mark model state as stale so the badge shows last-known data with
    // the stale flag. Note: useModelStoreBootstrap also watches
    // connection.status and calls markStale on 'disconnected' — this is
    // a belt-and-suspenders call for code paths that disconnect without
    // going through the status watcher synchronously.
    try {
      useModelStore().markStale()
    } catch {
      // Pinia store may not be available in every call context; ignore.
    }
  }

  /**
   * Connect directly to the local Hermes server (localhost:8642).
   * Hermes exposes an OpenAI-compatible REST API — NOT ACP WebSocket.
   * We confirm the server is alive via GET /health, then mark connected.
   *
   * Bug 5 (fallback-visibility post-merge): previously this assumed
   * the local server had no API_SERVER_KEY and hard-coded
   * `authEnabled = false`. When the user started hermes-agent with a
   * key in ~/.hermes/.env, every downstream /v1/chat, /v1/models,
   * and /v1/chat/stream (SSE) call went without an Authorization
   * header and returned 401 — the UI silently failed to bootstrap
   * the model store. We now read the key via the hermes:config IPC
   * and, if present, enable auth and set hermesAuthToken before
   * probing /health.
   */
  async function connectLocal(): Promise<void> {
    // If already connected to another server, clean up first
    if (currentServer.value) {
      try {
        await disconnect()
      } catch {
        /* best-effort */
      }
    }

    const attemptId = nextConnectionAttempt()
    status.value = 'connecting'
    clearAuthToken()

    setBaseURL(LOCAL_SERVER.url)
    const authStore = useAuthStore()

    // Read the local Hermes config (model + fallback chain + API key)
    // BEFORE any HTTP probe so we can authenticate from the very first
    // request. hermesConfig is a local file read — fast, no network.
    let configApiKey: string | null = null
    if (window.api?.hermesConfig) {
      try {
        const cfg = await window.api.hermesConfig()
        if (!isCurrentAttempt(attemptId)) return
        if (cfg.apiServerKey) configApiKey = cfg.apiServerKey
        if (cfg.model) hermesRealModel.value = cfg.model
      } catch {
        /* fall through — treat as unauthenticated local */
      }
    }

    if (configApiKey) {
      authStore.authEnabled = true
      authStore.setToken(configApiKey)
      hermesAuthToken.value = configApiKey
    } else {
      authStore.authEnabled = false
      hermesAuthToken.value = null
    }

    try {
      // Use Electron main-process fetch to bypass CORS restrictions.
      // /health itself doesn't require auth, but we send the header
      // anyway — if the user rotated their key we'd rather fail here
      // than silently stream 401s later.
      const headers: Record<string, string> = {}
      if (configApiKey) headers['Authorization'] = `Bearer ${configApiKey}`
      const resp = window.api
        ? await window.api.httpFetch(`${LOCAL_SERVER.url}/health`, { headers })
        : await fetch(`${LOCAL_SERVER.url}/health`, {
            headers,
            signal: AbortSignal.timeout(LOCAL_CONNECT_TIMEOUT)
          }).then((r) => ({ ok: r.ok, status: r.status, body: '' }))

      assertCurrentAttempt(attemptId)
      if (!resp.ok) throw new Error(`health check returned ${resp.status}`)

      const data = typeof resp.body === 'string' && resp.body ? JSON.parse(resp.body) : {}
      if (data?.status !== 'ok') throw new Error('unexpected health response')

      const modelId = await validateHermesRestAuth(LOCAL_SERVER.url, configApiKey)
      assertCurrentAttempt(attemptId)
      serverType.value = 'hermes-rest'
      if (modelId) hermesRealModel.value = modelId
      currentServer.value = { ...LOCAL_SERVER }
      status.value = 'connected'
      safeSet('lastConnectedServerId', LOCAL_SERVER.id)
      if (!modelId) fetchHermesModel() // non-blocking: resolve the final display name
    } catch (e) {
      if (e instanceof Error && e.message === 'Connection superseded') return
      if (!isCurrentAttempt(attemptId)) return
      nextConnectionAttempt()
      status.value = 'error'
      // Roll back auth state so a retry doesn't reuse a bad token.
      hermesAuthToken.value = null
      authStore.setToken(null)
      authStore.authEnabled = true // Reset to default; don't leave it false if no key was found
      if (e instanceof ConnectionError) throw e
      throw new ConnectionError('network', '无法连接到本地 Hermes 服务器')
    }
  }

  /**
   * Auto-connect on app launch:
   *  1. Try localhost:8642 first (zero-config experience)
   *  2. Fall back to last saved server
   */
  async function autoConnect(): Promise<boolean> {
    // 1. Always try local Hermes server first
    try {
      await connectLocal()
      return true
    } catch {
      // Local not running — fall through
    }

    // 2. Fall back to last manually-saved server
    const lastId = safeGet('lastConnectedServerId')
    if (!lastId || lastId === LOCAL_SERVER.id) return false

    await loadServers()
    const server = servers.value.find((s) => s.id === lastId)
    if (!server) return false

    try {
      await connect(lastId)
      return true
    } catch {
      return false
    }
  }

  return {
    currentServer,
    status,
    servers,
    serverType,
    hermesRealModel,
    hermesAuthToken,
    loadServers,
    addServer,
    deleteServer,
    connect,
    connectLocal,
    disconnect,
    autoConnect
  }
})
