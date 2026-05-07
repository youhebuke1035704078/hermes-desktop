import { describe, expect, it } from 'vitest'
import { extractAssistantContentFromChunk } from './hermes-chat-content'

describe('extractAssistantContentFromChunk', () => {
  it('extracts OpenAI delta content', () => {
    expect(
      extractAssistantContentFromChunk({
        choices: [{ delta: { content: 'hello' } }]
      })
    ).toBe('hello')
  })

  it('extracts non-streaming message content', () => {
    expect(
      extractAssistantContentFromChunk({
        choices: [{ message: { content: 'done' } }]
      })
    ).toBe('done')
  })

  it('extracts text choices and root output_text', () => {
    expect(
      extractAssistantContentFromChunk({
        choices: [{ text: 'choice text' }]
      })
    ).toBe('choice text')
    expect(extractAssistantContentFromChunk({ output_text: 'root text' })).toBe('root text')
  })

  it('joins structured content arrays', () => {
    expect(
      extractAssistantContentFromChunk({
        choices: [{ delta: { content: [{ text: 'first' }, { text: 'second' }] } }]
      })
    ).toBe('first\nsecond')
  })
})
