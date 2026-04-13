import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { setBaseURL, clearAuthToken } from '@/api/desktop-http-client'
import { ConnectionState } from '@/api/types'
import { useAuthStore } from './auth'
import { useWebSocketStore } from './websocket'
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
  username: '_noauth_',
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

  /** Check whether a URL points to the local machine */
  function isLocalUrl(url: string): boolean {
    try {
      const host = new URL(url).hostname
      return host === 'localhost' || host === '127.0.0.1' || host === '::1'
    } catch { return false }
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
      const headers: Record<string, string> = {}
      if (hermesAuthToken.value) headers['Authorization'] = `Bearer ${hermesAuthToken.value}`
      const modelsResp = window.api
        ? await window.api.httpFetch(`${serverUrl}/v1/models`, { headers })
        : await fetch(`${serverUrl}/v1/models`, { headers, signal: AbortSignal.timeout(3000) })
            .then(r => ({ ok: r.ok, status: r.status, body: '' }))
      if (modelsResp.ok) {
        const body = typeof modelsResp.body === 'string' && modelsResp.body
          ? modelsResp.body : ''
        const data = body ? JSON.parse(body) : {}
        const modelId = data?.data?.[0]?.id
        if (modelId && modelId !== 'hermes-agent') {
          hermesRealModel.value = modelId
          return
        }
      }
    } catch { /* fall through */ }

    // Strategy 2: Read local config file (only for localhost)
    if (isLocalUrl(serverUrl) && window.api?.hermesConfig) {
      try {
        const result = await window.api.hermesConfig()
        if (result.ok && result.model) {
          hermesRealModel.value = result.model
          return
        }
      } catch { /* config read failed */ }
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
      try { await disconnect() } catch { /* best-effort */ }
    }

    status.value = 'connecting'
    // Clear stale token from previous server before doing anything
    clearAuthToken()

    const password = window.api ? await window.api.decryptPassword(serverId) : null
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
          : await fetch(`${server.url}/health`, { signal: AbortSignal.timeout(5000) })
              .then(r => ({ ok: r.ok, status: r.status, body: '' }))
        if (healthResp.ok) {
          const data = typeof healthResp.body === 'string' && healthResp.body
            ? JSON.parse(healthResp.body) : {}
          if (data?.status === 'ok') isHermesRest = true
        }
      } catch { /* health probe failed — fall through to WebSocket */ }

      if (isHermesRest) {
        // Hermes Agent REST API — no WebSocket needed
        serverType.value = 'hermes-rest'
        hermesAuthToken.value = isNoAuth ? null : password
        currentServer.value = server
        status.value = 'connected'
        safeSet('lastConnectedServerId', serverId)
        fetchHermesModel() // non-blocking: read actual model name from config
        return
      }

      // ACP WebSocket gateway path
      serverType.value = 'acp-ws'

      // Start native WebSocket connection and wait for protocol v3 handshake
      const wsStore = useWebSocketStore()
      await wsStore.connect(server.url)

      currentServer.value = server
      status.value = 'connected'

      // Remember last connected server for auto-reconnect after app restart (e.g. update)
      safeSet('lastConnectedServerId', serverId)

      // Keep connectionStore.status in sync with wsStore.state for post-connect
      // state changes (e.g. WS drop → reconnecting → reconnected / failed)
      stopStateSync?.()
      stopStateSync = watch(() => wsStore.state, (wsState) => {
        switch (wsState) {
          case ConnectionState.CONNECTED: status.value = 'connected'; break
          case ConnectionState.FAILED: status.value = 'error'; break
          case ConnectionState.RECONNECTING:
          case ConnectionState.CONNECTING: status.value = 'connecting'; break
          case ConnectionState.DISCONNECTED: status.value = 'disconnected'; break
        }
      })
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new ConnectionError('timeout', '连接超时，请检查服务器是否可达')), CONNECT_TIMEOUT)
    })

    try {
      await Promise.race([connectFlow(), timeout])
    } catch (e) {
      // If a newer connect() call superseded this one, don't touch shared state
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'Connection superseded') return

      status.value = 'error'
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
    stopStateSync?.()
    stopStateSync = null
    const wsStore = useWebSocketStore()
    wsStore.disconnect()
    const authStore = useAuthStore()
    if (authStore.authEnabled) {
      await authStore.logout()
    }
    clearAuthToken()
    authStore.authEnabled = true  // Reset to default
    serverType.value = null
    hermesRealModel.value = null
    hermesAuthToken.value = null
    currentServer.value = null
    status.value = 'disconnected'
  }

  /**
   * Connect directly to the local Hermes server (localhost:8642).
   * Hermes exposes an OpenAI-compatible REST API — NOT ACP WebSocket.
   * We confirm the server is alive via GET /health, then mark connected.
   */
  async function connectLocal(): Promise<void> {
    // If already connected to another server, clean up first
    if (currentServer.value) {
      try { await disconnect() } catch { /* best-effort */ }
    }

    status.value = 'connecting'
    clearAuthToken()

    setBaseURL(LOCAL_SERVER.url)
    const authStore = useAuthStore()
    authStore.authEnabled = false // local server without API_SERVER_KEY

    try {
      // Use Electron main-process fetch to bypass CORS restrictions
      const resp = window.api
        ? await window.api.httpFetch(`${LOCAL_SERVER.url}/health`)
        : await fetch(`${LOCAL_SERVER.url}/health`, { signal: AbortSignal.timeout(LOCAL_CONNECT_TIMEOUT) }).then(r => ({ ok: r.ok, status: r.status, body: '' }))

      if (!resp.ok) throw new Error(`health check returned ${resp.status}`)

      const data = typeof resp.body === 'string' && resp.body ? JSON.parse(resp.body) : {}
      if (data?.status !== 'ok') throw new Error('unexpected health response')

      serverType.value = 'hermes-rest'
      currentServer.value = { ...LOCAL_SERVER }
      status.value = 'connected'
      safeSet('lastConnectedServerId', LOCAL_SERVER.id)
      fetchHermesModel() // non-blocking: read actual model name from config
    } catch (e) {
      status.value = 'error'
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

  return { currentServer, status, servers, serverType, hermesRealModel, hermesAuthToken, loadServers, addServer, deleteServer, connect, connectLocal, disconnect, autoConnect }
})
