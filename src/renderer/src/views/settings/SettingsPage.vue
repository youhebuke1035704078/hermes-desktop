<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard,
  NSpace,
  NSelect,
  NText,
  NForm,
  NFormItem,
  NButton,
  NTag,
  NIcon,
  NGrid,
  NGridItem,
  NDescriptions,
  NDescriptionsItem,
  NInput,
  NSpin,
  NAlert,
  useMessage
} from 'naive-ui'
import {
  ServerOutline,
  SwapHorizontalOutline,
  DocumentTextOutline,
  RefreshOutline,
  SaveOutline,
  ChevronDownOutline,
  ChevronUpOutline,
  RocketOutline,
  CloudDownloadOutline,
  InformationCircleOutline,
  PaperPlaneOutline,
  CogOutline,
  CopyOutline
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useThemeStore, type ThemeMode } from '@/stores/theme'
import { useWebSocketStore } from '@/stores/websocket'
import { useConnectionStore } from '@/stores/connection'
import { useOpsStore } from '@/stores/ops'
import { ConnectionState } from '@/api/types'
import { useMgmtProbe, type MgmtFetchResult } from '@/composables/useMgmtProbe'
import { hermesRestRequest } from '@/api/hermes-rest-client'
import { downloadJSON, formatRelativeTime } from '@/utils/format'
import { writeTextToClipboard } from '@/utils/clipboard'

const router = useRouter()
const themeStore = useThemeStore()
const wsStore = useWebSocketStore()
const connectionStore = useConnectionStore()
const opsStore = useOpsStore()
const { t } = useI18n()
const message = useMessage()

// ── Theme ──
const themeOptions = computed(() => [
  { label: t('pages.settings.themeLight'), value: 'light' },
  { label: t('pages.settings.themeDark'), value: 'dark' }
])

// ── Connection status ──
const connectionStatus = computed(() => {
  // Local Hermes REST mode has no WebSocket — derive status from connectionStore
  if (connectionStore.serverType === 'hermes-rest') {
    const st = connectionStore.status
    if (st === 'connected')
      return { text: t('pages.settings.statusConnected'), type: 'success' as const }
    if (st === 'connecting')
      return { text: t('pages.settings.statusConnecting'), type: 'info' as const }
    if (st === 'error') return { text: t('pages.settings.statusFailed'), type: 'error' as const }
    return { text: t('pages.settings.statusDisconnected'), type: 'error' as const }
  }
  switch (wsStore.state) {
    case ConnectionState.CONNECTED:
      return { text: t('pages.settings.statusConnected'), type: 'success' as const }
    case ConnectionState.CONNECTING:
      return { text: t('pages.settings.statusConnecting'), type: 'info' as const }
    case ConnectionState.RECONNECTING:
      return {
        text: t('pages.settings.statusReconnecting', { count: wsStore.reconnectAttempts }),
        type: 'warning' as const
      }
    case ConnectionState.FAILED:
      return { text: t('pages.settings.statusFailed'), type: 'error' as const }
    default:
      return { text: t('pages.settings.statusDisconnected'), type: 'error' as const }
  }
})

const currentServer = computed(() => connectionStore.currentServer)
const isNoAuth = computed(() => currentServer.value?.username === '_noauth_')
const isHermesRest = computed(() => connectionStore.serverType === 'hermes-rest')
const desktopVersion = computed(() =>
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '-'
)
/** True when connected server is localhost — version/config/restart only work locally */
const isLocalServer = computed(() => {
  const url = connectionStore.currentServer?.url
  if (!url) return false
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
})

// ── Remote management API ──
/** Management API URL: same host as Hermes Agent, port 8643 */
const mgmtUrl = computed(() => {
  const url = connectionStore.currentServer?.url
  if (!url) return ''
  try {
    const u = new URL(url)
    u.port = '8643'
    return u.origin
  } catch {
    return ''
  }
})

/** Wall-clock timeout for the mgmt-server health probe. Main-process
 *  httpFetch has no built-in timeout, so we race against a setTimeout
 *  to avoid a hung Tailscale connect leaving the UI in "probing" forever. */
const MGMT_PROBE_TIMEOUT_MS = 5000

async function mgmtHealthFetcher(url: string): Promise<MgmtFetchResult> {
  const fetchPromise: Promise<MgmtFetchResult> = window.api
    ? window.api.httpFetch(url).then((r) => ({ ok: r.ok, status: r.status, body: r.body }))
    : fetch(url, { signal: AbortSignal.timeout(MGMT_PROBE_TIMEOUT_MS) })
        .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.text() }))
        .catch((e: any) => ({ ok: false, status: 0, body: e?.message || 'fetch failed' }))
  const timeoutPromise = new Promise<MgmtFetchResult>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), MGMT_PROBE_TIMEOUT_MS)
  )
  return Promise.race([fetchPromise, timeoutPromise])
}

const mgmtProbe = useMgmtProbe(mgmtHealthFetcher)
// Destructure refs so templates can bind them with auto-unwrap.
const mgmtAvailable = mgmtProbe.available
const mgmtProbing = mgmtProbe.probing
const mgmtErrorKind = mgmtProbe.errorKind
const mgmtErrorDetail = mgmtProbe.errorDetail
const restSettingsAvailable = ref(false)
const restSettingsProbing = ref(false)
const restSettingsError = ref('')

/** True if version/config/restart features should be shown */
const canManage = computed(
  () =>
    isHermesRest.value &&
    (isLocalServer.value || restSettingsAvailable.value || mgmtAvailable.value)
)
const remoteManageAvailable = computed(() => restSettingsAvailable.value || mgmtAvailable.value)
const remoteProbeBusy = computed(() => restSettingsProbing.value || mgmtProbing.value)

/** Human-friendly message for the current probe failure, or '' on success. */
const mgmtErrorMessage = computed(() => {
  if (restSettingsError.value) return restSettingsError.value
  const kind = mgmtErrorKind.value
  if (!kind || kind === 'empty-url') return ''
  return t(`pages.settings.mgmtError.${kind}`, { url: mgmtUrl.value })
})

/** Call remote management API with auth */
async function mgmtFetch(
  path: string,
  options: { method?: string; body?: string } = {}
): Promise<any> {
  const url = `${mgmtUrl.value}${path}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (connectionStore.hermesAuthToken)
    headers['Authorization'] = `Bearer ${connectionStore.hermesAuthToken}`
  if (window.api) {
    const resp = await window.api.httpFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body
    })
    return typeof resp.body === 'string' && resp.body ? JSON.parse(resp.body) : resp
  }
  const resp = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body,
    signal: AbortSignal.timeout(10000)
  })
  return resp.json()
}

/** Call Hermes Agent REST settings API on the connected :8642 server. */
async function restSettingsFetch(
  path: string,
  options: { method?: string; body?: string } = {}
): Promise<any> {
  return await hermesRestRequest(`/v1/hermes/settings${path}`, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body
  })
}

/** Remote settings calls prefer the built-in Hermes REST API and keep 8643 as legacy fallback. */
async function remoteSettingsFetch(
  path: string,
  options: { method?: string; body?: string } = {}
): Promise<any> {
  if (restSettingsAvailable.value) {
    return await restSettingsFetch(path, options)
  }
  return await mgmtFetch(path, options)
}

/** Probe the mgmt-server and, on success, eagerly populate the feature cards.
 *  Safe to call repeatedly — used by onMounted, the Retry button, and the
 *  connection-status watcher after a reconnect. */
async function triggerMgmtProbe(): Promise<void> {
  restSettingsAvailable.value = false
  restSettingsError.value = ''
  mgmtProbe.reset()
  if (isLocalServer.value || !isHermesRest.value) return
  restSettingsProbing.value = true
  try {
    const summary = await restSettingsFetch('/summary')
    if (summary?.ok) {
      restSettingsAvailable.value = true
      if (summary.hermesHome) hermesDir.value = summary.hermesHome
      loadConfigFiles()
      await fetchHermesVersion()
      checkHermesUpdate()
      return
    }
    restSettingsError.value = summary?.error || t('pages.settings.restSettingsUnavailable')
  } catch (e: any) {
    restSettingsAvailable.value = false
    restSettingsError.value = e?.message || t('pages.settings.restSettingsUnavailable')
  } finally {
    restSettingsProbing.value = false
  }

  // Legacy compatibility: older Hermes Agent builds used a separate :8643
  // management service. Keep probing it so old remotes are still manageable.
  await mgmtProbe.probe(mgmtUrl.value)
  if (mgmtAvailable.value) {
    loadConfigFiles()
    await fetchHermesVersion()
    checkHermesUpdate()
  }
}

function handleThemeChange(mode: ThemeMode) {
  themeStore.setMode(mode)
}

async function handleDisconnect() {
  await connectionStore.disconnect()
  router.push({ name: 'Connection' })
}

function handleSwitchServer() {
  router.push({ name: 'Connection', query: { manual: '1' } })
}

function goChannels() {
  router.push({ name: 'Channels' })
}

function goLogs() {
  router.push({ name: 'Logs' })
}

function goBackup() {
  router.push({ name: 'Backup' })
}

// ── Config file editors ──
const hermesDir = ref('')
const configYaml = ref('')
const configYamlLoading = ref(false)
const configYamlSaving = ref(false)
const configYamlError = ref('')
const configYamlNotFound = ref(false)

const envContent = ref('')
const envLoading = ref(false)
const envSaving = ref(false)
const envError = ref('')
const envNotFound = ref(false)

const restarting = ref(false)
const configExpanded = ref(false)
const envExpanded = ref(false)

// ── Hermes version & update ──
const hermesVersion = ref('')
const hermesDate = ref('')
const hermesVersionLoading = ref(false)
const hermesCurrentTag = ref('')
const hermesLatestTag = ref('')
const hermesUpdateAvailable = ref(false)
const hermesUpdateChecked = ref(false) // true after first check completes
const hermesCheckingUpdate = ref(false)
const hermesUpdating = ref(false)
const hermesUpdateLog = ref('')
// Persistent error state so users don't lose context when the auto-dismiss
// toast fades. Cleared at the start of each check/update attempt.
const hermesCheckError = ref('')
const hermesUpdateError = ref('')

type DiagnosticType = 'success' | 'warning' | 'error' | 'info' | 'default'

interface ModelDiagnosticItem {
  key: string
  label: string
  value: string
  detail: string
  type: DiagnosticType
}

const modelDiagnosticLoading = ref(false)
const modelDiagnosticCheckedAt = ref<number | null>(null)
const modelDiagnosticItems = ref<ModelDiagnosticItem[]>([])

const hermesReleaseUrl = computed(() =>
  hermesLatestTag.value
    ? `https://github.com/NousResearch/hermes-agent/releases/tag/${hermesLatestTag.value}`
    : 'https://github.com/NousResearch/hermes-agent/releases'
)

const modelDiagnosticSummary = computed(() => {
  const hasError = modelDiagnosticItems.value.some((item) => item.type === 'error')
  const hasWarning = modelDiagnosticItems.value.some((item) => item.type === 'warning')
  return {
    type: hasError
      ? ('error' as DiagnosticType)
      : hasWarning
        ? ('warning' as DiagnosticType)
        : ('success' as DiagnosticType),
    label: hasError ? '异常' : hasWarning ? '需关注' : '可用'
  }
})

const modelDiagnosticCheckedText = computed(() =>
  modelDiagnosticCheckedAt.value ? formatRelativeTime(modelDiagnosticCheckedAt.value) : '尚未运行'
)

const modelDiagnosticText = computed(() => {
  if (!modelDiagnosticItems.value.length) return ''
  return [
    `服务器：${currentServer.value?.url || '-'}`,
    `当前识别模型：${connectionStore.hermesRealModel || 'unknown'}`,
    `上次诊断：${modelDiagnosticCheckedText.value}`,
    ...modelDiagnosticItems.value.map((item) => `- ${item.label}: ${item.value} | ${item.detail}`)
  ].join('\n')
})

const updateAdvice = computed(() => {
  const error = hermesUpdateError.value || hermesCheckError.value
  if (!error) return ''
  return classifyUpdateError(error)
})

function extractYamlScalar(content: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = content.match(new RegExp(`^\\s*${escaped}:\\s*['"]?([^'"#\\n]+)`, 'm'))
  return (match?.[1] || '').trim()
}

function parseFallbackModels(content: string): string[] {
  const fallbackBlock = content.match(/(?:fallback_providers|fallback_model):([\s\S]*?)(?:\n\S|$)/)
  const source = fallbackBlock?.[1] || ''
  const models = [...source.matchAll(/^\s*(?:-\s*)?model:\s*['"]?([^'"#\n]+)/gm)]
    .map((match) => (match[1] || '').trim())
    .filter(Boolean)
  if (!models.length) {
    const inline = content.match(/^\s*fallback_model:\s*['"]?([^'"#\n]+)/m)?.[1]?.trim()
    if (inline) models.push(inline)
  }
  return models
}

function hasEnvValue(content: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*${escaped}\\s*=\\s*\\S+`, 'm').test(content)
}

function classifyUpdateError(error: string): string {
  const text = error.toLowerCase()
  if (text.includes('connection closed') || text.includes('socket') || text.includes('network')) {
    return '网络连接被关闭，优先检查 GitHub/VPN/Tailscale 连接；也可以直接打开 Releases 页面下载安装包。'
  }
  if (text.includes('timeout') || text.includes('timed out')) {
    return '检查更新超时，通常是网络链路不稳定；稍后重试或打开 Releases 页面手动下载。'
  }
  if (text.includes('403') || text.includes('permission') || text.includes('forbidden')) {
    return '当前网络或账号权限访问更新源受限，请换网络或手动打开 Releases 页面。'
  }
  if (text.includes('dirty') || text.includes('local changes')) {
    return '本地 Hermes Agent 有未提交改动，自动更新会被保护性拦截。'
  }
  return '可以先重试；如果仍失败，打开 Releases 页面手动下载或检查远端管理接口。'
}

function opsTagType(severity: string): DiagnosticType {
  if (severity === 'critical') return 'error'
  if (severity === 'success') return 'success'
  if (severity === 'info') return 'info'
  if (severity === 'warning') return 'warning'
  return 'default'
}

function extractModelProbeText(payload: any): string {
  return (
    payload?.choices?.[0]?.message?.content ||
    payload?.choices?.[0]?.text ||
    payload?.output_text ||
    payload?.content ||
    ''
  ).toString()
}

async function probeChatModel(
  label: string,
  key: string,
  model: string
): Promise<ModelDiagnosticItem> {
  if (!model) {
    return {
      key,
      label,
      value: '未配置',
      detail: '没有可测试的模型名',
      type: 'warning'
    }
  }
  const started = Date.now()
  try {
    const result = await hermesRestRequest<any>('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '请只回复 OK，用于 Hermes Desktop 模型健康检查。' }],
        max_tokens: 8,
        stream: false
      })
    })
    const preview = extractModelProbeText(result).slice(0, 40) || '接口已响应'
    return {
      key,
      label,
      value: '可用',
      detail: `${model} · ${Date.now() - started}ms · ${preview}`,
      type: 'success'
    }
  } catch (e: any) {
    return {
      key,
      label,
      value: '失败',
      detail: `${model} · ${e?.message || '模型调用失败'}`,
      type: 'error'
    }
  }
}

async function runModelDiagnostic() {
  modelDiagnosticLoading.value = true
  const items: ModelDiagnosticItem[] = []

  const tokenPresent = !!connectionStore.hermesAuthToken
  items.push({
    key: 'token',
    label: '访问令牌',
    value: tokenPresent ? '已配置' : '未配置',
    detail: tokenPresent ? 'Desktop 会在 REST 请求中附带 Bearer token' : '受保护接口可能返回 401',
    type: tokenPresent ? 'success' : 'warning'
  })

  try {
    const health = await hermesRestRequest<any>('/health')
    items.push({
      key: 'health',
      label: '服务健康',
      value: health?.status || health?.ok ? '可访问' : '有响应',
      detail: currentServer.value?.url || 'Hermes REST',
      type: health?.ok === false ? 'warning' : 'success'
    })
  } catch (e: any) {
    items.push({
      key: 'health',
      label: '服务健康',
      value: '失败',
      detail: e?.message || 'health probe failed',
      type: 'error'
    })
  }

  try {
    const models = await hermesRestRequest<any>('/v1/models')
    const modelIds = Array.isArray(models?.data)
      ? models.data.map((row: any) => row?.id || row?.name).filter(Boolean)
      : []
    items.push({
      key: 'models',
      label: '模型接口',
      value: modelIds[0] || connectionStore.hermesRealModel || '已响应',
      detail: modelIds.length
        ? `可见模型 ${modelIds.slice(0, 3).join(', ')}`
        : '接口响应中未包含模型列表',
      type: modelIds.length || connectionStore.hermesRealModel ? 'success' : 'warning'
    })
  } catch (e: any) {
    items.push({
      key: 'models',
      label: '模型接口',
      value: '失败',
      detail: e?.message || 'models probe failed',
      type: 'error'
    })
  }

  if (canManage.value && !configYaml.value && !configYamlLoading.value && !envLoading.value) {
    await loadConfigFiles()
  }

  const configuredDefault = extractYamlScalar(configYaml.value, 'default')
  const configuredProvider = extractYamlScalar(configYaml.value, 'provider')
  const fallbackModelList = parseFallbackModels(configYaml.value)
  const fallbackModels = fallbackModelList.slice(0, 3).join(', ')
  items.push({
    key: 'config-main',
    label: '主模型配置',
    value: configuredDefault || connectionStore.hermesRealModel || '未识别',
    detail: configuredProvider
      ? `provider: ${configuredProvider}`
      : '未从 config.yaml 解析到 provider',
    type: configuredDefault || connectionStore.hermesRealModel ? 'success' : 'warning'
  })
  items.push({
    key: 'config-fallback',
    label: '备用模型',
    value: fallbackModels || '未配置',
    detail: fallbackModels
      ? 'fallback_providers 已配置'
      : '建议保留可用备用模型，避免主模型凭据失败时中断',
    type: fallbackModels ? 'success' : 'warning'
  })
  items.push({
    key: 'gemini-key',
    label: 'GEMINI_API_KEY',
    value: hasEnvValue(envContent.value, 'GEMINI_API_KEY') ? '已配置' : '未配置',
    detail: '用于 Gemini 备用模型可用性',
    type: hasEnvValue(envContent.value, 'GEMINI_API_KEY') ? 'success' : 'warning'
  })
  items.push({
    key: 'server-key',
    label: 'API_SERVER_KEY',
    value: hasEnvValue(envContent.value, 'API_SERVER_KEY') ? '已配置' : '未配置',
    detail: '用于 Desktop 访问受保护的 Hermes REST 接口',
    type: hasEnvValue(envContent.value, 'API_SERVER_KEY') || tokenPresent ? 'success' : 'warning'
  })

  const primaryModel = configuredDefault || connectionStore.hermesRealModel || 'hermes-agent'
  items.push(await probeChatModel('主模型调用', 'probe-primary', primaryModel))
  items.push(await probeChatModel('备用模型调用', 'probe-fallback', fallbackModelList[0] || ''))

  modelDiagnosticItems.value = items
  modelDiagnosticCheckedAt.value = Date.now()
  const hasError = items.some((item) => item.type === 'error')
  opsStore.pushNotice({
    title: hasError ? '模型与凭据诊断发现异常' : '模型与凭据诊断通过',
    detail:
      items
        .filter((item) => item.type === 'error' || item.type === 'warning')
        .map((item) => `${item.label}: ${item.detail}`)
        .join('；') || '主模型、备用模型、服务健康和关键凭据检查完成。',
    severity: hasError ? 'warning' : 'success',
    source: '模型诊断'
  })
  modelDiagnosticLoading.value = false
}

async function copyModelDiagnostic(): Promise<void> {
  if (!modelDiagnosticText.value) {
    message.warning('请先运行诊断')
    return
  }
  try {
    await writeTextToClipboard(modelDiagnosticText.value)
    message.success('已复制诊断摘要')
  } catch {
    message.error(t('common.copyFailed'))
  }
}

async function fetchHermesVersion() {
  hermesVersionLoading.value = true
  try {
    const res =
      isLocalServer.value && window.api
        ? await window.api.hermesVersion()
        : await remoteSettingsFetch('/version')
    if (res.ok) {
      hermesVersion.value = res.version || ''
      hermesDate.value = res.date || ''
    }
  } catch {
    /* ignore */
  } finally {
    hermesVersionLoading.value = false
  }
}

async function checkHermesUpdate() {
  hermesCheckingUpdate.value = true
  hermesUpdateAvailable.value = false
  // Clear stale error state on every attempt so the user isn't confused
  // by a leftover message from a previous failure.
  hermesCheckError.value = ''
  try {
    const res =
      isLocalServer.value && window.api
        ? await window.api.hermesCheckUpdate()
        : await remoteSettingsFetch('/check-update')
    if (res.ok) {
      hermesCurrentTag.value = res.current || ''
      hermesLatestTag.value = res.latest || ''
      hermesUpdateAvailable.value = !!res.updateAvailable
    } else if (!hermesUpdateChecked.value) {
      // Silent fail on auto-check; only show error on manual click
    } else {
      const err = res.error || 'Check failed'
      hermesCheckError.value = err
      message.error(err)
    }
  } catch (e: any) {
    if (hermesUpdateChecked.value) {
      hermesCheckError.value = e.message
      message.error(e.message)
    }
  } finally {
    hermesCheckingUpdate.value = false
    hermesUpdateChecked.value = true
  }
}

async function doHermesUpdate() {
  hermesUpdating.value = true
  hermesUpdateLog.value = ''
  // Clear stale error so a retry starts from a clean slate.
  hermesUpdateError.value = ''
  hermesCheckError.value = ''
  let unsub: (() => void) | null = null
  if (isLocalServer.value && window.api) {
    unsub = window.api.onHermesUpdateProgress((data: string) => {
      hermesUpdateLog.value += data
    })
  }
  try {
    const res =
      isLocalServer.value && window.api
        ? await window.api.hermesUpdate()
        : await remoteSettingsFetch('/update', { method: 'POST' })
    if (res.ok) {
      message.success(t('pages.settings.updateSuccess'))
      hermesUpdateAvailable.value = false
      hermesUpdateError.value = ''
      await fetchHermesVersion()
    } else {
      const err = res.error || 'Unknown error'
      hermesUpdateError.value = err
      message.error(`${t('pages.settings.updateFailed')}: ${err}`)
    }
  } catch (e: any) {
    hermesUpdateError.value = e.message
    message.error(`${t('pages.settings.updateFailed')}: ${e.message}`)
  } finally {
    unsub?.()
    hermesUpdating.value = false
  }
}

async function loadConfigFiles() {
  if (isLocalServer.value) {
    if (!window.api) return
    hermesDir.value = (await window.api.getHomedir()) + '/.hermes'
  } else {
    hermesDir.value = hermesDir.value || '~/.hermes'
  }

  // Load config.yaml
  configYamlLoading.value = true
  configYamlError.value = ''
  configYamlNotFound.value = false
  try {
    const res =
      isLocalServer.value && window.api
        ? await window.api.fsReadFile(`${hermesDir.value}/config.yaml`)
        : await remoteSettingsFetch('/config/yaml')
    if (res.ok) {
      configYaml.value = res.content || ''
      if (res.notFound) configYamlNotFound.value = true
    } else if (res.error?.includes('does not exist')) {
      configYamlNotFound.value = true
      configYaml.value = ''
    } else {
      configYamlError.value = res.error || t('pages.settings.loadFileFailed')
    }
  } catch (e: any) {
    configYamlError.value = e.message
  } finally {
    configYamlLoading.value = false
  }

  // Load .env
  envLoading.value = true
  envError.value = ''
  envNotFound.value = false
  try {
    const res =
      isLocalServer.value && window.api
        ? await window.api.fsReadFile(`${hermesDir.value}/.env`)
        : await remoteSettingsFetch('/config/env')
    if (res.ok) {
      envContent.value = res.content || ''
      if (res.notFound) envNotFound.value = true
    } else if (res.error?.includes('does not exist')) {
      envNotFound.value = true
      envContent.value = ''
    } else {
      envError.value = res.error || t('pages.settings.loadFileFailed')
    }
  } catch (e: any) {
    envError.value = e.message
  } finally {
    envLoading.value = false
  }
}

async function saveConfigYaml() {
  configYamlSaving.value = true
  try {
    const res =
      isLocalServer.value && window.api
        ? await window.api.fsWriteFile(`${hermesDir.value}/config.yaml`, configYaml.value)
        : await remoteSettingsFetch('/config/yaml', {
            method: 'PUT',
            body: JSON.stringify({ content: configYaml.value })
          })
    if (res.ok) {
      message.success(t('pages.settings.saveSuccess'))
      configYamlNotFound.value = false
      opsStore.recordAudit({
        target: 'config.yaml',
        action: '保存',
        detail: `${currentServer.value?.url || 'local'} · ${configYaml.value.length} chars · 重启后生效`
      })
    } else {
      message.error(`${t('pages.settings.saveFailed')}: ${res.error}`)
    }
  } catch (e: any) {
    message.error(`${t('pages.settings.saveFailed')}: ${e.message}`)
  } finally {
    configYamlSaving.value = false
  }
}

async function saveEnv() {
  envSaving.value = true
  try {
    const res =
      isLocalServer.value && window.api
        ? await window.api.fsWriteFile(`${hermesDir.value}/.env`, envContent.value)
        : await remoteSettingsFetch('/config/env', {
            method: 'PUT',
            body: JSON.stringify({ content: envContent.value })
          })
    if (res.ok) {
      message.success(t('pages.settings.saveSuccess'))
      envNotFound.value = false
      opsStore.recordAudit({
        target: '.env',
        action: '保存',
        detail: `${currentServer.value?.url || 'local'} · ${envContent.value.split('\n').filter(Boolean).length} 行 · 重启后生效`
      })
    } else {
      message.error(`${t('pages.settings.saveFailed')}: ${res.error}`)
    }
  } catch (e: any) {
    message.error(`${t('pages.settings.saveFailed')}: ${e.message}`)
  } finally {
    envSaving.value = false
  }
}

function exportDiagnosticReport() {
  const report = opsStore.buildDiagnosticReport({
    desktop: {
      connectedServer: currentServer.value?.url || '',
      serverType: connectionStore.serverType,
      connectionStatus: connectionStore.status,
      model: connectionStore.hermesRealModel || ''
    },
    modelDiagnostic: {
      checkedAt: modelDiagnosticCheckedAt.value
        ? new Date(modelDiagnosticCheckedAt.value).toISOString()
        : null,
      items: modelDiagnosticItems.value
    },
    update: {
      current: hermesCurrentTag.value || hermesVersion.value,
      latest: hermesLatestTag.value,
      checkError: hermesCheckError.value,
      updateError: hermesUpdateError.value
    }
  })
  downloadJSON(
    report,
    `hermes-desktop-diagnostic-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  )
}

async function restartHermes() {
  restarting.value = true
  try {
    const res =
      isLocalServer.value && window.api
        ? await window.api.hermesRestart()
        : await remoteSettingsFetch('/restart', { method: 'POST' })
    if (res.ok) {
      message.success(t('pages.settings.restartSuccess'))
    } else {
      message.error(`${t('pages.settings.restartFailed')}: ${res.error}`)
    }
  } catch (e: any) {
    message.error(`${t('pages.settings.restartFailed')}: ${e.message}`)
  } finally {
    restarting.value = false
  }
}

onMounted(async () => {
  if (isLocalServer.value) {
    // Local: load config files and version directly via IPC
    loadConfigFiles()
    if (isHermesRest.value) {
      await fetchHermesVersion()
      checkHermesUpdate()
    }
  } else if (isHermesRest.value) {
    // Remote: probe management API; on success, triggerMgmtProbe loads
    // config/version/update status for the newly-visible feature cards.
    await triggerMgmtProbe()
  }
})

// Auto-re-probe when the connection transitions back to 'connected' after
// a drop (Tailscale reconnect, server restart, manual disconnect+reconnect).
// Without this, a one-shot probe failure during mount would leave the
// Settings page permanently showing the misleading "local-only" banner.
watch(
  () => connectionStore.status,
  (newStatus, oldStatus) => {
    if (
      newStatus === 'connected' &&
      oldStatus !== 'connected' &&
      isHermesRest.value &&
      !isLocalServer.value
    ) {
      void triggerMgmtProbe()
    }
  }
)

watch(
  () => [connectionStore.currentServer?.url || '', connectionStore.serverType] as const,
  () => {
    restSettingsAvailable.value = false
    restSettingsError.value = ''
    mgmtProbe.reset()
    if (connectionStore.status === 'connected' && isHermesRest.value && !isLocalServer.value) {
      void triggerMgmtProbe()
    }
  }
)
</script>

<template>
  <NSpace vertical :size="12" class="settings-page">
    <NCard class="app-card settings-overview-card">
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="CogOutline" size="18" />
          <span>系统设置</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NButton size="small" type="primary" secondary @click="exportDiagnosticReport">
          导出诊断包
        </NButton>
      </template>

      <NText depth="3" class="settings-overview-note">
        连接、模型、更新、诊断和偏好集中管理。
      </NText>
      <div class="settings-groups">
        <div class="settings-group">
          <div class="settings-group-title">连接与模型</div>
          <div class="settings-row">
            <span>服务器</span>
            <strong>{{ currentServer?.url || '-' }}</strong>
          </div>
          <div class="settings-row">
            <span>访问令牌</span>
            <strong>{{
              isNoAuth ? '免认证' : currentServer?.username ? '已配置' : '未配置'
            }}</strong>
          </div>
          <div class="settings-row">
            <span>主模型</span>
            <strong>{{ connectionStore.hermesRealModel || 'unknown' }}</strong>
          </div>
          <div class="settings-row">
            <span>备用模型</span>
            <strong>{{
              modelDiagnosticItems.some(
                (item) => item.key.includes('fallback') && item.type === 'success'
              )
                ? '可用'
                : '待诊断'
            }}</strong>
          </div>
          <NButton
            size="small"
            secondary
            :loading="modelDiagnosticLoading"
            @click="runModelDiagnostic"
          >
            运行诊断
          </NButton>
        </div>

        <div class="settings-group">
          <div class="settings-group-title">运维维护</div>
          <div class="settings-row">
            <span>版本更新</span>
            <strong>{{
              hermesCurrentTag || (hermesVersion ? `v${hermesVersion}` : `v${desktopVersion}`)
            }}</strong>
          </div>
          <div class="settings-row">
            <span>系统日志</span>
            <strong>可打开</strong>
          </div>
          <div class="settings-row">
            <span>数据备份</span>
            <strong>{{ t('routes.backup') }}</strong>
          </div>
          <div class="settings-row">
            <span>配置审计</span>
            <strong>{{ opsStore.recentAudits.length }} 条</strong>
          </div>
          <NButton size="small" secondary @click="goLogs">打开维护工具</NButton>
        </div>

        <div class="settings-group">
          <div class="settings-group-title">偏好设置</div>
          <div class="settings-row">
            <span>主题</span>
            <strong>{{ themeStore.mode }}</strong>
          </div>
          <div class="settings-row">
            <span>语言</span>
            <strong>中文 / English</strong>
          </div>
          <div class="settings-row">
            <span>侧栏</span>
            <strong>竖版固定</strong>
          </div>
          <div class="settings-row">
            <span>关于</span>
            <strong>Hermes Desktop</strong>
          </div>
          <NButton size="small" secondary @click="message.success('偏好已保存')">保存偏好</NButton>
        </div>
      </div>
    </NCard>

    <!-- Current Connection -->
    <NCard class="app-card">
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="ServerOutline" size="18" />
          <span>{{ t('pages.settings.currentConnection') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NTag :type="connectionStatus.type" size="small" round :bordered="false">
          {{ connectionStatus.text }}
        </NTag>
      </template>

      <NDescriptions label-placement="left" :column="1" bordered size="small" v-if="currentServer">
        <NDescriptionsItem :label="t('pages.settings.serverName')">
          {{ currentServer.name }}
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('pages.settings.serverAddress')">
          <NText code>{{ currentServer.url }}</NText>
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('pages.settings.authMethod')">
          <NTag v-if="isNoAuth" size="small" type="success" :bordered="false">{{
            t('pages.settings.noAuth')
          }}</NTag>
          <NSpace v-else align="center" :size="6">
            <NTag size="small" :bordered="false">{{ t('pages.settings.accountAuth') }}</NTag>
            <NText depth="3" style="font-size: 12px">{{ currentServer.username }}</NText>
          </NSpace>
        </NDescriptionsItem>
        <NDescriptionsItem
          :label="t('pages.settings.gatewayVersion')"
          v-if="wsStore.gatewayVersion"
        >
          {{ wsStore.gatewayVersion }}
        </NDescriptionsItem>
      </NDescriptions>

      <NSpace style="margin-top: 16px" :size="12">
        <NButton size="small" @click="handleSwitchServer">
          <template #icon><NIcon :component="SwapHorizontalOutline" /></template>
          {{ t('pages.settings.switchServer') }}
        </NButton>
        <NButton size="small" type="error" quaternary @click="handleDisconnect">
          {{ t('pages.settings.disconnect') }}
        </NButton>
      </NSpace>
    </NCard>

    <!-- Secondary maintenance entry points -->
    <NCard class="app-card">
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="CogOutline" size="18" />
          <span>维护工具</span>
        </NSpace>
      </template>
      <NText depth="3" class="settings-section-note"> 渠道、日志和备份收纳在这里。 </NText>
      <NGrid cols="1 m:3" responsive="screen" :x-gap="10" :y-gap="10">
        <NGridItem>
          <div class="settings-module-card">
            <div class="settings-module-head">
              <NIcon :component="PaperPlaneOutline" size="18" />
              <NText strong>{{ t('routes.channels') }}</NText>
            </div>
            <NText depth="3" class="settings-module-detail">
              管理外部消息渠道、账号认证和连接状态。
            </NText>
            <NButton size="small" secondary block @click="goChannels">打开渠道设置</NButton>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="settings-module-card">
            <div class="settings-module-head">
              <NIcon :component="DocumentTextOutline" size="18" />
              <NText strong>{{ t('routes.logs') }}</NText>
            </div>
            <NText depth="3" class="settings-module-detail">
              查看运行日志、筛选错误和导出排障线索。
            </NText>
            <NButton size="small" secondary block @click="goLogs">打开诊断日志</NButton>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="settings-module-card">
            <div class="settings-module-head">
              <NIcon :component="SaveOutline" size="18" />
              <NText strong>{{ t('routes.backup') }}</NText>
            </div>
            <NText depth="3" class="settings-module-detail">
              创建、恢复、上传和下载 Hermes 数据备份。
            </NText>
            <NButton size="small" secondary block @click="goBackup">打开数据维护</NButton>
          </div>
        </NGridItem>
      </NGrid>
    </NCard>

    <!-- Model & credential diagnostics -->
    <NCard class="app-card" v-if="isHermesRest">
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="InformationCircleOutline" size="18" />
          <span>模型与凭据诊断</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NSpace align="center" :size="8">
          <NTag
            size="small"
            :type="modelDiagnosticItems.length ? modelDiagnosticSummary.type : 'default'"
            round
            :bordered="false"
          >
            {{
              modelDiagnosticItems.length
                ? modelDiagnosticSummary.label
                : modelDiagnosticCheckedText
            }}
          </NTag>
          <NButton size="small" :loading="modelDiagnosticLoading" @click="runModelDiagnostic">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            运行诊断
          </NButton>
          <NButton
            v-if="modelDiagnosticItems.length"
            size="small"
            secondary
            @click="copyModelDiagnostic"
          >
            <template #icon><NIcon :component="CopyOutline" /></template>
            复制摘要
          </NButton>
        </NSpace>
      </template>

      <NDescriptions label-placement="left" :column="1" bordered size="small">
        <NDescriptionsItem label="服务器">
          <NText code>{{ currentServer?.url || '-' }}</NText>
        </NDescriptionsItem>
        <NDescriptionsItem label="当前识别模型">
          <NTag
            size="small"
            :bordered="false"
            round
            :type="connectionStore.hermesRealModel ? 'success' : 'warning'"
          >
            {{ connectionStore.hermesRealModel || 'unknown' }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem label="上次诊断">
          {{ modelDiagnosticCheckedText }}
        </NDescriptionsItem>
      </NDescriptions>

      <NSpin :show="modelDiagnosticLoading">
        <div v-if="modelDiagnosticItems.length" class="diagnostic-grid">
          <div v-for="item in modelDiagnosticItems" :key="item.key" class="diagnostic-item">
            <div class="diagnostic-item-head">
              <NText strong>{{ item.label }}</NText>
              <NTag size="small" :type="item.type" round :bordered="false">{{ item.value }}</NTag>
            </div>
            <NText depth="3" class="diagnostic-item-detail">{{ item.detail }}</NText>
          </div>
        </div>
        <NAlert v-else type="info" :closable="false" style="margin-top: 12px">
          点击运行诊断后，会检查服务健康、模型接口、主模型配置、备用模型和关键环境变量。
        </NAlert>
      </NSpin>
    </NCard>

    <!-- Server Info (remote without management API — basic fallback) -->
    <NCard class="app-card" v-if="isHermesRest && !isLocalServer && !remoteManageAvailable">
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="InformationCircleOutline" size="18" />
          <span>{{ t('pages.settings.serverInfo') }}</span>
        </NSpace>
      </template>

      <NDescriptions label-placement="left" :column="1" bordered size="small">
        <NDescriptionsItem :label="t('pages.settings.serverPlatform')">
          <NTag size="small" :bordered="false" round type="info">Hermes Agent</NTag>
        </NDescriptionsItem>
        <NDescriptionsItem
          :label="t('pages.settings.serverModel')"
          v-if="connectionStore.hermesRealModel"
        >
          <NTag size="small" :bordered="false" round type="success">
            {{ connectionStore.hermesRealModel }}
          </NTag>
        </NDescriptionsItem>
      </NDescriptions>

      <!-- Probe status / diagnostic + Retry -->
      <div style="margin-top: 12px">
        <NAlert v-if="remoteProbeBusy" type="default" :closable="false">
          <template #icon><NSpin :size="14" /></template>
          {{ t('pages.settings.mgmtProbing') }}
        </NAlert>
        <NAlert
          v-else-if="restSettingsError || (mgmtErrorKind && mgmtErrorKind !== 'empty-url')"
          type="info"
          :closable="false"
          :title="t('pages.settings.mgmtNotAvailable')"
        >
          <div style="font-size: 13px; margin-bottom: 6px">{{ mgmtErrorMessage }}</div>
          <div
            v-if="mgmtErrorDetail"
            style="
              font-family: ui-monospace, Menlo, Monaco, monospace;
              font-size: 12px;
              opacity: 0.75;
              word-break: break-word;
            "
          >
            {{ mgmtErrorDetail }}
          </div>
          <div style="font-size: 12px; margin-top: 8px; opacity: 0.85">
            {{ t('pages.settings.mgmtInstallHint') }}
          </div>
        </NAlert>
        <NAlert v-else type="info" :closable="false">
          {{ t('pages.settings.serverLocalOnly') }}
        </NAlert>
      </div>

      <NSpace style="margin-top: 12px" :size="8">
        <NButton size="small" :loading="remoteProbeBusy" @click="triggerMgmtProbe">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          {{ t('pages.settings.mgmtRetryProbe') }}
        </NButton>
      </NSpace>
    </NCard>

    <!-- Hermes Agent Version & Update (local server only — uses local git/binary) -->
    <NCard class="app-card" v-if="canManage">
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="RocketOutline" size="18" />
          <span>{{ t('pages.settings.hermesVersion') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NTag v-if="hermesVersion" size="small" :bordered="false" round type="info">
          v{{ hermesVersion }}
        </NTag>
      </template>

      <NDescriptions label-placement="left" :column="1" bordered size="small" v-if="hermesVersion">
        <NDescriptionsItem :label="t('pages.settings.currentVersion')">
          <NText strong>v{{ hermesVersion }}</NText>
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('pages.settings.releaseDate')" v-if="hermesDate">
          {{ hermesDate }}
        </NDescriptionsItem>
      </NDescriptions>
      <NSpin v-else-if="hermesVersionLoading" :show="true" size="small" style="padding: 12px 0" />

      <!-- Auto-check status -->
      <div style="margin-top: 12px">
        <!-- Checking spinner -->
        <NAlert v-if="hermesCheckingUpdate" type="default" :closable="false">
          <template #icon><NSpin :size="14" /></template>
          {{ t('pages.settings.checking') }}
        </NAlert>
        <!-- Update failure (persistent, user can retry) -->
        <NAlert
          v-else-if="hermesUpdateError"
          type="error"
          :closable="true"
          :title="t('pages.settings.updateFailed')"
          @close="hermesUpdateError = ''"
        >
          <div
            style="
              word-break: break-word;
              font-family: ui-monospace, Menlo, Monaco, monospace;
              font-size: 12px;
            "
          >
            {{ hermesUpdateError }}
          </div>
          <div v-if="updateAdvice" style="margin-top: 6px; font-size: 12px">{{ updateAdvice }}</div>
          <div style="margin-top: 6px; font-size: 12px; opacity: 0.8">
            {{ t('pages.settings.updateRetryHint') }}
          </div>
        </NAlert>
        <!-- Check failure (persistent, user can retry) -->
        <NAlert
          v-else-if="hermesCheckError"
          type="error"
          :closable="true"
          :title="t('pages.settings.checkUpdateFailed')"
          @close="hermesCheckError = ''"
        >
          <div
            style="
              word-break: break-word;
              font-family: ui-monospace, Menlo, Monaco, monospace;
              font-size: 12px;
            "
          >
            {{ hermesCheckError }}
          </div>
          <div v-if="updateAdvice" style="margin-top: 6px; font-size: 12px">{{ updateAdvice }}</div>
          <div style="margin-top: 6px; font-size: 12px; opacity: 0.8">
            {{ t('pages.settings.updateRetryHint') }}
          </div>
        </NAlert>
        <!-- Update available -->
        <NAlert v-else-if="hermesUpdateAvailable" type="warning" :closable="false">
          {{ t('pages.settings.updateAvailable', { version: hermesLatestTag }) }}
        </NAlert>
        <!-- Up to date -->
        <NAlert
          v-else-if="hermesUpdateChecked && !hermesUpdateAvailable"
          type="success"
          :closable="false"
        >
          {{ t('pages.settings.noUpdate') }}
        </NAlert>
      </div>

      <div
        v-if="hermesUpdating && hermesUpdateLog"
        style="
          margin-top: 12px;
          max-height: 120px;
          overflow-y: auto;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          padding: 8px;
          font-family: monospace;
          font-size: 12px;
          white-space: pre-wrap;
          color: #aaa;
        "
      >
        {{ hermesUpdateLog }}
      </div>

      <NSpace style="margin-top: 12px" :size="8">
        <NButton
          size="small"
          :loading="hermesCheckingUpdate"
          :disabled="hermesUpdating"
          @click="checkHermesUpdate"
        >
          <template #icon><NIcon :component="RefreshOutline" /></template>
          {{ t('pages.settings.checkUpdate') }}
        </NButton>
        <NButton
          v-if="hermesUpdateAvailable"
          size="small"
          type="primary"
          :loading="hermesUpdating"
          @click="doHermesUpdate"
        >
          <template #icon><NIcon :component="CloudDownloadOutline" /></template>
          {{ hermesUpdating ? t('pages.settings.updating') : t('pages.settings.updateNow') }}
        </NButton>
        <NButton size="small" tag="a" :href="hermesReleaseUrl" target="_blank">
          打开 Releases
        </NButton>
      </NSpace>
    </NCard>

    <!-- Hermes Config (config.yaml) — local only -->
    <NCard class="app-card app-card--collapsible" v-if="canManage">
      <template #header>
        <NSpace
          align="center"
          :size="8"
          style="cursor: pointer"
          @click="configExpanded = !configExpanded"
        >
          <NIcon :component="configExpanded ? ChevronUpOutline : ChevronDownOutline" size="18" />
          <NIcon :component="DocumentTextOutline" size="18" />
          <span>{{ t('pages.settings.hermesConfig') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NText depth="3" style="font-size: 12px">{{ t('pages.settings.hermesConfigDesc') }}</NText>
      </template>

      <div v-show="configExpanded">
        <NSpin :show="configYamlLoading">
          <NAlert
            v-if="configYamlNotFound"
            type="info"
            style="margin-bottom: 12px"
            :closable="false"
          >
            {{ t('pages.settings.fileNotFound') }}
          </NAlert>
          <NAlert v-if="configYamlError" type="error" style="margin-bottom: 12px" :closable="false">
            {{ configYamlError }}
          </NAlert>
          <NInput
            v-model:value="configYaml"
            type="textarea"
            :autosize="{ minRows: 8, maxRows: 24 }"
            :placeholder="
              configYamlLoading
                ? t('pages.settings.loadingFile')
                : 'model:\n  default: openai-codex/gpt-5.4\n  provider: openai-codex'
            "
            style="font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 13px"
          />
          <NSpace style="margin-top: 12px" :size="8">
            <NButton
              type="primary"
              size="small"
              :loading="configYamlSaving"
              :disabled="configYamlLoading"
              @click="saveConfigYaml"
            >
              <template #icon><NIcon :component="SaveOutline" /></template>
              {{ configYamlSaving ? t('pages.settings.saving') : t('pages.settings.saveFile') }}
            </NButton>
          </NSpace>
        </NSpin>
      </div>
    </NCard>

    <!-- Hermes .env — local only -->
    <NCard class="app-card app-card--collapsible" v-if="canManage">
      <template #header>
        <NSpace
          align="center"
          :size="8"
          style="cursor: pointer"
          @click="envExpanded = !envExpanded"
        >
          <NIcon :component="envExpanded ? ChevronUpOutline : ChevronDownOutline" size="18" />
          <NIcon :component="DocumentTextOutline" size="18" />
          <span>{{ t('pages.settings.hermesEnv') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NText depth="3" style="font-size: 12px">{{ t('pages.settings.hermesEnvDesc') }}</NText>
      </template>

      <div v-show="envExpanded">
        <NSpin :show="envLoading">
          <NAlert v-if="envNotFound" type="info" style="margin-bottom: 12px" :closable="false">
            {{ t('pages.settings.fileNotFound') }}
          </NAlert>
          <NAlert v-if="envError" type="error" style="margin-bottom: 12px" :closable="false">
            {{ envError }}
          </NAlert>
          <NInput
            v-model:value="envContent"
            type="textarea"
            :autosize="{ minRows: 6, maxRows: 20 }"
            :placeholder="
              envLoading
                ? t('pages.settings.loadingFile')
                : 'API_SERVER_KEY=\nOPENAI_API_KEY=sk-...'
            "
            style="font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 13px"
          />
          <NSpace style="margin-top: 12px" :size="8">
            <NButton
              type="primary"
              size="small"
              :loading="envSaving"
              :disabled="envLoading"
              @click="saveEnv"
            >
              <template #icon><NIcon :component="SaveOutline" /></template>
              {{ envSaving ? t('pages.settings.saving') : t('pages.settings.saveFile') }}
            </NButton>
          </NSpace>
        </NSpin>
      </div>
    </NCard>

    <!-- Restart Hermes service — local only (macOS launchd) -->
    <NCard class="app-card" v-if="canManage">
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="RefreshOutline" size="18" />
          <span>{{ t('pages.settings.restartHermes') }}</span>
        </NSpace>
      </template>

      <NAlert type="info" :closable="false" style="margin-bottom: 12px">
        {{ t('pages.settings.restartTip') }}
      </NAlert>
      <NButton type="warning" size="small" :loading="restarting" @click="restartHermes">
        <template #icon><NIcon :component="RefreshOutline" /></template>
        {{ restarting ? t('pages.settings.restarting') : t('pages.settings.restartHermes') }}
      </NButton>
    </NCard>

    <!-- Notifications, audit and diagnostic export -->
    <NGrid cols="1 l:3" responsive="screen" :x-gap="12" :y-gap="12">
      <NGridItem>
        <NCard title="通知中心" class="app-card settings-ops-card">
          <template #header-extra>
            <NTag
              size="small"
              :type="opsStore.activeNotices.length ? 'warning' : 'success'"
              round
              :bordered="false"
            >
              {{ opsStore.activeNotices.length }} 待处理
            </NTag>
          </template>
          <NSpace v-if="opsStore.recentNotices.length" vertical :size="8">
            <div
              v-for="notice in opsStore.recentNotices.slice(0, 4)"
              :key="notice.id"
              class="settings-ops-row"
            >
              <div class="settings-ops-row-head">
                <NText strong>{{ notice.title }}</NText>
                <NTag size="tiny" :type="opsTagType(notice.severity)" round :bordered="false">
                  {{ notice.source }}
                </NTag>
              </div>
              <NText depth="3" class="settings-ops-row-detail">{{ notice.detail }}</NText>
              <NButton
                v-if="!notice.resolvedAt"
                size="tiny"
                secondary
                @click="opsStore.resolveNotice(notice.id)"
              >
                标记已处理
              </NButton>
            </div>
          </NSpace>
          <NText v-else depth="3">暂无通知。</NText>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard title="配置变更审计" class="app-card settings-ops-card">
          <NSpace v-if="opsStore.recentAudits.length" vertical :size="8">
            <div
              v-for="audit in opsStore.recentAudits.slice(0, 5)"
              :key="audit.id"
              class="settings-ops-row"
            >
              <div class="settings-ops-row-head">
                <NText strong>{{ audit.target }}</NText>
                <NTag size="tiny" round :bordered="false">{{ audit.action }}</NTag>
              </div>
              <NText depth="3" class="settings-ops-row-detail">{{ audit.detail }}</NText>
              <NText depth="3" style="font-size: 12px">{{
                formatRelativeTime(audit.createdAt)
              }}</NText>
            </div>
          </NSpace>
          <NText v-else depth="3">保存 config.yaml 或 .env 后会自动记录审计摘要。</NText>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard title="故障报告导出" class="app-card settings-ops-card">
          <NText depth="3" class="settings-ops-row-detail">
            导出 Desktop 连接状态、模型诊断、通知中心和配置审计摘要，方便跨设备排障。
          </NText>
          <NSpace vertical :size="8">
            <NButton size="small" type="primary" secondary @click="exportDiagnosticReport">
              导出诊断包
            </NButton>
            <NButton
              size="small"
              secondary
              :loading="modelDiagnosticLoading"
              @click="runModelDiagnostic"
            >
              重新测试主备模型
            </NButton>
          </NSpace>
        </NCard>
      </NGridItem>
    </NGrid>

    <!-- Appearance -->
    <NCard :title="t('pages.settings.appearanceSettings')" class="app-card">
      <NForm label-placement="left" label-width="120" style="max-width: 500px">
        <NFormItem :label="t('pages.settings.themeMode')">
          <NSelect
            :value="themeStore.mode"
            :options="themeOptions"
            @update:value="handleThemeChange"
          />
        </NFormItem>
      </NForm>
    </NCard>

    <!-- About -->
    <NCard :title="t('pages.settings.about')" class="app-card">
      <NSpace vertical :size="8">
        <NText>Hermes Desktop</NText>
        <NText depth="3" style="font-size: 13px">
          {{ t('pages.settings.aboutLine1') }}
        </NText>
        <NText depth="3" style="font-size: 13px">
          {{ t('pages.settings.aboutLine2') }}
        </NText>
      </NSpace>
    </NCard>
  </NSpace>
</template>

<style scoped>
.settings-page {
  font-size: var(--font-body);
}

.settings-overview-card {
  border-radius: var(--radius);
}

.settings-overview-note {
  display: block;
  margin-bottom: var(--ui-gap);
  font-size: var(--font-body-sm);
  line-height: var(--line-normal);
}

.settings-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-gap);
}

.settings-group {
  padding: var(--ui-panel-padding);
  border: 1px solid var(--n-border-color);
  border-radius: var(--radius);
  background: var(--n-color-embedded);
  min-width: 0;
}

.settings-group-title {
  font-size: var(--font-section-title);
  font-weight: 760;
  margin-bottom: var(--ui-gap-sm);
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-gap);
  padding: 7px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: var(--font-body);
}

.settings-row span {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.settings-row strong {
  min-width: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.settings-group .n-button {
  margin-top: 10px;
}

.diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-gap-sm);
  margin-top: 12px;
}

.diagnostic-item {
  border: 1px solid var(--n-border-color);
  border-radius: var(--radius);
  padding: var(--ui-panel-padding-sm) 12px;
  min-width: 0;
}

.diagnostic-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.diagnostic-item-detail {
  display: block;
  margin-top: 8px;
  font-size: var(--font-body-sm);
  line-height: var(--line-normal);
  overflow-wrap: anywhere;
}

.settings-section-note {
  display: block;
  margin-bottom: var(--ui-gap);
  font-size: var(--font-body-sm);
  line-height: var(--line-normal);
}

.settings-module-card {
  border: 1px solid var(--n-border-color);
  border-radius: var(--radius);
  padding: var(--ui-panel-padding-sm);
  min-height: 124px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-module-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-module-detail {
  display: block;
  flex: 1;
  font-size: var(--font-body-sm);
  line-height: var(--line-normal);
}

.settings-ops-card {
  height: 100%;
}

.settings-ops-row {
  border: 1px solid var(--n-border-color);
  border-radius: var(--radius);
  padding: var(--ui-panel-padding-sm) 12px;
}

.settings-ops-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.settings-ops-row-detail {
  display: block;
  margin: 6px 0 8px;
  font-size: var(--font-body-sm);
  line-height: var(--line-normal);
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .settings-groups {
    grid-template-columns: 1fr;
  }

  .diagnostic-grid {
    grid-template-columns: 1fr;
  }
}
</style>
