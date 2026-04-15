/**
 * Model lifecycle store.
 *
 * Tracks the effective model, primary model, fallback chain, and the
 * most recent lifecycle event ingest state.  Consumed by:
 *   - the ModelStateBadge / ModelDropdown in the app header
 *   - the FallbackChip on assistant messages produced while in fallback
 *   - the NotificationLayer (transient toasts on transitions)
 *
 * See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §4.2
 *
 * Legacy compatibility: the previous stub exposed `models: ModelInfo[]`
 * and a no-op `fetchModels()`.  SessionsPage.vue still imports them for
 * its batch-model selector.  We preserve those fields unchanged so the
 * rewrite is drop-in; the selector has always been empty against the
 * stub and still is.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  FallbackActivatedPayload,
  PrimaryRestoredPayload,
  ChainExhaustedPayload,
  ModelInfo,
} from '@/api/types'

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export type ModelStateKind = 'unknown' | 'normal' | 'fallback' | 'exhausted' | 'stale'

export interface ModelState {
  kind: ModelStateKind
  primaryModel: string | null
  currentModel: string | null
  fallbackChain: string[]
  fallbackFrom: string | null
  reasonCode: string | null
  reasonText: string | null
  switchedAt: string | null
  attemptedModels: string[]
}

const INITIAL_STATE: ModelState = {
  kind: 'unknown',
  primaryModel: null,
  currentModel: null,
  fallbackChain: [],
  fallbackFrom: null,
  reasonCode: null,
  reasonText: null,
  switchedAt: null,
  attemptedModels: [],
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Normalize a model identifier that may include a provider prefix
 * (e.g. "openrouter/anthropic/claude-3.5-sonnet") down to the short
 * name config-parser emits for the fallback chain ("claude-3.5-sonnet").
 *
 * Bug 3 fix: hermes-agent's chain_exhausted event emits attempted_models
 * with the full provider path intact while the bootstrapped fallbackChain
 * uses short names. ModelDropdown.vue compares them via
 * `attemptedModels.includes(model)`, which never matched and left the
 * is-failed line-through styling un-applied in acceptance scenario 3.
 * Normalizing on ingest keeps downstream consumers doing plain equality.
 */
function toShortName(full: string): string {
  if (!full.includes('/')) return full
  const last = full.split('/').pop()
  return last && last.length > 0 ? last : full
}

// ---------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------

export const useModelStore = defineStore('model', () => {
  const state = ref<ModelState>({ ...INITIAL_STATE })

  // Legacy fields — consumed by SessionsPage's batch-model selector.
  // Preserved unchanged during the D2 rewrite; the stub was always a no-op.
  const models = ref<ModelInfo[]>([])

  async function fetchModels(): Promise<void> {
    // no-op stub (matches pre-D2 behaviour)
  }

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------

  const isNormal = computed(() => state.value.kind === 'normal')
  const isFallback = computed(() => state.value.kind === 'fallback')
  const isExhausted = computed(() => state.value.kind === 'exhausted')
  const isStale = computed(() => state.value.kind === 'stale')
  const displayModel = computed(
    () => state.value.currentModel ?? state.value.primaryModel ?? 'unknown',
  )

  // ------------------------------------------------------------------
  // Ingest actions
  // ------------------------------------------------------------------

  /**
   * Initialize the store with the primary model and fallback chain
   * resolved from backend config.  Moves kind from 'unknown' → 'normal'
   * when a primary is present; stays 'unknown' if none.
   */
  function bootstrap(params: { primary: string | null; fallbackChain: string[] }): void {
    state.value = {
      ...INITIAL_STATE,
      kind: params.primary ? 'normal' : 'unknown',
      primaryModel: params.primary,
      currentModel: params.primary,
      fallbackChain: params.fallbackChain,
    }
  }

  /**
   * Ingest a hermes.model.fallback_activated event.  Transitions to
   * 'fallback' kind regardless of the prior kind (normal → fallback,
   * fallback → fallback advancing the chain, unknown → fallback).
   * primaryModel is left untouched so we can restore it later.
   */
  function applyFallbackActivated(p: FallbackActivatedPayload): void {
    state.value = {
      ...state.value,
      kind: 'fallback',
      currentModel: p.to_model,
      fallbackFrom: p.from_model,
      reasonCode: p.reason_code,
      reasonText: p.reason_text,
      switchedAt: p.timestamp,
    }
  }

  /**
   * Ingest a hermes.model.primary_restored event.  Transitions back
   * to 'normal' kind and clears the fallback reason fields.
   */
  function applyPrimaryRestored(p: PrimaryRestoredPayload): void {
    state.value = {
      ...state.value,
      kind: 'normal',
      currentModel: p.restored_to,
      fallbackFrom: null,
      reasonCode: null,
      reasonText: null,
      switchedAt: p.timestamp,
    }
  }

  /**
   * Ingest a hermes.model.chain_exhausted event.  Transitions to
   * 'exhausted' kind (terminal for the current run).  currentModel
   * is cleared because no model is effective.
   */
  function applyChainExhausted(p: ChainExhaustedPayload): void {
    state.value = {
      ...state.value,
      kind: 'exhausted',
      currentModel: null,
      // Bug 3: normalize provider-prefixed names to the short form the
      // fallbackChain uses, so ModelDropdown's `includes()` check marks
      // every attempted model as failed.
      attemptedModels: p.attempted_models.map(toShortName),
      reasonCode: p.last_error_code,
      reasonText: p.last_error_text,
      switchedAt: p.timestamp,
    }
  }

  /**
   * Mark the current state as stale (e.g. WebSocket disconnected,
   * backend restarted).  Preserves display data so the UI can still
   * show last-known values with a "stale" indicator.  No-op when the
   * store has never been bootstrapped.
   */
  function markStale(): void {
    if (state.value.kind === 'unknown') return
    state.value = { ...state.value, kind: 'stale' }
  }

  /**
   * Reset to the initial unknown state.  Used on logout / server swap.
   */
  function reset(): void {
    state.value = { ...INITIAL_STATE }
  }

  return {
    state,
    // legacy
    models,
    fetchModels,
    // derived
    isNormal,
    isFallback,
    isExhausted,
    isStale,
    displayModel,
    // ingest
    bootstrap,
    applyFallbackActivated,
    applyPrimaryRestored,
    applyChainExhausted,
    markStale,
    reset,
  }
})
