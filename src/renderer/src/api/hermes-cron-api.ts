/**
 * Hermes Agent Cron REST API client
 *
 * Wraps /api/jobs endpoints. Uses Electron main-process httpFetch when
 * available (bypasses CORS), falling back to browser fetch.
 */
import type { CronJob, CronJobState, CronSchedule } from './types'

// ── Raw API types (from Hermes Agent /api/jobs response) ──

interface HermesJobRaw {
  id: string
  name: string
  prompt: string
  skills: string[]
  skill: string | null
  model: string | null
  provider: string | null
  base_url: string | null
  script: string | null
  schedule: { kind: string; expr?: string; display?: string }
  schedule_display: string
  repeat: { times: number | null; completed: number }
  enabled: boolean
  state: string // 'scheduled' | 'running' | 'paused' | 'completed'
  paused_at: string | null
  paused_reason: string | null
  created_at: string
  next_run_at: string | null
  last_run_at: string | null
  last_status: string | null // 'ok' | 'error' | null
  last_error: string | null
  last_delivery_error: string | null
  deliver: string
  origin: string | null
}

// ── Normalizer: convert Hermes REST shape → Desktop CronJob shape ──

function toIsoMs(s: string | null): number | undefined {
  if (!s) return undefined
  return new Date(s).getTime()
}

function normalizeCronJob(raw: HermesJobRaw): CronJob {
  const rawKind = raw.schedule?.kind || 'cron'
  let scheduleObj: CronSchedule
  if (rawKind === 'at') {
    scheduleObj = { kind: 'at', at: raw.schedule?.expr || raw.schedule_display || '' }
  } else if (rawKind === 'every') {
    scheduleObj = { kind: 'every', everyMs: Number(raw.schedule?.expr) || 0 }
  } else {
    scheduleObj = { kind: 'cron', expr: raw.schedule?.expr || raw.schedule_display || '' }
  }

  const state: CronJobState = {
    nextRunAtMs: toIsoMs(raw.next_run_at),
    lastRunAtMs: toIsoMs(raw.last_run_at),
    lastStatus: raw.last_status as CronJobState['lastStatus'],
    lastError: raw.last_error || undefined,
    runningAtMs: raw.state === 'running' ? Date.now() : undefined,
  }

  return {
    id: raw.id,
    name: raw.name,
    description: raw.prompt,
    enabled: raw.enabled,
    schedule: raw.schedule_display || (raw.schedule?.expr ?? ''),
    scheduleObj,
    state,
    createdAtMs: toIsoMs(raw.created_at),
    nextRun: raw.next_run_at || undefined,
    lastRun: raw.last_run_at || undefined,
    command: raw.prompt,
    payload: { kind: 'agentTurn', message: raw.prompt, model: raw.model || undefined },
    delivery: { mode: raw.deliver === 'local' ? 'none' : 'announce' },
  }
}

// ── HTTP helper ──

async function hermesFetch<T = any>(
  baseUrl: string,
  token: string | null,
  path: string,
  init: { method?: string; body?: string } = {},
): Promise<T> {
  const url = `${baseUrl}${path}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  if (window.api?.httpFetch) {
    const resp = await window.api.httpFetch(url, { method: init.method || 'GET', headers, body: init.body })
    if (!resp.ok) {
      const errBody = typeof resp.body === 'string' ? resp.body : ''
      throw new Error(errBody || `HTTP ${resp.status}`)
    }
    if (typeof resp.body !== 'string' || !resp.body) return {} as T
    // Wrap JSON.parse so a 200-with-non-JSON response (HTML error page from a
    // reverse proxy, cached 200 with status banner, etc.) surfaces as a clear
    // error instead of an opaque `SyntaxError: Unexpected token`.
    try {
      return JSON.parse(resp.body) as T
    } catch {
      const preview = resp.body.slice(0, 120).replace(/\s+/g, ' ')
      throw new Error(`Non-JSON response from ${path}: ${preview}${resp.body.length > 120 ? '…' : ''}`)
    }
  }

  const resp = await fetch(url, {
    method: init.method || 'GET',
    headers,
    body: init.body,
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`)
  return resp.json()
}

// ── Public API ──

export interface CronApiOptions {
  baseUrl: string
  token: string | null
}

export async function listJobs(opts: CronApiOptions): Promise<CronJob[]> {
  const data = await hermesFetch<{ jobs: HermesJobRaw[] }>(opts.baseUrl, opts.token, '/api/jobs?include_disabled=true')
  return (data.jobs || []).map(normalizeCronJob)
}

export async function getJob(opts: CronApiOptions, id: string): Promise<CronJob> {
  const data = await hermesFetch<{ job: HermesJobRaw }>(opts.baseUrl, opts.token, `/api/jobs/${id}`)
  return normalizeCronJob(data.job)
}

export async function createJob(opts: CronApiOptions, params: {
  name: string
  schedule: string
  prompt: string
  deliver?: string
  skills?: string[]
  repeat?: number
  enabled?: boolean
}): Promise<CronJob> {
  const data = await hermesFetch<{ job: HermesJobRaw }>(opts.baseUrl, opts.token, '/api/jobs', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return normalizeCronJob(data.job)
}

export async function updateJob(opts: CronApiOptions, id: string, params: Record<string, any>): Promise<CronJob> {
  const data = await hermesFetch<{ job: HermesJobRaw }>(opts.baseUrl, opts.token, `/api/jobs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  })
  return normalizeCronJob(data.job)
}

export async function deleteJob(opts: CronApiOptions, id: string): Promise<void> {
  await hermesFetch(opts.baseUrl, opts.token, `/api/jobs/${id}`, { method: 'DELETE' })
}

export async function pauseJob(opts: CronApiOptions, id: string): Promise<void> {
  await hermesFetch(opts.baseUrl, opts.token, `/api/jobs/${id}/pause`, { method: 'POST' })
}

export async function resumeJob(opts: CronApiOptions, id: string): Promise<void> {
  await hermesFetch(opts.baseUrl, opts.token, `/api/jobs/${id}/resume`, { method: 'POST' })
}

export async function runJob(opts: CronApiOptions, id: string): Promise<void> {
  await hermesFetch(opts.baseUrl, opts.token, `/api/jobs/${id}/run`, { method: 'POST' })
}
