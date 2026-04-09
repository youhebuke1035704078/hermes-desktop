import Store from 'electron-store'
import { safeStorage } from 'electron'

export interface ServerConfig {
  id: string
  name: string
  url: string
  username: string
  encryptedPassword: string
}

const store = new Store<{ servers: ServerConfig[] }>({
  defaults: { servers: [] }
})

export function getServers(): Omit<ServerConfig, 'encryptedPassword'>[] {
  return store.get('servers').map(({ encryptedPassword: _, ...rest }) => rest)
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function saveServer(server: {
  id: string
  name: string
  url: string
  username: string
  password: string
}): void {
  const servers = store.get('servers')
  const encryptionOk = safeStorage.isEncryptionAvailable()
  if (!encryptionOk) {
    console.warn('[store] ⚠️  safeStorage encryption not available — credentials stored with base64 encoding only (NOT encrypted). This is insecure.')
  }
  const encrypted = encryptionOk
    ? safeStorage.encryptString(server.password).toString('base64')
    : Buffer.from(server.password).toString('base64')

  const entry: ServerConfig = {
    id: server.id,
    name: server.name,
    url: server.url,
    username: server.username,
    encryptedPassword: encrypted
  }

  const idx = servers.findIndex((s) => s.id === server.id)
  if (idx >= 0) servers[idx] = entry
  else servers.push(entry)
  store.set('servers', servers)
}

export function removeServer(id: string): void {
  store.set(
    'servers',
    store.get('servers').filter((s) => s.id !== id)
  )
}

export function decryptPassword(id: string): string | null {
  const server = store.get('servers').find((s) => s.id === id)
  if (!server) return null
  const buf = Buffer.from(server.encryptedPassword, 'base64')
  return safeStorage.isEncryptionAvailable()
    ? safeStorage.decryptString(buf)
    : buf.toString('utf-8')
}
