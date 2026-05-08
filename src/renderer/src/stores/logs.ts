import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import { useConnectionStore } from './connection'
import { hermesRestGet } from '@/api/hermes-rest-client'
import type { LogEntry, LogLevel, LogsTailResult } from '@/api/types'

/** Cap raw line buffer to prevent unbounded memory growth */
const MAX_BUFFER_LINES = 5000
/** Default number of lines to fetch per poll */
const DEFAULT_LIMIT = 500
/** Default max bytes per poll (256 KiB) */
const DEFAULT_MAX_BYTES = 256 * 1024

function normalizeLogLevel(level: unknown): LogLevel | null {
  if (typeof level !== 'string') return null
  const value = level.toLowerCase()
  if (value === 'warning') return 'warn'
  const validLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
  return validLevels.includes(value as LogLevel) ? (value as LogLevel) : null
}

/** Parse a raw log line into a structured entry (best-effort) */
export function parseLogLine(raw: string): LogEntry {
  const trimmed = raw.trim()
  if (!trimmed) return { raw }

  // Try JSON first (Hermes emits JSONL logs by default)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed)
      if (obj && typeof obj === 'object') {
        const level = normalizeLogLevel(obj.level)
        return {
          raw,
          time: typeof obj.time === 'string' ? obj.time : typeof obj.ts === 'string' ? obj.ts : null,
          level,
          subsystem: typeof obj.subsystem === 'string' ? obj.subsystem : typeof obj.component === 'string' ? obj.component : null,
          message: typeof obj.msg === 'string' ? obj.msg : typeof obj.message === 'string' ? obj.message : null,
          meta: obj,
        }
      }
    } catch {
      // fall through to plain parsing
    }
  }

  // Python logging default: "2026-05-08 18:08:44,075 INFO gateway.run: message"
  const pythonMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:[,.]\d{3,6})?)\s+([A-Za-z]+)\s+([^:]+):\s?(.*)$/)
  if (pythonMatch) {
    const [, time, levelRaw, subsystem, message] = pythonMatch
    return {
      raw,
      time,
      level: normalizeLogLevel(levelRaw),
      subsystem: subsystem.trim(),
      message,
    }
  }

  // Plain text: try to extract ISO timestamp + level prefix
  const plainMatch = trimmed.match(/^(\S+)\s+\[?([A-Za-z]+)\]?\s+(.*)$/)
  if (plainMatch) {
    const [, time, levelRaw, message] = plainMatch
    const level = normalizeLogLevel(levelRaw)
    if (level) {
      return { raw, time, level, message }
    }
  }

  return { raw, message: trimmed }
}

export const useLogsStore = defineStore('logs', () => {
  const entries = ref<LogEntry[]>([])
  const cursor = ref<number>(0)
  const fileName = ref<string>('')
  const fileSize = ref<number>(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const autoRefresh = ref(false)
  const refreshIntervalMs = ref(3000)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  // ── Filters (UI state) ──
  const levelFilter = ref<LogLevel | null>(null)
  const subsystemFilter = ref<string | null>(null)
  const searchQuery = ref('')

  const availableSubsystems = computed(() => {
    const set = new Set<string>()
    for (const e of entries.value) {
      if (e.subsystem) set.add(e.subsystem)
    }
    return [...set].sort()
  })

  const filteredEntries = computed(() => {
    let list = entries.value
    if (levelFilter.value) {
      list = list.filter((e) => e.level === levelFilter.value)
    }
    if (subsystemFilter.value) {
      list = list.filter((e) => e.subsystem === subsystemFilter.value)
    }
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      list = list.filter((e) => e.raw.toLowerCase().includes(q))
    }
    return list
  })

  const counts = computed(() => {
    const c = { total: entries.value.length, error: 0, warn: 0, info: 0 }
    for (const e of entries.value) {
      if (e.level === 'error' || e.level === 'fatal') c.error++
      else if (e.level === 'warn') c.warn++
      else if (e.level === 'info') c.info++
    }
    return c
  })

  async function fetchOnce(reset = false): Promise<void> {
    const wsStore = useWebSocketStore()
    const connectionStore = useConnectionStore()
    loading.value = true
    error.value = null
    try {
      const params = reset
        ? { limit: DEFAULT_LIMIT, maxBytes: DEFAULT_MAX_BYTES }
        : { cursor: cursor.value, limit: DEFAULT_LIMIT, maxBytes: DEFAULT_MAX_BYTES }

      const result = connectionStore.serverType === 'hermes-rest'
        ? await hermesRestGet<LogsTailResult>('/v1/hermes/logs', params)
        : await wsStore.rpc.tailLogs(params)

      // If server indicates log file was reset (rotated), clear buffer
      if (result.reset || reset) {
        entries.value = []
      }

      const newEntries = result.lines
        .map((line) => parseLogLine(line))
        .filter((e) => e.raw.trim().length > 0)

      // Append new entries, capped at MAX_BUFFER_LINES
      entries.value = [...entries.value, ...newEntries].slice(-MAX_BUFFER_LINES)
      cursor.value = result.cursor
      fileName.value = result.file || ''
      fileSize.value = result.size || 0
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function startAutoRefresh(): void {
    if (pollTimer) return
    autoRefresh.value = true
    pollTimer = setInterval(() => {
      fetchOnce().catch(() => {})
    }, refreshIntervalMs.value)
  }

  function stopAutoRefresh(): void {
    autoRefresh.value = false
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function toggleAutoRefresh(): void {
    if (autoRefresh.value) stopAutoRefresh()
    else startAutoRefresh()
  }

  function clearBuffer(): void {
    entries.value = []
  }

  function $dispose(): void {
    stopAutoRefresh()
  }

  return {
    entries, cursor, fileName, fileSize, loading, error,
    autoRefresh, refreshIntervalMs,
    levelFilter, subsystemFilter, searchQuery,
    availableSubsystems, filteredEntries, counts,
    fetchOnce, startAutoRefresh, stopAutoRefresh, toggleAutoRefresh,
    clearBuffer, $dispose,
  }
})
