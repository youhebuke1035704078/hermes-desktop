/**
 * WebSocket bridge — creates WebSocket connections in the main process
 * so we can set custom Origin headers (browser WebSocket API cannot).
 *
 * The renderer communicates via IPC:
 *   invoke  'ws:connect'  → open a new connection
 *   send    'ws:send'     → send a message
 *   send    'ws:close'    → close the connection
 *
 * Main → Renderer events:
 *   'ws:open'    → connection opened
 *   'ws:message' → received a message
 *   'ws:close'   → connection closed  (code, reason)
 *   'ws:error'   → error              (message)
 */
import { ipcMain, type WebContents } from 'electron'
import WebSocket from 'ws'

// Debug logging: gated behind HERMES_WS_DEBUG env var so production builds don't
// flood stderr or leak JSON-RPC payload previews. The previous implementation
// unconditionally appended every message to /tmp/ws-bridge.log which (1) grew
// unbounded on macOS/Linux, (2) silently failed on Windows where /tmp doesn't
// exist, and (3) persisted fragments of auth-bearing WebSocket traffic.
const DEBUG_WS = !!process.env.HERMES_WS_DEBUG

function dbg(...args: unknown[]): void {
  if (!DEBUG_WS) return
  process.stderr.write('[ws-bridge] ' + args.map(String).join(' ') + '\n')
}

// Per-WebContents WebSocket map (keyed by webContents.id)
const wsMap = new Map<number, WebSocket>()

/** Safely close a WebSocket without throwing */
function safeClose(socket: WebSocket | null | undefined, code?: number, reason?: string): void {
  if (!socket) return
  try {
    socket.removeAllListeners()
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(code, reason)
    }
  } catch (e) {
    dbg('safeClose error (suppressed):', e)
  }
}

/** Validate that a URL uses an allowed WebSocket scheme. */
function isSafeWsUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'ws:' || u.protocol === 'wss:'
  } catch {
    return false
  }
}

/** Cleanup all open sockets on app shutdown — exported for main/index.ts to call. */
export function shutdownWsBridge(): void {
  for (const [, socket] of wsMap) {
    safeClose(socket, 1001, 'app shutting down')
  }
  wsMap.clear()
}

export function registerWsBridge(): void {
  ipcMain.handle('ws:connect', (event, url: string, origin?: string) => {
    const senderId = event.sender.id
    dbg('ws:connect called, senderId =', senderId, 'url =', url, 'origin =', origin)
    if (!isSafeWsUrl(url)) {
      dbg('ws:connect BLOCKED — invalid scheme:', url)
      if (!event.sender.isDestroyed()) {
        event.sender.send('ws:error', 'Blocked: only ws/wss URLs are allowed')
      }
      return
    }
    // Tear down previous connection for this sender
    safeClose(wsMap.get(senderId))
    wsMap.delete(senderId)

    // Forward the renderer's own Origin so the gateway's allowedOrigins
    // check sees the same value it would from a normal browser connection.
    const headers: Record<string, string> = {}
    if (origin) headers['Origin'] = origin

    const ws = new WebSocket(url, { headers })
    wsMap.set(senderId, ws)

    const sender: WebContents = event.sender

    ws.on('open', () => {
      dbg('WebSocket opened, senderId =', senderId)
      if (!sender.isDestroyed()) sender.send('ws:open')
    })

    ws.on('message', (data: WebSocket.RawData) => {
      const str = data.toString()
      dbg('message received, len =', str.length, 'preview:', str.substring(0, 120))
      if (!sender.isDestroyed()) {
        sender.send('ws:message', str)
        dbg('message forwarded to renderer')
      } else {
        dbg('sender destroyed, cannot forward')
      }
    })

    ws.on('close', (code: number, reason: Buffer) => {
      dbg('close, senderId =', senderId, 'code =', code, 'reason =', reason.toString())
      wsMap.delete(senderId)
      if (!sender.isDestroyed()) sender.send('ws:close', code, reason.toString())
    })

    ws.on('error', (err: Error) => {
      dbg('WebSocket error, senderId =', senderId, ':', err.message)
      if (!sender.isDestroyed()) sender.send('ws:error', err.message)
    })
  })

  ipcMain.on('ws:send', (event, data: string) => {
    const ws = wsMap.get(event.sender.id)
    dbg('ws:send, senderId =', event.sender.id, 'len =', data.length, 'preview:', data.substring(0, 120))
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    } else {
      dbg('ws:send DROPPED, readyState =', ws?.readyState)
    }
  })

  ipcMain.on('ws:close', (event, code?: number, reason?: string) => {
    const ws = wsMap.get(event.sender.id)
    safeClose(ws, code, reason)
    wsMap.delete(event.sender.id)
  })
}
