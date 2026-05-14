import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from './chat'
import { useConnectionStore } from './connection'
import { useHermesChatStore, type HermesConversation } from './hermes-chat'

function createStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key)
    },
    setItem: (key: string, value: string) => {
      data.set(key, value)
    }
  }
}

function installWindowApi(api: Record<string, unknown>): void {
  const localStorage = createStorage()
  const sessionStorage = createStorage()
  vi.stubGlobal('window', { api, localStorage, sessionStorage })
}

function conversation(partial: Partial<HermesConversation>): HermesConversation {
  return {
    id: partial.id || 'conv-1',
    title: partial.title || '',
    messages: partial.messages || [],
    model: partial.model || 'hermes-agent',
    resolvedModel: partial.resolvedModel,
    createdAt: partial.createdAt || 1_700_000_000_000,
    updatedAt: partial.updatedAt || 1_700_000_000_000,
    tokenUsage: partial.tokenUsage,
    tokenUsageHistory: partial.tokenUsageHistory
  }
}

describe('REST chat conversation scoping', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps an in-flight REST reply scoped to its original conversation', async () => {
    let chunkHandler:
      | ((chunk: { requestId: string; done: boolean; data?: Record<string, unknown> }) => void)
      | null = null

    installWindowApi({
      onHermesChatChunk: vi.fn((handler) => {
        chunkHandler = handler
        return vi.fn()
      }),
      hermesChat: vi.fn(async (_url, _body, _auth, _sessionId, requestId: string) => {
        const hermesChatStore = useHermesChatStore()
        const chatStore = useChatStore()

        hermesChatStore.switchTo('conv-2')
        chatStore.setMessages([
          {
            id: 'conv-2-visible-message',
            role: 'user',
            content: 'message from another conversation',
            timestamp: '2026-05-14T00:00:00.000Z'
          }
        ])

        chunkHandler?.({
          requestId,
          done: false,
          data: {
            choices: [{ delta: { content: 'original reply' } }]
          }
        })

        return { ok: true, requestId, finalContent: 'original reply' }
      })
    })

    const connectionStore = useConnectionStore()
    connectionStore.serverType = 'hermes-rest'
    connectionStore.currentServer = {
      id: 'server',
      name: 'server',
      url: 'http://localhost:8642',
      username: '_noauth_'
    }
    connectionStore.hermesRealModel = 'gpt-5.4'

    const hermesChatStore = useHermesChatStore()
    hermesChatStore.conversations = [
      conversation({ id: 'conv-1', title: 'original', messages: [] }),
      conversation({
        id: 'conv-2',
        title: 'other',
        messages: [
          {
            id: 'conv-2-visible-message',
            role: 'user',
            content: 'message from another conversation',
            timestamp: '2026-05-14T00:00:00.000Z'
          }
        ]
      })
    ]
    hermesChatStore.activeId = 'conv-1'

    const chatStore = useChatStore()
    chatStore.sessionKey = 'main'
    chatStore.setMessages([])

    await chatStore.sendMessage('hello', 'hermes-agent')

    const original = hermesChatStore.conversations.find((item) => item.id === 'conv-1')!
    const other = hermesChatStore.conversations.find((item) => item.id === 'conv-2')!

    expect(original.messages.map((item) => [item.role, item.content])).toEqual([
      ['user', 'hello'],
      ['assistant', 'original reply']
    ])
    expect(other.messages.map((item) => item.content)).toEqual([
      'message from another conversation'
    ])
    expect(chatStore.messages.map((item) => item.content)).toEqual([
      'message from another conversation'
    ])
  })
})
