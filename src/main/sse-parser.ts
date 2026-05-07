/**
 * Pure SSE line parser. Tracks the last-seen `event:` name across lines
 * so that subsequent `data:` lines can be associated with it.
 *
 * Usage:
 *   const state = makeInitialSseParserState()
 *   for (const line of lines) {
 *     const parsed = parseSseLine(line, state)
 *     if (parsed.kind === 'data') { ... }
 *   }
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.4
 * and Task E1 of the implementation plan.
 */

export interface SseParserState {
  lastEventName: string | null
  pendingEventName: string | null
  pendingDataLines: string[]
}

export type ParsedSseLine =
  | { kind: 'data'; event: string | null; data: string }
  | { kind: 'event'; name: string }
  | { kind: 'empty' }
  | { kind: 'skip' }

export function makeInitialSseParserState(): SseParserState {
  return { lastEventName: null, pendingEventName: null, pendingDataLines: [] }
}

export function parseSseLine(line: string, state: SseParserState): ParsedSseLine {
  if (line.startsWith('event:')) {
    const name = line.slice('event:'.length).trim()
    state.lastEventName = name
    return { kind: 'event', name }
  }
  if (line.startsWith('data:')) {
    const data = line.slice('data:'.length).trim()
    return { kind: 'data', event: state.lastEventName, data }
  }
  if (line.trim() === '') {
    state.lastEventName = null
    return { kind: 'empty' }
  }
  // Comment lines (start with ':'), id:, retry:, unknown fields
  return { kind: 'skip' }
}

function resetPendingEvent(state: SseParserState): void {
  state.pendingEventName = null
  state.pendingDataLines = []
}

function dataFieldValue(line: string): string {
  const raw = line.slice('data:'.length)
  return raw.startsWith(' ') ? raw.slice(1) : raw
}

/**
 * Standards-compliant SSE event parser. Unlike parseSseLine, this buffers
 * multiple data: lines until the blank dispatch line and joins them with "\n".
 */
export function parseSseEventLine(line: string, state: SseParserState): ParsedSseLine {
  if (line.startsWith('event:')) {
    const name = line.slice('event:'.length).trim()
    state.lastEventName = name
    state.pendingEventName = name
    return { kind: 'event', name }
  }
  if (line.startsWith('data:')) {
    if (state.pendingEventName === null) {
      state.pendingEventName = state.lastEventName
    }
    state.pendingDataLines.push(dataFieldValue(line))
    return { kind: 'skip' }
  }
  if (line.trim() === '') {
    if (state.pendingDataLines.length > 0) {
      const event = state.pendingEventName
      const data = state.pendingDataLines.join('\n')
      resetPendingEvent(state)
      state.lastEventName = null
      return { kind: 'data', event, data }
    }
    state.lastEventName = null
    resetPendingEvent(state)
    return { kind: 'empty' }
  }
  return { kind: 'skip' }
}

export function flushSseEvent(state: SseParserState): ParsedSseLine | null {
  if (state.pendingDataLines.length === 0) return null
  const event = state.pendingEventName
  const data = state.pendingDataLines.join('\n')
  resetPendingEvent(state)
  state.lastEventName = null
  return { kind: 'data', event, data }
}
