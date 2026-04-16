/**
 * useMgmtProbe — probes the remote Hermes Management API (`:8643/health`)
 * and classifies failures so the Settings page can render a diagnostic
 * message + Retry button instead of silently showing the
 * "only available on local connection" banner.
 *
 * Design goals:
 * - Pure composable with an injected fetcher → trivially unit-testable
 * - Errors classified into kinds the UI can map to i18n strings
 * - Safe to call repeatedly (reset between probes so stale errors
 *   don't linger into a successful retry)
 * - No Vue template dependencies — callers wire refs into their UI
 */
import { ref } from 'vue'

export interface MgmtFetchResult {
  ok: boolean
  status: number
  body: string
}

export type MgmtFetcher = (url: string) => Promise<MgmtFetchResult>

export type MgmtProbeErrorKind =
  | 'empty-url'        // caller passed an empty URL (connection not yet established)
  | 'network'          // fetch failed at transport layer (refused / unreachable)
  | 'timeout'          // fetch aborted by timeout
  | 'http'             // fetch returned a non-2xx HTTP status
  | 'parse'            // response body wasn't JSON
  | 'wrong-platform'   // reachable but not a Hermes mgmt-server

/** True when the fetcher body hints at a timeout/abort — kept as a function
 *  so it can be tweaked if main-process fetch error wording changes. */
function bodyLooksLikeTimeout(body: string | null | undefined): boolean {
  if (!body) return false
  return /timeout|abort/i.test(body)
}

export function useMgmtProbe(fetcher: MgmtFetcher) {
  const available = ref(false)
  const probing = ref(false)
  const errorKind = ref<MgmtProbeErrorKind | null>(null)
  const errorDetail = ref<string>('')

  function setFailure(kind: MgmtProbeErrorKind, detail: string) {
    available.value = false
    errorKind.value = kind
    errorDetail.value = detail
  }

  function setSuccess() {
    available.value = true
    errorKind.value = null
    errorDetail.value = ''
  }

  async function probe(mgmtUrl: string): Promise<void> {
    if (!mgmtUrl) {
      // Reset probing in case caller chained probes; empty URL is a
      // benign pre-condition failure, not a probe attempt.
      probing.value = false
      setFailure('empty-url', '')
      return
    }
    probing.value = true
    // Clear previous error state before the attempt so a retry doesn't
    // flash the old error until the new result comes back.
    errorKind.value = null
    errorDetail.value = ''
    try {
      const resp = await fetcher(`${mgmtUrl}/health`)
      if (!resp.ok) {
        if (resp.status === 0) {
          // Transport-level failure from main-process fetch. Use body
          // hints to distinguish timeout from refused/unreachable.
          if (bodyLooksLikeTimeout(resp.body)) {
            setFailure('timeout', resp.body || '')
          } else {
            setFailure('network', resp.body || '')
          }
        } else {
          setFailure('http', `HTTP ${resp.status}`)
        }
        return
      }
      let data: unknown
      try {
        data = resp.body ? JSON.parse(resp.body) : {}
      } catch {
        setFailure('parse', (resp.body || '').slice(0, 200))
        return
      }
      const platform = (data as { platform?: unknown } | null)?.platform
      if (platform === 'hermes-mgmt') {
        setSuccess()
      } else {
        setFailure('wrong-platform', typeof platform === 'string' ? platform : '')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/timeout|abort/i.test(msg)) {
        setFailure('timeout', msg)
      } else {
        setFailure('network', msg)
      }
    } finally {
      probing.value = false
    }
  }

  function reset() {
    available.value = false
    probing.value = false
    errorKind.value = null
    errorDetail.value = ''
  }

  return { available, probing, errorKind, errorDetail, probe, reset }
}
