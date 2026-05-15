import { describe, expect, it } from 'vitest'
import { parseHermesConfigSummary } from './hermes-config-parser'

describe('parseHermesConfigSummary', () => {
  it('extracts primary and fallback_providers for the header fallback pill', () => {
    const result = parseHermesConfigSummary(`
model:
  default: gpt-5.4
  provider: openai-codex
fallback_providers:
  - provider: gemini
    model: gemini-3-flash-preview
`)

    expect(result.primary).toBe('gpt-5.4')
    expect(result.fallback_chain).toEqual(['gpt-5.4', 'gemini-3-flash-preview'])
  })

  it('deduplicates fallback entries', () => {
    const result = parseHermesConfigSummary(`
model:
  default: openai-codex/gpt-5.4
fallback_model: gemini-3-flash-preview
fallback_providers:
  - provider: gemini
    model: gemini-3-flash-preview
`)

    expect(result.fallback_chain).toEqual(['gpt-5.4', 'gemini-3-flash-preview'])
  })
})
