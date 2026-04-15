/**
 * Payload factories for hermes.model.* lifecycle events.
 *
 * Used by composable and component unit tests so each spec can build
 * realistic payloads without re-typing the 10+ field schema. Every
 * factory accepts a `Partial<...>` override map.
 *
 * See docs/superpowers/plans/2026-04-14-hermes-desktop-fallback-visibility.md
 * Task F1.
 */
import type {
  FallbackActivatedPayload,
  PrimaryRestoredPayload,
  ChainExhaustedPayload,
} from '@/api/types'

export function makeFallbackActivatedPayload(
  overrides: Partial<FallbackActivatedPayload> = {},
): FallbackActivatedPayload {
  return {
    schema_version: 1,
    timestamp: '2026-04-14T10:00:00Z',
    from_model: 'gpt-5.4',
    to_model: 'gemini-2.5-pro',
    from_provider: 'openai',
    to_provider: 'google',
    reason_code: 'auth_failed',
    reason_text: '401 Unauthorized',
    fallback_chain: ['gpt-5.4', 'gemini-2.5-pro'],
    fallback_index: 1,
    ...overrides,
  }
}

export function makePrimaryRestoredPayload(
  overrides: Partial<PrimaryRestoredPayload> = {},
): PrimaryRestoredPayload {
  return {
    schema_version: 1,
    timestamp: '2026-04-14T10:05:00Z',
    restored_to: 'gpt-5.4',
    restored_from: 'gemini-2.5-pro',
    primary_model: 'gpt-5.4',
    ...overrides,
  }
}

export function makeChainExhaustedPayload(
  overrides: Partial<ChainExhaustedPayload> = {},
): ChainExhaustedPayload {
  return {
    schema_version: 1,
    timestamp: '2026-04-14T10:10:00Z',
    attempted_models: ['gpt-5.4', 'gemini-2.5-pro', 'claude-3.5-sonnet'],
    last_error_code: 'server_error',
    last_error_text: 'All models failed',
    fallback_chain: ['gpt-5.4', 'gemini-2.5-pro', 'claude-3.5-sonnet'],
    ...overrides,
  }
}

/**
 * Build a raw SSE frame string exactly as hermes-agent emits it.
 * Useful for integration tests that feed bytes into a parser.
 */
export function makeSSELines(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}
