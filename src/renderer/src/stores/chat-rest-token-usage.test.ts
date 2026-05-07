import { describe, it, expect } from 'vitest'
import {
  extractAssistantContentFromChunk,
  extractErrorMessageFromChunk,
  extractUsageFromChunk,
  reconcileFinalAssistantContent,
} from './chat'

describe('extractUsageFromChunk', () => {
  it('returns null for content delta chunk (no usage)', () => {
    const chunk = {
      choices: [{ index: 0, delta: { content: 'hello' } }],
    }
    expect(extractUsageFromChunk(chunk)).toBeNull()
  })

  it('extracts usage from finish chunk with usage field', () => {
    const chunk = {
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 150, completion_tokens: 250, total_tokens: 400 },
    }
    expect(extractUsageFromChunk(chunk)).toEqual({
      inputTokens: 150,
      outputTokens: 250,
    })
  })

  it('returns null for finish chunk without usage field', () => {
    const chunk = {
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    }
    expect(extractUsageFromChunk(chunk)).toBeNull()
  })

  it('handles missing or malformed usage gracefully', () => {
    expect(extractUsageFromChunk(null)).toBeNull()
    expect(extractUsageFromChunk(undefined)).toBeNull()
    expect(extractUsageFromChunk({})).toBeNull()
    expect(extractUsageFromChunk({ usage: 'bad' })).toBeNull()
    expect(extractUsageFromChunk({ usage: { prompt_tokens: 'nan' } })).toBeNull()
  })

  it('treats missing token fields as zero', () => {
    const chunk = {
      usage: { prompt_tokens: 100 },
    }
    expect(extractUsageFromChunk(chunk)).toEqual({
      inputTokens: 100,
      outputTokens: 0,
    })
  })
})

describe('extractAssistantContentFromChunk', () => {
  it('extracts OpenAI streaming delta content', () => {
    const chunk = {
      choices: [{ index: 0, delta: { content: 'hello' } }],
    }
    expect(extractAssistantContentFromChunk(chunk)).toBe('hello')
  })

  it('extracts non-streaming message content when forwarded over SSE', () => {
    const chunk = {
      choices: [{ index: 0, message: { role: 'assistant', content: 'done' } }],
    }
    expect(extractAssistantContentFromChunk(chunk)).toBe('done')
  })

  it('extracts text from structured content arrays', () => {
    const chunk = {
      choices: [{
        index: 0,
        delta: {
          content: [
            { type: 'text', text: 'first' },
            { type: 'output_text', text: 'second' },
          ],
        },
      }],
    }
    expect(extractAssistantContentFromChunk(chunk)).toBe('first\nsecond')
  })

  it('ignores role-only chunks', () => {
    const chunk = {
      choices: [{ index: 0, delta: { role: 'assistant' } }],
    }
    expect(extractAssistantContentFromChunk(chunk)).toBe('')
  })
})

describe('extractErrorMessageFromChunk', () => {
  it('extracts OpenAI-style error messages', () => {
    expect(extractErrorMessageFromChunk({
      error: { message: 'Request timed out.' },
    })).toBe('Request timed out.')
  })

  it('treats error finish reason as a stream error', () => {
    expect(extractErrorMessageFromChunk({
      choices: [{ index: 0, delta: {}, finish_reason: 'error' }],
    })).toBe('Hermes Agent stream ended with an error.')
  })
})

describe('reconcileFinalAssistantContent', () => {
  it('fills in chunks that were missed by the IPC listener cleanup race', () => {
    expect(reconcileFinalAssistantContent('gpt-', 'gpt-5.4，openai-codex')).toBe('gpt-5.4，openai-codex')
  })

  it('does not duplicate when streaming already assembled the full answer', () => {
    expect(reconcileFinalAssistantContent('gpt-5.4，openai-codex', 'gpt-5.4，openai-codex')).toBe('gpt-5.4，openai-codex')
  })

  it('appends final text only when it is not a replacement prefix', () => {
    expect(reconcileFinalAssistantContent('hello ', 'world')).toBe('hello world')
  })
})
