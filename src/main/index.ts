import { app, shell, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, session, dialog } from 'electron'
import { join, resolve, extname, basename } from 'path'
import { execFile } from 'child_process'
import { readdir, stat, readFile, mkdir, unlink, copyFile, realpath } from 'fs/promises'
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
    title: 'OpenClaw Desktop',
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
  tray.setToolTip('OpenClaw 桌面管理终端')

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

  // OpenClaw version lookup — fetch directly from the npm registry HTTPS
  // endpoint instead of shelling out to `npm view`. Electron apps launched
  // outside a login shell often don't have `npm` in PATH (especially on
  // Windows where it's installed via nvm-windows or node MSI and the cmd.exe
  // environment doesn't inherit user PATH). Hitting registry.npmjs.org
  // directly removes the dependency entirely and works through corporate
  // proxies that already route to the registry.
  ipcMain.handle('openclaw:npmVersions', async () => {
    try {
      const res = await fetch('https://registry.npmjs.org/openclaw', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) {
        return { ok: false, error: `Registry HTTP ${res.status}`, versions: [] }
      }
      const data = (await res.json()) as {
        versions?: Record<string, unknown>
        'dist-tags'?: { latest?: string }
        time?: Record<string, string>
      }
      const versionKeys = data.versions ? Object.keys(data.versions) : []
      if (versionKeys.length === 0) {
        return { ok: false, error: 'Registry returned no versions', versions: [] }
      }
      // Sort by publish time desc (newest first). Fall back to string
      // compare for versions that lack a time entry.
      const time = data.time || {}
      const sorted = [...versionKeys].sort((a, b) => {
        const ta = time[a] ? Date.parse(time[a]) : 0
        const tb = time[b] ? Date.parse(time[b]) : 0
        if (tb !== ta) return tb - ta
        return b.localeCompare(a)
      })
      // If dist-tags.latest is available, pin it to the front just in case
      // a newer version was published with an older timestamp (prerelease
      // re-publish, etc).
      const latest = data['dist-tags']?.latest
      if (latest && sorted[0] !== latest) {
        const idx = sorted.indexOf(latest)
        if (idx > 0) {
          sorted.splice(idx, 1)
          sorted.unshift(latest)
        }
      }
      return { ok: true, versions: sorted }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg, versions: [] }
    }
  })

  ipcMain.handle('openclaw:npmUpdate', async (_, version: string) => {
    return new Promise((resolve) => {
      // Validate version to prevent shell injection
      if (version && !/^[0-9a-zA-Z._-]+$/.test(version)) {
        resolve({ ok: false, error: 'Invalid version format' })
        return
      }
      const pkg = version ? `openclaw@${version}` : 'openclaw'
      const shell = process.platform === 'win32' ? 'cmd' : '/bin/zsh'
      const args = process.platform === 'win32'
        ? ['/c', `npm install -g ${pkg}`]
        : ['-l', '-c', `npm install -g ${pkg}`]
      execFile(shell, args, { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: stderr || err.message })
          return
        }
        resolve({ ok: true, message: stdout.trim() })
      })
    })
  })

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

  // Return local home directory path (for constructing ~/.openclaw path)
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

  // ── Backup system ──
  const BACKUP_DIR = join(homedir(), '.openclaw-desktop-backups')

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
      const filename = `openclaw-backup-${ts}.tar.gz`
      const outPath = join(BACKUP_DIR, filename)

      // Notify progress
      const send = (p: number, msg: string) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('backup:progress', { progress: p, message: msg, status: 'running' })
        }
      }

      send(10, '正在打包 .openclaw 数据目录...')

      await new Promise<void>((resolve, reject) => {
        // tar the .openclaw directory, excluding large cache dirs
        execFile('tar', [
          'czf', outPath,
          '--exclude', '.openclaw/workspace/node_modules',
          '--exclude', '.openclaw/workspace/exports',
          '--exclude', '.openclaw/media',
          '-C', homedir(),
          '.openclaw',
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
      // under `.openclaw/`. Rejects absolute paths, `..` traversal, and any
      // entry that would escape the openclaw data directory. Without this a
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
          !(entry === '.openclaw' || entry === '.openclaw/' || entry.startsWith('.openclaw/'))
        ) {
          return {
            ok: false,
            error: `Backup rejected: unsafe entry "${entry}". Only .openclaw/* paths are allowed.`,
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
  electronApp.setAppUserModelId('com.openclaw.desktop')

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
