/**
 * Unit tests for the pure SSE line parser.
 *
 * See docs/superpowers/plans/2026-04-14-hermes-desktop-fallback-visibility.md
 * Task E1.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  flushSseEvent,
  parseSseEventLine,
  parseSseLine,
  makeInitialSseParserState
} from './sse-parser'
import type { SseParserState } from './sse-parser'

describe('parseSseLine', () => {
  let state: SseParserState

  beforeEach(() => {
    state = makeInitialSseParserState()
  })

  it('data: line without prior event has null event name', () => {
    const result = parseSseLine('data: {"hello":"world"}', state)
    expect(result).toEqual({ kind: 'data', event: null, data: '{"hello":"world"}' })
  })

  it('event: then data: pairs data with event name', () => {
    parseSseLine('event: hermes.model.fallback_activated', state)
    const result = parseSseLine('data: {"x":1}', state)
    expect(result).toEqual({
      kind: 'data',
      event: 'hermes.model.fallback_activated',
      data: '{"x":1}'
    })
  })

  it('blank line resets lastEventName', () => {
    parseSseLine('event: foo', state)
    parseSseLine('', state)
    const result = parseSseLine('data: {}', state)
    expect(result).toEqual({ kind: 'data', event: null, data: '{}' })
  })

  it('blank line returns empty kind', () => {
    const result = parseSseLine('', state)
    expect(result).toEqual({ kind: 'empty' })
  })

  it('comment line (starts with colon) returns skip', () => {
    const result = parseSseLine(': heartbeat', state)
    expect(result).toEqual({ kind: 'skip' })
  })

  it('multiple data: lines after one event: share the event name', () => {
    parseSseLine('event: hermes.model.primary_restored', state)
    const r1 = parseSseLine('data: {"a":1}', state)
    const r2 = parseSseLine('data: {"b":2}', state)
    expect(r1).toMatchObject({ event: 'hermes.model.primary_restored' })
    expect(r2).toMatchObject({ event: 'hermes.model.primary_restored' })
  })

  it('strips whitespace in "data: " and "event: " prefixes', () => {
    const r = parseSseLine('data:   {"x":1}   ', state)
    expect(r).toEqual({ kind: 'data', event: null, data: '{"x":1}' })
  })

  it('unknown fields (id:, retry:) return skip', () => {
    expect(parseSseLine('id: 42', state)).toEqual({ kind: 'skip' })
    expect(parseSseLine('retry: 3000', state)).toEqual({ kind: 'skip' })
  })

  it('hermes.model.* event names detected correctly', () => {
    parseSseLine('event: hermes.model.chain_exhausted', state)
    const r = parseSseLine('data: {}', state)
    expect(r.kind).toBe('data')
    if (r.kind === 'data') {
      expect(r.event).toBe('hermes.model.chain_exhausted')
      expect(r.event?.startsWith('hermes.model.')).toBe(true)
    }
  })
})

describe('parseSseEventLine', () => {
  let state: SseParserState

  beforeEach(() => {
    state = makeInitialSseParserState()
  })

  it('dispatches multi-line data as one SSE event', () => {
    parseSseEventLine('event: hermes.model.fallback_activated', state)
    expect(parseSseEventLine('data: {"a":1,', state)).toEqual({ kind: 'skip' })
    expect(parseSseEventLine('data: "b":2}', state)).toEqual({ kind: 'skip' })

    expect(parseSseEventLine('', state)).toEqual({
      kind: 'data',
      event: 'hermes.model.fallback_activated',
      data: '{"a":1,\n"b":2}'
    })
  })

  it('flushes a final data event without trailing blank line', () => {
    parseSseEventLine('data: {"choices":[{"delta":{"content":"tail"}}]}', state)

    expect(flushSseEvent(state)).toEqual({
      kind: 'data',
      event: null,
      data: '{"choices":[{"delta":{"content":"tail"}}]}'
    })
    expect(flushSseEvent(state)).toBeNull()
  })

  it('resets event name after dispatch', () => {
    parseSseEventLine('event: hermes.model.primary_restored', state)
    parseSseEventLine('data: {"ok":true}', state)
    parseSseEventLine('', state)
    parseSseEventLine('data: {"plain":true}', state)

    expect(parseSseEventLine('', state)).toEqual({
      kind: 'data',
      event: null,
      data: '{"plain":true}'
    })
  })
})
