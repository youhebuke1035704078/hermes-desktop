/**
 * Pure visibility predicate for the header ModelStateBadge.
 *
 * History: Bug 4 of the fallback-visibility post-merge acceptance
 * pass — the AppHeader originally gated the badge on
 * `connectionStore.status === 'connected'`, which unmounted the
 * entire component on disconnect and hid the stale model name plan
 * §I1 scenario 4 explicitly required to stay visible. This helper
 * keeps the badge visible whenever we have any bootstrapped state,
 * and hides it only in the true "no data yet" case (kind === 'unknown').
 */
import type { ModelState } from '@/stores/model'

export type ConnectionStatusValue =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

export function shouldShowModelBadge(
  connectionStatus: ConnectionStatusValue,
  modelState: Pick<ModelState, 'kind'>,
): boolean {
  if (connectionStatus === 'connected') return true
  // Keep last-known data visible during disconnect / reconnect /
  // transient errors. The store's `kind` only returns to 'unknown'
  // after a full reset, which is what we actually want to hide on.
  return modelState.kind !== 'unknown'
}
