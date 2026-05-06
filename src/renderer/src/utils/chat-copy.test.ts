import { describe, expect, it } from 'vitest'
import { collectStructuredMessageContent } from './chat-copy'

describe('collectStructuredMessageContent', () => {
  it('includes plain text, tool details, validation errors, and image refs', () => {
    const text = collectStructuredMessageContent({
      plainTexts: ['hello'],
      thinkings: [{ text: 'plan' }],
      toolCalls: [
        {
          id: 'call-1',
          name: 'shell',
          command: 'pwd',
          workdir: '/tmp',
          argumentsJson: '{\n  "cmd": "pwd"\n}',
        },
      ],
      toolResults: [
        {
          id: 'call-1',
          name: 'shell',
          status: 'ok',
          content: '/tmp',
        },
      ],
      validationErrors: [
        {
          toolName: 'shell',
          issues: ['missing command'],
          argumentsText: '{}',
        },
      ],
      images: [{ url: '/api/media?path=browser%2Fa.png' }],
    })

    expect(text).toContain('hello')
    expect(text).toContain('[thinking]\nplan')
    expect(text).toContain('[tool_call] shell')
    expect(text).toContain('command: pwd')
    expect(text).toContain('[tool_result] shell')
    expect(text).toContain('status: ok')
    expect(text).toContain('[validation_error] shell')
    expect(text).toContain('- missing command')
    expect(text).toContain('[image] /api/media?path=browser%2Fa.png')
  })
})
