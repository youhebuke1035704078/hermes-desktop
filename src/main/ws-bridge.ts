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
import { appendFileSync } from 'fs'

function dbg(...args: unknown[]) {
  const line = '[ws-bridge] ' + args.map(String).join(' ') + '\n'
  process.stderr.write(line)
  try { appendFileSync('/tmp/ws-bridge.log', new Date().toISOString() + ' ' + line) } catch { /* */ }
}

let ws: WebSocket | null = null

export function registerWsBridge(): void {
  ipcMain.handle('ws:connect', (event, url: string, origin?: string) => {
    dbg('ws:connect called, url =', url, 'origin =', origin)
    // Tear down previous connection
    if (ws) {
      try { ws.removeAllListeners(); ws.close() } catch { /* */ }
      ws = null
    }

    // Forward the renderer's own Origin so the gateway's allowedOrigins
    // check sees the same value it would from a normal browser connection.
    const headers: Record<string, string> = {}
    if (origin) headers['Origin'] = origin

    ws = new WebSocket(url, { headers })

    const sender: WebContents = event.sender

    ws.on('open', () => {
      dbg('WebSocket opened')
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
      dbg('close, code =', code, 'reason =', reason.toString())
      if (!sender.isDestroyed()) sender.send('ws:close', code, reason.toString())
    })

    ws.on('error', (err: Error) => {
      dbg('WebSocket error:', err.message)
      if (!sender.isDestroyed()) sender.send('ws:error', err.message)
    })
  })

  ipcMain.on('ws:send', (_event, data: string) => {
    dbg('ws:send, len =', data.length, 'preview:', data.substring(0, 120))
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    } else {
      dbg('ws:send DROPPED, readyState =', ws?.readyState)
    }
  })

  ipcMain.on('ws:close', (_event, code?: number, reason?: string) => {
    if (ws) {
      try { ws.removeAllListeners(); ws.close(code, reason) } catch { /* */ }
      ws = null
    }
  })
}
