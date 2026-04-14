import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import type { Channel, ChannelAuthParams, PairParams } from '@/api/types/channel'

export const useChannelsStore = defineStore('channels', () => {
  const channels = ref<Channel[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedChannelId = ref<string | null>(null)
  const authInFlight = ref<string | null>(null) // channelId of in-progress auth

  // ── Getters ──
  const connectedCount = computed(() => channels.value.filter((c) => c.status === 'connected').length)
  const disconnectedCount = computed(() => channels.value.filter((c) => c.status === 'disconnected').length)
  const errorCount = computed(() => channels.value.filter((c) => c.status === 'error').length)
  const totalMembers = computed(() =>
    channels.value.reduce((sum, c) => sum + (typeof c.memberCount === 'number' ? c.memberCount : 0), 0),
  )

  const platforms = computed(() => {
    const set = new Set<string>()
    for (const c of channels.value) {
      if (c.platform) set.add(String(c.platform))
    }
    return [...set].sort()
  })

  const selectedChannel = computed(() =>
    channels.value.find((c) => c.id === selectedChannelId.value) || null,
  )

  // ── Actions ──
  async function fetchChannels(): Promise<void> {
    const wsStore = useWebSocketStore()
    loading.value = true
    error.value = null
    try {
      channels.value = await wsStore.rpc.listChannels()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function authChannel(params: ChannelAuthParams): Promise<{ ok: boolean; error?: string; payload?: unknown }> {
    const wsStore = useWebSocketStore()
    authInFlight.value = params.channelId
    try {
      const payload = await wsStore.rpc.authChannel(params)
      await fetchChannels()
      return { ok: true, payload }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      authInFlight.value = null
    }
  }

  async function pairChannel(params: PairParams): Promise<{ ok: boolean; error?: string }> {
    const wsStore = useWebSocketStore()
    authInFlight.value = params.channelId
    try {
      await wsStore.rpc.pairChannel(params)
      await fetchChannels()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      authInFlight.value = null
    }
  }

  async function refreshStatus(channelId: string): Promise<void> {
    const wsStore = useWebSocketStore()
    try {
      const status = await wsStore.rpc.getChannelStatus(channelId)
      const channel = channels.value.find((c) => c.id === channelId)
      if (channel) {
        channel.status = status
      }
    } catch {
      // ignore — caller will see the stale value
    }
  }

  return {
    channels, loading, error, selectedChannelId, authInFlight,
    connectedCount, disconnectedCount, errorCount, totalMembers, platforms, selectedChannel,
    fetchChannels, authChannel, pairChannel, refreshStatus,
  }
})
