/**
 * Pure helpers used by chat.ts:sendMessage() to stamp in-flight
 * assistant messages with the current model-fallback metadata.
 *
 * History: the logic was previously inlined inside sendMessage, with
 * two risks:
 *   1. No unit coverage — the stamp ran only against a live
 *      Electron + Pinia + SSE loop, so regressions (Bug 2) were
 *      only caught during real-agent acceptance testing.
 *   2. The stamp conditions (fallback vs. stale, null currentModel,
 *      already-stamped) were duplicated between the placeholder
 *      creator and the retro-stamping watcher, making it easy for
 *      them to drift apart.
 *
 * By extracting:
 *   - `initialFallbackStamp(state)` — fields for a fresh placeholder
 *   - `applyFallbackStamp(existing, state)` — retro-stamp in place
 * we get a single source of truth for "what counts as fallback"
 * and a testable API. chat.ts imports both.
 *
 * See src/renderer/src/stores/chat-fallback-stamp.test.ts for the
 * full set of cases, including the Pinia reactivity mirror that
 * pins the watch-fires-synchronously assumption we depend on.
 */
import type { ChatMessage } from '@/api/types'
import type { ModelState } from './model'

type StampState = Pick<ModelState, 'kind' | 'currentModel' | 'fallbackFrom' | 'reasonText'>

export interface InitialFallbackStamp {
  model: string | undefined
  fromFallback: boolean
  fallbackFrom: string | undefined
  fallbackReasonText: string | undefined
}

/**
 * Return the fallback-related fields to copy onto a fresh assistant
 * placeholder message at creation time. Only the 'fallback' kind
 * yields fromFallback=true — 'stale' residue from a previous session
 * is explicitly ignored so new messages don't inherit noise.
 */
export function initialFallbackStamp(state: StampState): InitialFallbackStamp {
  return {
    model: state.currentModel ?? undefined,
    fromFallback: state.kind === 'fallback',
    fallbackFrom: state.kind === 'fallback' ? state.fallbackFrom ?? undefined : undefined,
    fallbackReasonText: state.kind === 'fallback' ? state.reasonText ?? undefined : undefined,
  }
}

/**
 * Produce a new message with fallback metadata applied from the
 * current model store state, or null when no update is warranted
 * (store not in fallback, or message already stamped). Callers
 * assign the returned message in place of the existing entry.
 *
 * Always returns a NEW object — never mutates `existing`.
 */
export function applyFallbackStamp(
  existing: ChatMessage,
  state: StampState,
): ChatMessage | null {
  if (state.kind !== 'fallback') return null
  if (existing.fromFallback) return null
  return {
    ...existing,
    fromFallback: true,
    model: state.currentModel ?? existing.model,
    fallbackFrom: state.fallbackFrom ?? undefined,
    fallbackReasonText: state.reasonText ?? undefined,
  }
}
