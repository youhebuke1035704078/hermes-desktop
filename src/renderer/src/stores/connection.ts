import { ref } from 'vue'
import { defineStore } from 'pinia'
import { setBaseURL, clearAuthToken } from '../api/http-client'
import { useAuthStore } from './auth'
import { useGatewayStore } from './gateway'

export interface ServerConfig {
  id: string
  name: string
  url: string
  username: string
}

export const useConnectionStore = defineStore('connection', () => {
  const currentServer = ref<ServerConfig | null>(null)
  const status = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const servers = ref<ServerConfig[]>([])

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
    if (!window.api) return
    await window.api.saveServer(server)
    await loadServers()
  }

  async function deleteServer(id: string) {
    if (!window.api) return
    await window.api.removeServer(id)
    await loadServers()
    if (currentServer.value?.id === id) {
      await disconnect()
    }
  }

  async function connect(serverId: string) {
    status.value = 'connecting'
    const password = window.api ? await window.api.decryptPassword(serverId) : null
    const server = servers.value.find((s) => s.id === serverId)
    if (!server || !password) {
      status.value = 'error'
      return
    }

    setBaseURL(server.url)
    try {
      const authStore = useAuthStore()
      await authStore.login(server.username, password)
      // Start SSE event stream after successful auth
      const gwStore = useGatewayStore()
      await gwStore.connect()
      currentServer.value = server
      status.value = 'connected'
    } catch {
      status.value = 'error'
      throw new Error('连接失败')
    }
  }

  async function disconnect() {
    const gwStore = useGatewayStore()
    gwStore.disconnect()
    const authStore = useAuthStore()
    await authStore.logout()
    clearAuthToken()
    currentServer.value = null
    status.value = 'disconnected'
  }

  return { currentServer, status, servers, loadServers, addServer, deleteServer, connect, disconnect }
})
