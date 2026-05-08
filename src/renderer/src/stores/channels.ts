import { ref, computed, shallowRef, triggerRef } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import { useConnectionStore } from './connection'
import { hermesRestGet } from '@/api/hermes-rest-client'
import type { Channel, ChannelAuthParams, PairParams } from '@/api/types/channel'

export const useChannelsStore = defineStore('channels', () => {
  const channels = ref<Channel[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedChannelId = ref<string | null>(null)
  // Set of channelIds with an auth/pair RPC in flight. Previously a single
  // ref<string | null> — concurrent auth+pair on different channels would
  // clobber each other's indicator (A's finally cleared B's in-progress
  // state). Using a set, every action manages only its own id.
  const authInFlightSet = shallowRef<Set<string>>(new Set())

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
    const connectionStore = useConnectionStore()
    loading.value = true
    error.value = null
    try {
      if (connectionStore.serverType === 'hermes-rest') {
        const payload = await hermesRestGet<{ channels?: Channel[] }>('/v1/hermes/channels')
        channels.value = Array.isArray(payload.channels) ? payload.channels : []
      } else {
        channels.value = await wsStore.rpc.listChannels()
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function markInFlight(channelId: string): boolean {
    if (authInFlightSet.value.has(channelId)) return false
    authInFlightSet.value.add(channelId)
    triggerRef(authInFlightSet)
    return true
  }

  function clearInFlight(channelId: string): void {
    if (authInFlightSet.value.delete(channelId)) {
      triggerRef(authInFlightSet)
    }
  }

  function isAuthInFlight(channelId: string | null | undefined): boolean {
    if (!channelId) return false
    return authInFlightSet.value.has(channelId)
  }

  async function authChannel(params: ChannelAuthParams): Promise<{ ok: boolean; error?: string; payload?: unknown }> {
    const wsStore = useWebSocketStore()
    const connectionStore = useConnectionStore()
    if (connectionStore.serverType === 'hermes-rest') {
      return { ok: false, error: 'Hermes REST channels are read-only in this version' }
    }
    if (!markInFlight(params.channelId)) {
      return { ok: false, error: 'auth already in flight' }
    }
    try {
      const payload = await wsStore.rpc.authChannel(params)
      await fetchChannels()
      return { ok: true, payload }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      clearInFlight(params.channelId)
    }
  }

  async function pairChannel(params: PairParams): Promise<{ ok: boolean; error?: string }> {
    const wsStore = useWebSocketStore()
    const connectionStore = useConnectionStore()
    if (connectionStore.serverType === 'hermes-rest') {
      return { ok: false, error: 'Hermes REST channels are read-only in this version' }
    }
    if (!markInFlight(params.channelId)) {
      return { ok: false, error: 'pair already in flight' }
    }
    try {
      await wsStore.rpc.pairChannel(params)
      await fetchChannels()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      clearInFlight(params.channelId)
    }
  }

  async function refreshStatus(channelId: string): Promise<void> {
    const wsStore = useWebSocketStore()
    const connectionStore = useConnectionStore()
    try {
      if (connectionStore.serverType === 'hermes-rest') {
        await fetchChannels()
        return
      }
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
    channels, loading, error, selectedChannelId, authInFlightSet,
    isAuthInFlight,
    connectedCount, disconnectedCount, errorCount, totalMembers, platforms, selectedChannel,
    fetchChannels, authChannel, pairChannel, refreshStatus,
  }
})
