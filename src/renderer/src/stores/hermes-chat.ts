import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { safeGet, safeSet } from '@/utils/safe-storage'
import type { ChatMessage } from '@/api/types'

export interface HermesConversation {
  id: string
  title: string
  messages: ChatMessage[]
  model: string
  /** Actual model resolved from API response (e.g. "gpt-5.4") */
  resolvedModel?: string
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'hermes_conversations'
const MAX_CONVERSATIONS = 50

export const useHermesChatStore = defineStore('hermes-chat', () => {
  const conversations = ref<HermesConversation[]>([])
  const activeId = ref<string | null>(null)
  const model = ref('hermes-agent')

  const activeConversation = computed(() =>
    conversations.value.find(c => c.id === activeId.value) || null,
  )

  /** Load persisted conversations from localStorage */
  function load() {
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
  }

  /** Persist to localStorage */
  function save() {
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

  return {
    conversations,
    activeId,
    model,
    activeConversation,
    load,
    save,
    createConversation,
    switchTo,
    deleteConversation,
    renameConversation,
    setMessages,
    setModel,
  }
})
