import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getServers: (): Promise<
    Array<{ id: string; name: string; url: string; username: string }>
  > => ipcRenderer.invoke('store:getServers'),

  saveServer: (server: {
    id: string
    name: string
    url: string
    username: string
    password: string
  }): Promise<void> => ipcRenderer.invoke('store:saveServer', server),

  removeServer: (id: string): Promise<void> => ipcRenderer.invoke('store:removeServer', id),

  decryptPassword: (id: string): Promise<string | null> =>
    ipcRenderer.invoke('store:decryptPassword', id),

  isEncryptionAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('store:isEncryptionAvailable'),

  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  close: (): void => ipcRenderer.send('window:close'),

  notify: (title: string, body: string): void => ipcRenderer.send('notify', title, body),

  notifyAlert: (opts: {
    title: string
    body: string
    severity?: 'critical' | 'warning' | 'info'
    silent?: boolean
  }): void => ipcRenderer.send('notify:alert', opts),

  setBadge: (count: number): void => ipcRenderer.send('badge:set', count),
  clearBadge: (): void => ipcRenderer.send('badge:clear'),

  /** Listen for navigation events from main process (e.g. notification click) */
  onNavigate: (callback: (path: string) => void): (() => void) => {
    const handler = (_: any, path: string) => callback(path)
    ipcRenderer.on('navigate', handler)
    return () => ipcRenderer.removeListener('navigate', handler)
  },

  // ── WebSocket bridge (main-process WS with custom Origin) ──
  wsConnect: (url: string, origin?: string): Promise<void> => ipcRenderer.invoke('ws:connect', url, origin),
  wsSend: (data: string): void => { ipcRenderer.send('ws:send', data) },
  wsClose: (code?: number, reason?: string): void => { ipcRenderer.send('ws:close', code, reason) },
  onWsOpen: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('ws:open', handler)
    return () => { ipcRenderer.removeListener('ws:open', handler) }
  },
  onWsMessage: (cb: (data: string) => void): (() => void) => {
    const handler = (_: unknown, data: string) => cb(data)
    ipcRenderer.on('ws:message', handler)
    return () => { ipcRenderer.removeListener('ws:message', handler) }
  },
  onWsClose: (cb: (code: number, reason: string) => void): (() => void) => {
    const handler = (_: unknown, code: number, reason: string) => cb(code, reason)
    ipcRenderer.on('ws:close', handler)
    return () => { ipcRenderer.removeListener('ws:close', handler) }
  },
  onWsError: (cb: (error: string) => void): (() => void) => {
    const handler = (_: unknown, error: string) => cb(error)
    ipcRenderer.on('ws:error', handler)
    return () => { ipcRenderer.removeListener('ws:error', handler) }
  },

  // ── HTTP proxy (main-process fetch, no CORS) ──
  httpFetch: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; ok: boolean; body: string }> =>
    ipcRenderer.invoke('http:fetch', url, init),

  // ── Hermes config (read ~/.hermes/config.yaml for actual model name) ──
  hermesConfig: (): Promise<{
    ok: boolean
    model: string | null
    fullModel: string | null
    provider: string | null
    primary: string | null
    fallback_chain: string[]
  }> => ipcRenderer.invoke('hermes:config'),

  // ── Hermes streaming chat (SSE via main-process) ──
  hermesChat: (url: string, body: string, authToken?: string, sessionId?: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('hermes:chat', url, body, authToken, sessionId),
  onHermesChatChunk: (cb: (chunk: { done: boolean; data?: any }) => void): (() => void) => {
    const handler = (_: unknown, chunk: { done: boolean; data?: any }) => cb(chunk)
    ipcRenderer.on('hermes:chat:chunk', handler)
    return () => ipcRenderer.removeListener('hermes:chat:chunk', handler)
  },
  /**
   * Subscribe to hermes.model.* lifecycle events streamed from the main
   * process. The callback receives `{ name, payload }` frames exactly as
   * emitted by hermes-agent's B1 SSE relay.
   */
  onHermesLifecycle: (
    cb: (event: { name: string; payload: unknown }) => void
  ): (() => void) => {
    const handler = (_: unknown, event: { name: string; payload: unknown }): void => cb(event)
    ipcRenderer.on('hermes:lifecycle', handler)
    return () => ipcRenderer.removeListener('hermes:lifecycle', handler)
  },

  // ── Skill management ──
  hermesSkills: (): Promise<any> => ipcRenderer.invoke('hermes:skills'),
  hermesSkillsConfig: (action: string, payload: any): Promise<any> =>
    ipcRenderer.invoke('hermes:skills:config', action, payload),

  // ── Backup system ──
  backupList: (): Promise<{ ok: boolean; backups: Array<{ filename: string; size: number; createdAt: string; date: string }>; error?: string }> =>
    ipcRenderer.invoke('backup:list'),
  backupCreate: (): Promise<{ ok: boolean; filename?: string; size?: number; error?: string }> =>
    ipcRenderer.invoke('backup:create'),
  backupDelete: (filename: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('backup:delete', filename),
  backupDownload: (filename: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('backup:download', filename),
  backupRestore: (filename: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('backup:restore', filename),
  backupUpload: (): Promise<{ ok: boolean; filename?: string; size?: number; error?: string }> =>
    ipcRenderer.invoke('backup:upload'),
  onBackupProgress: (cb: (data: { progress: number; message: string; status: string }) => void): (() => void) => {
    const handler = (_: unknown, data: { progress: number; message: string; status: string }) => cb(data)
    ipcRenderer.on('backup:progress', handler)
    return () => ipcRenderer.removeListener('backup:progress', handler)
  },

  // ── Local filesystem browsing ──
  fsReaddir: (dirPath: string): Promise<{
    ok: boolean
    entries: Array<{
      name: string
      path: string
      type: 'file' | 'directory'
      size?: number
      mtimeMs?: number
      extension?: string
    }>
    error?: string
  }> => ipcRenderer.invoke('fs:readdir', dirPath),

  fsReadFile: (filePath: string, encoding?: string): Promise<{
    ok: boolean
    content?: string
    encoding?: string
    name?: string
    size?: number
    error?: string
  }> => ipcRenderer.invoke('fs:readFile', filePath, encoding),

  fsWriteFile: (filePath: string, content: string): Promise<{
    ok: boolean
    error?: string
  }> => ipcRenderer.invoke('fs:writeFile', filePath, content),

  hermesRestart: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('hermes:restart'),
  hermesVersion: (): Promise<{ ok: boolean; version?: string; date?: string; error?: string }> =>
    ipcRenderer.invoke('hermes:version'),
  hermesCheckUpdate: (): Promise<{ ok: boolean; current?: string; latest?: string; updateAvailable?: boolean; error?: string }> =>
    ipcRenderer.invoke('hermes:checkUpdate'),
  hermesUpdate: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('hermes:update'),
  onHermesUpdateProgress: (cb: (data: string) => void): (() => void) => {
    const handler = (_: unknown, data: string) => cb(data)
    ipcRenderer.on('hermes:update:progress', handler)
    return () => ipcRenderer.removeListener('hermes:update:progress', handler)
  },

  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getHomedir: (): Promise<string> => ipcRenderer.invoke('app:homedir'),

  // ── App auto-updater ──
  updaterCheck: (): Promise<{ ok: boolean; version?: string; error?: string }> =>
    ipcRenderer.invoke('updater:check'),
  updaterDownload: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('updater:download'),
  updaterInstall: (): void => { ipcRenderer.invoke('updater:install') },
  onUpdaterStatus: (cb: (data: {
    event: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error'
    version?: string
    releaseDate?: string
    percent?: number
    bytesPerSecond?: number
    transferred?: number
    total?: number
    error?: string
  }) => void): (() => void) => {
    const handler = (_: unknown, data: any) => cb(data)
    ipcRenderer.on('updater:status', handler)
    return () => ipcRenderer.removeListener('updater:status', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
