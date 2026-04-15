/**
 * Pure parser for ~/.hermes/config.yaml.
 *
 * Extracts the primary model and fallback chain so the renderer can
 * display the model-state badge with accurate data. Tolerates multiple
 * real-world shapes:
 *
 *   # Structured (current format):
 *   model:
 *     default: openai-codex/gpt-5.4
 *     provider: openai-codex
 *   fallback_model:
 *     provider: gemini
 *     model: gemini-2.5-pro
 *
 *   # Plain-string:
 *   model: openai-codex/gpt-5.4
 *   fallback_model: google/gemini-2.5-pro
 *
 *   # List form:
 *   fallback_model:
 *     - gemini-2.5-pro
 *     - claude-3.5-sonnet
 *
 * Short names are extracted by taking the segment after the last `/`.
 *
 * See docs/superpowers/plans/2026-04-14-hermes-desktop-fallback-visibility.md
 * Task E2.
 */
import * as yaml from 'js-yaml'

export interface HermesConfigSummary {
  /** Short primary model name, e.g. "gpt-5.4". Null if not resolvable. */
  primary: string | null
  /** Full primary identifier, e.g. "openai-codex/gpt-5.4". */
  fullModel: string | null
  /** Primary provider, e.g. "openai-codex". */
  provider: string | null
  /**
   * Full chain (primary first, then fallbacks), using short names.
   * Empty array if nothing resolvable.
   */
  fallback_chain: string[]
}

const EMPTY: HermesConfigSummary = {
  primary: null,
  fullModel: null,
  provider: null,
  fallback_chain: [],
}

function shortName(full: string): string {
  return full.includes('/') ? full.split('/').pop() || full : full
}

/** Pull a model short-name out of anything the config may legally hold. */
function extractModel(node: unknown): string | null {
  if (typeof node === 'string') return shortName(node)
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    // Structured primary: { default, provider }
    if (typeof obj.default === 'string') return shortName(obj.default)
    // Structured fallback: { provider, model }
    if (typeof obj.model === 'string') return shortName(obj.model)
  }
  return null
}

function extractFullModel(node: unknown): string | null {
  if (typeof node === 'string') return node
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.default === 'string') return obj.default
    if (typeof obj.model === 'string') return obj.model
  }
  return null
}

function extractProvider(node: unknown): string | null {
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.provider === 'string') return obj.provider
  }
  return null
}

function extractFallbackList(node: unknown): string[] {
  if (node == null) return []
  if (Array.isArray(node)) {
    return node
      .map((item) => extractModel(item))
      .filter((m): m is string => typeof m === 'string' && m.length > 0)
  }
  const single = extractModel(node)
  return single ? [single] : []
}

export function parseHermesConfig(raw: string): HermesConfigSummary {
  let parsed: unknown
  try {
    parsed = yaml.load(raw)
  } catch {
    return { ...EMPTY }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ...EMPTY }
  }
  const obj = parsed as Record<string, unknown>

  const primary = extractModel(obj.model)
  const fullModel = extractFullModel(obj.model)
  const provider = extractProvider(obj.model)

  const fallbacks = extractFallbackList(obj.fallback_model)
  const fallback_chain = primary ? [primary, ...fallbacks] : fallbacks

  return { primary, fullModel, provider, fallback_chain }
}
