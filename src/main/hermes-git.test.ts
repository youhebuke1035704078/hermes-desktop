/**
 * Unit tests for src/main/hermes-git.ts — the helpers that power
 * `hermes:checkUpdate` and `hermes:update` IPC handlers.
 *
 * These are pure behavioural tests: no real git, no real timers.
 * We inject a fake `execFile` and a no-op `sleep` so the suite runs
 * deterministically in a few ms.
 */
import { describe, it, expect } from 'vitest'
import {
  runGit,
  gitFetchWithRetry,
  createGitLock,
  RETRYABLE_FETCH_ERRORS,
  type ExecFileError,
  type ExecFileFn,
  type SleepFn,
} from './hermes-git'

// ── Test helpers ───────────────────────────────────────────────────────

interface FakeExecResult {
  err?: ExecFileError
  stdout?: string
  stderr?: string
}

/**
 * Build a fake `execFile` that returns a queued sequence of results.
 * Each invocation pulls the next entry from `impls`. If the queue is
 * drained the fake errors loudly so tests fail fast.
 */
function makeExec(impls: FakeExecResult[]): {
  exec: ExecFileFn
  calls: Array<{ args: string[]; timeout: number }>
} {
  const calls: Array<{ args: string[]; timeout: number }> = []
  let idx = 0
  const exec: ExecFileFn = (_file, args, options, cb) => {
    calls.push({ args, timeout: options.timeout })
    const r = impls[idx++]
    if (!r) {
      cb(Object.assign(new Error('fake exec: no more results'), { code: 1 }), '', '')
      return
    }
    // Resolve on the microtask queue so the caller sees async behaviour.
    queueMicrotask(() => cb(r.err ?? null, r.stdout ?? '', r.stderr ?? ''))
  }
  return { exec, calls }
}

function noopSleep(): SleepFn {
  return async () => {}
}

function timeoutError(): ExecFileError {
  // Matches how node's execFile surfaces a timeout kill.
  return Object.assign(new Error('Command failed: git'), {
    killed: true,
    signal: 'SIGTERM' as const,
  })
}

function exitError(code: number, message = 'Command failed: git'): ExecFileError {
  return Object.assign(new Error(message), { code })
}

// ── runGit ─────────────────────────────────────────────────────────────

describe('runGit', () => {
  it('resolves ok on success with trimmed stdout', async () => {
    const { exec } = makeExec([{ stdout: 'v1.2.3\n' }])
    const r = await runGit(['--version'], 1000, exec)
    expect(r.ok).toBe(true)
    expect(r.stdout).toBe('v1.2.3')
    expect(r.stderr).toBe('')
  })

  it('classifies SIGTERM-killed errors as timedOut', async () => {
    const { exec } = makeExec([{ err: timeoutError() }])
    const r = await runGit(['fetch'], 1000, exec)
    expect(r.ok).toBe(false)
    expect(r.timedOut).toBe(true)
    expect(r.error).toMatch(/timed out after 1000ms/)
  })

  it('reports the exit code for non-zero exits and includes stderr', async () => {
    const { exec } = makeExec([
      { err: exitError(128), stderr: 'fatal: not a git repository' },
    ])
    const r = await runGit(['status'], 1000, exec)
    expect(r.ok).toBe(false)
    expect(r.timedOut).toBeFalsy()
    expect(r.error).toContain('exit 128')
    expect(r.error).toContain('fatal: not a git repository')
    expect(r.stderr).toBe('fatal: not a git repository')
  })

  it('falls back to err.message when stderr is empty and the message is informative', async () => {
    const err: ExecFileError = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })
    const { exec } = makeExec([{ err }])
    const r = await runGit(['status'], 1000, exec)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('ENOENT')
    expect(r.error).toContain('spawn git ENOENT')
  })

  it('suppresses the generic "Command failed:" message when there is no stderr', async () => {
    // This is the exact bug that prompted the original fix — we must NOT
    // leak the bare node message back to the UI.
    const { exec } = makeExec([{ err: exitError(1, 'Command failed: git fetch --tags') }])
    const r = await runGit(['fetch', '--tags'], 1000, exec)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('exit 1')
    expect(r.error).not.toMatch(/Command failed/)
  })

  it('passes the exact args and timeout through to execFile', async () => {
    const { exec, calls } = makeExec([{ stdout: '' }])
    await runGit(['-C', '/repo', 'fetch', '--tags'], 9999, exec)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.args).toEqual(['-C', '/repo', 'fetch', '--tags'])
    expect(calls[0]!.timeout).toBe(9999)
  })
})

// ── RETRYABLE_FETCH_ERRORS regex ───────────────────────────────────────

describe('RETRYABLE_FETCH_ERRORS', () => {
  it('matches common transient network errors', () => {
    expect(RETRYABLE_FETCH_ERRORS.test('could not resolve host github.com')).toBe(true)
    expect(RETRYABLE_FETCH_ERRORS.test('Connection reset by peer')).toBe(true)
    expect(RETRYABLE_FETCH_ERRORS.test('SSL_ERROR_SYSCALL')).toBe(true)
    expect(RETRYABLE_FETCH_ERRORS.test('TLS handshake failed')).toBe(true)
    expect(RETRYABLE_FETCH_ERRORS.test('operation timed out')).toBe(true)
    expect(RETRYABLE_FETCH_ERRORS.test('fetch timeout')).toBe(true)
  })

  it('does NOT match permission / auth / repo errors', () => {
    expect(RETRYABLE_FETCH_ERRORS.test('Permission denied (publickey)')).toBe(false)
    expect(RETRYABLE_FETCH_ERRORS.test('authentication failed')).toBe(false)
    expect(RETRYABLE_FETCH_ERRORS.test('fatal: not a git repository')).toBe(false)
    expect(RETRYABLE_FETCH_ERRORS.test('Repository not found')).toBe(false)
  })
})

// ── gitFetchWithRetry ──────────────────────────────────────────────────

describe('gitFetchWithRetry', () => {
  it('returns immediately on first-attempt success', async () => {
    const { exec, calls } = makeExec([{ stdout: 'From origin' }])
    const slept: number[] = []
    const sleep: SleepFn = async (ms) => {
      slept.push(ms)
    }
    const r = await gitFetchWithRetry('/repo', 60000, exec, sleep)
    expect(r.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(slept).toEqual([]) // no sleep on success
  })

  it('retries once on timeout and succeeds the second time', async () => {
    const { exec, calls } = makeExec([
      { err: timeoutError() },
      { stdout: 'fetched' },
    ])
    const slept: number[] = []
    const sleep: SleepFn = async (ms) => {
      slept.push(ms)
    }
    const r = await gitFetchWithRetry('/repo', 60000, exec, sleep, 123)
    expect(r.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(slept).toEqual([123]) // exactly one back-off
  })

  it('retries once on a DNS "could not resolve host" error', async () => {
    const { exec, calls } = makeExec([
      {
        err: exitError(128),
        stderr: 'fatal: unable to access: Could not resolve host: github.com',
      },
      { stdout: 'fetched' },
    ])
    const r = await gitFetchWithRetry('/repo', 60000, exec, noopSleep())
    expect(r.ok).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('does NOT retry on auth failure', async () => {
    const { exec, calls } = makeExec([
      {
        err: exitError(128),
        stderr: 'fatal: Authentication failed for https://github.com/x/y.git',
      },
    ])
    const r = await gitFetchWithRetry('/repo', 60000, exec, noopSleep())
    expect(r.ok).toBe(false)
    expect(calls).toHaveLength(1) // NO retry
    expect(r.error).toMatch(/Authentication failed/)
  })

  it('does NOT retry on missing-repo error', async () => {
    const { exec, calls } = makeExec([
      { err: exitError(128), stderr: 'fatal: not a git repository' },
    ])
    const r = await gitFetchWithRetry('/repo', 60000, exec, noopSleep())
    expect(r.ok).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('returns the second failure when both attempts fail', async () => {
    const { exec, calls } = makeExec([
      { err: timeoutError() },
      { err: timeoutError() },
    ])
    const r = await gitFetchWithRetry('/repo', 60000, exec, noopSleep())
    expect(r.ok).toBe(false)
    expect(calls).toHaveLength(2)
    expect(r.timedOut).toBe(true)
    expect(r.error).toMatch(/timed out/)
  })

  it('passes the repo path into "git -C"', async () => {
    const { exec, calls } = makeExec([{ stdout: '' }])
    await gitFetchWithRetry('/custom/repo', 1000, exec, noopSleep())
    expect(calls[0]!.args).toEqual(['-C', '/custom/repo', 'fetch', '--tags'])
    expect(calls[0]!.timeout).toBe(1000)
  })
})

// ── createGitLock ──────────────────────────────────────────────────────

describe('createGitLock', () => {
  it('runs a single task and returns its value', async () => {
    const withLock = createGitLock()
    const r = await withLock(async () => 'hello')
    expect(r).toBe('hello')
  })

  it('serializes concurrent tasks', async () => {
    const withLock = createGitLock(5000, 5) // short poll interval so the test is quick
    const order: string[] = []
    const taskA = withLock(async () => {
      order.push('A-start')
      await new Promise((r) => setTimeout(r, 30))
      order.push('A-end')
      return 'a'
    })
    // Start B immediately — it should have to wait for A to finish.
    const taskB = withLock(async () => {
      order.push('B-start')
      await new Promise((r) => setTimeout(r, 5))
      order.push('B-end')
      return 'b'
    })
    const [a, b] = await Promise.all([taskA, taskB])
    expect(a).toBe('a')
    expect(b).toBe('b')
    // B must not start until A finished
    expect(order).toEqual(['A-start', 'A-end', 'B-start', 'B-end'])
  })

  it('releases the lock when the wrapped function throws', async () => {
    const withLock = createGitLock(5000, 5)
    await expect(
      withLock(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    // Next call should acquire immediately, proving the lock was released.
    const r = await withLock(async () => 'after')
    expect(r).toBe('after')
  })

  it('returns LockTimeoutError when the wait exceeds the timeout', async () => {
    // Use a fake sleep + a fake clock so the poll loop ticks in virtual time.
    let fakeNow = 0
    const sleep: SleepFn = async (ms) => {
      fakeNow += ms
    }
    const originalNow = Date.now
    Date.now = () => fakeNow
    try {
      const withLock = createGitLock(50, 10, sleep)

      // Start a long task that holds the lock until we explicitly release it.
      let releaseLong: () => void = () => {}
      const longPromise = new Promise<void>((resolve) => {
        releaseLong = resolve
      })
      const longTask = withLock(async () => {
        await longPromise
        return 'done'
      })

      // Yield microtasks so `longTask` grabs the lock before the second call.
      await Promise.resolve()

      const r = await withLock(async () => 'should not run')
      expect(r).toEqual({ ok: false, error: 'git lock wait timeout' })

      releaseLong()
      await longTask
    } finally {
      Date.now = originalNow
    }
  })

  it('keeps state independent between different lock instances', async () => {
    const lockA = createGitLock()
    const lockB = createGitLock()
    const events: string[] = []
    const a = lockA(async () => {
      events.push('A-start')
      await new Promise((r) => setTimeout(r, 30))
      events.push('A-end')
    })
    // B uses a different lock so it should run in parallel.
    const b = lockB(async () => {
      events.push('B-start')
      await new Promise((r) => setTimeout(r, 5))
      events.push('B-end')
    })
    await Promise.all([a, b])
    // B-start must happen before A-end (i.e. they overlap).
    expect(events.indexOf('B-start')).toBeLessThan(events.indexOf('A-end'))
  })
})
