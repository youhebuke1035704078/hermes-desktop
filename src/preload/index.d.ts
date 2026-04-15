import { ElectronAPI } from '@electron-toolkit/preload'

interface HermesAPI {
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
  getHomedir(): Promise<string>
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

  // Hermes config (read ~/.hermes/config.yaml for actual model name +
  // fallback chain surfaced to the model-state badge)
  hermesConfig(): Promise<{
    ok: boolean
    model: string | null
    fullModel: string | null
    provider: string | null
    primary: string | null
    fallback_chain: string[]
  }>

  // Hermes streaming chat (SSE)
  hermesChat(url: string, body: string, authToken?: string, sessionId?: string): Promise<{ ok: boolean; error?: string }>
  onHermesChatChunk(cb: (chunk: { done: boolean; data?: any }) => void): () => void
  /**
   * Subscribe to hermes.model.* lifecycle events (fallback_activated,
   * primary_restored, chain_exhausted) streamed from the main process.
   */
  onHermesLifecycle(cb: (event: { name: string; payload: unknown }) => void): () => void

  // Skill management
  hermesSkills(): Promise<{
    ok: boolean
    skills: Array<{
      name: string
      description: string
      version: string
      author: string
      category: string
      platforms: string[]
      prerequisites?: { commands?: string[]; env_vars?: string[] }
      configVars?: { key: string; description: string; default?: any; prompt?: string }[]
      tags?: string[]
      license?: string
      dirPath: string
      relatedSkills?: string[]
      homepage?: string
    }>
    disabled: string[]
    configValues: Record<string, any>
    externalDirs: string[]
    error?: string
  }>
  hermesSkillsConfig(
    action: string,
    payload: any
  ): Promise<{ ok: boolean; error?: string }>

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
  fsWriteFile(filePath: string, content: string): Promise<{
    ok: boolean
    error?: string
  }>

  // Hermes service control & updates
  hermesRestart(): Promise<{ ok: boolean; error?: string }>
  hermesVersion(): Promise<{ ok: boolean; version?: string; date?: string; error?: string }>
  hermesCheckUpdate(): Promise<{ ok: boolean; current?: string; latest?: string; updateAvailable?: boolean; error?: string }>
  hermesUpdate(): Promise<{ ok: boolean; error?: string }>
  onHermesUpdateProgress(cb: (data: string) => void): () => void

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
    api: HermesAPI
  }
}
