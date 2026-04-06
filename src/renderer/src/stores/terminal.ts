import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiFetch, getAuthToken } from '../api/http-client'
import { useConnectionStore } from './connection'

export const useTerminalStore = defineStore('terminal', () => {
  const connectionState = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const currentSession = ref<any | null>(null)
  const config = ref({ cols: 80, rows: 24, timeout: 60, nodeId: undefined as string | undefined, cwd: undefined as string | undefined, shell: undefined as string | undefined })
  const error = ref<string | null>(null)
  const eventSource = ref<EventSource | null>(null)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 10
  const reconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatTimer = ref<ReturnType<typeof setInterval> | null>(null)
  const outputCallback = ref<((data: string) => void) | null>(null)
  const connectedCallback = ref<((sessionId: string) => void) | null>(null)
  const disconnectedCallback = ref<(() => void) | null>(null)

  const isConnected = computed(() => connectionState.value === 'connected')
  const isConnecting = computed(() => connectionState.value === 'connecting')
  const hasError = computed(() => connectionState.value === 'error')

  function setConfig(newConfig: Partial<typeof config.value>) {
    config.value = { ...config.value, ...newConfig }
  }

  function onOutput(cb: (data: string) => void) { outputCallback.value = cb }
  function onConnected(cb: (id: string) => void) { connectedCallback.value = cb }
  function onDisconnected(cb: () => void) { disconnectedCallback.value = cb }

  function getBaseUrl(): string {
    const connStore = useConnectionStore()
    return connStore.currentServer?.url || ''
  }

  function connect(nodeId?: string) {
    if (eventSource.value) disconnect()
    connectionState.value = 'connecting'
    error.value = null
    config.value.nodeId = nodeId

    const baseUrl = getBaseUrl()
    const params = new URLSearchParams()
    const token = getAuthToken()
    if (token) params.append('token', token)
    if (nodeId) params.append('nodeId', nodeId)
    params.append('cols', String(config.value.cols))
    params.append('rows', String(config.value.rows))

    const url = `${baseUrl}/api/terminal/stream?${params.toString()}`
    eventSource.value = new EventSource(url)

    eventSource.value.onopen = () => { reconnectAttempts.value = 0 }
    eventSource.value.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleEvent(data)
      } catch {
        outputCallback.value?.(event.data)
      }
    }
    eventSource.value.onerror = () => {
      connectionState.value = 'error'
      disconnectedCallback.value?.()
      scheduleReconnect()
    }
  }

  function handleEvent(event: any) {
    switch (event.type) {
      case 'connected':
        connectionState.value = 'connected'
        currentSession.value = { id: event.sessionId, nodeId: config.value.nodeId }
        startHeartbeat()
        connectedCallback.value?.(event.sessionId)
        break
      case 'output':
        if (event.data) outputCallback.value?.(event.data)
        break
      case 'disconnected':
        connectionState.value = 'disconnected'
        disconnectedCallback.value?.()
        break
    }
  }

  function scheduleReconnect() {
    if (reconnectAttempts.value >= maxReconnectAttempts) return
    reconnectTimer.value = setTimeout(() => {
      reconnectAttempts.value++
      connect(config.value.nodeId)
    }, 1000 * Math.pow(1.5, reconnectAttempts.value))
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer.value = setInterval(async () => {
      if (isConnected.value && currentSession.value) {
        try {
          await apiFetch('/api/terminal/heartbeat', {
            method: 'POST',
            body: JSON.stringify({ sessionId: currentSession.value.id })
          })
        } catch {}
      }
    }, (config.value.timeout || 60) * 500)
  }

  function stopHeartbeat() {
    if (heartbeatTimer.value) { clearInterval(heartbeatTimer.value); heartbeatTimer.value = null }
  }

  function disconnect() {
    stopHeartbeat()
    if (reconnectTimer.value) { clearTimeout(reconnectTimer.value); reconnectTimer.value = null }
    eventSource.value?.close()
    eventSource.value = null
    connectionState.value = 'disconnected'
    currentSession.value = null
    reconnectAttempts.value = 0
  }

  async function sendInput(input: string): Promise<boolean> {
    if (!isConnected.value || !currentSession.value) return false
    try {
      await apiFetch('/api/terminal/input', {
        method: 'POST',
        body: JSON.stringify({ sessionId: currentSession.value.id, data: input })
      })
      return true
    } catch { return false }
  }

  async function resize(cols: number, rows: number): Promise<boolean> {
    if (!isConnected.value || !currentSession.value) return false
    try {
      await apiFetch('/api/terminal/resize', {
        method: 'POST',
        body: JSON.stringify({ sessionId: currentSession.value.id, cols, rows })
      })
      config.value.cols = cols
      config.value.rows = rows
      return true
    } catch { return false }
  }

  return {
    connectionState, currentSession, config, error, isConnected, isConnecting, hasError,
    setConfig, onOutput, onConnected, onDisconnected,
    connect, disconnect, sendInput, resize
  }
})
