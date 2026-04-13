import { app, shell, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, session, dialog } from 'electron'
import { join, resolve, extname, basename } from 'path'
import { execFile } from 'child_process'
import { readdir, stat, readFile, writeFile, mkdir, unlink, copyFile, realpath } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { getServers, saveServer, removeServer, decryptPassword, isEncryptionAvailable } from './store'
import { registerWsBridge, shutdownWsBridge } from './ws-bridge'
import icon from '../../resources/icon.png?asset'

// Prevent crash dialog from uncaught WebSocket / network errors
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})

// ── Single instance lock: prevent duplicate app in taskbar ──
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Hermes Desktop',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Sandbox disabled: preload uses Node.js APIs (ipcRenderer) for IPC bridge
      sandbox: false,
      zoomFactor: 1.0,
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (is.dev) {
      mainWindow?.webContents.openDevTools()
      // Forward renderer errors to main process stdout for diagnostics
      mainWindow?.webContents.on('console-message', (_event, level, message) => {
        if (level >= 2) {  // warnings and errors only
          console.log(`[renderer] ${message.substring(0, 300)}`)
        }
      })
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Defense-in-depth: deny any top-level navigation away from the bundled
  // renderer. vue-router uses hash history so legitimate in-app navigation
  // never triggers `will-navigate`. A compromised renderer (or injected
  // markdown/html) trying to navigate to http(s)://… or file://… would
  // otherwise leave the app shell. External links already go through
  // setWindowOpenHandler → shell.openExternal above.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedPrefixes: string[] = []
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      allowedPrefixes.push(process.env['ELECTRON_RENDERER_URL'])
    }
    // In production the renderer is loaded via loadFile(); will-navigate
    // fires for anything that isn't the same file:// URL already rendered.
    const isSameDoc = url.startsWith('file://') && url.includes('/renderer/index.html')
    const isAllowedDev = allowedPrefixes.some((p) => url.startsWith(p))
    if (!isSameDoc && !isAllowedDev) {
      event.preventDefault()
      // Forward external links to the system browser instead of swallowing.
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url)
      }
    }
  })

  // Deny all permission requests by default (camera, microphone, geolocation,
  // notifications via the Permissions API, etc.). The app does not legitimately
  // need any of these — OS-level notifications go through main process via IPC.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })

  // Hide to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

}

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('Hermes 桌面管理终端')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

/**
 * Validate that a URL uses an allowed HTTP scheme before passing it to fetch().
 * Blocks file://, data:, javascript:, and other dangerous schemes that could
 * be used to read local files or execute code.
 */
function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function registerIpcHandlers(): void {
  // Store: server config (wrapped in try-catch to prevent unhandled IPC failures)
  ipcMain.handle('store:getServers', () => {
    try { return getServers() } catch (_e) { return [] }
  })
  ipcMain.handle('store:saveServer', (_, server) => {
    try { return saveServer(server) } catch (e: any) { throw new Error(`Save failed: ${e.message}`) }
  })
  ipcMain.handle('store:removeServer', (_, id) => {
    try { return removeServer(id) } catch (e: any) { throw new Error(`Remove failed: ${e.message}`) }
  })
  ipcMain.handle('store:decryptPassword', (_, id) => {
    try { return decryptPassword(id) } catch (_e) { return null }
  })
  ipcMain.handle('store:isEncryptionAvailable', () => {
    try { return isEncryptionAvailable() } catch { return false }
  })

  // App info
  ipcMain.handle('app:getVersion', () => app.getVersion())

  // HTTP proxy — allows renderer to fetch from external URLs without CORS restrictions.
  // URL scheme is validated to block file://, data:, javascript:, etc.
  ipcMain.handle('http:fetch', async (_, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    if (!isSafeHttpUrl(url)) {
      return { status: 0, ok: false, body: 'Blocked: only http/https URLs are allowed' }
    }
    try {
      const res = await fetch(url, {
        method: init?.method || 'GET',
        headers: init?.headers,
        body: init?.body,
      })
      const body = await res.text()
      return { status: res.status, ok: res.ok, body }
    } catch (e: any) {
      return { status: 0, ok: false, body: e.message || 'Network error' }
    }
  })

  // ── Hermes REST API: streaming chat via SSE ──
  // Main-process fetch bypasses renderer CORS; SSE chunks are forwarded via IPC events.
  ipcMain.handle('hermes:chat', async (event, url: string, body: string) => {
    if (!isSafeHttpUrl(url)) {
      return { ok: false, error: 'Blocked: only http/https URLs are allowed' }
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (!res.ok) {
        const errBody = await res.text()
        return { ok: false, error: `HTTP ${res.status}: ${errBody}` }
      }

      // Stream SSE chunks back to the renderer
      const reader = res.body?.getReader()
      if (!reader) return { ok: false, error: 'No readable stream' }

      const decoder = new TextDecoder()
      let buffer = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue // skip empty lines and SSE comments
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6)
            if (data === '[DONE]') {
              event.sender.send('hermes:chat:chunk', { done: true })
            } else {
              try {
                const parsed = JSON.parse(data)
                event.sender.send('hermes:chat:chunk', { done: false, data: parsed })
              } catch { /* skip malformed JSON */ }
            }
          }
        }
      }

      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Network error' }
    }
  })

  // ── Read Hermes Agent config (to extract actual underlying model name) ──
  ipcMain.handle('hermes:config', async () => {
    try {
      const configPath = join(homedir(), '.hermes/config.yaml')
      const content = await readFile(configPath, 'utf-8')
      // Extract model.default (e.g. "openai-codex/gpt-5.4")
      const modelMatch = content.match(/model:\s*\n\s+default:\s*(.+)/)
      const providerMatch = content.match(/provider:\s*(.+)/)
      const rawModel = modelMatch?.[1]?.trim() || null
      const provider = providerMatch?.[1]?.trim() || null
      // Extract the short model name (e.g. "gpt-5.4" from "openai-codex/gpt-5.4")
      const shortModel = rawModel?.includes('/') ? rawModel.split('/').pop() || rawModel : rawModel
      return { ok: true, model: shortModel, fullModel: rawModel, provider }
    } catch {
      return { ok: false, model: null, fullModel: null, provider: null }
    }
  })

  // Return local home directory path (for constructing ~/.hermes path)
  ipcMain.handle('app:homedir', () => homedir())

  // Local filesystem browsing (scoped to workspace directories).
  // realpath() resolves symlinks so a `home/link → /etc` cannot bypass the
  // home-directory check (TOCTOU hardening).
  ipcMain.handle('fs:readdir', async (_, dirPath: string) => {
    try {
      const realHome = await realpath(homedir())
      let realDir: string
      try {
        realDir = await realpath(resolve(dirPath))
      } catch {
        return { ok: false, error: 'Path does not exist', entries: [] }
      }
      if (realDir !== realHome && !realDir.startsWith(realHome + '/')) {
        return { ok: false, error: 'Access denied: path outside home directory', entries: [] }
      }
      const items = await readdir(realDir, { withFileTypes: true })
      const entries = await Promise.all(
        items
          .filter((d) => !d.name.startsWith('.'))
          .map(async (d) => {
            const fullPath = join(realDir, d.name)
            const isDir = d.isDirectory()
            let size: number | undefined
            let mtimeMs: number | undefined
            if (!isDir) {
              try {
                const s = await stat(fullPath)
                size = s.size
                mtimeMs = s.mtimeMs
              } catch { /* ignore */ }
            }
            return {
              name: d.name,
              path: fullPath,
              type: isDir ? 'directory' : 'file',
              size,
              mtimeMs,
              extension: isDir ? undefined : extname(d.name).replace('.', ''),
            }
          })
      )
      // Sort: directories first, then alphabetically
      entries.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1
        if (a.type !== 'directory' && b.type === 'directory') return 1
        return a.name.localeCompare(b.name)
      })
      return { ok: true, entries }
    } catch (e: any) {
      return { ok: false, error: e.message, entries: [] }
    }
  })

  ipcMain.handle('fs:readFile', async (_, filePath: string, encoding?: string) => {
    try {
      // Security: resolve symlinks before checking bounds to prevent TOCTOU
      // symlink attacks (e.g. `~/link → /etc/passwd`).
      const realHome = await realpath(homedir())
      let realFile: string
      try {
        realFile = await realpath(resolve(filePath))
      } catch {
        return { ok: false, error: 'File does not exist' }
      }
      if (!realFile.startsWith(realHome + '/')) {
        return { ok: false, error: 'Access denied: path outside home directory' }
      }
      const s = await stat(realFile)
      if (s.size > 10 * 1024 * 1024) {
        return { ok: false, error: 'File too large (>10MB)' }
      }
      const ext = extname(realFile).replace('.', '').toLowerCase()
      const binaryExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'pdf', 'zip', 'tar', 'gz', 'rar', '7z', 'mp4', 'mp3', 'wav']
      const isBinary = binaryExts.includes(ext)
      const content = await readFile(realFile, isBinary ? 'base64' : (encoding || 'utf-8') as BufferEncoding)
      return { ok: true, content, encoding: isBinary ? 'base64' : 'utf-8', name: basename(realFile), size: s.size }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
    try {
      const realHome = await realpath(homedir())
      const resolved = resolve(filePath)
      // If file already exists, resolve symlinks and check bounds
      let targetPath: string
      try {
        targetPath = await realpath(resolved)
      } catch {
        // File doesn't exist yet — verify parent directory is under $HOME
        const parentDir = resolve(resolved, '..')
        let realParent: string
        try {
          realParent = await realpath(parentDir)
        } catch {
          return { ok: false, error: 'Parent directory does not exist' }
        }
        if (realParent !== realHome && !realParent.startsWith(realHome + '/')) {
          return { ok: false, error: 'Access denied: path outside home directory' }
        }
        targetPath = resolved
      }
      if (targetPath !== realHome && !targetPath.startsWith(realHome + '/')) {
        return { ok: false, error: 'Access denied: path outside home directory' }
      }
      await writeFile(targetPath, content, 'utf-8')
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // ── Hermes service control (macOS launchd) ──
  ipcMain.handle('hermes:restart', async () => {
    try {
      return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        execFile('launchctl', ['kickstart', '-k', 'gui/' + process.getuid!() + '/ai.hermes.gateway'], (err, _stdout, stderr) => {
          if (err) {
            resolve({ ok: false, error: stderr || err.message })
          } else {
            resolve({ ok: true })
          }
        })
      })
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // ── Hermes Agent version & update ──
  const HERMES_BIN = join(homedir(), '.hermes/hermes-agent/hermes')
  const HERMES_REPO = join(homedir(), '.hermes/hermes-agent')

  ipcMain.handle('hermes:version', async () => {
    try {
      return await new Promise<{ ok: boolean; version?: string; date?: string; error?: string }>((resolve) => {
        execFile(HERMES_BIN, ['--version'], { timeout: 5000 }, (err, stdout) => {
          if (err) {
            resolve({ ok: false, error: err.message })
            return
          }
          // Parse: "Hermes Agent v0.8.0 (2026.4.8)"
          const match = stdout.match(/v([\d.]+)\s*\(([^)]+)\)/)
          resolve({
            ok: true,
            version: match ? match[1] : stdout.trim(),
            date: match ? match[2] : undefined,
          })
        })
      })
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('hermes:checkUpdate', async () => {
    try {
      // Fetch remote tags, then compare with latest local tag
      return await new Promise<{ ok: boolean; current?: string; latest?: string; updateAvailable?: boolean; error?: string }>((resolve) => {
        execFile('git', ['-C', HERMES_REPO, 'fetch', '--tags'], { timeout: 15000 }, (fetchErr) => {
          if (fetchErr) {
            resolve({ ok: false, error: 'Failed to fetch: ' + fetchErr.message })
            return
          }
          // Get all tags sorted by date (newest first)
          execFile('git', ['-C', HERMES_REPO, 'tag', '--sort=-creatordate'], { timeout: 5000 }, (tagErr, tagOut) => {
            if (tagErr) {
              resolve({ ok: false, error: tagErr.message })
              return
            }
            const tags = tagOut.trim().split('\n').filter(Boolean)
            const latest = tags[0] || ''
            // Compare commit dates: if HEAD is newer than (or equal to) the latest tag, no update needed
            // This handles repos where tags are on a separate release branch
            execFile('git', ['-C', HERMES_REPO, 'log', '-1', '--format=%ct', 'HEAD'], { timeout: 5000 }, (_headErr, headTs) => {
              const headTime = parseInt(headTs?.trim() || '0', 10)
              if (!latest) {
                resolve({ ok: true, current: 'dev', latest: '', updateAvailable: false })
                return
              }
              execFile('git', ['-C', HERMES_REPO, 'log', '-1', '--format=%ct', latest], { timeout: 5000 }, (_tagErr, tagTs) => {
                const tagTime = parseInt(tagTs?.trim() || '0', 10)
                // HEAD is up-to-date if its commit is same age or newer than latest tag
                const updateAvailable = tagTime > headTime
                // Show current as a readable description
                execFile('git', ['-C', HERMES_REPO, 'describe', '--tags', '--always', 'HEAD'], { timeout: 5000 }, (_dErr, dOut) => {
                  const current = dOut?.trim() || 'dev'
                  resolve({ ok: true, current, latest, updateAvailable })
                })
              })
            })
          })
        })
      })
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('hermes:update', async (event) => {
    try {
      return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const child = execFile(HERMES_BIN, ['update'], { timeout: 120000 })
        let output = ''
        child.stdout?.on('data', (data: string) => {
          output += data
          event.sender.send('hermes:update:progress', data.toString())
        })
        child.stderr?.on('data', (data: string) => {
          output += data
          event.sender.send('hermes:update:progress', data.toString())
        })
        child.on('close', (code) => {
          if (code === 0) {
            resolve({ ok: true })
          } else {
            resolve({ ok: false, error: output || `Exit code ${code}` })
          }
        })
        child.on('error', (err) => {
          resolve({ ok: false, error: err.message })
        })
      })
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // ── Backup system ──
  const BACKUP_DIR = join(homedir(), '.hermes-desktop-backups')

  ipcMain.handle('backup:list', async () => {
    try {
      if (!existsSync(BACKUP_DIR)) return { ok: true, backups: [] }
      const items = await readdir(BACKUP_DIR)
      const backups: Array<{ filename: string; size: number; createdAt: string; date: string }> = []
      for (const name of items) {
        if (!name.endsWith('.tar.gz')) continue
        try {
          const s = await stat(join(BACKUP_DIR, name))
          backups.push({
            filename: name,
            size: s.size,
            createdAt: s.birthtime.toISOString(),
            date: s.birthtime.toLocaleString(),
          })
        } catch { /* skip */ }
      }
      backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      return { ok: true, backups }
    } catch (e: any) {
      return { ok: false, error: e.message, backups: [] }
    }
  })

  ipcMain.handle('backup:create', async (event) => {
    try {
      await mkdir(BACKUP_DIR, { recursive: true })
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename = `hermes-backup-${ts}.tar.gz`
      const outPath = join(BACKUP_DIR, filename)

      // Notify progress
      const send = (p: number, msg: string) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('backup:progress', { progress: p, message: msg, status: 'running' })
        }
      }

      send(10, '正在打包 .hermes 数据目录...')

      await new Promise<void>((resolve, reject) => {
        // tar the .hermes directory, excluding large cache dirs
        execFile('tar', [
          'czf', outPath,
          '--exclude', '.hermes/workspace/node_modules',
          '--exclude', '.hermes/workspace/exports',
          '--exclude', '.hermes/media',
          '-C', homedir(),
          '.hermes',
        ], { timeout: 300000 }, (err) => {
          if (err) reject(new Error(err.message))
          else resolve()
        })
      })

      send(90, '正在验证备份...')
      const s = await stat(outPath)
      send(100, '备份完成')

      return { ok: true, filename, size: s.size }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('backup:delete', async (_, filename: string) => {
    try {
      if (!filename.endsWith('.tar.gz') || filename.includes('..') || filename.includes('/')) {
        return { ok: false, error: 'Invalid filename' }
      }
      await unlink(join(BACKUP_DIR, filename))
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('backup:download', async (_, filename: string) => {
    try {
      if (!filename.endsWith('.tar.gz') || filename.includes('..') || filename.includes('/')) {
        return { ok: false, error: 'Invalid filename' }
      }
      const srcPath = join(BACKUP_DIR, filename)
      if (!mainWindow) return { ok: false, error: 'Window not available' }
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: filename,
        filters: [{ name: 'Archive', extensions: ['tar.gz'] }],
      })
      if (result.canceled || !result.filePath) return { ok: false, error: 'Cancelled' }
      await copyFile(srcPath, result.filePath)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('backup:restore', async (event, filename: string) => {
    try {
      if (!filename.endsWith('.tar.gz') || filename.includes('..') || filename.includes('/')) {
        return { ok: false, error: 'Invalid filename' }
      }
      const srcPath = join(BACKUP_DIR, filename)
      if (!existsSync(srcPath)) return { ok: false, error: 'Backup file not found' }

      const send = (p: number, msg: string) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('backup:progress', { progress: p, message: msg, status: 'running' })
        }
      }

      // Security: list tarball contents first and verify every entry lives
      // under `.hermes/`. Rejects absolute paths, `..` traversal, and any
      // entry that would escape the hermes data directory. Without this a
      // malicious (or third-party) tarball placed into BACKUP_DIR could
      // overwrite arbitrary files in $HOME when the user hits "restore".
      send(5, '正在校验备份内容...')
      const entries = await new Promise<string[]>((resolve, reject) => {
        execFile(
          'tar',
          ['tzf', srcPath],
          { timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
          (err, stdout) => {
            if (err) reject(new Error(err.message))
            else resolve(stdout.split('\n').map((s) => s.trim()).filter(Boolean))
          }
        )
      })
      for (const entry of entries) {
        if (
          entry.startsWith('/') ||
          entry.startsWith('..') ||
          entry.includes('/../') ||
          entry.includes('\\') ||
          !(entry === '.hermes' || entry === '.hermes/' || entry.startsWith('.hermes/'))
        ) {
          return {
            ok: false,
            error: `Backup rejected: unsafe entry "${entry}". Only .hermes/* paths are allowed.`,
          }
        }
      }

      send(15, '正在解压备份...')

      await new Promise<void>((resolve, reject) => {
        execFile('tar', [
          'xzf', srcPath,
          '-C', homedir(),
        ], { timeout: 300000 }, (err) => {
          if (err) reject(new Error(err.message))
          else resolve()
        })
      })

      send(100, '恢复完成')
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('backup:upload', async () => {
    try {
      if (!mainWindow) return { ok: false, error: 'Window not available' }
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Archive', extensions: ['gz'] }],
      })
      if (result.canceled || result.filePaths.length === 0) return { ok: false, error: 'Cancelled' }
      const src = result.filePaths[0]!
      // Sanity-check the picked file before accepting it into BACKUP_DIR so
      // we don't silently copy non-tar.gz files (the file-dialog filter is
      // advisory on most platforms). A later `backup:restore` will also
      // validate contents, but failing fast here is better UX.
      const name = basename(src)
      if (!name.endsWith('.tar.gz') || name.includes('..') || name.includes('/')) {
        return { ok: false, error: 'Invalid backup filename (must be *.tar.gz)' }
      }
      const srcStat = await stat(src)
      // Cap upload size to 2 GB. A pathologically large tarball could fill
      // the user's disk before anyone notices.
      if (srcStat.size > 2 * 1024 * 1024 * 1024) {
        return { ok: false, error: 'Backup file too large (>2GB)' }
      }
      await mkdir(BACKUP_DIR, { recursive: true })
      const dest = join(BACKUP_DIR, name)
      await copyFile(src, dest)
      const s = await stat(dest)
      return { ok: true, filename: name, size: s.size }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.hide())

  // Notifications — basic
  ipcMain.on('notify', (_, title: string, body: string) => {
    new Notification({ title, body }).show()
  })

  // Notifications — enhanced with severity, sound, and badge
  ipcMain.on('notify:alert', (_, opts: {
    title: string
    body: string
    severity?: 'critical' | 'warning' | 'info'
    silent?: boolean
  }) => {
    const notification = new Notification({
      title: opts.title,
      body: opts.body,
      silent: opts.silent ?? (opts.severity === 'info'),
      urgency: opts.severity === 'critical' ? 'critical' : opts.severity === 'warning' ? 'normal' : 'low'
    })
    notification.on('click', () => {
      mainWindow?.show()
      mainWindow?.focus()
      // Navigate to alerts page
      mainWindow?.webContents.send('navigate', '/alerts')
    })
    notification.show()
  })

  // Badge count (macOS dock badge)
  ipcMain.on('badge:set', (_, count: number) => {
    if (process.platform === 'darwin') {
      app.dock?.setBadge(count > 0 ? String(count) : '')
    }
  })

  ipcMain.on('badge:clear', () => {
    if (process.platform === 'darwin') {
      app.dock?.setBadge('')
    }
  })
}

// ── Auto-updater setup ──
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('updater:status', { event: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:status', {
      event: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
    })
  })
  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('updater:status', {
      event: 'not-available',
      version: info.version,
    })
  })
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:status', {
      event: 'progress',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:status', {
      event: 'downloaded',
      version: info.version,
    })
  })
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater:status', {
      event: 'error',
      error: err.message,
    })
  })

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, version: result?.updateInfo?.version }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(true, true)
  })

  // Check for updates 5s after launch (non-dev only)
  if (!is.dev) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.nousresearch.hermes-desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Remove CORS restrictions for Gateway API calls
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    headers['access-control-allow-origin'] = ['*']
    headers['access-control-allow-headers'] = ['*']
    headers['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, OPTIONS']
    callback({ responseHeaders: headers })
  })

  registerWsBridge()
  registerIpcHandlers()
  setupAutoUpdater()
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Clean up the main-process WebSocket bridge before the app terminates so the
// gateway does not see a half-closed connection.
app.on('before-quit', () => {
  isQuitting = true
  shutdownWsBridge()
})
