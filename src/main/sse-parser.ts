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
}

export type ParsedSseLine =
  | { kind: 'data'; event: string | null; data: string }
  | { kind: 'event'; name: string }
  | { kind: 'empty' }
  | { kind: 'skip' }

export function makeInitialSseParserState(): SseParserState {
  return { lastEventName: null }
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
