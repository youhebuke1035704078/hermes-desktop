/**
 * Unit tests for parseHermesConfig — the pure YAML extractor for
 * ~/.hermes/config.yaml.
 *
 * See docs/superpowers/plans/2026-04-14-hermes-desktop-fallback-visibility.md
 * Task E2 (deviation: the plan inlines parsing in the IPC handler; we
 * extract it for TDD-testability).
 */
import { describe, it, expect } from 'vitest'
import { parseHermesConfig } from './config-parser'

describe('parseHermesConfig', () => {
  it('extracts model.default + fallback_model.model from real-world format', () => {
    const raw = `
model:
  default: openai-codex/gpt-5.4
  provider: openai-codex
fallback_model:
  provider: gemini
  model: gemini-2.5-pro
`
    const result = parseHermesConfig(raw)
    expect(result.primary).toBe('gpt-5.4')
    expect(result.fullModel).toBe('openai-codex/gpt-5.4')
    expect(result.provider).toBe('openai-codex')
    expect(result.fallback_chain).toEqual(['gpt-5.4', 'gemini-2.5-pro'])
  })

  it('handles plain-string model field (legacy format)', () => {
    const raw = `
model: openai-codex/gpt-5.4
fallback_model: google/gemini-2.5-pro
`
    const result = parseHermesConfig(raw)
    expect(result.primary).toBe('gpt-5.4')
    expect(result.fullModel).toBe('openai-codex/gpt-5.4')
    expect(result.fallback_chain).toEqual(['gpt-5.4', 'gemini-2.5-pro'])
  })

  it('handles list-form fallback_model', () => {
    const raw = `
model:
  default: gpt-5.4
fallback_model:
  - gemini-2.5-pro
  - claude-3.5-sonnet
`
    const result = parseHermesConfig(raw)
    expect(result.primary).toBe('gpt-5.4')
    expect(result.fallback_chain).toEqual(['gpt-5.4', 'gemini-2.5-pro', 'claude-3.5-sonnet'])
  })

  it('handles list of structured objects for fallback_model', () => {
    const raw = `
model:
  default: gpt-5.4
fallback_model:
  - provider: gemini
    model: gemini-2.5-pro
  - provider: anthropic
    model: claude-3.5-sonnet
`
    const result = parseHermesConfig(raw)
    expect(result.fallback_chain).toEqual(['gpt-5.4', 'gemini-2.5-pro', 'claude-3.5-sonnet'])
  })

  it('handles fallback_providers from current Hermes config', () => {
    const raw = `
model:
  default: gpt-5.4
  provider: openai-codex
fallback_providers:
  - provider: gemini
    model: gemini-3-flash-preview
`
    const result = parseHermesConfig(raw)
    expect(result.fallback_chain).toEqual(['gpt-5.4', 'gemini-3-flash-preview'])
    expect(result.fallback_chain_full).toEqual([
      'openai-codex/gpt-5.4',
      'gemini/gemini-3-flash-preview'
    ])
  })

  it('returns empty fallback_chain when only primary is present', () => {
    const raw = `
model:
  default: gpt-5.4
`
    const result = parseHermesConfig(raw)
    expect(result.primary).toBe('gpt-5.4')
    expect(result.fallback_chain).toEqual(['gpt-5.4'])
  })

  it('returns nulls and empty chain when both fields missing', () => {
    const result = parseHermesConfig('other: value\n')
    expect(result.primary).toBe(null)
    expect(result.fullModel).toBe(null)
    expect(result.provider).toBe(null)
    expect(result.fallback_chain).toEqual([])
  })

  it('returns safe fallback on malformed YAML', () => {
    const result = parseHermesConfig('{{{not yaml')
    expect(result.primary).toBe(null)
    expect(result.fallback_chain).toEqual([])
  })
})
