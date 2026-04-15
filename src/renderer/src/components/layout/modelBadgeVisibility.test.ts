import { describe, test, expect } from 'vitest'
import { shouldShowModelBadge } from './modelBadgeVisibility'
import type { ModelState } from '@/stores/model'

/**
 * Regression tests for Bug 4 (fallback-visibility post-merge):
 * the AppHeader used `v-if="connectionStore.status === 'connected'"`
 * which unmounted the badge entirely during disconnect. Plan §I1
 * scenario 4 requires the last-known fallback state to remain visible
 * with a stale indicator when the agent goes away, which can only
 * happen if the badge stays mounted.
 */
describe('shouldShowModelBadge', () => {
  function state(kind: ModelState['kind']): ModelState {
    return {
      kind,
      primaryModel: null,
      currentModel: null,
      fallbackChain: [],
      fallbackFrom: null,
      reasonCode: null,
      reasonText: null,
      switchedAt: null,
      attemptedModels: [],
    }
  }

  test('hides badge when the store has never been bootstrapped', () => {
    // Before first successful connection: no data to show.
    expect(shouldShowModelBadge('disconnected', state('unknown'))).toBe(false)
    expect(shouldShowModelBadge('connecting', state('unknown'))).toBe(false)
    expect(shouldShowModelBadge('error', state('unknown'))).toBe(false)
  })

  test('shows badge whenever connected, regardless of model kind', () => {
    expect(shouldShowModelBadge('connected', state('normal'))).toBe(true)
    expect(shouldShowModelBadge('connected', state('fallback'))).toBe(true)
    expect(shouldShowModelBadge('connected', state('exhausted'))).toBe(true)
  })

  test('keeps stale badge mounted during disconnect (regression: Bug 4)', () => {
    // markStale() runs on disconnect, preserving last-known
    // currentModel/fallbackFrom. The badge must stay mounted so the
    // user can see "(stale)" in the tooltip.
    expect(shouldShowModelBadge('disconnected', state('stale'))).toBe(true)
    expect(shouldShowModelBadge('connecting', state('stale'))).toBe(true)
  })

  test('shows badge mid-reconnect if previous session left non-unknown state', () => {
    // Brief window where status=connecting but state still holds the
    // previous bootstrapped values. Keep the badge visible.
    expect(shouldShowModelBadge('connecting', state('normal'))).toBe(true)
    expect(shouldShowModelBadge('connecting', state('fallback'))).toBe(true)
  })
})
