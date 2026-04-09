import { app, shell, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, session, dialog } from 'electron'
import { join, resolve, extname, basename } from 'path'
import { execFile } from 'child_process'
import { readdir, stat, readFile, mkdir, unlink, copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { getServers, saveServer, removeServer, decryptPassword, isEncryptionAvailable } from './store'
import { registerWsBridge } from './ws-bridge'
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

function registerIpcHandlers(): void {
  // Store: server config (wrapped in try-catch to prevent unhandled IPC failures)
  ipcMain.handle('store:getServers', () => {
    try { return getServers() } catch (e: any) { return [] }
  })
  ipcMain.handle('store:saveServer', (_, server) => {
    try { return saveServer(server) } catch (e: any) { throw new Error(`Save failed: ${e.message}`) }
  })
  ipcMain.handle('store:removeServer', (_, id) => {
    try { return removeServer(id) } catch (e: any) { throw new Error(`Remove failed: ${e.message}`) }
  })
  ipcMain.handle('store:decryptPassword', (_, id) => {
    try { return decryptPassword(id) } catch (e: any) { return null }
  })
  ipcMain.handle('store:isEncryptionAvailable', () => {
    try { return isEncryptionAvailable() } catch { return false }
  })

  // App info
  ipcMain.handle('app:getVersion', () => app.getVersion())

  // OpenClaw npm update — runs in Electron's shell so npm is in PATH
  ipcMain.handle('openclaw:npmVersions', async () => {
    return new Promise((resolve) => {
      const shell = process.platform === 'win32' ? 'cmd' : '/bin/zsh'
      const args = process.platform === 'win32'
        ? ['/c', 'npm view openclaw versions --json']
        : ['-l', '-c', 'npm view openclaw versions --json']
      execFile(shell, args, { timeout: 30000 }, (err, stdout) => {
        if (err) {
          resolve({ ok: false, error: err.message, versions: [] })
          return
        }
        try {
          const parsed = JSON.parse(stdout)
          const versions = (Array.isArray(parsed) ? parsed : [parsed]).reverse()
          resolve({ ok: true, versions })
        } catch {
          resolve({ ok: false, error: 'Failed to parse versions', versions: [] })
        }
      })
    })
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

  // HTTP proxy — allows renderer to fetch from external URLs without CORS restrictions
  ipcMain.handle('http:fetch', async (_, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
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

  // Local filesystem browsing (scoped to workspace directories)
  ipcMain.handle('fs:readdir', async (_, dirPath: string) => {
    try {
      // Security: only allow reading within home directory
      const resolved = resolve(dirPath)
      if (!resolved.startsWith(homedir())) {
        return { ok: false, error: 'Access denied: path outside home directory', entries: [] }
      }
      const items = await readdir(dirPath, { withFileTypes: true })
      const entries = await Promise.all(
        items
          .filter((d) => !d.name.startsWith('.'))
          .map(async (d) => {
            const fullPath = join(dirPath, d.name)
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
      // Security: only allow reading within home directory
      const resolved = resolve(filePath)
      if (!resolved.startsWith(homedir())) {
        return { ok: false, error: 'Access denied: path outside home directory' }
      }
      const s = await stat(filePath)
      if (s.size > 10 * 1024 * 1024) {
        return { ok: false, error: 'File too large (>10MB)' }
      }
      const ext = extname(filePath).replace('.', '').toLowerCase()
      const binaryExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'pdf', 'zip', 'tar', 'gz', 'rar', '7z', 'mp4', 'mp3', 'wav']
      const isBinary = binaryExts.includes(ext)
      const content = await readFile(filePath, isBinary ? 'base64' : (encoding || 'utf-8') as BufferEncoding)
      return { ok: true, content, encoding: isBinary ? 'base64' : 'utf-8', name: basename(filePath), size: s.size }
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
      if (!filename.endsWith('.tar.gz') || filename.includes('..')) {
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
      if (!filename.endsWith('.tar.gz') || filename.includes('..')) {
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
      if (!filename.endsWith('.tar.gz') || filename.includes('..')) {
        return { ok: false, error: 'Invalid filename' }
      }
      const srcPath = join(BACKUP_DIR, filename)
      if (!existsSync(srcPath)) return { ok: false, error: 'Backup file not found' }

      const send = (p: number, msg: string) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('backup:progress', { progress: p, message: msg, status: 'running' })
        }
      }

      send(10, '正在解压备份...')

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
      await mkdir(BACKUP_DIR, { recursive: true })
      const name = basename(src)
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
