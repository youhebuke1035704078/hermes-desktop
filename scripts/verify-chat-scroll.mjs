#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outMain = path.join(repoRoot, 'out/main/index.js')
const electronBin = path.join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron'
)

if (!existsSync(outMain)) {
  throw new Error('out/main/index.js not found. Run `npm run build` before this verifier.')
}
if (!existsSync(electronBin)) {
  throw new Error('Electron binary not found. Run `npm install` first.')
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function startFakeHermesServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost:8642')
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }
    if (url.pathname === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'gpt-5.4', object: 'model' }] }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  return new Promise((resolve) => {
    server.once('error', (error) => {
      if (error?.code === 'EADDRINUSE') {
        resolve(null)
        return
      }
      throw error
    })
    server.listen(8642, '127.0.0.1', () => resolve(server))
  })
}

function buildSeedConversation() {
  const now = Date.now()
  const messages = []
  for (let i = 0; i < 80; i += 1) {
    const role = i % 2 === 0 ? 'user' : 'assistant'
    messages.push({
      id: `scroll-msg-${i}`,
      role,
      content:
        role === 'user'
          ? `用户消息 ${i + 1}: 这是一条用于验证在线对话滚动的长消息。`
          : `助手回复 ${i + 1}: 这里放多行内容来撑开真实聊天高度。\n- 第一行验证列表\n- 第二行验证滚动容器\n- 第三行验证鼠标滚轮事件`,
      timestamp: new Date(now - (80 - i) * 60_000).toISOString(),
      model: role === 'assistant' ? 'gpt-5.4' : undefined
    })
  }
  return {
    conversations: [
      {
        id: 'scroll-test-conversation',
        title: '滚动验证会话',
        messages,
        model: 'hermes-agent',
        resolvedModel: 'gpt-5.4',
        createdAt: now - 80 * 60_000,
        updatedAt: now
      }
    ],
    activeId: 'scroll-test-conversation',
    model: 'hermes-agent'
  }
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response.json()
}

async function connectToPage(port, child) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < 20_000) {
    if (child.exitCode !== null) {
      throw new Error(`Electron exited early with code ${child.exitCode}`)
    }
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`)
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
      if (page) {
        return new CdpClient(page.webSocketDebuggerUrl)
      }
    } catch (error) {
      lastError = error
    }
    await wait(250)
  }
  throw new Error(`Timed out waiting for Electron CDP page: ${lastError?.message || 'unknown'}`)
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.nextId = 1
    this.pending = new Map()
    this.ws.on('message', (buffer) => {
      const message = JSON.parse(buffer.toString())
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)))
      } else {
        pending.resolve(message.result)
      }
    })
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve)
      this.ws.once('error', reject)
    })
  }

  async send(method, params = {}) {
    await this.ready()
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    this.ws.send(payload)
    return result
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
    }
    return result.result?.value
  }

  close() {
    this.ws.close()
  }
}

async function waitFor(cdp, expression, timeoutMs, label) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = await cdp.evaluate(expression)
    if (value) return value
    await wait(200)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function main() {
  const fakeServer = await startFakeHermesServer()
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'hermes-scroll-'))
  const port = 9333 + Math.floor(Math.random() * 400)
  const child = spawn(
    electronBin,
    [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, outMain],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1',
        HERMES_DESKTOP_SCROLL_TEST: '1',
        HERMES_DESKTOP_TEST_WIDTH: '2560',
        HERMES_DESKTOP_TEST_HEIGHT: '1600'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  let stderr = ''
  child.stdout.on('data', (chunk) => process.stdout.write(chunk))
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString()
    process.stderr.write(chunk)
  })

  let cdp
  try {
    cdp = await connectToPage(port, child)
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    try {
      const { windowId } = await cdp.send('Browser.getWindowForTarget')
      await cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds: { left: 0, top: 0, width: 2560, height: 1600, windowState: 'normal' }
      })
    } catch {
      // Browser window sizing is best-effort in Electron/CDP.
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 2560,
      height: 1600,
      deviceScaleFactor: 1,
      mobile: false
    })

    const seed = JSON.stringify(buildSeedConversation())
    await waitFor(cdp, 'document.readyState === "complete"', 15_000, 'document ready')
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
      localStorage.setItem('hermes_conversations', ${JSON.stringify(seed)});
      localStorage.setItem('hermes_chat_disable_server_sync_v1', '1');
      localStorage.setItem('hermes_chat_selected_session_v1', 'main');
      localStorage.setItem('theme', 'dark');
      location.hash = '#/connection';
      `
    })
    await cdp.send('Page.reload', { ignoreCache: true })

    await waitFor(cdp, 'document.readyState === "complete"', 15_000, 'document reload')
    await waitFor(cdp, 'location.hash.includes("/chat")', 20_000, 'chat route')
    try {
      await waitFor(
        cdp,
        'document.querySelector(".chat-transcript") && document.querySelectorAll(".chat-bubble").length >= 70',
        20_000,
        'chat transcript with seeded messages'
      )
    } catch (error) {
      const diagnostics = await cdp.evaluate(`
        (() => ({
          hash: location.hash,
          title: document.title,
          bodyText: document.body?.innerText?.slice(0, 1200) || '',
          hasTranscript: Boolean(document.querySelector('.chat-transcript')),
          bubbleCount: document.querySelectorAll('.chat-bubble').length,
          storageLength: localStorage.getItem('hermes_conversations')?.length || 0,
          storageHead: localStorage.getItem('hermes_conversations')?.slice(0, 220) || ''
        }))()
      `)
      throw new Error(`${error.message}\nDiagnostics: ${JSON.stringify(diagnostics, null, 2)}`)
    }

    const before = await cdp.evaluate(`
      (() => {
        const el = document.querySelector('.chat-transcript');
        const rect = el.getBoundingClientRect();
        el.scrollTop = el.scrollHeight;
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          bubbleCount: document.querySelectorAll('.chat-bubble').length,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          scrollTop: el.scrollTop,
          overflowY: getComputedStyle(el).overflowY,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        };
      })()
    `)

    if (!before || before.scrollHeight <= before.clientHeight + 20) {
      const chain = await cdp.evaluate(`
        (() => {
          const rows = []
          let el = document.querySelector('.chat-transcript')
          while (el && rows.length < 12) {
            const rect = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            rows.push({
              tag: el.tagName,
              className: el.className,
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              clientHeight: el.clientHeight,
              scrollHeight: el.scrollHeight,
              overflowY: style.overflowY,
              display: style.display,
              height: style.height,
              minHeight: style.minHeight,
              maxHeight: style.maxHeight,
              flex: style.flex,
              gridTemplateRows: style.gridTemplateRows
            })
            el = el.parentElement
          }
          return rows
        })()
      `)
      throw new Error(`Transcript is not scrollable: ${JSON.stringify(before)}\nChain: ${JSON.stringify(chain, null, 2)}`)
    }

    const transcriptX = Math.round(before.rect.x + before.rect.width / 2)
    const transcriptY = Math.round(before.rect.y + Math.min(before.rect.height / 2, 420))
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: transcriptX,
      y: transcriptY,
      deltaX: 0,
      deltaY: -900,
      modifiers: 0
    })
    await wait(350)

    const afterWheel = await cdp.evaluate(`
      (() => {
        const el = document.querySelector('.chat-transcript');
        return {
          scrollTop: el.scrollTop,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          autoFollowText: document.querySelector('.chat-thread-title')?.innerText || ''
        };
      })()
    `)

    if (!(afterWheel.scrollTop < before.scrollTop - 100)) {
      throw new Error(
        `Wheel did not move transcript upward. before=${JSON.stringify(before)} after=${JSON.stringify(afterWheel)}`
      )
    }

    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: transcriptX,
      y: transcriptY,
      deltaX: 0,
      deltaY: 900,
      modifiers: 0
    })
    await wait(350)

    const afterDown = await cdp.evaluate(`
      (() => {
        const el = document.querySelector('.chat-transcript');
        return { scrollTop: el.scrollTop, maxTop: el.scrollHeight - el.clientHeight };
      })()
    `)

    if (!(afterDown.scrollTop > afterWheel.scrollTop + 100)) {
      throw new Error(
        `Wheel did not move transcript downward. afterWheel=${JSON.stringify(afterWheel)} afterDown=${JSON.stringify(afterDown)}`
      )
    }

    const composeSynthetic = await cdp.evaluate(`
      (() => {
        const el = document.querySelector('.chat-transcript');
        const compose = document.querySelector('.chat-compose-card');
        el.scrollTop = el.scrollHeight;
        const beforeTop = el.scrollTop;
        compose.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: -900,
          deltaX: 0
        }));
        return { beforeTop, afterTop: el.scrollTop, maxTop: el.scrollHeight - el.clientHeight };
      })()
    `)

    if (!(composeSynthetic.afterTop < composeSynthetic.beforeTop - 100)) {
      throw new Error(
        `Wheel over compose card did not move transcript. result=${JSON.stringify(composeSynthetic)}`
      )
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          fakeServer: Boolean(fakeServer),
          before,
          afterWheel,
          afterDown,
          composeSynthetic
        },
        null,
        2
      )
    )
  } finally {
    cdp?.close()
    child.kill()
    if (fakeServer) await new Promise((resolve) => fakeServer.close(resolve))
    await rm(userDataDir, { recursive: true, force: true })
    if (child.exitCode !== null && child.exitCode !== 0) {
      process.stderr.write(stderr)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
