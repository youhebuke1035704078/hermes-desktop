import type { HealthChannelSummary } from '@/api/types'

/**
 * Tri-state channel link result:
 *   - 'linked'   — we have a positive signal that the channel is linked
 *   - 'unlinked' — we have an explicit negative signal (linked === false)
 *   - 'unknown'  — the field is simply missing / undefined
 *
 * The `unknown` state is important: webhook-only channels (e.g. a feishu
 * plugin that only uses incoming webhooks) often don't report a `linked`
 * field at all, and some gateway versions omit the field for configured
 * channels. Treating `unknown` as `unlinked` produces false-positive alerts,
 * so callers that raise alerts should only react to the explicit 'unlinked'
 * state.
 */
export type ChannelLinkState = 'linked' | 'unlinked' | 'unknown'

export function getChannelLinkState(ch: HealthChannelSummary): ChannelLinkState {
  // Explicit top-level positive signal
  if (ch.linked === true) return 'linked'

  // Multi-account aggregation (e.g. feishu with multiple webhook accounts).
  // Any explicit `linked === true` in any account wins.
  const accounts = ch.accounts
  if (accounts && Object.keys(accounts).length > 0) {
    const states = Object.values(accounts).map((acc) => acc?.linked)
    if (states.some((s) => s === true)) return 'linked'
    if (states.length > 0 && states.every((s) => s === false)) return 'unlinked'
    // At least one account has linked === undefined — can't say for sure.
    // Respect an explicit top-level 'false' if present, else unknown.
    if (ch.linked === false) return 'unlinked'
    return 'unknown'
  }

  // No accounts array at all. Respect explicit top-level linked === false,
  // otherwise the field is simply missing — don't pretend it's unlinked.
  if (ch.linked === false) return 'unlinked'
  return 'unknown'
}

/**
 * Returns true when the channel is positively known to be linked.
 * Use this for UI classification ("running" vs "configured") where we
 * want to be conservative — only show the "running" state when we have
 * affirmative evidence.
 *
 * Note: `unknown` maps to `false` here, so callers that want to avoid
 * false-positive alerts should use `isChannelExplicitlyUnlinked()` instead.
 */
export function isChannelLinked(ch: HealthChannelSummary): boolean {
  return getChannelLinkState(ch) === 'linked'
}

/**
 * Returns true ONLY when the channel has an explicit "unlinked" signal.
 * Use this when raising alerts — we don't want to alert on `unknown`
 * states because many channels (webhook-only, custom plugins, older
 * gateway versions) don't report a `linked` field at all.
 */
export function isChannelExplicitlyUnlinked(ch: HealthChannelSummary): boolean {
  return getChannelLinkState(ch) === 'unlinked'
}
