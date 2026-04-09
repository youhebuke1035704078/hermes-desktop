import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { setBaseURL, clearAuthToken } from '@/api/desktop-http-client'
import { ConnectionState } from '@/api/types'
import { useAuthStore } from './auth'
import { useWebSocketStore } from './websocket'

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

export const useConnectionStore = defineStore('connection', () => {
  const currentServer = ref<ServerConfig | null>(null)
  const status = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const servers = ref<ServerConfig[]>([])
  /** Stops the watcher that syncs status with wsStore.state after initial connect */
  let stopStateSync: (() => void) | null = null

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
        // Server has auth disabled — no token needed
        authStore.authEnabled = false
      } else {
        // Gateway uses WebSocket token-based auth (protocol v3).
        // Set the password/token directly — the WS handshake will authenticate.
        authStore.authEnabled = true
        authStore.setToken(password)
      }

      // Start native WebSocket connection and wait for protocol v3 handshake
      const wsStore = useWebSocketStore()
      await wsStore.connect(server.url)

      currentServer.value = server
      status.value = 'connected'

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
    currentServer.value = null
    status.value = 'disconnected'
  }

  return { currentServer, status, servers, loadServers, addServer, deleteServer, connect, disconnect }
})
