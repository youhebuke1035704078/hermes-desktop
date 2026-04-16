import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { safeGet, safeSet } from '@/utils/safe-storage'
import { useConnectionStore } from './connection'
import type { ChatMessage } from '@/api/types'

export interface TokenUsageEntry {
  /** Unix ms timestamp when this turn completed */
  ts: number
  input: number
  output: number
  /** Resolved model for this specific turn (may differ across turns if user switched) */
  model?: string
}

export interface HermesConversation {
  id: string
  title: string
  messages: ChatMessage[]
  model: string
  /** Actual model resolved from API response (e.g. "gpt-5.4") */
  resolvedModel?: string
  createdAt: number
  updatedAt: number
  /** Cumulative token usage across all turns in this conversation */
  tokenUsage?: { totalInput: number; totalOutput: number }
  /** Per-turn usage records — enables time-range filtering.
   *  Added in v0.4.4; older conversations may only have cumulative `tokenUsage`. */
  tokenUsageHistory?: TokenUsageEntry[]
}

const STORAGE_KEY = 'hermes_conversations'
const MAX_CONVERSATIONS = 50

/** Debounce timer for server sync */
let syncTimer: ReturnType<typeof setTimeout> | null = null
const SYNC_DEBOUNCE = 2000

export const useHermesChatStore = defineStore('hermes-chat', () => {
  const conversations = ref<HermesConversation[]>([])
  const activeId = ref<string | null>(null)
  const model = ref('hermes-agent')
  /** Whether server sync is available (management API detected) */
  const serverSyncAvailable = ref(false)

  const activeConversation = computed(() =>
    conversations.value.find(c => c.id === activeId.value) || null,
  )

  // ── Server sync helpers ──

  /** Derive management API URL from current server (port 8643) */
  function getMgmtUrl(): string {
    const conn = useConnectionStore()
    const url = conn.currentServer?.url
    if (!url) return ''
    try {
      const u = new URL(url)
      u.port = '8643'
      return u.origin
    } catch { return '' }
  }

  function getAuthToken(): string | null {
    const conn = useConnectionStore()
    return conn.hermesAuthToken
  }

  async function mgmtFetch(path: string, opts: { method?: string; body?: string } = {}): Promise<any> {
    const baseUrl = getMgmtUrl()
    if (!baseUrl) throw new Error('No management URL')
    const url = `${baseUrl}${path}`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = getAuthToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (window.api?.httpFetch) {
      const resp = await window.api.httpFetch(url, { method: opts.method || 'GET', headers, body: opts.body })
      return typeof resp.body === 'string' && resp.body ? JSON.parse(resp.body) : {}
    }
    const resp = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body, signal: AbortSignal.timeout(10000) })
    return resp.json()
  }

  /** Probe management API for conversation sync support */
  async function probeServerSync(): Promise<void> {
    try {
      const resp = await mgmtFetch('/health')
      serverSyncAvailable.value = resp?.platform === 'hermes-mgmt'
    } catch {
      serverSyncAvailable.value = false
    }
  }

  /** Load conversations from server */
  async function loadFromServer(): Promise<boolean> {
    if (!serverSyncAvailable.value) return false
    try {
      const resp = await mgmtFetch('/conversations')
      if (resp.ok && resp.data) {
        const remote = resp.data as {
          conversations: HermesConversation[]
          activeId: string | null
          model: string
        }
        // Merge: remote takes precedence for conversations that exist on both sides
        // (keyed by id, newer updatedAt wins)
        const localMap = new Map(conversations.value.map(c => [c.id, c]))
        const remoteMap = new Map((remote.conversations || []).map(c => [c.id, c]))

        const merged: HermesConversation[] = []
        const allIds = new Set([...localMap.keys(), ...remoteMap.keys()])

        for (const id of allIds) {
          const local = localMap.get(id)
          const remoteConv = remoteMap.get(id)
          if (local && remoteConv) {
            // Both exist — keep newer
            merged.push(local.updatedAt >= remoteConv.updatedAt ? local : remoteConv)
          } else {
            merged.push((local || remoteConv)!)
          }
        }

        // Sort by updatedAt descending
        merged.sort((a, b) => b.updatedAt - a.updatedAt)
        conversations.value = merged.slice(0, MAX_CONVERSATIONS)

        // Use remote activeId if we don't have a local one
        if (!activeId.value && remote.activeId) {
          activeId.value = remote.activeId
        }
        if (remote.model) model.value = remote.model

        saveLocal()
        return true
      }
    } catch { /* server sync failed, use local */ }
    return false
  }

  /** Save conversations to server (debounced) */
  function syncToServer() {
    if (!serverSyncAvailable.value) return
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(async () => {
      try {
        await mgmtFetch('/conversations', {
          method: 'PUT',
          body: JSON.stringify({
            data: {
              conversations: conversations.value.slice(0, MAX_CONVERSATIONS),
              activeId: activeId.value,
              model: model.value,
            },
          }),
        })
      } catch { /* silent fail */ }
    }, SYNC_DEBOUNCE)
  }

  // ── Local storage helpers ──

  function saveLocal() {
    try {
      safeSet(STORAGE_KEY, JSON.stringify({
        conversations: conversations.value.slice(0, MAX_CONVERSATIONS),
        activeId: activeId.value,
        model: model.value,
      }))
    } catch (e) {
      console.warn('[hermes-chat] Failed to save:', e)
    }
  }

  /** Persist to both localStorage and server */
  function save() {
    saveLocal()
    syncToServer()
  }

  /** Load persisted conversations from localStorage, then try server sync */
  function load() {
    // Load from localStorage first (instant)
    try {
      const raw = safeGet(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as {
          conversations: HermesConversation[]
          activeId: string | null
          model: string
        }
        conversations.value = parsed.conversations || []
        activeId.value = parsed.activeId || null
        if (parsed.model) model.value = parsed.model
      }
    } catch {
      conversations.value = []
      activeId.value = null
    }
    // Ensure there's always at least one conversation
    if (!conversations.value.length) {
      createConversation()
    }
    if (!activeId.value || !conversations.value.find(c => c.id === activeId.value)) {
      activeId.value = conversations.value[0]?.id || null
    }

    // Async: probe server sync and merge
    probeServerSync().then(() => {
      if (serverSyncAvailable.value) {
        loadFromServer()
      }
    })
  }

  /** Create a new blank conversation and make it active */
  function createConversation(): string {
    const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const conv: HermesConversation = {
      id,
      title: '',
      messages: [],
      model: model.value,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    conversations.value.unshift(conv)
    activeId.value = id
    save()
    return id
  }

  /** Switch active conversation */
  function switchTo(id: string) {
    activeId.value = id
    save()
  }

  /** Delete a conversation */
  function deleteConversation(id: string) {
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeId.value === id) {
      activeId.value = conversations.value[0]?.id || null
      if (!conversations.value.length) createConversation()
    }
    save()
  }

  /** Rename a conversation */
  function renameConversation(id: string, title: string) {
    const conv = conversations.value.find(c => c.id === id)
    if (!conv) return
    conv.title = title.trim()
    conv.updatedAt = Date.now()
    save()
  }

  /** Update messages for the active conversation and persist */
  function setMessages(messages: ChatMessage[], resolvedModel?: string) {
    const conv = conversations.value.find(c => c.id === activeId.value)
    if (!conv) return
    conv.messages = messages
    conv.updatedAt = Date.now()
    if (resolvedModel) conv.resolvedModel = resolvedModel
    // Auto-title from first user message
    if (!conv.title) {
      const firstUser = messages.find(m => m.role === 'user')
      if (firstUser?.content) {
        conv.title = firstUser.content.slice(0, 30) + (firstUser.content.length > 30 ? '...' : '')
      }
    }
    save()
  }

  function setModel(m: string) {
    model.value = m
    save()
  }

  /** Accumulate token usage from a single turn into the conversation total AND append a per-turn history entry */
  function accumulateTokenUsage(id: string, inputTokens: number, outputTokens: number, model?: string) {
    if (inputTokens <= 0 && outputTokens <= 0) return
    const conv = conversations.value.find(c => c.id === id)
    if (!conv) return
    const prev = conv.tokenUsage || { totalInput: 0, totalOutput: 0 }
    conv.tokenUsage = {
      totalInput: prev.totalInput + inputTokens,
      totalOutput: prev.totalOutput + outputTokens,
    }
    if (!conv.tokenUsageHistory) conv.tokenUsageHistory = []
    const entry: TokenUsageEntry = {
      ts: Date.now(),
      input: inputTokens,
      output: outputTokens,
    }
    if (model) entry.model = model
    conv.tokenUsageHistory.push(entry)
    // Persist the real model from the SSE chunk onto the conversation so the
    // dashboard's "all" preset (legacy byModel aggregation via
    // conv.resolvedModel) shows real names like "gemini-2.5-flash" instead of
    // the generic "hermes-agent" proxy label.
    if (model) conv.resolvedModel = model
    conv.updatedAt = Date.now()
    save()
  }

  return {
    conversations,
    activeId,
    model,
    serverSyncAvailable,
    activeConversation,
    load,
    loadFromServer,
    save,
    createConversation,
    switchTo,
    deleteConversation,
    renameConversation,
    setMessages,
    setModel,
    accumulateTokenUsage,
  }
})
