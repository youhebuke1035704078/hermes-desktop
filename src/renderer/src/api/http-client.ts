/**
 * ApiClient — Native WebSocket client for Hermes Gateway protocol v3.
 *
 * Connection flow:
 *   1. Open WebSocket to ws(s)://<host>/
 *   2. Receive {type:"event", event:"connect.challenge", payload:{nonce,ts}}
 *   3. Send   {type:"req", id, method:"connect", params:{minProtocol:3, maxProtocol:3, client:{…}, auth:{token}, …}}
 *   4. Receive {type:"res", id, ok:true, payload:{type:"hello-ok", protocol:3, server:{version,connId}, features:{methods,events}, …}}
 *   5. After hello-ok, RPC calls are JSON-RPC request/response frames over the same socket.
 */
import { ConnectionState, type RPCEvent } from './types'

// ─── Electron IPC WebSocket bridge ──────────────────────────────────
// Browser WebSocket cannot set custom Origin headers, causing the gateway to
// reject connections from the Electron dev-server origin.  This thin wrapper
// creates the real WebSocket in the main process (via IPC) where the Origin
// header is set to the gateway's own address.

interface WsBridgeApi {
  wsConnect(url: string, origin?: string): Promise<void>
  wsSend(data: string): void
  wsClose(code?: number, reason?: string): void
  onWsOpen(cb: () => void): () => void
  onWsMessage(cb: (data: string) => void): () => void
  onWsClose(cb: (code: number, reason: string) => void): () => void
  onWsError(cb: (error: string) => void): () => void
}

function getWsBridge(): WsBridgeApi | null {
  return (window as unknown as { api?: WsBridgeApi }).api ?? null
}

/**
 * Drop-in replacement for the browser `WebSocket` that routes through
 * Electron's main process so we can set the Origin header.
 */
class BridgedWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = BridgedWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((evt: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((evt: { code: number; reason: string }) => void) | null = null

  private cleanups: Array<() => void> = []

  constructor(url: string) {
    const api = getWsBridge()!

    this.cleanups.push(api.onWsOpen(() => {
      this.readyState = BridgedWebSocket.OPEN
      this.onopen?.()
    }))

    this.cleanups.push(api.onWsMessage((data: string) => {
      this.onmessage?.({ data })
    }))

    this.cleanups.push(api.onWsClose((code: number, reason: string) => {
      this.readyState = BridgedWebSocket.CLOSED
      this.onclose?.({ code, reason })
      this.dispose()
    }))

    this.cleanups.push(api.onWsError(() => {
      this.onerror?.()
    }))

    // Derive the Origin from the gateway URL so the gateway's
    // allowedOrigins check accepts it (renderer origin is file:// in production)
    try {
      const parsed = new URL(url)
      const gatewayOrigin = `http${parsed.protocol === 'wss:' ? 's' : ''}://${parsed.host}`
      api.wsConnect(url, gatewayOrigin)
    } catch {
      api.wsConnect(url, window.location.origin)
    }
  }

  send(data: string): void {
    getWsBridge()?.wsSend(data)
  }

  close(code?: number, reason?: string): void {
    this.readyState = BridgedWebSocket.CLOSING
    getWsBridge()?.wsClose(code, reason)
    this.dispose()
  }

  private dispose(): void {
    this.cleanups.forEach((fn) => fn())
    this.cleanups = []
  }
}

type EventHandler = (...args: unknown[]) => void

export interface ApiClientConfig {
  baseUrl?: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
  getToken?: () => string | null
  onUnauthorized?: () => void
}

const DEFAULT_CONFIG: Required<Omit<ApiClientConfig, 'onUnauthorized'>> & { onUnauthorized?: () => void } = {
  baseUrl: '',
  reconnectInterval: 3000,
  maxReconnectAttempts: 20,
  getToken: () => null,
  onUnauthorized: undefined,
}

let requestCounter = 0
function nextReqId(): string {
  return `rpc-${++requestCounter}-${Date.now()}`
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class ApiClient {
  private config: Required<Omit<ApiClientConfig, 'onUnauthorized'>> & { onUnauthorized?: () => void }
  private listeners = new Map<string, Set<EventHandler>>()
  private ws: WebSocket | BridgedWebSocket | null = null
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _state: ConnectionState = ConnectionState.DISCONNECTED
  private pendingRequests = new Map<string, PendingRequest>()
  private handshakeCompleted = false

  get state(): ConnectionState {
    return this._state
  }

  constructor(config?: Partial<ApiClientConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  connect(): void {
    // Tear down any prior socket + pending reconnect timer before starting a
    // new connection. Without this, calling connect() while a reconnect is
    // pending — or while an old socket is still draining — leaks the old
    // BridgedWebSocket (its IPC listeners remain alive) and races the new
    // connection for every inbound frame.
    this.clearTimers()
    if (this.ws) {
      try { this.ws.close(1000, 'client reconnect') } catch { /* */ }
      this.ws = null
    }
    this.rejectAllPending('Reconnecting')
    this._state = ConnectionState.CONNECTING
    this.emit('stateChange', ConnectionState.CONNECTING)
    this.reconnectAttempts = 0
    this.handshakeCompleted = false
    this.openWebSocket()
  }

  disconnect(): void {
    this.clearTimers()
    this.handshakeCompleted = false
    this._state = ConnectionState.DISCONNECTED
    this.rejectAllPending('Disconnected')
    if (this.ws) {
      try { this.ws.close(1000, 'client disconnect') } catch { /* */ }
      this.ws = null
    }
    this.emit('stateChange', ConnectionState.DISCONNECTED)
  }

  // ─── WebSocket lifecycle ───────────────────────────────────────────

  /** Convert http(s) base URL to ws(s) URL */
  private toWsUrl(): string {
    const base = this.config.baseUrl || window.location.origin
    return base.replace(/^http/, 'ws').replace(/\/$/, '')
  }

  private openWebSocket(): void {
    try {
      const url = this.toWsUrl()

      // Prefer the Electron IPC bridge (main-process WS with custom Origin)
      // so the gateway's allowedOrigins check passes.
      const bridge = getWsBridge()
      if (bridge && typeof bridge.wsConnect === 'function') {
        const bws = new BridgedWebSocket(url)
        this.ws = bws

        bws.onopen = () => {
          console.log('[ApiClient] WebSocket opened (bridged), awaiting connect.challenge…')
          this.reconnectAttempts = 0
        }

        bws.onmessage = (evt) => {
          this.handleFrame(evt.data)
        }

        bws.onerror = () => {
          // No useful info; onclose fires next
        }

        bws.onclose = (evt) => {
          this.handleClose(evt.code, evt.reason)
        }
      } else {
        // Fallback: plain browser WebSocket (works when Origin is already allowed)
        this.ws = new WebSocket(url)

        this.ws.onopen = () => {
          console.log('[ApiClient] WebSocket opened, awaiting connect.challenge…')
          this.reconnectAttempts = 0
        }

        this.ws.onmessage = (evt: MessageEvent) => {
          this.handleFrame(evt.data as string)
        }

        this.ws.onerror = () => {
          // No useful info; onclose fires next
        }

        this.ws.onclose = (evt: CloseEvent) => {
          this.handleClose(evt.code, evt.reason)
        }
      }
    } catch (e) {
      console.error('[ApiClient] Failed to create WebSocket:', e)
      this.scheduleReconnect()
    }
  }

  // ─── Frame routing ─────────────────────────────────────────────────

  private handleFrame(raw: string): void {
    let frame: Record<string, unknown>
    try {
      frame = JSON.parse(raw)
    } catch {
      console.error('[ApiClient] Unparseable frame')
      return
    }

    switch (frame.type) {
      case 'event':
        this.handleEventFrame(frame as unknown as { type: 'event'; event: string; payload: unknown; seq?: number })
        break
      case 'res':
        this.handleResponseFrame(frame as unknown as {
          type: 'res'; id: string; ok: boolean; payload?: unknown
          error?: { message: string; code?: string | number; details?: unknown }
        })
        break
      default:
        console.warn('[ApiClient] Unknown frame type:', frame.type)
    }
  }

  private handleEventFrame(frame: { type: 'event'; event: string; payload: unknown; seq?: number }): void {
    if (frame.event === 'connect.challenge') {
      console.log('[ApiClient] Got connect.challenge, sending handshake…')
      this.sendConnectHandshake()
      return
    }

    // Forward all other events to listeners
    queueMicrotask(() => {
      const evt: RPCEvent = { type: 'event', event: frame.event, payload: frame.payload }
      if (frame.seq !== undefined) evt.seq = frame.seq
      this.emit('event', evt)
      this.emit(`event:${frame.event}`, frame.payload)
    })
  }

  private handleResponseFrame(frame: {
    type: 'res'; id: string; ok: boolean; payload?: unknown
    error?: { message: string; code?: string | number; details?: unknown }
  }): void {
    const pending = this.pendingRequests.get(frame.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pendingRequests.delete(frame.id)

    if (frame.ok) {
      pending.resolve(frame.payload)
    } else {
      pending.reject(new Error(frame.error?.message || 'RPC error'))
    }
  }

  // ─── Protocol v3 connect handshake ─────────────────────────────────

  private sendConnectHandshake(): void {
    const token = this.config.getToken?.()

    const params: Record<string, unknown> = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'hermes-desktop',
        displayName: 'Hermes Desktop',
        version: __APP_VERSION__,
        platform: this.detectPlatform(),
        mode: 'ui',
      },
      role: 'operator',
      scopes: ['operator.admin'],
      caps: ['tool-events'],
    }

    if (token) {
      params.auth = { token }
    }

    this.sendRequest('connect', params)
      .then((helloOk) => {
        this.handshakeCompleted = true
        this._state = ConnectionState.CONNECTED
        this.emit('stateChange', ConnectionState.CONNECTED)

        // Reshape payload so the store can read `version` at top level
        const row = (helloOk ?? {}) as Record<string, unknown>
        const server = (row.server ?? {}) as Record<string, unknown>
        this.emit('connected', { ...row, version: server.version })
        console.log('[ApiClient] Connected — gateway', server.version)
      })
      .catch((err: Error) => {
        console.error('[ApiClient] Handshake failed:', err.message)
        if (/auth|unauthorized|forbidden|token/i.test(err.message)) {
          try { this.config.onUnauthorized?.() } catch { /* */ }
        }
        this._state = ConnectionState.FAILED
        this.emit('stateChange', ConnectionState.FAILED)
        this.emit('failed', err.message)
        // Reject any other pending requests synchronously — don't rely on
        // `ws.close()` → `handleClose` to do it, since close() can silently
        // no-op on already-closed sockets and leave callers hung.
        this.rejectAllPending('handshake failed')
        try { this.ws?.close(1008, 'handshake failed') } catch { /* */ }
      })
  }

  private detectPlatform(): string {
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('mac')) return 'macos'
    if (ua.includes('win')) return 'windows'
    if (ua.includes('linux')) return 'linux'
    return 'electron'
  }

  // ─── Low-level request / response ──────────────────────────────────

  private sendRequest(method: string, params?: unknown, timeoutMs = 30_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const OPEN = 1  // WebSocket.OPEN === BridgedWebSocket.OPEN === 1
      if (!this.ws || this.ws.readyState !== OPEN) {
        reject(new Error('WebSocket not open'))
        return
      }

      const id = nextReqId()
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC timeout: ${method}`))
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timer })
      this.ws.send(JSON.stringify({ type: 'req', id, method, params }))
    })
  }

  // ─── Public API (same interface as before) ─────────────────────────

  async rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.handshakeCompleted) {
      throw new Error('Not connected to gateway')
    }
    return this.sendRequest(method, params) as Promise<T>
  }

  async health(): Promise<{ ok: boolean; gateway: string; clients: number }> {
    return {
      ok: this._state === ConnectionState.CONNECTED,
      gateway: this.handshakeCompleted ? 'connected' : 'disconnected',
      clients: 1,
    }
  }

  // ─── Reconnect ────────────────────────────────────────────────────

  private handleClose(code: number, reason: string): void {
    this.handshakeCompleted = false
    this.ws = null
    this.rejectAllPending(`Connection closed (${code}): ${reason}`)

    this.emit('disconnected', code, reason || 'WebSocket closed')

    if (this._state !== ConnectionState.DISCONNECTED && this._state !== ConnectionState.FAILED) {
      // Clear any already-scheduled reconnect before arming a new one —
      // otherwise a transient double-close can stack two `openWebSocket`
      // invocations (the old timer still fires after the new one overwrites
      // `reconnectTimer`).
      this.clearTimers()
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this._state = ConnectionState.FAILED
      this.emit('stateChange', ConnectionState.FAILED)
      this.emit('failed', 'Max reconnect attempts reached')
      return
    }

    this._state = ConnectionState.RECONNECTING
    this.emit('stateChange', ConnectionState.RECONNECTING)

    // Exponential backoff + ±20% jitter. Without jitter, N disconnected
    // clients reconnecting after a gateway restart re-converge on the same
    // retry wave and amplify load.
    const baseDelay = Math.min(
      this.config.reconnectInterval * Math.pow(1.5, this.reconnectAttempts),
      30000,
    )
    const jitterFactor = 0.8 + Math.random() * 0.4
    const delay = Math.round(baseDelay * jitterFactor)
    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.handshakeCompleted = false
      this.openWebSocket()
    }, delay)

    this.emit('reconnecting', this.reconnectAttempts, delay)
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private rejectAllPending(reason: string): void {
    this.pendingRequests.forEach(({ reject, timer }) => {
      clearTimeout(timer)
      reject(new Error(reason))
    })
    this.pendingRequests.clear()
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    return () => this.off(event, handler)
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler)
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event)
    if (!handlers || handlers.size === 0) return
    handlers.forEach((handler) => {
      try {
        handler(...args)
      } catch (e) {
        console.error(`[ApiClient] Event handler error for "${event}":`, e)
      }
    })
  }
}
