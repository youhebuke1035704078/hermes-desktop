/**
 * Unit tests for useMgmtProbe — probes the remote Hermes Management API
 * and classifies failures so the Settings page can show a diagnostic
 * message plus a Retry button instead of the misleading
 * "only local" banner.
 */
import { describe, it, expect } from 'vitest'
import { useMgmtProbe, type MgmtFetchResult } from './useMgmtProbe'

function makeFetcher(resp: MgmtFetchResult | Error) {
  return async () => {
    if (resp instanceof Error) throw resp
    return resp
  }
}

describe('useMgmtProbe', () => {
  it('sets available=true when /health returns platform=hermes-mgmt', async () => {
    const probe = useMgmtProbe(makeFetcher({
      ok: true,
      status: 200,
      body: JSON.stringify({ status: 'ok', platform: 'hermes-mgmt', port: 8643 }),
    }))
    await probe.probe('http://host:8643')
    expect(probe.available.value).toBe(true)
    expect(probe.errorKind.value).toBeNull()
    expect(probe.errorDetail.value).toBe('')
  })

  it('sets wrong-platform when platform mismatches', async () => {
    const probe = useMgmtProbe(makeFetcher({
      ok: true,
      status: 200,
      body: JSON.stringify({ status: 'ok', platform: 'something-else' }),
    }))
    await probe.probe('http://host:8643')
    expect(probe.available.value).toBe(false)
    expect(probe.errorKind.value).toBe('wrong-platform')
    expect(probe.errorDetail.value).toBe('something-else')
  })

  it('sets network error when fetcher returns status=0 with a generic body', async () => {
    const probe = useMgmtProbe(makeFetcher({
      ok: false,
      status: 0,
      body: 'fetch failed',
    }))
    await probe.probe('http://host:8643')
    expect(probe.available.value).toBe(false)
    expect(probe.errorKind.value).toBe('network')
    expect(probe.errorDetail.value).toBe('fetch failed')
  })

  it('sets timeout when fetcher body indicates abort/timeout', async () => {
    const probe = useMgmtProbe(makeFetcher({
      ok: false,
      status: 0,
      body: 'The operation was aborted due to timeout',
    }))
    await probe.probe('http://host:8643')
    expect(probe.available.value).toBe(false)
    expect(probe.errorKind.value).toBe('timeout')
  })

  it('sets timeout when fetcher throws with message "timeout"', async () => {
    const probe = useMgmtProbe(makeFetcher(new Error('timeout')))
    await probe.probe('http://host:8643')
    expect(probe.available.value).toBe(false)
    expect(probe.errorKind.value).toBe('timeout')
    expect(probe.errorDetail.value).toBe('timeout')
  })

  it('sets network error when fetcher throws a generic error', async () => {
    const probe = useMgmtProbe(makeFetcher(new Error('ECONNREFUSED')))
    await probe.probe('http://host:8643')
    expect(probe.available.value).toBe(false)
    expect(probe.errorKind.value).toBe('network')
    expect(probe.errorDetail.value).toBe('ECONNREFUSED')
  })

  it('sets parse error when body is not valid JSON', async () => {
    const probe = useMgmtProbe(makeFetcher({
      ok: true,
      status: 200,
      body: 'not json <!DOCTYPE html>',
    }))
    await probe.probe('http://host:8643')
    expect(probe.available.value).toBe(false)
    expect(probe.errorKind.value).toBe('parse')
    expect(probe.errorDetail.value).toContain('not json')
  })

  it('sets http error when status is non-zero but not ok', async () => {
    const probe = useMgmtProbe(makeFetcher({
      ok: false,
      status: 404,
      body: 'not found',
    }))
    await probe.probe('http://host:8643')
    expect(probe.available.value).toBe(false)
    expect(probe.errorKind.value).toBe('http')
    expect(probe.errorDetail.value).toBe('HTTP 404')
  })

  it('skips probe when URL is empty and sets empty-url error', async () => {
    const probe = useMgmtProbe(makeFetcher({
      ok: true,
      status: 200,
      body: '',
    }))
    await probe.probe('')
    expect(probe.available.value).toBe(false)
    expect(probe.errorKind.value).toBe('empty-url')
    expect(probe.probing.value).toBe(false)
  })

  it('probing flag is true during probe, false after', async () => {
    let resolveP: (value: MgmtFetchResult) => void = () => {}
    const pending = new Promise<MgmtFetchResult>(resolve => { resolveP = resolve })
    const probe = useMgmtProbe(() => pending)
    const done = probe.probe('http://host:8643')
    expect(probe.probing.value).toBe(true)
    resolveP({ ok: true, status: 200, body: JSON.stringify({ platform: 'hermes-mgmt' }) })
    await done
    expect(probe.probing.value).toBe(false)
  })

  it('reset clears all state', async () => {
    const probe = useMgmtProbe(makeFetcher({
      ok: true,
      status: 200,
      body: JSON.stringify({ platform: 'hermes-mgmt' }),
    }))
    await probe.probe('http://host:8643')
    probe.reset()
    expect(probe.available.value).toBe(false)
    expect(probe.errorKind.value).toBeNull()
    expect(probe.errorDetail.value).toBe('')
    expect(probe.probing.value).toBe(false)
  })

  it('successful probe after a failure clears the previous error', async () => {
    let mode: 'fail' | 'ok' = 'fail'
    const probe = useMgmtProbe(async () => {
      if (mode === 'fail') return { ok: false, status: 0, body: 'fetch failed' }
      return { ok: true, status: 200, body: JSON.stringify({ platform: 'hermes-mgmt' }) }
    })
    await probe.probe('http://host:8643')
    expect(probe.errorKind.value).toBe('network')
    mode = 'ok'
    await probe.probe('http://host:8643')
    expect(probe.available.value).toBe(true)
    expect(probe.errorKind.value).toBeNull()
    expect(probe.errorDetail.value).toBe('')
  })
})
