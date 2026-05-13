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
  httpFetch(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ): Promise<{ status: number; ok: boolean; body: string }>
  clipboardWriteText(text: string): Promise<{ ok: boolean; error?: string }>

  // Hermes config (read ~/.hermes/config.yaml for actual model name +
  // fallback chain surfaced to the model-state badge)
  hermesConfig(): Promise<{
    ok: boolean
    model: string | null
    fullModel: string | null
    provider: string | null
    primary: string | null
    fallback_chain: string[]
    fallback_chain_full: string[]
    apiServerKey: string | null
  }>

  // Hermes streaming chat (SSE)
  hermesChat(
    url: string,
    body: string,
    authToken?: string,
    sessionId?: string,
    requestId?: string
  ): Promise<{
    ok: boolean
    error?: string
    requestId?: string
    finalContent?: string
    aborted?: boolean
  }>
  hermesChatAbort(requestId: string): Promise<{ ok: boolean; error?: string }>
  onHermesChatChunk(
    cb: (chunk: { requestId?: string; done: boolean; data?: any }) => void
  ): () => void
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
      source?: 'bundled' | 'workspace' | 'managed' | 'extra' | 'user_created'
    }>
    disabled: string[]
    configValues: Record<string, any>
    externalDirs: string[]
    source?: 'local' | 'server'
    rootDir?: string
    error?: string
  }>
  hermesSkillsConfig(action: string, payload: any): Promise<{ ok: boolean; error?: string }>

  // Backup system
  backupList(): Promise<{
    ok: boolean
    backups: Array<{ filename: string; size: number; createdAt: string; date: string }>
    error?: string
  }>
  backupCreate(): Promise<{ ok: boolean; filename?: string; size?: number; error?: string }>
  backupDelete(filename: string): Promise<{ ok: boolean; error?: string }>
  backupDownload(filename: string): Promise<{ ok: boolean; error?: string }>
  backupRestore(filename: string): Promise<{ ok: boolean; error?: string }>
  backupUpload(): Promise<{ ok: boolean; filename?: string; size?: number; error?: string }>
  onBackupProgress(
    cb: (data: { progress: number; message: string; status: string }) => void
  ): () => void

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
  fsReadFile(
    filePath: string,
    encoding?: string
  ): Promise<{
    ok: boolean
    content?: string
    encoding?: string
    name?: string
    size?: number
    error?: string
  }>
  fsWriteFile(
    filePath: string,
    content: string
  ): Promise<{
    ok: boolean
    error?: string
  }>

  // Hermes service control & updates
  hermesRestart(): Promise<{ ok: boolean; error?: string }>
  hermesVersion(): Promise<{ ok: boolean; version?: string; date?: string; error?: string }>
  hermesCheckUpdate(): Promise<{
    ok: boolean
    current?: string
    latest?: string
    updateAvailable?: boolean
    error?: string
  }>
  hermesUpdate(): Promise<{ ok: boolean; error?: string }>
  onHermesUpdateProgress(
    cb: (data: string | { phase?: string; percent?: number; detail?: string }) => void
  ): () => void

  // Device identity (main-process Ed25519; private key stays in main)
  deviceEnsure(migration?: { publicKey: string; privateKey: string } | null): Promise<{
    ok: boolean
    deviceId?: string
    publicKey?: string
    encrypted?: boolean
    error?: string
  }>
  deviceSign(payload: string): Promise<{ ok: boolean; signature?: string; error?: string }>

  // App auto-updater
  updaterCheck(): Promise<{
    ok: boolean
    version?: string
    updateAvailable?: boolean
    manual?: boolean
    downloadUrl?: string
    releaseUrl?: string
    error?: string
  }>
  updaterDownload(): Promise<{ ok: boolean; error?: string }>
  updaterInstall(): void
  updaterOpenDownload(url?: string): Promise<{ ok: boolean; error?: string }>
  onUpdaterStatus(
    cb: (data: {
      event: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error'
      version?: string
      releaseDate?: string
      manual?: boolean
      downloadUrl?: string
      releaseUrl?: string
      percent?: number
      bytesPerSecond?: number
      transferred?: number
      total?: number
      error?: string
    }) => void
  ): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: HermesAPI
  }
}
