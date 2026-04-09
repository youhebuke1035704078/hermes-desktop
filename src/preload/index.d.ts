import { ElectronAPI } from '@electron-toolkit/preload'

interface OpenClawAPI {
  getServers(): Promise<Array<{ id: string; name: string; url: string; username: string }>>
  saveServer(server: {
    id: string
    name: string
    url: string
    username: string
    password: string
  }): Promise<void>
  removeServer(id: string): Promise<void>
  decryptPassword(id: string): Promise<string | null>
  isEncryptionAvailable(): Promise<boolean>
  minimize(): void
  maximize(): void
  close(): void
  notify(title: string, body: string): void
  notifyAlert(opts: {
    title: string
    body: string
    severity?: 'critical' | 'warning' | 'info'
    silent?: boolean
  }): void
  setBadge(count: number): void
  clearBadge(): void
  onNavigate(callback: (path: string) => void): () => void
  getVersion(): Promise<string>
  npmVersions(): Promise<{ ok: boolean; versions: string[]; error?: string }>
  npmUpdate(version: string): Promise<{ ok: boolean; message?: string; error?: string }>

  // WebSocket bridge
  wsConnect(url: string, origin?: string): Promise<void>
  wsSend(data: string): void
  wsClose(code?: number, reason?: string): void
  onWsOpen(cb: () => void): () => void
  onWsMessage(cb: (data: string) => void): () => void
  onWsClose(cb: (code: number, reason: string) => void): () => void
  onWsError(cb: (error: string) => void): () => void

  // HTTP proxy
  httpFetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; ok: boolean; body: string }>

  // Backup system
  backupList(): Promise<{ ok: boolean; backups: Array<{ filename: string; size: number; createdAt: string; date: string }>; error?: string }>
  backupCreate(): Promise<{ ok: boolean; filename?: string; size?: number; error?: string }>
  backupDelete(filename: string): Promise<{ ok: boolean; error?: string }>
  backupDownload(filename: string): Promise<{ ok: boolean; error?: string }>
  backupRestore(filename: string): Promise<{ ok: boolean; error?: string }>
  backupUpload(): Promise<{ ok: boolean; filename?: string; size?: number; error?: string }>
  onBackupProgress(cb: (data: { progress: number; message: string; status: string }) => void): () => void

  // Local filesystem
  fsReaddir(dirPath: string): Promise<{
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
  }>
  fsReadFile(filePath: string, encoding?: string): Promise<{
    ok: boolean
    content?: string
    encoding?: string
    name?: string
    size?: number
    error?: string
  }>

  // App auto-updater
  updaterCheck(): Promise<{ ok: boolean; version?: string; error?: string }>
  updaterDownload(): Promise<{ ok: boolean; error?: string }>
  updaterInstall(): void
  onUpdaterStatus(cb: (data: {
    event: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error'
    version?: string
    releaseDate?: string
    percent?: number
    bytesPerSecond?: number
    transferred?: number
    total?: number
    error?: string
  }) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: OpenClawAPI
  }
}
