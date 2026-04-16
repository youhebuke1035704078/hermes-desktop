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
  NDescriptions,
  NDescriptionsItem,
  NInput,
  NSpin,
  NAlert,
  useMessage,
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
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useThemeStore, type ThemeMode } from '@/stores/theme'
import { useWebSocketStore } from '@/stores/websocket'
import { useConnectionStore } from '@/stores/connection'
import { ConnectionState } from '@/api/types'
import { useMgmtProbe, type MgmtFetchResult } from '@/composables/useMgmtProbe'

const router = useRouter()
const themeStore = useThemeStore()
const wsStore = useWebSocketStore()
const connectionStore = useConnectionStore()
const { t } = useI18n()
const message = useMessage()

// ── Theme ──
const themeOptions = computed(() => ([
  { label: t('pages.settings.themeLight'), value: 'light' },
  { label: t('pages.settings.themeDark'), value: 'dark' },
]))

// ── Connection status ──
const connectionStatus = computed(() => {
  // Local Hermes REST mode has no WebSocket — derive status from connectionStore
  if (connectionStore.serverType === 'hermes-rest') {
    const st = connectionStore.status
    if (st === 'connected') return { text: t('pages.settings.statusConnected'), type: 'success' as const }
    if (st === 'connecting') return { text: t('pages.settings.statusConnecting'), type: 'info' as const }
    if (st === 'error') return { text: t('pages.settings.statusFailed'), type: 'error' as const }
    return { text: t('pages.settings.statusDisconnected'), type: 'error' as const }
  }
  switch (wsStore.state) {
    case ConnectionState.CONNECTED: return { text: t('pages.settings.statusConnected'), type: 'success' as const }
    case ConnectionState.CONNECTING: return { text: t('pages.settings.statusConnecting'), type: 'info' as const }
    case ConnectionState.RECONNECTING: return { text: t('pages.settings.statusReconnecting', { count: wsStore.reconnectAttempts }), type: 'warning' as const }
    case ConnectionState.FAILED: return { text: t('pages.settings.statusFailed'), type: 'error' as const }
    default: return { text: t('pages.settings.statusDisconnected'), type: 'error' as const }
  }
})

const currentServer = computed(() => connectionStore.currentServer)
const isNoAuth = computed(() => currentServer.value?.username === '_noauth_')
const isHermesRest = computed(() => connectionStore.serverType === 'hermes-rest')
/** True when connected server is localhost — version/config/restart only work locally */
const isLocalServer = computed(() => {
  const url = connectionStore.currentServer?.url
  if (!url) return false
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch { return false }
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
  } catch { return '' }
})

/** Wall-clock timeout for the mgmt-server health probe. Main-process
 *  httpFetch has no built-in timeout, so we race against a setTimeout
 *  to avoid a hung Tailscale connect leaving the UI in "probing" forever. */
const MGMT_PROBE_TIMEOUT_MS = 5000

async function mgmtHealthFetcher(url: string): Promise<MgmtFetchResult> {
  const fetchPromise: Promise<MgmtFetchResult> = window.api
    ? window.api.httpFetch(url).then(r => ({ ok: r.ok, status: r.status, body: r.body }))
    : fetch(url, { signal: AbortSignal.timeout(MGMT_PROBE_TIMEOUT_MS) })
        .then(async r => ({ ok: r.ok, status: r.status, body: await r.text() }))
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

/** True if version/config/restart features should be shown */
const canManage = computed(() => isHermesRest.value && (isLocalServer.value || mgmtAvailable.value))

/** Human-friendly message for the current probe failure, or '' on success. */
const mgmtErrorMessage = computed(() => {
  const kind = mgmtErrorKind.value
  if (!kind || kind === 'empty-url') return ''
  return t(`pages.settings.mgmtError.${kind}`, { url: mgmtUrl.value })
})

/** Call remote management API with auth */
async function mgmtFetch(path: string, options: { method?: string; body?: string } = {}): Promise<any> {
  const url = `${mgmtUrl.value}${path}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (connectionStore.hermesAuthToken) headers['Authorization'] = `Bearer ${connectionStore.hermesAuthToken}`
  if (window.api) {
    const resp = await window.api.httpFetch(url, { method: options.method || 'GET', headers, body: options.body })
    return typeof resp.body === 'string' && resp.body ? JSON.parse(resp.body) : resp
  }
  const resp = await fetch(url, { method: options.method || 'GET', headers, body: options.body, signal: AbortSignal.timeout(10000) })
  return resp.json()
}

/** Probe the mgmt-server and, on success, eagerly populate the feature cards.
 *  Safe to call repeatedly — used by onMounted, the Retry button, and the
 *  connection-status watcher after a reconnect. */
async function triggerMgmtProbe(): Promise<void> {
  if (isLocalServer.value || !isHermesRest.value) return
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
const hermesUpdateChecked = ref(false)   // true after first check completes
const hermesCheckingUpdate = ref(false)
const hermesUpdating = ref(false)
const hermesUpdateLog = ref('')
// Persistent error state so users don't lose context when the auto-dismiss
// toast fades. Cleared at the start of each check/update attempt.
const hermesCheckError = ref('')
const hermesUpdateError = ref('')

async function fetchHermesVersion() {
  hermesVersionLoading.value = true
  try {
    const res = isLocalServer.value && window.api
      ? await window.api.hermesVersion()
      : await mgmtFetch('/version')
    if (res.ok) {
      hermesVersion.value = res.version || ''
      hermesDate.value = res.date || ''
    }
  } catch { /* ignore */ }
  finally { hermesVersionLoading.value = false }
}

async function checkHermesUpdate() {
  hermesCheckingUpdate.value = true
  hermesUpdateAvailable.value = false
  // Clear stale error state on every attempt so the user isn't confused
  // by a leftover message from a previous failure.
  hermesCheckError.value = ''
  try {
    const res = isLocalServer.value && window.api
      ? await window.api.hermesCheckUpdate()
      : await mgmtFetch('/check-update')
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
    const res = isLocalServer.value && window.api
      ? await window.api.hermesUpdate()
      : await mgmtFetch('/update', { method: 'POST' })
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
    hermesDir.value = '~/.hermes'
  }

  // Load config.yaml
  configYamlLoading.value = true
  configYamlError.value = ''
  configYamlNotFound.value = false
  try {
    const res = isLocalServer.value && window.api
      ? await window.api.fsReadFile(`${hermesDir.value}/config.yaml`)
      : await mgmtFetch('/config/yaml')
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
    const res = isLocalServer.value && window.api
      ? await window.api.fsReadFile(`${hermesDir.value}/.env`)
      : await mgmtFetch('/config/env')
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
    const res = isLocalServer.value && window.api
      ? await window.api.fsWriteFile(`${hermesDir.value}/config.yaml`, configYaml.value)
      : await mgmtFetch('/config/yaml', { method: 'PUT', body: JSON.stringify({ content: configYaml.value }) })
    if (res.ok) {
      message.success(t('pages.settings.saveSuccess'))
      configYamlNotFound.value = false
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
    const res = isLocalServer.value && window.api
      ? await window.api.fsWriteFile(`${hermesDir.value}/.env`, envContent.value)
      : await mgmtFetch('/config/env', { method: 'PUT', body: JSON.stringify({ content: envContent.value }) })
    if (res.ok) {
      message.success(t('pages.settings.saveSuccess'))
      envNotFound.value = false
    } else {
      message.error(`${t('pages.settings.saveFailed')}: ${res.error}`)
    }
  } catch (e: any) {
    message.error(`${t('pages.settings.saveFailed')}: ${e.message}`)
  } finally {
    envSaving.value = false
  }
}

async function restartHermes() {
  restarting.value = true
  try {
    const res = isLocalServer.value && window.api
      ? await window.api.hermesRestart()
      : await mgmtFetch('/restart', { method: 'POST' })
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
watch(() => connectionStore.status, (newStatus, oldStatus) => {
  if (
    newStatus === 'connected' &&
    oldStatus !== 'connected' &&
    isHermesRest.value &&
    !isLocalServer.value
  ) {
    void triggerMgmtProbe()
  }
})
</script>

<template>
  <NSpace vertical :size="16">
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
          <NTag v-if="isNoAuth" size="small" type="success" :bordered="false">{{ t('pages.settings.noAuth') }}</NTag>
          <NSpace v-else align="center" :size="6">
            <NTag size="small" :bordered="false">{{ t('pages.settings.accountAuth') }}</NTag>
            <NText depth="3" style="font-size: 12px;">{{ currentServer.username }}</NText>
          </NSpace>
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('pages.settings.gatewayVersion')" v-if="wsStore.gatewayVersion">
          {{ wsStore.gatewayVersion }}
        </NDescriptionsItem>
      </NDescriptions>

      <NSpace style="margin-top: 16px;" :size="12">
        <NButton size="small" @click="handleSwitchServer">
          <template #icon><NIcon :component="SwapHorizontalOutline" /></template>
          {{ t('pages.settings.switchServer') }}
        </NButton>
        <NButton size="small" type="error" quaternary @click="handleDisconnect">
          {{ t('pages.settings.disconnect') }}
        </NButton>
      </NSpace>
    </NCard>

    <!-- Server Info (remote without management API — basic fallback) -->
    <NCard class="app-card" v-if="isHermesRest && !isLocalServer && !mgmtAvailable">
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
        <NDescriptionsItem :label="t('pages.settings.serverModel')" v-if="connectionStore.hermesRealModel">
          <NTag size="small" :bordered="false" round type="success">
            {{ connectionStore.hermesRealModel }}
          </NTag>
        </NDescriptionsItem>
      </NDescriptions>

      <!-- Probe status / diagnostic + Retry -->
      <div style="margin-top: 12px;">
        <NAlert v-if="mgmtProbing" type="default" :closable="false">
          <template #icon><NSpin :size="14" /></template>
          {{ t('pages.settings.mgmtProbing') }}
        </NAlert>
        <NAlert
          v-else-if="mgmtErrorKind && mgmtErrorKind !== 'empty-url'"
          type="info"
          :closable="false"
          :title="t('pages.settings.mgmtNotAvailable')"
        >
          <div style="font-size: 13px; margin-bottom: 6px;">{{ mgmtErrorMessage }}</div>
          <div
            v-if="mgmtErrorDetail"
            style="font-family: ui-monospace, Menlo, Monaco, monospace; font-size: 12px; opacity: 0.75; word-break: break-word;"
          >
            {{ mgmtErrorDetail }}
          </div>
          <div style="font-size: 12px; margin-top: 8px; opacity: 0.85;">
            {{ t('pages.settings.mgmtInstallHint') }}
          </div>
        </NAlert>
        <NAlert v-else type="info" :closable="false">
          {{ t('pages.settings.serverLocalOnly') }}
        </NAlert>
      </div>

      <NSpace style="margin-top: 12px;" :size="8">
        <NButton size="small" :loading="mgmtProbing" @click="triggerMgmtProbe">
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
      <NSpin v-else-if="hermesVersionLoading" :show="true" size="small" style="padding: 12px 0;" />

      <!-- Auto-check status -->
      <div style="margin-top: 12px;">
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
          <div style="word-break: break-word; font-family: ui-monospace, Menlo, Monaco, monospace; font-size: 12px;">{{ hermesUpdateError }}</div>
          <div style="margin-top: 6px; font-size: 12px; opacity: 0.8;">{{ t('pages.settings.updateRetryHint') }}</div>
        </NAlert>
        <!-- Check failure (persistent, user can retry) -->
        <NAlert
          v-else-if="hermesCheckError"
          type="error"
          :closable="true"
          :title="t('pages.settings.checkUpdateFailed')"
          @close="hermesCheckError = ''"
        >
          <div style="word-break: break-word; font-family: ui-monospace, Menlo, Monaco, monospace; font-size: 12px;">{{ hermesCheckError }}</div>
          <div style="margin-top: 6px; font-size: 12px; opacity: 0.8;">{{ t('pages.settings.updateRetryHint') }}</div>
        </NAlert>
        <!-- Update available -->
        <NAlert v-else-if="hermesUpdateAvailable" type="warning" :closable="false">
          {{ t('pages.settings.updateAvailable', { version: hermesLatestTag }) }}
        </NAlert>
        <!-- Up to date -->
        <NAlert v-else-if="hermesUpdateChecked && !hermesUpdateAvailable" type="success" :closable="false">
          {{ t('pages.settings.noUpdate') }}
        </NAlert>
      </div>

      <div v-if="hermesUpdating && hermesUpdateLog" style="margin-top: 12px; max-height: 120px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 12px; white-space: pre-wrap; color: #aaa;">{{ hermesUpdateLog }}</div>

      <NSpace style="margin-top: 12px;" :size="8">
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
      </NSpace>
    </NCard>

    <!-- Hermes Config (config.yaml) — local only -->
    <NCard class="app-card app-card--collapsible" v-if="canManage">
      <template #header>
        <NSpace align="center" :size="8" style="cursor: pointer;" @click="configExpanded = !configExpanded">
          <NIcon :component="configExpanded ? ChevronUpOutline : ChevronDownOutline" size="18" />
          <NIcon :component="DocumentTextOutline" size="18" />
          <span>{{ t('pages.settings.hermesConfig') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NText depth="3" style="font-size: 12px;">{{ t('pages.settings.hermesConfigDesc') }}</NText>
      </template>

      <div v-show="configExpanded">
        <NSpin :show="configYamlLoading">
          <NAlert v-if="configYamlNotFound" type="info" style="margin-bottom: 12px;" :closable="false">
            {{ t('pages.settings.fileNotFound') }}
          </NAlert>
          <NAlert v-if="configYamlError" type="error" style="margin-bottom: 12px;" :closable="false">
            {{ configYamlError }}
          </NAlert>
          <NInput
            v-model:value="configYaml"
            type="textarea"
            :autosize="{ minRows: 8, maxRows: 24 }"
            :placeholder="configYamlLoading ? t('pages.settings.loadingFile') : 'model:\n  default: openai-codex/gpt-5.4\n  provider: openai-codex'"
            style="font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 13px;"
          />
          <NSpace style="margin-top: 12px;" :size="8">
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
        <NSpace align="center" :size="8" style="cursor: pointer;" @click="envExpanded = !envExpanded">
          <NIcon :component="envExpanded ? ChevronUpOutline : ChevronDownOutline" size="18" />
          <NIcon :component="DocumentTextOutline" size="18" />
          <span>{{ t('pages.settings.hermesEnv') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NText depth="3" style="font-size: 12px;">{{ t('pages.settings.hermesEnvDesc') }}</NText>
      </template>

      <div v-show="envExpanded">
        <NSpin :show="envLoading">
          <NAlert v-if="envNotFound" type="info" style="margin-bottom: 12px;" :closable="false">
            {{ t('pages.settings.fileNotFound') }}
          </NAlert>
          <NAlert v-if="envError" type="error" style="margin-bottom: 12px;" :closable="false">
            {{ envError }}
          </NAlert>
          <NInput
            v-model:value="envContent"
            type="textarea"
            :autosize="{ minRows: 6, maxRows: 20 }"
            :placeholder="envLoading ? t('pages.settings.loadingFile') : 'API_SERVER_KEY=\nOPENAI_API_KEY=sk-...'"
            style="font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 13px;"
          />
          <NSpace style="margin-top: 12px;" :size="8">
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

      <NAlert type="info" :closable="false" style="margin-bottom: 12px;">
        {{ t('pages.settings.restartTip') }}
      </NAlert>
      <NButton
        type="warning"
        size="small"
        :loading="restarting"
        @click="restartHermes"
      >
        <template #icon><NIcon :component="RefreshOutline" /></template>
        {{ restarting ? t('pages.settings.restarting') : t('pages.settings.restartHermes') }}
      </NButton>
    </NCard>

    <!-- Appearance -->
    <NCard :title="t('pages.settings.appearanceSettings')" class="app-card">
      <NForm label-placement="left" label-width="120" style="max-width: 500px;">
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
        <NText depth="3" style="font-size: 13px;">
          {{ t('pages.settings.aboutLine1') }}
        </NText>
        <NText depth="3" style="font-size: 13px;">
          {{ t('pages.settings.aboutLine2') }}
        </NText>
      </NSpace>
    </NCard>
  </NSpace>
</template>
