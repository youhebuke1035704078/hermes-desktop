import { describe, it, expect } from 'vitest'
import { extractUsageFromChunk } from './chat'

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
