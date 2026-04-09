<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import {
  NCard,
  NInput,
  NButton,
  NIcon,
  NSpace,
  NEmpty,
  NSpin,
  NAlert,
  NText,
  NTag,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NImage,
  NTabs,
  NTabPane,
  NBreadcrumb,
  NBreadcrumbItem,
  NTooltip,
  NSelect,
  NAvatar,
  useMessage,
  type DataTableColumns,
  type SelectOption,
} from 'naive-ui'
import {
  RefreshOutline,
  FolderOutline,
  DocumentOutline,
  CodeSlashOutline,
  ImageOutline,
  VideocamOutline,
  MusicalNotesOutline,
  ArchiveOutline,
  CloudDownloadOutline,
  AddOutline,
  HomeOutline,
  CreateOutline,
  TextOutline,
  ListOutline,
  CodeOutline,
  LinkOutline,
  ImageOutline as ImageIconOutline,
  ChatboxEllipsesOutline,
  RemoveOutline,
  AddCircleOutline,
  ReorderFourOutline,
  PersonOutline,
  ExpandOutline,
  ContractOutline,
  DocumentTextOutline,
  ChevronDownOutline,
  ChevronForwardOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useConnectionStore } from '@/stores/connection'
import { useWebSocketStore } from '@/stores/websocket'
import { useMemoryStore } from '@/stores/memory'
import { formatRelativeTime } from '@/utils/format'
import { renderSimpleMarkdown, extractTocHeadings } from '@/utils/markdown'

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  isDirectory?: boolean
  size?: number
  updatedAtMs?: number
  extension?: string
  modifiedAt?: string
}

interface AgentSelectOption extends SelectOption {
  agent: {
    id: string
    name?: string
    identity?: {
      name?: string
      emoji?: string
      avatar?: string
      avatarUrl?: string
    }
  }
}

const { t } = useI18n()
const message = useMessage()
const connectionStore = useConnectionStore()
const wsStore = useWebSocketStore()
const memoryStore = useMemoryStore()

const loading = ref(false)
const error = ref('')
const currentPath = ref('')
const entries = ref<FileEntry[]>([])
const selectedFile = ref<FileEntry | null>(null)
const fileContent = ref<string>('')
const fileLoading = ref(false)
const editedContent = ref('')
const allFiles = ref<any[]>([])

const showPreviewModal = ref(false)
const showEditorModal = ref(false)
const isEditorMaximized = ref(false)
const showCreateModal = ref(false)
const createType = ref<'file' | 'directory'>('file')
const createName = ref('')
const createLoading = ref(false)

const editorTextarea = ref<HTMLTextAreaElement | null>(null)

const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp']
const mdExts = ['md', 'markdown']
const codeExts = ['ts', 'tsx', 'js', 'jsx', 'vue', 'json', 'yaml', 'yml', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'scss', 'html', 'xml', 'sh', 'bash']
const pdfExts = ['pdf']

const isImageFile = computed(() => {
  if (!selectedFile.value) return false
  const ext = selectedFile.value.extension?.toLowerCase() || ''
  return imgExts.includes(ext)
})

const isMarkdownFile = computed(() => {
  if (!selectedFile.value) return false
  const ext = selectedFile.value.extension?.toLowerCase() || ''
  return mdExts.includes(ext)
})

const isCodeFile = computed(() => {
  if (!selectedFile.value) return false
  const ext = selectedFile.value.extension?.toLowerCase() || ''
  return codeExts.includes(ext)
})

const isPdfFile = computed(() => {
  if (!selectedFile.value) return false
  const ext = selectedFile.value.extension?.toLowerCase() || ''
  return pdfExts.includes(ext)
})

const imageUrl = ref<string | null>(null)
const previewTab = ref<'preview' | 'source'>('preview')
const isPreviewMaximized = ref(false)
const tocExpandedState = ref<Record<string, boolean>>({})

const tocHeadings = computed(() => {
  if (!isMarkdownFile.value || !fileContent.value) return []
  return extractTocHeadings(fileContent.value)
})

const editorTocHeadings = computed(() => {
  if (!isMarkdownFile.value || !editedContent.value) return []
  return extractTocHeadings(editedContent.value)
})

function getTocKey(heading: { text: string; level: number }): string {
  return `h${heading.level}-${heading.text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}`
}

function isTocExpanded(heading: { text: string; level: number }): boolean {
  const key = getTocKey(heading)
  if (tocExpandedState.value[key] === undefined) {
    return true
  }
  return tocExpandedState.value[key]
}

function toggleTocExpand(heading: { text: string; level: number }) {
  const key = getTocKey(heading)
  tocExpandedState.value[key] = !isTocExpanded(heading)
}

function hasVisibleChildren(headings: { level: number; text: string; id: string }[], currentIndex: number, parentLevel: number): boolean {
  for (let i = currentIndex + 1; i < headings.length; i++) {
    const heading = headings[i]
    if (heading && heading.level <= parentLevel) break
    return true
  }
  return false
}

function isHeadingVisible(headings: { level: number; text: string; id: string }[], currentIndex: number): boolean {
  const current = headings[currentIndex]
  if (!current) return false
  if (current.level === 1) return true
  
  for (let i = currentIndex - 1; i >= 0; i--) {
    const prev = headings[i]
    if (prev && prev.level < current.level) {
      return isTocExpanded(prev)
    }
  }
  return true
}

function getTocNumber(headings: { level: number; text: string; id: string }[], currentIndex: number): string {
  const current = headings[currentIndex]
  if (!current) return ''
  
  const counters: number[] = [0, 0, 0, 0, 0, 0]
  
  for (let i = 0; i <= currentIndex; i++) {
    const h = headings[i]
    if (!h) continue
    
    if (!isHeadingVisible(headings, i)) continue
    
    const level = h.level
    const idx = level - 1
    if (idx >= 0 && idx < 6) {
      counters[idx] = (counters[idx] ?? 0) + 1
    }
    
    for (let j = level; j < 6; j++) {
      counters[j] = 0
    }
  }
  
  const parts: string[] = []
  for (let i = 0; i < current.level; i++) {
    const count = counters[i] ?? 0
    if (count > 0) {
      parts.push(String(count))
    }
  }
  
  return parts.join('.')
}

function scrollToHeading(id: string) {
  const element = document.getElementById(id)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function scrollToEditorHeading(id: string) {
  const previewPane = document.querySelector('.preview-pane')
  if (previewPane) {
    const element = previewPane.querySelector(`#${id}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
}

const agentOptions = computed<AgentSelectOption[]>(() =>
  memoryStore.agents.map((agent) => ({
    label: agent.identity?.name || agent.name || agent.id,
    value: agent.id,
    agent: {
      id: agent.id,
      name: agent.name,
      identity: agent.identity,
    },
  }))
)

function renderAgentLabel(option: SelectOption) {
  const agentOption = option as AgentSelectOption
  const agent = agentOption.agent
  if (!agent) return option.label as string

  const identity = agent.identity
  const emoji = identity?.emoji
  const avatar = identity?.avatarUrl || identity?.avatar
  const name = identity?.name || agent.name || agent.id

  return h(
    'div',
    { style: 'display: flex; align-items: center; gap: 8px; white-space: nowrap;' },
    [
      emoji
        ? h('span', { style: 'font-size: 18px; line-height: 1; flex-shrink: 0;' }, emoji)
        : h(NAvatar, {
            round: true,
            size: 22,
            src: avatar || undefined,
            style: avatar ? undefined : 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); flex-shrink: 0;',
          }, { default: () => name.charAt(0).toUpperCase() }),
      h('span', { style: 'overflow: hidden; text-overflow: ellipsis;' }, name),
    ]
  )
}

const selectedAgentId = computed({
  get: () => memoryStore.selectedAgentId,
  set: (val: string) => {
    memoryStore.selectedAgentId = val
  }
})

/** Derive the gateway server's .openclaw root from its workspace path */
const currentWorkspace = computed(() => {
  const ws = memoryStore.workspace
  if (!ws) return ''
  // Handle both Unix (/) and Windows (\) paths from gateway
  const normalized = ws.replace(/\\/g, '/')
  const idx = normalized.indexOf('/.openclaw/')
  if (idx >= 0) {
    // Return using original separators (don't normalize)
    const cutLen = idx + '/.openclaw'.length
    return ws.substring(0, cutLen)
  }
  if (normalized.endsWith('/.openclaw')) return ws
  return ws
})

const pathParts = computed(() => {
  if (!currentPath.value || currentPath.value === '/') return []
  return currentPath.value.split('/').filter(Boolean)
})

const directories = computed(() => entries.value.filter(e => e.type === 'directory'))
const files = computed(() => entries.value.filter(e => e.type === 'file'))

const tableColumns = computed<DataTableColumns<FileEntry>>(() => [
  {
    title: t('pages.files.columns.name'),
    key: 'name',
    render(row) {
      const icon = row.type === 'directory' ? FolderOutline : getFileIcon(row.extension || '')
      const color = row.type === 'directory' ? '#f0a020' : undefined
      return h(NSpace, { align: 'center', size: 8 }, {
        default: () => [
          h(NIcon, { component: icon, color, size: 18 }),
          h('span', { 
            style: 'cursor: pointer; font-weight: 500;', 
            onClick: () => handleRowClick(row) 
          }, row.name),
        ],
      })
    },
  },
  {
    title: t('pages.files.columns.size'),
    key: 'size',
    width: 100,
    render(row) {
      if (row.type === 'directory') return h(NText, { depth: 3 }, { default: () => '-' })
      return formatFileSize(row.size ?? 0)
    },
  },
  {
    title: t('pages.files.columns.modified'),
    key: 'modifiedAt',
    width: 160,
    render(row) {
      return row.modifiedAt ? formatRelativeTime(new Date(row.modifiedAt).getTime()) : '-'
    },
  },
  {
    title: t('pages.files.columns.type'),
    key: 'type',
    width: 100,
    render(row) {
      const typeMap: Record<string, string> = {
        directory: t('pages.files.types.directory'),
        file: t('pages.files.types.file'),
        symlink: t('pages.files.types.symlink'),
      }
      return h(NTag, { size: 'small', bordered: false, round: true, type: row.type === 'directory' ? 'warning' : 'default' }, { default: () => typeMap[row.type] || row.type })
    },
  },
  {
    title: t('pages.files.columns.actions'),
    key: 'actions',
    width: 240,
    render(row) {
      const actions: any[] = []
      
      if (row.type === 'directory') {
        actions.push(
          h(NButton, {
            size: 'tiny',
            quaternary: true,
            type: 'primary',
            onClick: () => navigateToDirectory(row.name),
          }, {
            default: () => t('pages.files.actions.open'),
          })
        )
      } else {
        const ext = row.extension?.toLowerCase() || ''
        const isImage = imgExts.includes(ext)
        const isPdf = pdfExts.includes(ext)
        
        actions.push(
          h(NButton, {
            size: 'tiny',
            quaternary: true,
            onClick: () => openPreview(row),
          }, {
            default: () => t('pages.files.actions.view'),
          })
        )
        actions.push(
          h(NButton, {
            size: 'tiny',
            quaternary: true,
            onClick: () => downloadFileDirect(row),
          }, {
            default: () => t('pages.files.actions.download'),
          })
        )
        if (!isImage && !isPdf) {
          actions.push(
            h(NButton, {
              size: 'tiny',
              quaternary: true,
              type: 'info',
              onClick: () => openEditor(row),
            }, {
              default: () => t('pages.files.actions.edit'),
            })
          )
        }
      }
      
      return h(NSpace, { size: 4 }, { default: () => actions })
    },
  },
])

function getFileIcon(ext: string): any {
  const extLower = ext.toLowerCase().replace('.', '')
  if (codeExts.includes(extLower)) return CodeSlashOutline
  if (imgExts.includes(extLower)) return ImageOutline
  if (pdfExts.includes(extLower)) return DocumentTextOutline
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv']
  if (videoExts.includes(extLower)) return VideocamOutline
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac']
  if (audioExts.includes(extLower)) return MusicalNotesOutline
  const archiveExts = ['zip', 'tar', 'gz', 'rar', '7z']
  if (archiveExts.includes(extLower)) return ArchiveOutline
  return DocumentOutline
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    json: 'application/json',
    md: 'text/markdown',
    markdown: 'text/markdown',
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    ts: 'text/typescript',
    xml: 'application/xml',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    txt: 'text/plain',
  }
  return mimeMap[ext.toLowerCase()] || 'text/plain;charset=utf-8'
}

async function refreshFiles() {
  allFiles.value = []
  await browsePath(currentPath.value)
}

/** Resolve the absolute directory path for browsing */
function resolveAbsDir(relativePath: string): string {
  const ws = (currentWorkspace.value || '').replace(/\/$/, '')
  if (!relativePath || relativePath === '/') return ws
  return `${ws}/${relativePath}`
}

/** Whether the last browse used local FS (for readFileContent fallback) */
const isLocalWorkspace = ref(false)
/** Whether remote HTTP file server is available */
const useRemoteFs = ref(false)
/** Cached remote file server base URL */
const remoteFileServerUrl = ref('')

/**
 * Derive the file-server URL from the gateway connection URL.
 * Gateway runs on port X (e.g., 18789), file-server on port X+2 (e.g., 18791).
 */
function getFileServerUrl(): string {
  if (remoteFileServerUrl.value) return remoteFileServerUrl.value
  const server = connectionStore.currentServer
  if (!server?.url) return ''
  try {
    const u = new URL(server.url.replace(/^ws/, 'http'))
    const gwPort = parseInt(u.port || '18789', 10)
    u.port = String(gwPort + 2)
    remoteFileServerUrl.value = u.origin
    return remoteFileServerUrl.value
  } catch {
    return ''
  }
}

/** Try fetching directory listing from the remote HTTP file server */
async function remoteHttpReaddir(dirPath: string): Promise<FileEntry[] | null> {
  const base = getFileServerUrl()
  if (!base) return null
  try {
    const url = `${base}/api/readdir?path=${encodeURIComponent(dirPath)}`
    const res = window.api
      ? await window.api.httpFetch(url)
      : { ok: false, body: '' }
    if (!res.ok) return null
    const data = JSON.parse(res.body)
    if (!data.ok || !Array.isArray(data.entries)) return null
    return data.entries.map((e: any) => ({
      name: e.name,
      path: e.path,
      type: e.type,
      size: e.size,
      modifiedAt: e.mtimeMs ? new Date(e.mtimeMs).toISOString() : undefined,
      extension: e.extension,
    }))
  } catch {
    return null
  }
}

/** Try reading a file from the remote HTTP file server */
async function remoteHttpReadFile(filePath: string): Promise<{ content: string; encoding: string } | null> {
  const base = getFileServerUrl()
  if (!base) return null
  try {
    const url = `${base}/api/readfile?path=${encodeURIComponent(filePath)}`
    const res = window.api
      ? await window.api.httpFetch(url)
      : { ok: false, body: '' }
    if (!res.ok) return null
    const data = JSON.parse(res.body)
    if (!data.ok) return null
    return { content: data.content || '', encoding: 'utf-8' }
  } catch {
    return null
  }
}

async function browsePath(path: string) {
  if (!currentWorkspace.value) {
    error.value = t('pages.files.noWorkspace')
    return
  }

  loading.value = true
  error.value = ''

  try {
    const absDir = resolveAbsDir(path)

    // Always try local FS first (no caching — avoids race conditions)
    if (window.api?.fsReaddir) {
      const result = await window.api.fsReaddir(absDir)
      if (result.ok) {
        console.log('[FilesPage] browsePath LOCAL:', absDir, `(${result.entries.length} items)`)
        isLocalWorkspace.value = true
        entries.value = result.entries.map((e) => ({
          name: e.name,
          path: e.path,
          type: e.type,
          size: e.size,
          modifiedAt: e.mtimeMs ? new Date(e.mtimeMs).toISOString() : undefined,
          extension: e.extension,
        }))
        currentPath.value = path
        return
      }
      console.log('[FilesPage] local FS failed for', absDir, ':', result.error, '→ trying RPC')
    }

    // Try remote HTTP file server (runs on gateway machine, port+2)
    isLocalWorkspace.value = false
    const httpEntries = await remoteHttpReaddir(absDir)
    if (httpEntries !== null) {
      console.log('[FilesPage] browsePath REMOTE HTTP:', absDir, `(${httpEntries.length} items)`)
      useRemoteFs.value = true
      entries.value = httpEntries
      currentPath.value = path
      return
    }

    // Try remote directory listing via gateway RPC (fs.readdir)
    const remoteEntries = await wsStore.rpc.remoteReaddir(absDir)
    if (remoteEntries !== null) {
      console.log('[FilesPage] browsePath REMOTE RPC:', absDir, `(${remoteEntries.length} items)`)
      entries.value = remoteEntries.map((e) => ({
        name: e.name,
        path: e.path,
        type: e.type,
        size: e.size,
        modifiedAt: e.mtimeMs ? new Date(e.mtimeMs).toISOString() : undefined,
        extension: e.extension,
      }))
      currentPath.value = path
      return
    }

    // Last resort: agent files only (limited to .md)
    if (allFiles.value.length === 0) {
      const agentId = selectedAgentId.value || 'main'
      const result = await wsStore.rpc.listAgentFiles(agentId)
      allFiles.value = result.files || []
    }
    console.log('[FilesPage] browsePath agent files fallback:', `${allFiles.value.length} files`)
    entries.value = allFiles.value.map((f) => ({
      name: f.name,
      path: f.path || f.name,
      type: (f.type || (f.isDirectory ? 'directory' : 'file')) as 'file' | 'directory',
      size: f.size,
      modifiedAt: f.updatedAtMs ? new Date(f.updatedAtMs).toISOString() : undefined,
      extension: f.name.includes('.') ? f.name.split('.').pop() : undefined,
    }))

    currentPath.value = path
  } catch (e: any) {
    console.error('[FilesPage] browsePath error:', e)
    error.value = e?.message || t('pages.files.loadFailed')
    entries.value = []
  } finally {
    loading.value = false
  }
}

async function switchAgent(agentId: string) {
  selectedAgentId.value = agentId
  currentPath.value = ''
  entries.value = []
  allFiles.value = []

  await memoryStore.fetchFiles(agentId)

  if (currentWorkspace.value) {
    await browsePath('')
  }
}

function handleRowClick(row: FileEntry) {
  if (row.type === 'directory') {
    navigateToDirectory(row.name)
  } else {
    openPreview(row)
  }
}

function navigateToDirectory(dirName: string) {
  const newPath = currentPath.value
    ? `${currentPath.value}/${dirName}`
    : dirName
  browsePath(newPath)
}

function navigateToPath(index: number) {
  if (index === -1) {
    browsePath('')
  } else {
    const parts = pathParts.value.slice(0, index + 1)
    browsePath(parts.join('/'))
  }
}

async function readFileContent(filePath: string): Promise<{ content: string; encoding: string }> {
  // 1. Local filesystem
  if (isLocalWorkspace.value && window.api?.fsReadFile) {
    const result = await window.api.fsReadFile(filePath)
    if (!result.ok) throw new Error(result.error || 'Read failed')
    return { content: result.content || '', encoding: result.encoding || 'utf-8' }
  }
  // 2. Remote HTTP file server (all file types)
  if (useRemoteFs.value) {
    const remote = await remoteHttpReadFile(filePath)
    if (remote) return remote
  }
  // 3. Fallback: agent files RPC (only .md)
  const agentId = selectedAgentId.value || 'main'
  const result = await wsStore.rpc.getAgentFile(agentId, filePath)
  return { content: result.file.content || '', encoding: 'utf-8' }
}

async function openPreview(file: FileEntry) {
  selectedFile.value = file
  fileLoading.value = true
  fileContent.value = ''
  imageUrl.value = null
  previewTab.value = 'preview'

  try {
    const { content } = await readFileContent(file.path)
    fileContent.value = content

    const ext = file.extension?.toLowerCase() || ''
    if (imgExts.includes(ext) && content) {
      if (ext === 'svg') {
        const blob = new Blob([content], { type: 'image/svg+xml' })
        imageUrl.value = URL.createObjectURL(blob)
      } else {
        const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
        // Local FS returns base64 for binary files; RPC also returns base64
        const prefix = content.startsWith('data:') ? content : `data:${mimeType};base64,${content}`
        imageUrl.value = prefix
      }
    }

    showPreviewModal.value = true
  } catch (e: any) {
    console.error('[FilesPage] openPreview error:', e)
    message.error(t('pages.files.readFileFailed') + ': ' + (e?.message || ''))
  } finally {
    fileLoading.value = false
  }
}

async function openEditor(file: FileEntry) {
  selectedFile.value = file
  fileLoading.value = true
  fileContent.value = ''
  editedContent.value = ''

  try {
    const { content } = await readFileContent(file.path)
    fileContent.value = content
    editedContent.value = fileContent.value
    showEditorModal.value = true

    await nextTick()
    if (editorTextarea.value) {
      editorTextarea.value.focus()
    }
  } catch (e: any) {
    console.error('[FilesPage] openEditor error:', e)
    message.error(t('pages.files.readFileFailed') + ': ' + (e?.message || ''))
  } finally {
    fileLoading.value = false
  }
}

async function saveFile() {
  if (!selectedFile.value) return

  fileLoading.value = true
  try {
    console.log('[FilesPage] Saving file:', selectedFile.value.path)

    const agentId = selectedAgentId.value || 'main'
    await wsStore.rpc.setAgentFile(agentId, selectedFile.value.path, editedContent.value)

    fileContent.value = editedContent.value
    message.success(t('pages.files.saveSuccess'))
    allFiles.value = []
    await browsePath(currentPath.value)
  } catch (e: any) {
    console.error('[FilesPage] saveFile error:', e)
    message.error(t('pages.files.saveFailed') + ': ' + (e?.message || ''))
  } finally {
    fileLoading.value = false
  }
}

async function downloadFileDirect(file: FileEntry) {
  try {
    const { content, encoding } = await readFileContent(file.path)

    if (!content) {
      message.warning(t('pages.files.noContent'))
      return
    }

    const ext = file.extension?.toLowerCase() || ''
    const mimeType = getMimeType(ext)
    let blob: Blob
    if (encoding === 'base64') {
      const binary = atob(content)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      blob = new Blob([bytes], { type: mimeType })
    } else {
      blob = new Blob([content], { type: mimeType })
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    message.error(t('pages.files.readFileFailed'))
  }
}

function downloadCurrentFile() {
  if (!selectedFile.value || !fileContent.value) {
    message.warning(t('pages.files.noContent'))
    return
  }
  const ext = selectedFile.value.extension?.toLowerCase() || ''
  const mimeType = getMimeType(ext)
  const blob = new Blob([fileContent.value], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = selectedFile.value.name
  link.click()
  URL.revokeObjectURL(url)
}

function openCreateModal(type: 'file' | 'directory') {
  createType.value = type
  createName.value = ''
  showCreateModal.value = true
}

async function createEntry() {
  if (!createName.value.trim()) return

  createLoading.value = true
  try {
    const name = createName.value.trim()
    const fullPath = currentPath.value ? `${currentPath.value}/${name}` : name

    console.log('[FilesPage] Creating:', createType.value, fullPath)

    if (createType.value === 'file') {
      const agentId = selectedAgentId.value || 'main'
      await wsStore.rpc.setAgentFile(agentId, fullPath, '')

      showCreateModal.value = false
      message.success(t('pages.files.createSuccess'))
      allFiles.value = []
      await browsePath(currentPath.value)
    } else {
      // mkdir not available via RPC
      message.warning(t('pages.files.operationNotSupported'))
      showCreateModal.value = false
    }
  } catch (e: any) {
    console.error('[FilesPage] createEntry error:', e)
    message.error(t('pages.files.createFailed') + ': ' + (e?.message || ''))
  } finally {
    createLoading.value = false
  }
}


function renderMarkdown(content: string): string {
  return renderSimpleMarkdown(content, {
    imageBasePath: selectedFile.value?.path,
  })
}

function handleCodeCopy(event: Event) {
  const target = event.target as HTMLElement
  const button = target.closest('.code-copy-btn') as HTMLButtonElement
  if (!button) return
  
  const code = button.dataset.code || ''
  navigator.clipboard.writeText(code).then(() => {
    button.classList.add('copied')
    button.title = 'Copied!'
    setTimeout(() => {
      button.classList.remove('copied')
      button.title = 'Copy code'
    }, 2000)
  }).catch((err) => {
    console.error('Failed to copy:', err)
  })
}

onMounted(() => {
  document.addEventListener('click', handleCodeCopy)
})

onUnmounted(() => {
  document.removeEventListener('click', handleCodeCopy)
})

function insertText(before: string, after: string = '') {
  if (!editorTextarea.value) return
  
  const textarea = editorTextarea.value
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selectedText = editedContent.value.substring(start, end)
  const newText = before + selectedText + after
  
  editedContent.value = 
    editedContent.value.substring(0, start) + 
    newText + 
    editedContent.value.substring(end)
  
  nextTick(() => {
    textarea.focus()
    const newCursorPos = start + before.length + selectedText.length
    textarea.setSelectionRange(newCursorPos, newCursorPos)
  })
}

function insertHeading(level: number) {
  const prefix = '#'.repeat(level) + ' '
  insertText(prefix)
}

function insertBold() {
  insertText('**', '**')
}

function insertItalic() {
  insertText('*', '*')
}

function insertStrikethrough() {
  insertText('~~', '~~')
}

function insertCode() {
  insertText('`', '`')
}

function insertCodeBlock() {
  insertText('\n```\n', '\n```\n')
}

function insertLink() {
  insertText('[', '](url)')
}

function insertImage() {
  insertText('![alt](', ')')
}

function insertQuote() {
  insertText('\n> ')
}

function insertUl() {
  insertText('\n- ')
}

function insertOl() {
  insertText('\n1. ')
}

function insertHr() {
  insertText('\n\n---\n\n')
}

function insertTable() {
  const table = `
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`
  insertText(table)
}

async function handleEditorPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  
  const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'))
  if (imageItems.length === 0) return
  
  event.preventDefault()
  
  for (const item of imageItems) {
    const file = item.getAsFile()
    if (!file) continue
    
    await uploadPastedImage(file)
  }
}

async function uploadPastedImage(_file: File) {
  // image upload not available via RPC
  message.warning(t('pages.files.operationNotSupported'))
}

async function initialize() {
  if (memoryStore.agents.length === 0) {
    await memoryStore.fetchAgents()
  }

  if (!memoryStore.selectedAgentId && memoryStore.agents.length > 0) {
    memoryStore.selectedAgentId = memoryStore.defaultAgentId || memoryStore.agents[0]?.id || 'main'
  }

  if (memoryStore.selectedAgentId && !memoryStore.workspace) {
    await memoryStore.fetchFiles(memoryStore.selectedAgentId)
  }
  
  if (currentWorkspace.value) {
    await browsePath('')
  }
}

watch(selectedAgentId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    switchAgent(newId)
  }
})

onMounted(() => {
  initialize()
})
</script>

<template>
  <NSpace vertical :size="16">
    <NCard :title="t('routes.files')" class="app-card">
      <template #header-extra>
        <NSpace :size="8">
          <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" :loading="loading || memoryStore.loadingAgents" @click="refreshFiles()">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('common.refresh') }}
          </NButton>
        </NSpace>
      </template>

      <NAlert v-if="error" type="error" :bordered="false" style="margin-bottom: 16px;">
        {{ error }}
      </NAlert>

      <div class="files-toolbar">
        <NSpace :size="12" align="center">
          <NSelect
            v-model:value="selectedAgentId"
            :options="agentOptions"
            :placeholder="t('pages.files.selectAgent')"
            :render-label="renderAgentLabel"
            style="width: 260px;"
            :loading="memoryStore.loadingAgents"
          >
            <template #arrow>
              <NIcon :component="PersonOutline" />
            </template>
          </NSelect>
          
          <NBreadcrumb>
            <NBreadcrumbItem @click="navigateToPath(-1)">
              <NIcon :component="HomeOutline" />
            </NBreadcrumbItem>
            <NBreadcrumbItem v-for="(part, index) in pathParts" :key="index" @click="navigateToPath(index)">
              {{ part }}
            </NBreadcrumbItem>
          </NBreadcrumb>
        </NSpace>
        
        <NSpace :size="8">
          <NButton size="small" @click="openCreateModal('file')" :disabled="!currentWorkspace">
            <template #icon><NIcon :component="AddOutline" /></template>
            {{ t('pages.files.actions.newFile') }}
          </NButton>
        </NSpace>
      </div>

      <div class="files-stats">
        <NTag size="small" :bordered="false">
          {{ directories.length }} {{ t('pages.files.types.directory') }}
        </NTag>
        <NTag size="small" :bordered="false" type="info">
          {{ files.length }} {{ t('pages.files.types.file') }}
        </NTag>
        <NTag v-if="currentWorkspace" size="small" :bordered="false" type="success">
          <template #icon><NIcon :component="FolderOutline" /></template>
          {{ currentWorkspace }}
        </NTag>
      </div>

      <NSpin :show="loading">
        <NDataTable
          v-if="entries.length > 0"
          :columns="tableColumns"
          :data="entries"
          :bordered="false"
          :single-line="false"
          size="small"
          :max-height="500"
          virtual-scroll
          :row-key="(row: FileEntry) => row.path"
        />
        <NEmpty v-else-if="!currentWorkspace" :description="t('pages.files.selectAgentFirst')" style="padding: 48px 0;" />
        <NEmpty v-else :description="t('pages.files.empty')" style="padding: 48px 0;" />
      </NSpin>

      <NText depth="3" style="font-size: 12px; display: block; margin-top: 12px;">
        {{ t('pages.files.workspace', { path: currentPath || '/' }) }}
      </NText>
    </NCard>

    <NModal 
      v-model:show="showPreviewModal" 
      preset="card" 
      :style="isPreviewMaximized ? 'width: 100vw; height: 100vh; max-width: 100vw; top: 0; left: 0; margin: 0;' : 'width: 90%; max-width: 1200px;'" 
      :content-style="isPreviewMaximized ? 'height: calc(100vh - 80px); overflow: hidden;' : ''"
      :title="selectedFile?.name || t('pages.files.preview')"
      :closable="!isPreviewMaximized"
      :mask-closable="!isPreviewMaximized"
    >
      <template #header-extra>
        <NSpace :size="8">
          <NButton size="small" quaternary @click="isPreviewMaximized = !isPreviewMaximized">
            <template #icon><NIcon :component="isPreviewMaximized ? ContractOutline : ExpandOutline" /></template>
            {{ isPreviewMaximized ? t('pages.files.actions.exitFullscreen') : t('pages.files.actions.fullscreen') }}
          </NButton>
          <NButton size="small" quaternary @click="downloadCurrentFile()">
            <template #icon><NIcon :component="CloudDownloadOutline" /></template>
            {{ t('pages.files.actions.download') }}
          </NButton>
          <NButton v-if="!isImageFile && !isPdfFile" size="small" type="primary" @click="showPreviewModal = false; openEditor(selectedFile!)">
            <template #icon><NIcon :component="CreateOutline" /></template>
            {{ t('pages.files.actions.edit') }}
          </NButton>
        </NSpace>
      </template>
      
      <NSpin :show="fileLoading">
        <div v-if="isImageFile && imageUrl" class="preview-image">
          <NImage 
            :src="imageUrl" 
            object-fit="contain"
            :img-props="{ style: 'max-width: 100%; max-height: 100%; object-fit: contain;' }"
          />
        </div>
        
        <NEmpty v-else-if="isPdfFile" :description="t('pages.files.pdfNotSupported')" style="padding: 48px 0;" />
        
        <template v-else-if="isMarkdownFile">
          <div class="markdown-container" :class="{ 'markdown-container--full': isPreviewMaximized }">
            <div class="markdown-content" :class="{ 'markdown-content--full': !tocHeadings.length }">
              <NTabs v-model:value="previewTab" type="line">
                <NTabPane name="preview" :tab="t('pages.files.preview')">
                  <div class="markdown-preview" :class="{ 'markdown-preview--full': isPreviewMaximized }" v-html="renderMarkdown(fileContent)"></div>
                </NTabPane>
                <NTabPane name="source" :tab="t('pages.files.source')">
                  <pre class="code-preview">{{ fileContent }}</pre>
                </NTabPane>
              </NTabs>
            </div>
            <div v-if="tocHeadings.length > 0 && previewTab === 'preview'" class="markdown-toc" :class="isPreviewMaximized ? 'markdown-toc--preview-full' : 'markdown-toc--preview'">
              <div class="toc-title">{{ t('pages.files.toc') }}</div>
              <div class="toc-list">
                <template v-for="(heading, index) in tocHeadings" :key="heading.id">
                  <div
                    v-if="isHeadingVisible(tocHeadings, index)"
                    class="toc-item"
                    :class="['toc-item--level-' + heading.level, { 'toc-item--has-children': hasVisibleChildren(tocHeadings, index, heading.level) }]"
                  >
                    <span class="toc-number">{{ getTocNumber(tocHeadings, index) }}</span>
                    <span class="toc-text" @click="scrollToHeading(heading.id)">{{ heading.text }}</span>
                    <span
                      v-if="hasVisibleChildren(tocHeadings, index, heading.level)"
                      class="toc-toggle"
                      @click.stop="toggleTocExpand(heading)"
                    >
                      <NIcon size="14" :component="isTocExpanded(heading) ? ChevronDownOutline : ChevronForwardOutline" />
                    </span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </template>
        
        <pre v-else-if="isCodeFile || fileContent" class="code-preview">{{ fileContent }}</pre>
        
        <NEmpty v-else :description="t('pages.files.noPreview')" />
      </NSpin>
    </NModal>

    <NModal 
      v-model:show="showEditorModal" 
      preset="card" 
      :style="isEditorMaximized ? 'width: 100vw; height: 100vh; max-width: 100vw; top: 0; left: 0; margin: 0;' : 'width: 95%; max-width: 1400px; height: 90vh;'" 
      :content-style="isEditorMaximized ? 'height: calc(100vh - 80px); overflow: hidden;' : ''"
      :title="selectedFile?.name || t('pages.files.editor.title')"
      :closable="!isEditorMaximized"
      :mask-closable="!isEditorMaximized"
    >
      <template #header-extra>
        <NSpace :size="8">
          <NButton size="small" quaternary @click="isEditorMaximized = !isEditorMaximized">
            <template #icon><NIcon :component="isEditorMaximized ? ContractOutline : ExpandOutline" /></template>
            {{ isEditorMaximized ? t('pages.files.actions.exitFullscreen') : t('pages.files.actions.fullscreen') }}
          </NButton>
          <NButton size="small" type="primary" :loading="fileLoading" @click="saveFile">
            {{ t('pages.files.actions.save') }}
          </NButton>
          <NButton size="small" @click="showEditorModal = false">
            {{ t('common.cancel') }}
          </NButton>
        </NSpace>
      </template>
      
      <div class="editor-container" :class="{ 'editor-container--fullscreen': isEditorMaximized }">
        <div class="editor-toolbar">
          <div class="toolbar-group">
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertHeading(1)">H1</NButton>
              </template>
              {{ t('pages.files.editor.heading1') }}
            </NTooltip>
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertHeading(2)">H2</NButton>
              </template>
              {{ t('pages.files.editor.heading2') }}
            </NTooltip>
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertHeading(3)">H3</NButton>
              </template>
              {{ t('pages.files.editor.heading3') }}
            </NTooltip>
          </div>
          
          <div class="toolbar-divider"></div>
          
          <div class="toolbar-group">
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertBold">
                  <template #icon><NIcon :component="TextOutline" /></template>
                  <span style="font-weight: bold;">B</span>
                </NButton>
              </template>
              {{ t('pages.files.editor.bold') }}
            </NTooltip>
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertItalic">
                  <template #icon><NIcon :component="TextOutline" /></template>
                  <span style="font-style: italic;">I</span>
                </NButton>
              </template>
              {{ t('pages.files.editor.italic') }}
            </NTooltip>
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertStrikethrough">
                  <template #icon><NIcon :component="TextOutline" /></template>
                  <span style="text-decoration: line-through;">S</span>
                </NButton>
              </template>
              {{ t('pages.files.editor.strikethrough') }}
            </NTooltip>
          </div>
          
          <div class="toolbar-divider"></div>
          
          <div class="toolbar-group">
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertCode">
                  <template #icon><NIcon :component="CodeOutline" /></template>
                </NButton>
              </template>
              {{ t('pages.files.editor.inlineCode') }}
            </NTooltip>
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertCodeBlock">
                  <template #icon><NIcon :component="CodeSlashOutline" /></template>
                </NButton>
              </template>
              {{ t('pages.files.editor.codeBlock') }}
            </NTooltip>
          </div>
          
          <div class="toolbar-divider"></div>
          
          <div class="toolbar-group">
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertLink">
                  <template #icon><NIcon :component="LinkOutline" /></template>
                </NButton>
              </template>
              {{ t('pages.files.editor.link') }}
            </NTooltip>
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertImage">
                  <template #icon><NIcon :component="ImageIconOutline" /></template>
                </NButton>
              </template>
              {{ t('pages.files.editor.image') }}
            </NTooltip>
          </div>
          
          <div class="toolbar-divider"></div>
          
          <div class="toolbar-group">
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertQuote">
                  <template #icon><NIcon :component="ChatboxEllipsesOutline" /></template>
                </NButton>
              </template>
              {{ t('pages.files.editor.quote') }}
            </NTooltip>
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertUl">
                  <template #icon><NIcon :component="ListOutline" /></template>
                </NButton>
              </template>
              {{ t('pages.files.editor.unorderedList') }}
            </NTooltip>
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertOl">
                  <template #icon><NIcon :component="ReorderFourOutline" /></template>
                </NButton>
              </template>
              {{ t('pages.files.editor.orderedList') }}
            </NTooltip>
          </div>
          
          <div class="toolbar-divider"></div>
          
          <div class="toolbar-group">
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertHr">
                  <template #icon><NIcon :component="RemoveOutline" /></template>
                </NButton>
              </template>
              {{ t('pages.files.editor.horizontalRule') }}
            </NTooltip>
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click="insertTable">
                  <template #icon><NIcon :component="AddCircleOutline" /></template>
                </NButton>
              </template>
              {{ t('pages.files.editor.table') }}
            </NTooltip>
          </div>
        </div>
        
        <div class="editor-content">
          <div class="editor-pane">
            <textarea
              ref="editorTextarea"
              v-model="editedContent"
              class="full-editor"
              :placeholder="t('pages.files.editPlaceholder')"
              @paste="handleEditorPaste"
            />
          </div>
          <div v-if="isMarkdownFile" class="preview-pane-wrapper">
            <div class="preview-pane">
              <div class="markdown-preview markdown-preview--full" v-html="renderMarkdown(editedContent)"></div>
            </div>
            <div v-if="editorTocHeadings.length > 0" class="markdown-toc" :class="isEditorMaximized ? 'markdown-toc--editor-full' : 'markdown-toc--editor'">
              <div class="toc-title">{{ t('pages.files.toc') }}</div>
              <div class="toc-list">
                <template v-for="(heading, index) in editorTocHeadings" :key="heading.id">
                  <div
                    v-if="isHeadingVisible(editorTocHeadings, index)"
                    class="toc-item"
                    :class="['toc-item--level-' + heading.level, { 'toc-item--has-children': hasVisibleChildren(editorTocHeadings, index, heading.level) }]"
                  >
                    <span class="toc-number">{{ getTocNumber(editorTocHeadings, index) }}</span>
                    <span class="toc-text" @click="scrollToEditorHeading(heading.id)">{{ heading.text }}</span>
                    <span
                      v-if="hasVisibleChildren(editorTocHeadings, index, heading.level)"
                      class="toc-toggle"
                      @click.stop="toggleTocExpand(heading)"
                    >
                      <NIcon size="14" :component="isTocExpanded(heading) ? ChevronDownOutline : ChevronForwardOutline" />
                    </span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </NModal>

    <NModal v-model:show="showCreateModal" preset="dialog" :title="createType === 'file' ? t('pages.files.createFile') : t('pages.files.createFolder')">
      <NForm @submit.prevent="createEntry">
        <NFormItem :label="createType === 'file' ? t('pages.files.fileName') : t('pages.files.folderName')">
          <NInput v-model:value="createName" :placeholder="t('pages.files.namePlaceholder')" @keyup.enter="createEntry" />
        </NFormItem>
      </NForm>
      <template #action>
        <NSpace>
          <NButton @click="showCreateModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="createLoading" :disabled="!createName.trim()" @click="createEntry">
            {{ t('common.create') }}
          </NButton>
        </NSpace>
      </template>
    </NModal>

  </NSpace>
</template>

<style scoped>
.files-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
}

.files-stats {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.preview-image {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  min-height: 200px;
  max-height: 500px;
  overflow: hidden;
}

.preview-image :deep(.n-image) {
  max-width: 100%;
  max-height: 100%;
}

.preview-image :deep(.n-image img) {
  max-width: 100%;
  max-height: 452px;
  object-fit: contain;
}

.code-preview {
  margin: 0;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 500px;
  overflow: auto;
}

.markdown-container {
  display: flex;
  gap: 16px;
  min-height: 200px;
  max-height: 70vh;
}

.markdown-container--full {
  max-height: calc(100vh - 100px);
  height: calc(100vh - 100px);
}

.markdown-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.markdown-content--full {
  width: 100%;
}

.markdown-content .n-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.markdown-content :deep(.n-tabs-pane-wrapper) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.markdown-content :deep(.n-tab-pane) {
  height: 100%;
  overflow: hidden;
}

.markdown-toc {
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  padding: 12px;
  overflow-y: auto;
  box-sizing: border-box;
}

.markdown-toc--preview {
  margin-top: 40px;
  max-height: calc(70vh - 40px);
}

.markdown-toc--preview-full {
  margin-top: 40px;
  height: calc(100% - 40px);
  max-height: calc(100vh - 140px);
}

.markdown-toc--editor {
  max-height: none;
}

.markdown-toc--editor-full {
  max-height: none;
}

.toc-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.toc-list {
  display: flex;
  flex-direction: column;
}

.toc-item {
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 6px;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 1px 0;
  position: relative;
}

.toc-item:hover {
  background: rgba(var(--primary-color-rgb, 59, 130, 246), 0.08);
  color: var(--text-primary);
}

.toc-item:hover .toc-number {
  color: var(--link-color);
}

.toc-number {
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 500;
  min-width: 20px;
  flex-shrink: 0;
  transition: color 0.15s ease;
}

.toc-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.toc-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 4px;
  margin-left: auto;
  color: var(--text-tertiary);
  transition: all 0.15s ease;
  opacity: 0.5;
}

.toc-item:hover .toc-toggle {
  opacity: 1;
}

.toc-toggle:hover {
  background: rgba(var(--primary-color-rgb, 59, 130, 246), 0.15);
  color: var(--link-color);
}

.toc-item--level-1 { 
  font-weight: 600;
  margin-top: 4px;
}
.toc-item--level-1:first-child { 
  margin-top: 0;
}

.toc-item--level-2 { 
  padding-left: 20px;
}

.toc-item--level-3 { 
  padding-left: 36px;
  font-size: 12px;
}

.toc-item--level-4 { 
  padding-left: 52px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.toc-item--level-5 { 
  padding-left: 68px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.toc-item--level-6 { 
  padding-left: 84px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.markdown-preview {
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  overflow: auto;
  max-height: 70vh;
  box-sizing: border-box;
}

.markdown-preview--full {
  max-height: calc(100vh - 150px);
  height: 100%;
}

.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3),
.markdown-preview :deep(h4),
.markdown-preview :deep(h5),
.markdown-preview :deep(h6) {
  margin: 16px 0 8px 0;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.markdown-preview :deep(h1::before),
.markdown-preview :deep(h2::before),
.markdown-preview :deep(h3::before),
.markdown-preview :deep(h4::before),
.markdown-preview :deep(h5::before),
.markdown-preview :deep(h6::before) {
  content: attr(data-heading-number);
  color: var(--text-tertiary);
  font-weight: 500;
  font-size: 0.85em;
  flex-shrink: 0;
}

.markdown-preview :deep(h1) { font-size: 1.75em; }
.markdown-preview :deep(h2) { font-size: 1.5em; }
.markdown-preview :deep(h3) { font-size: 1.25em; }
.markdown-preview :deep(h4) { font-size: 1.1em; }
.markdown-preview :deep(h5) { font-size: 1em; }
.markdown-preview :deep(h6) { font-size: 0.95em; }

.markdown-preview :deep(p) {
  margin: 8px 0;
  line-height: 1.7;
}

.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.markdown-preview :deep(li) {
  margin: 4px 0;
}

.markdown-preview :deep(code) {
  padding: 2px 6px;
  background: var(--bg-primary);
  border-radius: 4px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.9em;
}

.markdown-preview :deep(pre) {
  margin: 12px 0;
  background: var(--bg-primary);
  border-radius: var(--radius);
  overflow: hidden;
}

.markdown-preview :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-preview :deep(.code-block-container) {
  display: flex;
  position: relative;
  margin: 12px 0;
  background: var(--bg-primary);
  border-radius: var(--radius);
  overflow-x: auto;
}

.markdown-preview :deep(.code-line-numbers) {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  text-align: right;
  user-select: none;
  min-width: 40px;
}

.markdown-preview :deep(.line-number) {
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-tertiary);
  padding: 0 4px;
}

.markdown-preview :deep(.code-content) {
  flex: 1;
  padding: 12px;
  overflow-x: auto;
  min-width: 0;
}

.markdown-preview :deep(.code-content code) {
  padding: 0;
  background: transparent;
  display: block;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
}

.markdown-preview :deep(.code-block-wrapper) {
  position: relative;
  margin: 12px 0;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: var(--radius);
  overflow-x: auto;
}

.markdown-preview :deep(.code-block-wrapper code) {
  padding: 0;
  background: transparent;
  display: block;
}

.markdown-preview :deep(.code-copy-btn) {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  z-index: 10;
}

.markdown-preview :deep(.code-block-container:hover .code-copy-btn) {
  opacity: 1;
}

.markdown-preview :deep(.code-copy-btn:hover) {
  background: var(--bg-primary);
  color: var(--link-color);
}
.markdown-preview :deep(.code-copy-btn.copied) {
  color: var(--success-color);
}

.markdown-preview :deep(.katex-display) {
  display: block;
  margin: 16px 0;
  overflow-x: auto;
  overflow-y: hidden;
  text-align: center;
  padding: 8px 0;
}

.markdown-preview :deep(.katex-display > .katex) {
  display: inline-block;
  text-align: center;
  white-space: normal;
}

.markdown-preview :deep(.katex) {
  font-size: 1.1em;
}

.markdown-preview :deep(.katex-inline) {
  padding: 0 2px;
}

.markdown-preview :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 4px solid var(--border-color);
  background: var(--bg-primary);
}

.markdown-preview :deep(a) {
  color: var(--link-color);
  text-decoration: none;
}

.markdown-preview :deep(a:hover) {
  text-decoration: underline;
}

.markdown-preview :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.markdown-preview :deep(th),
.markdown-preview :deep(td) {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  text-align: left;
}

.markdown-preview :deep(th) {
  background: var(--bg-primary);
  font-weight: 600;
}

.markdown-preview :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius);
  margin: 8px 0;
}

.markdown-preview :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 16px 0;
}

.markdown-preview :deep(del) {
  color: var(--text-tertiary);
  text-decoration: line-through;
}

.markdown-preview :deep(mark) {
  background: rgba(255, 200, 0, 0.3);
  padding: 1px 4px;
  border-radius: 2px;
}

.markdown-preview :deep(strong) {
  font-weight: 600;
}

.markdown-preview :deep(em) {
  font-style: italic;
}

.markdown-preview :deep(sup) {
  font-size: 0.75em;
  vertical-align: super;
  line-height: 0;
}

.markdown-preview :deep(sub) {
  font-size: 0.75em;
  vertical-align: sub;
  line-height: 0;
}

.markdown-preview :deep(details) {
  margin: 8px 0;
  padding: 8px 12px;
  background: var(--bg-primary);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
}

.markdown-preview :deep(summary) {
  cursor: pointer;
  font-weight: 500;
  outline: none;
}

.markdown-preview :deep(summary:hover) {
  color: var(--link-color);
}

.markdown-preview :deep(dl) {
  margin: 12px 0;
}

.markdown-preview :deep(dt) {
  font-weight: 600;
  margin-top: 8px;
}

.markdown-preview :deep(dd) {
  margin-left: 24px;
  color: var(--text-secondary);
}

.markdown-preview :deep(figure) {
  margin: 12px 0;
  text-align: center;
}

.markdown-preview :deep(figcaption) {
  font-size: 0.9em;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.markdown-preview :deep(abbr[title]) {
  text-decoration: underline dotted;
  cursor: help;
}

.markdown-preview :deep(kbd) {
  display: inline-block;
  padding: 2px 6px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.85em;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: inset 0 -1px 0 var(--border-color);
}

.editor-container {
  height: calc(90vh - 120px);
  display: flex;
  flex-direction: column;
}

.editor-container--fullscreen {
  height: calc(100vh - 100px);
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  margin-bottom: 12px;
}

.toolbar-group {
  display: flex;
  gap: 2px;
}

.toolbar-divider {
  width: 1px;
  background: var(--border-color);
  margin: 0 8px;
}

.editor-content {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.preview-pane-wrapper {
  flex: 1;
  display: flex;
  gap: 12px;
  min-width: 0;
  border-left: 1px solid var(--border-color);
  padding-left: 12px;
  min-height: 0;
  overflow: hidden;
  align-items: stretch;
}

.preview-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.preview-pane .markdown-preview {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.preview-pane-wrapper .markdown-toc {
  flex-shrink: 0;
  align-self: stretch;
}

.full-editor {
  width: 100%;
  flex: 1;
  min-height: 0;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;
  box-sizing: border-box;
  color: var(--text-primary);
}

.full-editor:focus {
  border-color: var(--link-color);
}
</style>
