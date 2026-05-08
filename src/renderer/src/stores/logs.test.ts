import { describe, expect, it } from 'vitest'
import { parseLogLine } from './logs'

describe('parseLogLine', () => {
  it('parses Python gateway log lines with subsystem', () => {
    const entry = parseLogLine(
      '2026-05-08 18:08:44,075 INFO gateway.platforms.api_server: [Api_Server] API server listening on http://0.0.0.0:8642'
    )

    expect(entry.time).toBe('2026-05-08 18:08:44,075')
    expect(entry.level).toBe('info')
    expect(entry.subsystem).toBe('gateway.platforms.api_server')
    expect(entry.message).toBe('[Api_Server] API server listening on http://0.0.0.0:8642')
  })

  it('normalizes Python WARNING to warn', () => {
    const entry = parseLogLine(
      '2026-05-08 18:08:33,183 WARNING gateway.run: Shutdown diagnostic enabled'
    )

    expect(entry.level).toBe('warn')
    expect(entry.subsystem).toBe('gateway.run')
    expect(entry.message).toBe('Shutdown diagnostic enabled')
  })

  it('keeps JSONL log compatibility', () => {
    const entry = parseLogLine(
      '{"time":"2026-05-08T10:00:00Z","level":"WARNING","subsystem":"gateway","msg":"slow request","requestId":"r1"}'
    )

    expect(entry.time).toBe('2026-05-08T10:00:00Z')
    expect(entry.level).toBe('warn')
    expect(entry.subsystem).toBe('gateway')
    expect(entry.message).toBe('slow request')
    expect(entry.meta).toMatchObject({ requestId: 'r1' })
  })

  it('still parses simple timestamp and bracketed level lines', () => {
    const entry = parseLogLine('2026-05-08T10:00:00Z [ERROR] request failed')

    expect(entry.time).toBe('2026-05-08T10:00:00Z')
    expect(entry.level).toBe('error')
    expect(entry.message).toBe('request failed')
  })
})
