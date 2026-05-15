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
 *   # Provider-list form (current Hermes config):
 *   fallback_providers:
 *     - provider: gemini
 *       model: gemini-3-flash-preview
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
  /**
   * Full-form chain (primary first, then fallbacks) as `<provider>/<model>`
   * refs where provider can be determined. Falls back to the bare short
   * name when provider is unknown. Consumed by the chat `/model` picker
   * to surface real choices instead of an empty list.
   */
  fallback_chain_full: string[]
}

const EMPTY: HermesConfigSummary = {
  primary: null,
  fullModel: null,
  provider: null,
  fallback_chain: [],
  fallback_chain_full: []
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

function uniqueList(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)))
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

function extractAllFallbacks(obj: Record<string, unknown>): string[] {
  return uniqueList([
    ...extractFallbackList(obj.fallback_model),
    ...extractFallbackList(obj.fallback_providers),
    ...extractFallbackList(obj.fallback)
  ])
}

/**
 * Same as extractFallbackList but emits `<provider>/<model>` when each entry
 * carries its own provider (structured fallback_model), falling back to a
 * caller-supplied default provider or the bare short name.
 */
function extractFallbackListFull(node: unknown, defaultProvider: string | null): string[] {
  if (node == null) return []
  const items: unknown[] = Array.isArray(node) ? node : [node]
  const out: string[] = []
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      // Already qualified?
      if (item.includes('/')) out.push(item.trim())
      else if (defaultProvider) out.push(`${defaultProvider}/${item.trim()}`)
      else out.push(item.trim())
      continue
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      const model =
        (typeof obj.model === 'string' && obj.model.trim()) ||
        (typeof obj.default === 'string' && obj.default.trim()) ||
        ''
      if (!model) continue
      if (model.includes('/')) {
        out.push(model)
        continue
      }
      const prov =
        (typeof obj.provider === 'string' && obj.provider.trim()) || defaultProvider || ''
      out.push(prov ? `${prov}/${model}` : model)
    }
  }
  return out
}

function extractAllFallbacksFull(
  obj: Record<string, unknown>,
  defaultProvider: string | null
): string[] {
  return uniqueList([
    ...extractFallbackListFull(obj.fallback_model, defaultProvider),
    ...extractFallbackListFull(obj.fallback_providers, defaultProvider),
    ...extractFallbackListFull(obj.fallback, defaultProvider)
  ])
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

  const fallbacks = extractAllFallbacks(obj)
  const fallback_chain = primary ? uniqueList([primary, ...fallbacks]) : fallbacks

  // Full-form chain for the /model picker in the renderer.
  // Primary: use fullModel if already qualified, else build `<provider>/<primary>`.
  const primaryFull =
    fullModel && fullModel.includes('/')
      ? fullModel
      : primary && provider
        ? `${provider}/${primary}`
        : primary
  const fallbackFull = extractAllFallbacksFull(obj, provider)
  const fallback_chain_full: string[] = []
  if (primaryFull) fallback_chain_full.push(primaryFull)
  for (const f of fallbackFull) if (!fallback_chain_full.includes(f)) fallback_chain_full.push(f)

  return { primary, fullModel, provider, fallback_chain, fallback_chain_full }
}
