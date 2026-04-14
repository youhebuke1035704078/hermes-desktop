/**
 * Git helpers for the Hermes Agent update flow.
 *
 * Extracted from src/main/index.ts so they can be unit-tested with a fake
 * exec function. The production code still imports and uses the same API;
 * tests inject their own exec / sleep to drive retry, timeout, and mutex
 * scenarios without touching real git or the real wall clock.
 */
import { execFile as execFileNode } from 'child_process'

export interface GitResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
  timedOut?: boolean
}

/**
 * Error shape we actually read inside {@link runGit}. We can't use
 * `NodeJS.ErrnoException` directly because its `code` is typed as `string`
 * only, whereas node's `execFile` passes a numeric exit code on non-zero
 * exit. This type is a strict supertype, so the real `execFile` assigns to
 * it and tests can construct fakes without extra casting.
 */
export interface ExecFileError extends Error {
  code?: number | string
  killed?: boolean
  signal?: string
}

/**
 * Shape of the node `child_process.execFile` callback-form signature we
 * actually use. Tests provide a stub matching this contract.
 */
export type ExecFileFn = (
  file: string,
  args: string[],
  options: { timeout: number },
  callback: (err: ExecFileError | null, stdout: string, stderr: string) => void,
) => void

/** Delay function — tests can override to skip real setTimeout waits. */
export type SleepFn = (ms: number) => Promise<void>

const defaultExec: ExecFileFn = execFileNode as unknown as ExecFileFn
const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Run a git command (or any command) with clear error reporting.
 * Distinguishes timeout from other failures so the caller can classify
 * the error and decide whether to retry.
 */
export function runGit(
  args: string[],
  timeoutMs = 15000,
  exec: ExecFileFn = defaultExec,
): Promise<GitResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    exec('git', args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        const elapsed = Date.now() - started
        const timedOut =
          err.killed === true && (err.signal === 'SIGTERM' || elapsed >= timeoutMs - 100)
        const parts: string[] = []
        if (timedOut) parts.push(`timed out after ${timeoutMs}ms`)
        else if (typeof err.code === 'number') parts.push(`exit ${err.code}`)
        else if (err.code) parts.push(String(err.code))
        const stderrTrim = (stderr || '').trim()
        if (stderrTrim) parts.push(stderrTrim)
        if (!stderrTrim && err.message && !err.message.startsWith('Command failed:')) {
          parts.push(err.message)
        }
        if (parts.length === 0) parts.push(`git ${args.join(' ')} failed`)
        resolve({
          ok: false,
          stdout: '',
          stderr: stderrTrim,
          error: parts.join(': '),
          timedOut,
        })
        return
      }
      resolve({ ok: true, stdout: (stdout ?? '').trim(), stderr: (stderr ?? '').trim() })
    })
  })
}

/**
 * Regex matching transient network / TLS errors that are worth retrying.
 * Exported for tests — callers generally don't need to inspect it.
 */
export const RETRYABLE_FETCH_ERRORS =
  /could not resolve host|connection reset|ssl|tls|timeout|operation timed out/i

/**
 * Git fetch with one automatic retry on transient failure.
 *
 * Retryable means: the underlying runGit reported `timedOut: true`, OR its
 * error message matches {@link RETRYABLE_FETCH_ERRORS}. Non-retryable errors
 * (auth failures, missing remote, etc.) short-circuit immediately.
 *
 * Between attempts it waits `retryDelayMs` (default 800ms). Tests inject a
 * no-op sleep to keep the test suite fast.
 */
export async function gitFetchWithRetry(
  repoPath: string,
  timeoutMs = 60000,
  exec: ExecFileFn = defaultExec,
  sleep: SleepFn = defaultSleep,
  retryDelayMs = 800,
): Promise<GitResult> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await runGit(['-C', repoPath, 'fetch', '--tags'], timeoutMs, exec)
    if (r.ok) return r
    if (attempt === 2) return r
    const retryable = r.timedOut || RETRYABLE_FETCH_ERRORS.test(r.error || '')
    if (!retryable) return r
    console.error(
      `[hermes:fetch retry] attempt ${attempt} failed (${r.error}); retrying in ${retryDelayMs}ms`,
    )
    await sleep(retryDelayMs)
  }
  // Unreachable — the loop always returns — but TS needs a value here.
  return { ok: false, stdout: '', stderr: '', error: 'unreachable', timedOut: false }
}

/**
 * Result returned when a withGitLock caller times out waiting for the lock.
 * Callers should treat this like any other `ok: false` response.
 */
export interface LockTimeoutError {
  ok: false
  error: string
}

/**
 * Factory for a serialized git-operation lock. Each call to
 * `createGitLock()` returns an independent mutex, so tests can spawn one
 * lock per test case instead of sharing module-level state.
 *
 * The returned function is a `withLock` wrapper: pass it an async function
 * and it will wait (polling) until the lock is free, acquire it, run the
 * function, and release the lock — even if the function throws.
 *
 * If the wait exceeds `lockWaitTimeoutMs` (default 90s), it resolves with
 * `{ ok: false, error: 'git lock wait timeout' }` instead of hanging forever.
 */
export function createGitLock(
  defaultLockWaitTimeoutMs = 90000,
  defaultPollIntervalMs = 100,
  sleep: SleepFn = defaultSleep,
): <T>(
  fn: () => Promise<T>,
  lockWaitTimeoutMs?: number,
  pollIntervalMs?: number,
) => Promise<T | LockTimeoutError> {
  let busy = false
  return async function withLock<T>(
    fn: () => Promise<T>,
    lockWaitTimeoutMs = defaultLockWaitTimeoutMs,
    pollIntervalMs = defaultPollIntervalMs,
  ): Promise<T | LockTimeoutError> {
    const waitStart = Date.now()
    while (busy) {
      if (Date.now() - waitStart > lockWaitTimeoutMs) {
        return { ok: false, error: 'git lock wait timeout' }
      }
      await sleep(pollIntervalMs)
    }
    busy = true
    try {
      return await fn()
    } finally {
      busy = false
    }
  }
}
