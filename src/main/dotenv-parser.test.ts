/**
 * Tests for the pure .env parser used by the hermes:env-secrets IPC.
 *
 * Bug 5 (fallback-visibility post-merge):
 * connectLocal() assumed the local server has no API_SERVER_KEY and
 * set authStore.authEnabled = false, so subsequent chat and SSE
 * requests went without an Authorization header. When hermes-agent
 * is started with API_SERVER_KEY set in ~/.hermes/.env, every
 * renderer-originated HTTP call returns 401 and the UI silently
 * fails to stream.
 *
 * This parser is the main-process side of the fix: it reads the
 * dotenv file and returns just the value the renderer needs, so
 * connection.ts can set hermesAuthToken without having to read the
 * entire env file over IPC.
 */
import { describe, test, expect } from 'vitest'
import { extractApiServerKey } from './dotenv-parser'

describe('extractApiServerKey', () => {
  test('returns null for empty input', () => {
    expect(extractApiServerKey('')).toBe(null)
  })

  test('returns null when the key is absent', () => {
    expect(extractApiServerKey('FOO=bar\nBAZ=qux')).toBe(null)
  })

  test('extracts a plain value', () => {
    expect(extractApiServerKey('API_SERVER_KEY=secret123')).toBe('secret123')
  })

  test('extracts a value with double quotes', () => {
    expect(extractApiServerKey('API_SERVER_KEY="secret 123"')).toBe('secret 123')
  })

  test('extracts a value with single quotes', () => {
    expect(extractApiServerKey("API_SERVER_KEY='secret 123'")).toBe('secret 123')
  })

  test('ignores comment lines starting with #', () => {
    const content = '# comment about the key\nAPI_SERVER_KEY=real'
    expect(extractApiServerKey(content)).toBe('real')
  })

  test('ignores commented-out key entries', () => {
    const content = '# API_SERVER_KEY=old_fake_value\nOTHER=1'
    expect(extractApiServerKey(content)).toBe(null)
  })

  test('tolerates leading/trailing whitespace on the line', () => {
    const content = '   API_SERVER_KEY = spaced_secret  '
    expect(extractApiServerKey(content)).toBe('spaced_secret')
  })

  test('picks the first occurrence when duplicated', () => {
    const content = 'API_SERVER_KEY=first\nAPI_SERVER_KEY=second'
    expect(extractApiServerKey(content)).toBe('first')
  })

  test('handles Windows CRLF line endings', () => {
    const content = 'FOO=bar\r\nAPI_SERVER_KEY=crlf_secret\r\nBAZ=qux'
    expect(extractApiServerKey(content)).toBe('crlf_secret')
  })

  test('treats an empty value as null', () => {
    expect(extractApiServerKey('API_SERVER_KEY=')).toBe(null)
    expect(extractApiServerKey('API_SERVER_KEY=""')).toBe(null)
  })

  test('is an exact match (not prefix)', () => {
    // A key named API_SERVER_KEY_EXTRA must not match.
    expect(extractApiServerKey('API_SERVER_KEY_EXTRA=wrong')).toBe(null)
  })

  test('works inside a realistic .hermes/.env shape', () => {
    const content = `# Hermes environment file
OPENAI_API_KEY=sk-abc123
ANTHROPIC_API_KEY=sk-ant-xyz
GEMINI_API_KEY=gem-key
API_SERVER_KEY=hermes-desktop-token
LOG_LEVEL=INFO
`
    expect(extractApiServerKey(content)).toBe('hermes-desktop-token')
  })
})
