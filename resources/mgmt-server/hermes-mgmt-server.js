#!/usr/bin/env node
/**
 * Hermes Management API Server
 *
 * Lightweight HTTP server that exposes local management operations
 * (version check, config editing, restart, update) as REST endpoints
 * so that remote Hermes Desktop clients can manage this machine's
 * Hermes Agent over Tailscale / LAN.
 *
 * Auth: Bearer token from API_SERVER_KEY in ~/.hermes/.env
 * Port: 8643 (configurable via MGMT_PORT env var)
 */

const http = require('http')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const os = require('os')

const HERMES_DIR = path.join(os.homedir(), '.hermes')
const HERMES_BIN = path.join(HERMES_DIR, 'hermes-agent', 'hermes')
const HERMES_REPO = path.join(HERMES_DIR, 'hermes-agent')
const CONFIG_YAML = path.join(HERMES_DIR, 'config.yaml')
const ENV_FILE = path.join(HERMES_DIR, '.env')
const PORT = parseInt(process.env.MGMT_PORT || '8643', 10)

// ── Read API key from .env ──
function loadApiKey() {
  try {
    const content = fs.readFileSync(ENV_FILE, 'utf-8')
    const match = content.match(/^API_SERVER_KEY=(.+)$/m)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

let API_KEY = loadApiKey()

// Reload key periodically (in case .env is edited)
setInterval(() => { API_KEY = loadApiKey() }, 30000)

// ── Helpers ──
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}

function exec(cmd, args, opts = {}) {
  const timeoutMs = opts.timeout || 15000
  return new Promise((resolve) => {
    const started = Date.now()
    execFile(cmd, args, { timeout: timeoutMs, ...opts }, (err, stdout, stderr) => {
      if (err) {
        const elapsed = Date.now() - started
        // Timeout detection: Node sends SIGTERM on timeout and sets err.killed + err.signal
        const timedOut = err.killed === true && (err.signal === 'SIGTERM' || elapsed >= timeoutMs - 100)
        const parts = []
        if (timedOut) parts.push(`timed out after ${timeoutMs}ms`)
        else if (typeof err.code === 'number') parts.push(`exit ${err.code}`)
        else if (err.code) parts.push(`error ${err.code}`)
        const stderrTrim = (stderr || '').trim()
        if (stderrTrim) parts.push(stderrTrim)
        if (!stderrTrim && err.message && !err.message.startsWith('Command failed:')) parts.push(err.message)
        if (parts.length === 0) parts.push(`command '${cmd} ${args.join(' ')}' failed`)
        const errStr = parts.join(': ')
        // Log for post-hoc debugging (goes to mgmt-server.err via launchd)
        console.error(`[exec fail] ${cmd} ${args.join(' ')} -> ${errStr}`)
        resolve({ ok: false, error: errStr, timedOut })
      } else resolve({ ok: true, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

// Serialize git operations so /check-update and /update can't race on .git/index
let gitBusy = false
async function withGitLock(fn) {
  const waitStart = Date.now()
  while (gitBusy) {
    if (Date.now() - waitStart > 90000) return { ok: false, error: 'git lock wait timeout' }
    await new Promise((r) => setTimeout(r, 100))
  }
  gitBusy = true
  try { return await fn() } finally { gitBusy = false }
}

// Retry git fetch once on transient/timeout failure (network blips, slow cold cache)
async function gitFetchWithRetry(repo, timeoutMs = 60000) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await exec('git', ['-C', repo, 'fetch', '--tags'], { timeout: timeoutMs })
    if (r.ok) return r
    if (attempt === 2) return r
    // Only retry on timeout or clearly transient network errors
    const retryable = r.timedOut || /could not resolve host|connection reset|ssl|tls|timeout|operation timed out/i.test(r.error || '')
    if (!retryable) return r
    console.error(`[gitFetch retry] attempt ${attempt} failed (${r.error}); retrying in 800ms`)
    await new Promise((res) => setTimeout(res, 800))
  }
  return { ok: false, error: 'unreachable' }
}

// ── Auth middleware ──
function checkAuth(req, res) {
  if (!API_KEY) return true // no key configured = open access
  const auth = req.headers['authorization']
  if (auth === `Bearer ${API_KEY}`) return true
  json(res, 401, { error: 'Unauthorized' })
  return false
}

// ── Route handlers ──
const routes = {}

// Health check (public, no auth)
routes['GET /health'] = (_req, res) => {
  json(res, 200, { status: 'ok', platform: 'hermes-mgmt', port: PORT })
}

// Hermes Agent version
routes['GET /version'] = async (_req, res) => {
  // Strategy 1: hermes --version binary
  const result = await exec(HERMES_BIN, ['--version'])
  if (result.ok) {
    const match = result.stdout.match(/v([\d.]+)\s*\(([^)]+)\)/)
    return json(res, 200, {
      ok: true,
      version: match ? match[1] : result.stdout,
      date: match ? match[2] : undefined,
    })
  }
  // Strategy 2: read version from pyproject.toml or __init__.py
  try {
    const pyproject = fs.readFileSync(path.join(HERMES_REPO, 'pyproject.toml'), 'utf-8')
    const verMatch = pyproject.match(/^version\s*=\s*"([^"]+)"/m)
    if (verMatch) {
      return json(res, 200, { ok: true, version: verMatch[1], date: undefined })
    }
  } catch { /* fall through */ }
  // Strategy 3: git describe
  const gitResult = await exec('git', ['-C', HERMES_REPO, 'describe', '--tags', '--always', 'HEAD'])
  if (gitResult.ok) {
    return json(res, 200, { ok: true, version: gitResult.stdout, date: undefined })
  }
  json(res, 500, { ok: false, error: result.error })
}

// Check for updates (git fetch + compare tags)
routes['GET /check-update'] = async (_req, res) => {
  const result = await withGitLock(async () => {
    const fetchResult = await gitFetchWithRetry(HERMES_REPO, 45000)
    if (!fetchResult.ok) return { ok: false, error: 'git fetch failed: ' + fetchResult.error }

    const tagsResult = await exec('git', ['-C', HERMES_REPO, 'tag', '--sort=-creatordate'])
    if (!tagsResult.ok) return { ok: false, error: tagsResult.error }

    const tags = tagsResult.stdout.split('\n').filter(Boolean)
    const latest = tags[0] || ''

    if (!latest) return { ok: true, current: 'dev', latest: '', updateAvailable: false }

    const headTs = await exec('git', ['-C', HERMES_REPO, 'log', '-1', '--format=%ct', 'HEAD'])
    const tagTs = await exec('git', ['-C', HERMES_REPO, 'log', '-1', '--format=%ct', latest])
    const headTime = parseInt(headTs.stdout || '0', 10)
    const tagTime = parseInt(tagTs.stdout || '0', 10)
    const updateAvailable = tagTime > headTime

    const descResult = await exec('git', ['-C', HERMES_REPO, 'describe', '--tags', '--always', 'HEAD'])
    const current = descResult.stdout || 'dev'

    return { ok: true, current, latest, updateAvailable }
  })
  json(res, result.ok ? 200 : 500, result)
}

// Perform update (git fetch + checkout latest tag)
routes['POST /update'] = async (_req, res) => {
  const result = await withGitLock(async () => {
    // Auto-stash local changes (e.g. package-lock.json) so checkout can proceed.
    // Silent failure is fine: if nothing to stash, git returns non-zero but that's OK.
    await exec('git', [
      '-C', HERMES_REPO, 'stash', 'push', '--include-untracked',
      '-m', `hermes-mgmt-auto-stash-${Date.now()}`,
    ], { timeout: 10000 })

    // Fetch latest (60s timeout + auto retry on transient failure)
    const fetchResult = await gitFetchWithRetry(HERMES_REPO, 60000)
    if (!fetchResult.ok) return { ok: false, error: 'fetch failed: ' + fetchResult.error }

    // Get latest tag
    const tagsResult = await exec('git', ['-C', HERMES_REPO, 'tag', '--sort=-creatordate'])
    const latest = (tagsResult.stdout || '').split('\n').filter(Boolean)[0]
    if (!latest) return { ok: false, error: 'no tags found' }

    // Already on latest? No-op success.
    // NOTE: annotated tags have their own object SHA — use `tag^{commit}` to dereference
    // to the underlying commit so comparison against HEAD works.
    const head = await exec('git', ['-C', HERMES_REPO, 'rev-parse', 'HEAD'])
    const tagRev = await exec('git', ['-C', HERMES_REPO, 'rev-parse', `${latest}^{commit}`])
    if (head.ok && tagRev.ok && head.stdout === tagRev.stdout) {
      return { ok: true, version: latest, alreadyUpToDate: true }
    }

    // Checkout latest tag
    const coResult = await exec('git', ['-C', HERMES_REPO, 'checkout', latest], { timeout: 30000 })
    if (!coResult.ok) return { ok: false, error: 'checkout failed: ' + coResult.error }

    return { ok: true, version: latest }
  })
  json(res, result.ok ? 200 : 500, result)
}

// Read config.yaml
routes['GET /config/yaml'] = (_req, res) => {
  try {
    const content = fs.readFileSync(CONFIG_YAML, 'utf-8')
    json(res, 200, { ok: true, content })
  } catch (e) {
    if (e.code === 'ENOENT') json(res, 200, { ok: true, content: '', notFound: true })
    else json(res, 500, { ok: false, error: e.message })
  }
}

// Write config.yaml
routes['PUT /config/yaml'] = async (req, res) => {
  try {
    const body = JSON.parse(await readBody(req))
    fs.writeFileSync(CONFIG_YAML, body.content, 'utf-8')
    json(res, 200, { ok: true })
  } catch (e) {
    json(res, 500, { ok: false, error: e.message })
  }
}

// Read .env
routes['GET /config/env'] = (_req, res) => {
  try {
    const content = fs.readFileSync(ENV_FILE, 'utf-8')
    json(res, 200, { ok: true, content })
  } catch (e) {
    if (e.code === 'ENOENT') json(res, 200, { ok: true, content: '', notFound: true })
    else json(res, 500, { ok: false, error: e.message })
  }
}

// Write .env
routes['PUT /config/env'] = async (req, res) => {
  try {
    const body = JSON.parse(await readBody(req))
    fs.writeFileSync(ENV_FILE, body.content, 'utf-8')
    // Reload API key after .env change
    API_KEY = loadApiKey()
    json(res, 200, { ok: true })
  } catch (e) {
    json(res, 500, { ok: false, error: e.message })
  }
}

// Restart Hermes Agent (macOS launchd)
routes['POST /restart'] = async (_req, res) => {
  const uid = process.getuid ? process.getuid() : 501
  const result = await exec('launchctl', ['kickstart', '-k', `gui/${uid}/ai.hermes.gateway`])
  if (!result.ok) return json(res, 500, { ok: false, error: result.error })
  json(res, 200, { ok: true })
}

// ── Desktop conversation sync ──
const CONVERSATIONS_FILE = path.join(HERMES_DIR, 'desktop-conversations.json')

// Read conversations
routes['GET /conversations'] = (_req, res) => {
  try {
    if (!fs.existsSync(CONVERSATIONS_FILE)) {
      return json(res, 200, { ok: true, data: null })
    }
    const content = fs.readFileSync(CONVERSATIONS_FILE, 'utf-8')
    const data = JSON.parse(content)
    json(res, 200, { ok: true, data })
  } catch (e) {
    json(res, 500, { ok: false, error: e.message })
  }
}

// Write conversations
routes['PUT /conversations'] = async (req, res) => {
  try {
    const body = JSON.parse(await readBody(req))
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(body.data, null, 2), 'utf-8')
    json(res, 200, { ok: true })
  } catch (e) {
    json(res, 500, { ok: false, error: e.message })
  }
}

// ── Server ──
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    return res.end()
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const routeKey = `${req.method} ${url.pathname}`

  // Health is public
  if (routeKey === 'GET /health') return routes[routeKey](req, res)

  // All other routes require auth
  if (!checkAuth(req, res)) return

  const handler = routes[routeKey]
  if (!handler) return json(res, 404, { error: 'Not found' })

  try {
    await handler(req, res)
  } catch (e) {
    json(res, 500, { error: e.message })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hermes Management API listening on 0.0.0.0:${PORT}`)
  console.log(`Auth: ${API_KEY ? 'Bearer token (from .env)' : 'OPEN (no API_SERVER_KEY)'}`)
})
