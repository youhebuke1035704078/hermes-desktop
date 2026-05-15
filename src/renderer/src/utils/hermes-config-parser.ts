import * as yaml from 'js-yaml'

export interface HermesConfigSummary {
  primary: string | null
  fallback_chain: string[]
}

function shortName(full: string): string {
  return full.includes('/') ? full.split('/').pop() || full : full
}

function extractModel(node: unknown): string | null {
  if (typeof node === 'string') return shortName(node)
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.default === 'string') return shortName(obj.default)
    if (typeof obj.model === 'string') return shortName(obj.model)
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
      .filter((model): model is string => typeof model === 'string' && model.length > 0)
  }
  const single = extractModel(node)
  return single ? [single] : []
}

export function parseHermesConfigSummary(raw: string): HermesConfigSummary {
  let parsed: unknown
  try {
    parsed = yaml.load(raw)
  } catch {
    return { primary: null, fallback_chain: [] }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { primary: null, fallback_chain: [] }
  }

  const obj = parsed as Record<string, unknown>
  const primary = extractModel(obj.model)
  const fallbacks = uniqueList([
    ...extractFallbackList(obj.fallback_model),
    ...extractFallbackList(obj.fallback_providers),
    ...extractFallbackList(obj.fallback)
  ])
  const fallback_chain = primary ? uniqueList([primary, ...fallbacks]) : fallbacks
  return { primary, fallback_chain }
}
