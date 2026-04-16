import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import { useConnectionStore } from './connection'
import { useHermesChatStore } from './hermes-chat'
import { useModelStore } from '@/stores/model'
import { initialFallbackStamp, applyFallbackStamp } from './chat-fallback-stamp'
import type { ChatMessage } from '@/api/types'
import { byLocale, getActiveLocale } from '@/i18n/text'

type AgentPhase =
  | 'idle'
  | 'sending'
  | 'waiting'
  | 'thinking'
  | 'tool'
  | 'replying'
  | 'aborting'
  | 'done'
  | 'aborted'
  | 'error'

interface AgentStatus {
  phase: AgentPhase
  runId: string | null
  detail: string | null
  updatedAtMs: number
  sinceMs: number
  sessionKey: string | null
  lastMessage: string | null
  finishedAtMs: number | null
}

interface AgentStep {
  ts: number
  phase: AgentPhase
  label: string
}

interface ToolProgress {
  toolCallId: string
  name: string
  phase: 'start' | 'update' | 'result'
  meta: string | null
  isError: boolean | null
  argsPreview: string | null
  partialPreview: string | null
  resultPreview: string | null
  startedAtMs: number
  updatedAtMs: number
}

const MAX_AGENT_STEPS = 30
const TOOL_PREVIEW_MAX_CHARS = 6000
const FINALIZED_RUN_TTL_MS = 5 * 60 * 1000
/**
 * Upper bound on in-memory chat messages. Rendering thousands of messages
 * at once is a memory hazard: each message keeps its own markdown render,
 * tool-call preview, and DOM subtree. We keep the most recent N and drop
 * the oldest. The backend remains the source of truth for full history.
 */
const MAX_MESSAGES_IN_MEMORY = 2000

function capMessages(list: readonly ChatMessage[]): ChatMessage[] {
  if (list.length <= MAX_MESSAGES_IN_MEMORY) return [...list]
  return list.slice(list.length - MAX_MESSAGES_IN_MEMORY)
}

/**
 * Extract token usage from an SSE chunk.
 * hermes-agent sends usage in the final chunk (the one with finish_reason: "stop").
 * Returns { inputTokens, outputTokens } or null if no usage data present.
 */
export function extractUsageFromChunk(
  chunkData: unknown,
): { inputTokens: number; outputTokens: number } | null {
  if (!chunkData || typeof chunkData !== 'object') return null
  const usage = (chunkData as Record<string, unknown>).usage
  if (!usage || typeof usage !== 'object') return null
  const u = usage as Record<string, unknown>
  const input = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0
  const output = typeof u.completion_tokens === 'number' ? u.completion_tokens : 0
  if (input === 0 && output === 0) return null
  return { inputTokens: input, outputTokens: output }
}

export const useChatStore = defineStore('chat', () => {
  const CONTEXT_COMPACTION_DETAIL_ZH = '上下文压缩中...'
  const CONTEXT_COMPACTION_DETAIL_EN = 'Compacting context...'

  const sessionKey = ref('')
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const syncing = ref(false)
  const sending = ref(false)
  const lastError = ref<string | null>(null)
  const lastSyncedAt = ref<number | null>(null)
  
  // 支持多个智能体的状态管理
  const agentStatuses = ref<Map<string, AgentStatus>>(new Map())
  const agentSteps = ref<Map<string, AgentStep[]>>(new Map())
  const toolProgress = ref<Map<string, ToolProgress | null>>(new Map())
  
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimers: Array<ReturnType<typeof setTimeout>> = []
  let streamFlushRaf: number | null = null
  let pendingStreamMessages: ChatMessage[] = []
  let lastToolPreviewUpdateAtMs = 0
  const finalizedRuns = new Map<string, number>()

  // 获取或创建智能体状态
  function getOrCreateAgentStatus(agentId: string): AgentStatus {
    if (!agentStatuses.value.has(agentId)) {
      agentStatuses.value.set(agentId, {
        phase: 'idle',
        runId: null,
        detail: null,
        updatedAtMs: Date.now(),
        sinceMs: Date.now(),
        sessionKey: null,
        lastMessage: null,
        finishedAtMs: null,
      })
    }
    return agentStatuses.value.get(agentId)!  
  }

  // 获取或创建智能体步骤
  function getOrCreateAgentSteps(agentId: string): AgentStep[] {
    if (!agentSteps.value.has(agentId)) {
      agentSteps.value.set(agentId, [])
    }
    return agentSteps.value.get(agentId)!  
  }

  // 获取或创建工具进度
  function getOrCreateToolProgress(agentId: string): ToolProgress | null {
    if (!toolProgress.value.has(agentId)) {
      toolProgress.value.set(agentId, null)
    }
    return toolProgress.value.get(agentId)!  
  }

  const wsStore = useWebSocketStore()

  function toolCompletedDetail(toolName: string): string {
    const locale = getActiveLocale()
    return byLocale(`工具完成：${toolName}`, `Tool done: ${toolName}`, locale)
  }

  function contextCompactionDetail(): string {
    const locale = getActiveLocale()
    return byLocale(CONTEXT_COMPACTION_DETAIL_ZH, CONTEXT_COMPACTION_DETAIL_EN, locale)
  }

  function isContextCompactionDetail(value: string | null): boolean {
    if (!value) return false
    return value === CONTEXT_COMPACTION_DETAIL_ZH || value === CONTEXT_COMPACTION_DETAIL_EN
  }

  function markRunFinal(runId: string) {
    const normalized = runId.trim()
    if (!normalized) return

    const now = Date.now()
    finalizedRuns.set(normalized, now)

    for (const [key, ts] of finalizedRuns) {
      if (now - ts > FINALIZED_RUN_TTL_MS) {
        finalizedRuns.delete(key)
      }
    }
  }

  function isRunFinalized(runId: string): boolean {
    const normalized = runId.trim()
    if (!normalized) return false

    const ts = finalizedRuns.get(normalized)
    if (!ts) return false

    const now = Date.now()
    if (now - ts > FINALIZED_RUN_TTL_MS) {
      finalizedRuns.delete(normalized)
      return false
    }
    return true
  }

  function truncatePreview(value: string, maxChars = TOOL_PREVIEW_MAX_CHARS): string {
    const text = value.trim()
    if (text.length <= maxChars) return text
    return `${text.slice(0, maxChars)}...`
  }

  function redactSensitive(value: unknown, depth = 0): unknown {
    if (depth > 4) return value
    if (!value) return value
    if (typeof value !== 'object') return value

    if (Array.isArray(value)) {
      return value.map((item) => redactSensitive(item, depth + 1))
    }

    const row = value as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(row)) {
      if (/token|password|secret|api[_-]?key|authorization|cookie/i.test(key)) {
        next[key] = '[REDACTED]'
        continue
      }
      next[key] = redactSensitive(raw, depth + 1)
    }
    return next
  }

  function toJsonPreview(value: unknown): string | null {
    if (value === undefined || value === null) return null
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed ? truncatePreview(trimmed) : null
    }

    try {
      const redacted = redactSensitive(value)
      const json = JSON.stringify(redacted, null, 2)
      return json ? truncatePreview(json) : null
    } catch {
      const fallback = String(value)
      return fallback.trim() ? truncatePreview(fallback) : null
    }
  }

  function stepLabel(phase: AgentPhase, detail: string | null): string {
    const locale = getActiveLocale()
    if (phase === 'sending') return byLocale('消息发送中', 'Sending', locale)
    if (phase === 'waiting') return byLocale('等待响应', 'Waiting', locale)
    if (phase === 'thinking') return detail?.trim() ? detail.trim() : byLocale('思考中', 'Thinking', locale)
    if (phase === 'tool') {
      return detail?.trim()
        ? byLocale(`调用工具：${detail.trim()}`, `Calling tool: ${detail.trim()}`, locale)
        : byLocale('调用工具中', 'Running tool', locale)
    }
    if (phase === 'replying') return byLocale('回复中', 'Replying', locale)
    if (phase === 'aborting') return byLocale('停止中...', 'Stopping...', locale)
    if (phase === 'done') return byLocale('本轮完成', 'Done', locale)
    if (phase === 'aborted') return byLocale('已停止', 'Stopped', locale)
    if (phase === 'error') return detail?.trim() ? byLocale(`错误：${detail.trim()}`, `Error: ${detail.trim()}`, locale) : byLocale('错误', 'Error', locale)
    return byLocale('空闲', 'Idle', locale)
  }

  function appendAgentStep(agentId: string, phase: AgentPhase, detail: string | null) {
    if (phase === 'idle') return

    const label = stepLabel(phase, detail)
    const now = Date.now()
    const steps = getOrCreateAgentSteps(agentId)
    const last = steps[steps.length - 1]
    if (last && last.phase === phase && last.label === label) {
      return
    }

    agentSteps.value.set(agentId, [...steps, { ts: now, phase, label }].slice(-MAX_AGENT_STEPS))
  }

  function resetAgentProgress(agentId: string) {
    agentSteps.value.set(agentId, [])
    toolProgress.value.set(agentId, null)
    lastToolPreviewUpdateAtMs = 0
  }

  function setAgentStatusPhase(agentId: string, phase: AgentPhase, patch?: { runId?: string | null; detail?: string | null; sessionKey?: string | null; lastMessage?: string | null }) {
    const now = Date.now()
    const prev = getOrCreateAgentStatus(agentId)
    
    const isTerminalPhase = phase === 'done' || phase === 'aborted' || phase === 'error' || phase === 'idle'
    const wasActivePhase = prev.phase !== 'idle' && prev.phase !== 'done' && prev.phase !== 'aborted' && prev.phase !== 'error'
    
    const next: AgentStatus = {
      ...prev,
      phase,
      runId: patch?.runId === undefined ? prev.runId : patch.runId,
      detail: patch?.detail === undefined ? prev.detail : patch.detail,
      sessionKey: patch?.sessionKey === undefined ? prev.sessionKey : patch.sessionKey,
      lastMessage: patch?.lastMessage === undefined ? prev.lastMessage : patch.lastMessage,
      updatedAtMs: now,
      sinceMs: prev.phase === phase ? prev.sinceMs : now,
      finishedAtMs: isTerminalPhase && wasActivePhase ? now : prev.finishedAtMs,
    }

    const unchanged =
      prev.phase === next.phase &&
      prev.runId === next.runId &&
      prev.detail === next.detail &&
      prev.sessionKey === next.sessionKey &&
      prev.lastMessage === next.lastMessage
    if (unchanged) return

    agentStatuses.value.set(agentId, next)

    const phaseChanged = prev.phase !== next.phase
    const detailChanged = prev.detail !== next.detail
    if (
      phaseChanged ||
      (next.phase === 'tool' && detailChanged) ||
      (next.phase === 'thinking' && detailChanged && !!next.detail)
    ) {
      appendAgentStep(agentId, next.phase, next.detail)
    }
  }

  function resolveChatEventState(normalizedEvent: string, payloadRow?: Record<string, unknown> | null): string {
    const direct = asString(payloadRow?.state || payloadRow?.status || payloadRow?.phase).trim().toLowerCase()
    if (direct) return direct

    if (normalizedEvent === 'chat.delta' || normalizedEvent.endsWith('.delta')) return 'delta'
    if (normalizedEvent === 'chat.final' || normalizedEvent.endsWith('.final') || normalizedEvent === 'chat.done') return 'final'
    if (normalizedEvent === 'chat.aborted' || normalizedEvent.endsWith('.aborted') || normalizedEvent === 'chat.stop') return 'aborted'
    if (normalizedEvent === 'chat.error' || normalizedEvent.endsWith('.error')) return 'error'
    return ''
  }

  function resetAgentStatus(agentId: string) {
    agentStatuses.value.set(agentId, {
      phase: 'idle',
      runId: null,
      detail: null,
      updatedAtMs: Date.now(),
      sinceMs: Date.now(),
      sessionKey: null,
      lastMessage: null,
      finishedAtMs: null,
    })
  }

  function setSessionKey(key: string) {
    sessionKey.value = key.trim()
    const match = key.match(/^agent:([^:]+):/)
    if (match && match[1]) {
      const agentId = match[1]
      resetAgentStatus(agentId)
      resetAgentProgress(agentId)
    }
    finalizedRuns.clear()
    pendingStreamMessages = []
    if (streamFlushRaf !== null) {
      cancelAnimationFrame(streamFlushRaf)
      streamFlushRaf = null
    }
  }

  async function fetchHistory(
    key = sessionKey.value,
    options?: {
      silent?: boolean
      clearError?: boolean
    }
  ) {
    if (!key.trim()) {
      messages.value = []
      return
    }

    const silent = options?.silent ?? false
    const clearError = options?.clearError ?? !silent
    if (silent && syncing.value) {
      return
    }

    if (silent) {
      syncing.value = true
    } else {
      loading.value = true
    }
    if (clearError) {
      lastError.value = null
    }

    try {
      const normalizedKey = key.trim()
      sessionKey.value = normalizedKey

      // Hermes REST mode: history is local-only (sent with each request)
      if (isHermesRestMode()) {
        lastSyncedAt.value = Date.now()
      } else {
        const fetched = await wsStore.rpc.listChatHistory(normalizedKey)
        // Rapid session switches can cause an older response to arrive after
        // a newer one — drop it if the active session has since changed.
        if (sessionKey.value !== normalizedKey) return
        messages.value = capMessages(fetched)
        lastSyncedAt.value = Date.now()
      }
    } catch (error) {
      if (sessionKey.value !== key.trim()) return
      if (!silent || clearError) {
        lastError.value = error instanceof Error ? error.message : String(error)
      }
      console.error('[ChatStore] fetchHistory failed:', error)
    } finally {
      if (sessionKey.value === key.trim()) {
        if (silent) {
          syncing.value = false
        } else {
          loading.value = false
        }
      }
    }
  }

  function clearTimers() {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    for (const timer of pollTimers) {
      clearTimeout(timer)
    }
    pollTimers = []
    if (streamFlushRaf !== null) {
      cancelAnimationFrame(streamFlushRaf)
      streamFlushRaf = null
    }
    pendingStreamMessages = []
  }

  function scheduleHistoryRefresh(delay = 250) {
    if (!sessionKey.value.trim()) return
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    refreshTimer = setTimeout(() => {
      fetchHistory(sessionKey.value, { silent: true, clearError: false })
    }, delay)
  }

  function extractSessionKey(payload: unknown): string {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ''
    const row = payload as Record<string, unknown>
    if (typeof row.sessionKey === 'string') return row.sessionKey
    if (typeof row.key === 'string') return row.key
    if (row.session && typeof row.session === 'object' && !Array.isArray(row.session)) {
      const session = row.session as Record<string, unknown>
      if (typeof session.key === 'string') return session.key
      if (typeof session.sessionKey === 'string') return session.sessionKey
    }
    return ''
  }

  function asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
    return null
  }

  function asString(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return ''
  }

  function asText(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) {
      return value
        .map((item) => asText(item))
        .filter((item) => item.trim().length > 0)
        .join('\n')
    }
    const row = asRecord(value)
    if (!row) return ''

    if ('text' in row) return asText(row.text)
    if ('content' in row) return asText(row.content)
    if ('message' in row) return asText(row.message)
    if ('output' in row) return asText(row.output)
    if ('delta' in row) return asText(row.delta)
    return ''
  }

  function normalizeRole(value: unknown): ChatMessage['role'] {
    if (value === 'user' || value === 'assistant' || value === 'tool' || value === 'system') return value
    if (value === 'toolResult') return 'tool'
    return 'assistant'
  }

  function normalizeRealtimeMessage(value: unknown): ChatMessage | null {
    const row = asRecord(value)
    if (!row) return null

    const content = asText(
      row.content ?? row.text ?? row.message ?? row.output ?? row.delta ?? row.payload ?? row.input
    ).trim()
    if (!content) return null

    const id = typeof row.id === 'string' ? row.id : typeof row.messageId === 'string' ? row.messageId : undefined
    const timestamp =
      typeof row.timestamp === 'string'
        ? row.timestamp
        : typeof row.createdAt === 'string'
          ? row.createdAt
          : typeof row.time === 'string'
            ? row.time
            : undefined
    const name =
      typeof row.name === 'string' ? row.name : typeof row.model === 'string' ? row.model : undefined

    return {
      id,
      role: normalizeRole(row.role ?? row.type),
      content,
      timestamp,
      name,
    }
  }

  function extractRealtimeMessages(payload: unknown): ChatMessage[] {
    const rawItems: unknown[] = []

    if (Array.isArray(payload)) {
      rawItems.push(...payload)
    } else {
      const row = asRecord(payload)
      if (!row) return []

      if (Array.isArray(row.messages)) rawItems.push(...row.messages)
      if (Array.isArray(row.items)) rawItems.push(...row.items)
      if (Array.isArray(row.transcript)) rawItems.push(...row.transcript)
      if (Array.isArray(row.history)) rawItems.push(...row.history)

      if (row.message) rawItems.push(row.message)
      if (row.item) rawItems.push(row.item)

      if (row.role || row.type || row.content || row.text || row.message || row.output || row.delta) {
        rawItems.push(row)
      }
    }

    return rawItems.map((item) => normalizeRealtimeMessage(item)).filter((item): item is ChatMessage => !!item)
  }

  function extractRunId(payload: unknown): string {
    const row = asRecord(payload)
    if (!row) return ''
    const runId = asString(row.runId).trim()
    if (runId) return runId
    return ''
  }

  function mergeRealtimeMessages(
    nextMessages: ChatMessage[],
    options?: {
      streaming?: boolean
    }
  ) {
    if (nextMessages.length === 0) return

    const streaming = options?.streaming ?? false
    const list = [...messages.value]
    for (const next of nextMessages) {
      if (next.id) {
        const existingIndex = list.findIndex((item) => item.id && item.id === next.id)
        if (existingIndex >= 0) {
          const existing = list[existingIndex]
          if (!existing) continue
          list[existingIndex] =
            next.content.length >= existing.content.length
              ? { ...existing, ...next }
              : existing
          continue
        }
      }

      const last = list[list.length - 1]
      if (last && last.role === next.role && last.content === next.content) {
        const lastId = last.id || ''
        if (lastId.startsWith('web-') || lastId.startsWith('local-')) {
          list[list.length - 1] = { ...last, ...next }
          continue
        }
      }
      if (streaming && last && last.role === next.role) {
        if (next.content.startsWith(last.content)) {
          list[list.length - 1] = { ...last, ...next }
          continue
        }
        if (last.content.endsWith(next.content)) {
          continue
        }
        list[list.length - 1] = {
          ...last,
          ...next,
          content: `${last.content}${next.content}`,
        }
        continue
      }

      if (!next.id && last && !last.id && last.role === next.role) {
        if (next.content.startsWith(last.content)) {
          list[list.length - 1] = { ...last, ...next }
          continue
        }
      }

      list.push(next)
    }

    messages.value = capMessages(list)
  }

  function handleRealtimeEvent(
    payload: unknown,
    options?: {
      refreshHistory?: boolean
      streaming?: boolean
    }
  ) {
    const keyInEvent = extractSessionKey(payload)
    
    // 即使 sessionKey 为空，也处理事件，更新全局状态
    if (!sessionKey.value.trim() && keyInEvent) {
      // 当 sessionKey 为空但事件中有 sessionKey 时，更新 sessionKey
      sessionKey.value = keyInEvent
    }

    // 处理实时消息
    const realtimeMessages = extractRealtimeMessages(payload)
    if (options?.streaming) {
      pendingStreamMessages.push(...realtimeMessages)
      if (streamFlushRaf === null) {
        // 对齐浏览器绘制帧合并流式增量，减少滚动“抖动/跳帧”观感
        streamFlushRaf = requestAnimationFrame(() => {
          streamFlushRaf = null
          if (pendingStreamMessages.length === 0) return
          const batch = pendingStreamMessages
          pendingStreamMessages = []
          mergeRealtimeMessages(batch, { streaming: true })
        })
      }
    } else {
      mergeRealtimeMessages(realtimeMessages, { streaming: false })
    }

    if (options?.refreshHistory ?? true) {
      scheduleHistoryRefresh(200)
    }
  }

  function handleAgentStatusEvent(eventName: string, payload: unknown) {
    const normalizedEvent = eventName.trim().toLowerCase()
    if (!normalizedEvent) return

    const keyInEvent = extractSessionKey(payload)
    const payloadRow = asRecord(payload)

    // 从 sessionKey 中提取 agentId
    let agentId = 'default'
    if (keyInEvent) {
      const match = keyInEvent.match(/^agent:([^:]+):/)
      if (match && match[1]) {
        agentId = match[1]
      }
    } else if (sessionKey.value) {
      const match = sessionKey.value.match(/^agent:([^:]+):/)
      if (match && match[1]) {
        agentId = match[1]
      }
    }

    // 处理所有智能体的会话事件，不局限于当前 sessionKey

    const runIdInEvent = extractRunId(payload)
    const agentStatus = getOrCreateAgentStatus(agentId)
    const activeRunId = agentStatus.runId

    // 更新 sessionKey
    if (keyInEvent && agentStatus.sessionKey !== keyInEvent) {
      agentStatuses.value.set(agentId, {
        ...agentStatus,
        sessionKey: keyInEvent,
        updatedAtMs: Date.now(),
      })
    }

    if (normalizedEvent === 'chat' || normalizedEvent.startsWith('chat.')) {
      const state = resolveChatEventState(normalizedEvent, payloadRow)
      const isTerminal = state === 'final' || state === 'done' || state === 'aborted' || state === 'error'
      if (!isTerminal && runIdInEvent && isRunFinalized(runIdInEvent)) {
        return
      }
      if (activeRunId && runIdInEvent && runIdInEvent !== activeRunId && !isTerminal) {
        return
      }
      if (state === 'delta') {
        // touchAgentStatus(agentId)
        if (agentStatus.phase !== 'replying') {
          setAgentStatusPhase(agentId, 'replying', {
            runId: activeRunId || runIdInEvent || null,
            detail: null,
            sessionKey: keyInEvent,
          })
        }
        return
      }
      if (state === 'final' || state === 'done') {
        if (runIdInEvent) markRunFinal(runIdInEvent)
        setAgentStatusPhase(agentId, 'done', { runId: null, detail: null })
        scheduleHistoryRefresh(100)
        return
      }
      if (state === 'aborted') {
        if (runIdInEvent) markRunFinal(runIdInEvent)
        setAgentStatusPhase(agentId, 'aborted', { runId: null, detail: null })
        scheduleHistoryRefresh(100)
        return
      }
      if (state === 'error') {
        if (runIdInEvent) markRunFinal(runIdInEvent)
        const errorMessage = asString(payloadRow?.errorMessage).trim() || null
        setAgentStatusPhase(agentId, 'error', { runId: null, detail: errorMessage })
        scheduleHistoryRefresh(100)
        return
      }
      return
    }

    if (normalizedEvent === 'agent' || normalizedEvent.startsWith('agent.')) {
      // 新版 gateway 统一用 event=agent，payload.stream=lifecycle|assistant|tool|compaction
      if (normalizedEvent === 'agent') {
        const stream = asString(payloadRow?.stream).trim().toLowerCase()
        const data = asRecord(payloadRow?.data) || {}
        if (runIdInEvent && isRunFinalized(runIdInEvent) && stream !== 'lifecycle') {
          return
        }
        if (stream === 'lifecycle') {
          const phase = asString(data.phase).trim().toLowerCase()
          if (phase === 'start') {
            const prevPhase = agentStatus.phase
            if (prevPhase === 'idle' || prevPhase === 'done' || prevPhase === 'aborted' || prevPhase === 'error') {
              resetAgentProgress(agentId)
            }
            if (agentStatus.phase !== 'thinking') {
              setAgentStatusPhase(agentId, 'thinking', { runId: runIdInEvent || activeRunId || null, detail: null })
            }
            return
          }
          if (phase === 'end') {
            if (runIdInEvent) markRunFinal(runIdInEvent)
            setAgentStatusPhase(agentId, 'done', { runId: null, detail: null })
            scheduleHistoryRefresh(100)
            return
          }
          if (phase === 'error') {
            if (runIdInEvent) markRunFinal(runIdInEvent)
            const errorText = asText(data.error).trim() || null
            setAgentStatusPhase(agentId, 'error', { runId: null, detail: errorText })
            scheduleHistoryRefresh(100)
            return
          }
        }

        if (stream === 'tool') {
          // touchAgentStatus(agentId)
          const toolName = asString(data.name || data.tool || data.toolName).trim()
          const toolCallId = asString(data.toolCallId || data.callId || data.id).trim()
          const toolPhase = asString(data.phase || data.state).trim().toLowerCase()

          if (toolName && toolCallId) {
            const now = Date.now()
            if (toolPhase === 'start') {
              toolProgress.value.set(agentId, {
                toolCallId,
                name: toolName,
                phase: 'start',
                meta: null,
                isError: null,
                argsPreview: toJsonPreview(data.args),
                partialPreview: null,
                resultPreview: null,
                startedAtMs: now,
                updatedAtMs: now,
              })
            } else if (toolPhase === 'update') {
              if (now - lastToolPreviewUpdateAtMs >= 120) {
                lastToolPreviewUpdateAtMs = now
                const partialPreview = toJsonPreview(data.partialResult)
                const prevProgress = getOrCreateToolProgress(agentId)
                toolProgress.value.set(agentId, {
                  toolCallId,
                  name: toolName,
                  phase: 'update',
                  meta: prevProgress?.meta || null,
                  isError: prevProgress?.isError ?? null,
                  argsPreview: prevProgress?.argsPreview || null,
                  partialPreview: partialPreview || prevProgress?.partialPreview || null,
                  resultPreview: null,
                  startedAtMs: prevProgress?.startedAtMs || now,
                  updatedAtMs: now,
                })
              }
            } else if (toolPhase === 'result') {
              const prevProgress = getOrCreateToolProgress(agentId)
              toolProgress.value.set(agentId, {
                toolCallId,
                name: toolName,
                phase: 'result',
                meta: asString(data.meta).trim() || prevProgress?.meta || null,
                isError: typeof data.isError === 'boolean' ? data.isError : prevProgress?.isError ?? null,
                argsPreview: prevProgress?.argsPreview || null,
                partialPreview: prevProgress?.partialPreview || null,
                resultPreview: toJsonPreview(data.result),
                startedAtMs: prevProgress?.startedAtMs || now,
                updatedAtMs: now,
              })
            }
          }

          if (toolPhase === 'start' || toolPhase === 'update') {
            if (agentStatus.phase !== 'tool' || agentStatus.detail !== (toolName || null)) {
              setAgentStatusPhase(agentId, 'tool', {
                runId: runIdInEvent || activeRunId || null,
                detail: toolName || null,
              })
            }
            return
          }
          if (toolPhase === 'result') {
            // 工具结束后通常会继续思考/生成；这里只做一次轻量状态回落
            if (agentStatus.phase === 'tool') {
              setAgentStatusPhase(agentId, 'thinking', { runId: runIdInEvent || activeRunId || null, detail: toolName ? toolCompletedDetail(toolName) : null })
            }
            return
          }
        }

        if (stream === 'compaction') {
          const phase = asString((data as Record<string, unknown>).phase).trim().toLowerCase()
          if (phase === 'start') {
            setAgentStatusPhase(agentId, 'thinking', { runId: runIdInEvent || activeRunId || null, detail: contextCompactionDetail() })
            return
          }
          if (phase === 'end') {
            if (agentStatus.phase === 'thinking' && isContextCompactionDetail(agentStatus.detail)) {
              setAgentStatusPhase(agentId, 'thinking', { runId: runIdInEvent || activeRunId || null, detail: null })
            }
            return
          }
        }

        if (stream === 'assistant') {
          // touchAgentStatus(agentId)
          // 提取消息内容
          const rawContent = asString(data.content || data.text || data.delta)
          const content = rawContent.replace(/\n{3,}/g, '\n\n').trim()
          const lastMessage = content || agentStatus.lastMessage
          
          if (agentStatus.phase !== 'replying' && agentStatus.phase !== 'tool') {
            // chat delta 可能因节流略晚于 agent assistant stream，这里做兜底提示
            setAgentStatusPhase(agentId, 'replying', { 
              runId: runIdInEvent || activeRunId || null, 
              detail: null,
              sessionKey: keyInEvent,
              lastMessage,
            })
          } else if (lastMessage && lastMessage !== agentStatus.lastMessage) {
            // 更新消息内容
            agentStatuses.value.set(agentId, {
              ...agentStatus,
              lastMessage,
              updatedAtMs: Date.now(),
            })
          }
          return
        }

        return
      }

      // 旧版/兼容事件名：agent.started / agent.thinking / agent.done
      if (normalizedEvent === 'agent.started') {
        setAgentStatusPhase(agentId, 'thinking', { runId: activeRunId || runIdInEvent || null, detail: null })
        return
      }
      if (normalizedEvent === 'agent.thinking') {
        setAgentStatusPhase(agentId, 'thinking', { runId: activeRunId || runIdInEvent || null, detail: null })
        return
      }
      if (normalizedEvent === 'agent.done') {
        setAgentStatusPhase(agentId, 'done', { runId: null, detail: null })
        scheduleHistoryRefresh(100)
        return
      }
    }

    if (normalizedEvent.startsWith('tool.')) {
      if (normalizedEvent === 'tool.call') {
        const data = asRecord(payloadRow?.payload ?? payloadRow) || {}
        const toolName = asString(data.name || data.tool || data.toolName).trim() || null
        setAgentStatusPhase(agentId, 'tool', { runId: activeRunId || runIdInEvent || null, detail: toolName })
        return
      }
      if (normalizedEvent === 'tool.result') {
        setAgentStatusPhase(agentId, 'thinking', { runId: activeRunId || runIdInEvent || null, detail: null })
        return
      }
      return
    }

    if (normalizedEvent.startsWith('model.')) {
      if (normalizedEvent === 'model.streaming') {
        if (agentStatus.phase !== 'replying') {
          setAgentStatusPhase(agentId, 'replying', { runId: activeRunId || runIdInEvent || null, detail: null })
        }
      }
    }
  }

  /**
   * Check if the current connection is a local Hermes REST API server
   * (as opposed to an ACP WebSocket gateway).
   */
  function isHermesRestMode(): boolean {
    const connectionStore = useConnectionStore()
    return connectionStore.serverType === 'hermes-rest'
  }

  /** Replace in-memory messages (used by hermes-chat store to load conversations) */
  function setMessages(msgs: ChatMessage[]) {
    messages.value = msgs
  }

  /** Clear all in-memory messages */
  function clearMessages() {
    messages.value = []
  }

  async function sendMessage(content: string, model?: string) {
    const text = content.trim()
    if (!text) return
    if (!sessionKey.value.trim()) {
      throw new Error(byLocale('请先填写会话 Key', 'Please enter the session key', getActiveLocale()))
    }

    // 从 sessionKey 中提取 agentId
    let agentId = 'default'
    const match = sessionKey.value.match(/^agent:([^:]+):/)
    if (match && match[1]) {
      agentId = match[1]
    }

    const idempotencyKey = `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    resetAgentProgress(agentId)
    setAgentStatusPhase(agentId, 'sending', { runId: idempotencyKey, detail: null })
    const localMessage: ChatMessage = {
      id: idempotencyKey,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    messages.value = capMessages([...messages.value, localMessage])

    sending.value = true
    lastError.value = null

    // ── Hermes REST API path (POST /v1/chat/completions with SSE streaming) ──
    if (isHermesRestMode() && window.api?.hermesChat) {
      const assistantMsgId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      // Stamp the placeholder with current fallback state so the
      // FallbackChip renders immediately on first-turn fallback (where
      // the store already knows we're in fallback before sendMessage).
      // See chat-fallback-stamp.ts for the pure stamping logic.
      const modelStore = useModelStore()
      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        ...initialFallbackStamp(modelStore.state),
      }
      messages.value = capMessages([...messages.value, assistantMessage])
      setAgentStatusPhase(agentId, 'replying', { runId: idempotencyKey, detail: null })

      // Watch for mid-stream fallback activation and retro-stamp the
      // in-flight assistant message. flush: 'sync' guarantees the mark
      // lands before the next SSE chunk handler observes the message.
      const stopFallbackWatch = watch(
        () => modelStore.state.kind,
        () => {
          const idx = messages.value.findIndex(m => m.id === assistantMsgId)
          if (idx < 0) return
          const stamped = applyFallbackStamp(messages.value[idx], modelStore.state)
          if (!stamped) return
          messages.value[idx] = stamped
          messages.value = [...messages.value] // trigger Vue reactivity
        },
        { flush: 'sync' },
      )

      // Build OpenAI-format messages from local history (exclude the empty assistant placeholder)
      const apiMessages = messages.value
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.id !== assistantMsgId && m.content)
        .map(m => ({ role: m.role, content: m.content }))

      // Listen for SSE chunks. Bug 2 safety net: if a fallback_activated
      // lifecycle event raced the chunk through a different IPC channel
      // and the sync watcher didn't retro-stamp in time (e.g. the
      // sendMessage scope had already torn down), stamp inline from the
      // current modelStore state on every content chunk. The
      // applyFallbackStamp helper is a no-op when the state isn't in
      // fallback or the message is already stamped.
      let lastChunkUsage: { inputTokens: number; outputTokens: number } | null = null
      const cleanupChunkListener = window.api.onHermesChatChunk((chunk) => {
        if (chunk.done) return
        const delta = chunk.data?.choices?.[0]?.delta
        if (delta?.content) {
          const idx = messages.value.findIndex(m => m.id === assistantMsgId)
          if (idx >= 0) {
            const existing = messages.value[idx]
            const stamped = applyFallbackStamp(existing, modelStore.state)
            const base = stamped ?? existing
            messages.value[idx] = { ...base, content: base.content + delta.content }
            messages.value = [...messages.value] // trigger Vue reactivity
          }
        }
        // Capture usage from the final chunk (finish_reason: "stop")
        const usage = extractUsageFromChunk(chunk.data)
        if (usage) lastChunkUsage = usage
      })

      try {
        const connectionStore = useConnectionStore()
        const hermesChatStore = useHermesChatStore()
        const baseUrl = connectionStore.currentServer?.url || 'http://localhost:8642'
        const result = await window.api.hermesChat(
          `${baseUrl}/v1/chat/completions`,
          JSON.stringify({
            model: model?.trim() || 'hermes-agent',
            messages: apiMessages,
            stream: true,
          }),
          connectionStore.hermesAuthToken || undefined,
          hermesChatStore.activeId || undefined,
        )

        if (!result.ok) {
          throw new Error(result.error || 'Chat request failed')
        }

        // Accumulate token usage into the conversation.
        // Note: TypeScript can't track assignments inside callbacks, so we
        // cast to escape the `never` narrowing on the closure-mutated variable.
        const finalUsage = lastChunkUsage as { inputTokens: number; outputTokens: number } | null
        if (finalUsage && hermesChatStore.activeId) {
          hermesChatStore.accumulateTokenUsage(
            hermesChatStore.activeId,
            finalUsage.inputTokens,
            finalUsage.outputTokens,
          )
        }

        setAgentStatusPhase(agentId, 'done', { runId: null, detail: null })
      } catch (error) {
        lastError.value = error instanceof Error ? error.message : String(error)
        // Remove both user and empty assistant messages on failure
        messages.value = messages.value.filter(
          (item) => item.id !== idempotencyKey && item.id !== assistantMsgId,
        )
        setAgentStatusPhase(agentId, 'error', { runId: null, detail: lastError.value })
        throw error
      } finally {
        stopFallbackWatch()
        cleanupChunkListener()
        sending.value = false
      }
      return
    }

    // ── Legacy ACP WebSocket path (for non-Hermes servers) ──
    try {
      await wsStore.rpc.sendChatMessage({
        sessionKey: sessionKey.value.trim(),
        message: text,
        model: model?.trim() || undefined,
        idempotencyKey,
      })
      const agentStatus = getOrCreateAgentStatus(agentId)
      if (agentStatus.phase === 'sending' && agentStatus.runId === idempotencyKey) {
        setAgentStatusPhase(agentId, 'waiting', { runId: idempotencyKey, detail: null })
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      messages.value = messages.value.filter((item) => item.id !== idempotencyKey)
      const agentStatus = getOrCreateAgentStatus(agentId)
      if (agentStatus.runId === idempotencyKey) {
        setAgentStatusPhase(agentId, 'error', { runId: null, detail: lastError.value })
      }
      throw error
    } finally {
      sending.value = false
    }
  }

  async function abortActiveRun() {
    if (!sessionKey.value.trim()) {
      throw new Error(byLocale('请先填写会话 Key', 'Please enter the session key', getActiveLocale()))
    }

    // 从 sessionKey 中提取 agentId
    let agentId = 'default'
    const match = sessionKey.value.match(/^agent:([^:]+):/)
    if (match && match[1]) {
      agentId = match[1]
    }

    const agentStatus = getOrCreateAgentStatus(agentId)
    const phase = agentStatus.phase
    if (phase === 'idle' || phase === 'done' || phase === 'aborted' || phase === 'error') {
      return
    }

    setAgentStatusPhase(agentId, 'aborting', { detail: byLocale('停止中...', 'Stopping...', getActiveLocale()) })
    try {
      if (isHermesRestMode()) {
        // Local Hermes REST mode — no WS abort RPC, just mark aborted locally
        setAgentStatusPhase(agentId, 'aborted', { detail: byLocale('已停止', 'Stopped', getActiveLocale()) })
        return
      }
      await wsStore.rpc.abortChat(undefined, sessionKey.value.trim())
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setAgentStatusPhase(agentId, 'error', { runId: null, detail: reason })
      throw error
    }
  }

  return {
    sessionKey,
    messages,
    loading,
    syncing,
    sending,
    lastError,
    lastSyncedAt,
    agentStatuses,
    agentSteps,
    toolProgress,
    getOrCreateAgentStatus,
    setSessionKey,
    fetchHistory,
    handleRealtimeEvent,
    handleAgentStatusEvent,
    clearTimers,
    setMessages,
    clearMessages,
    sendMessage,
    abortActiveRun,
  }
})
