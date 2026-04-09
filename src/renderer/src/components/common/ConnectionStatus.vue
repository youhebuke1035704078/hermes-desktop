<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { NTag, NSpace, NButton, NSelect, NPopover, NProgress } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useWebSocketStore } from '@/stores/websocket'
import { ConnectionState } from '@/api/types'

const message = useMessage()

const wsStore = useWebSocketStore()
const { t } = useI18n()
const isUpdating = ref(false)
const selectedVersion = ref('')
const versionOptions = ref<Array<{ label: string; value: string }>>([])
const isLoadingVersions = ref(false)
const latestVersion = ref<string | null>(null)
const updateStatusMessage = ref('')
const updateProgress = ref(0)

// ── Desktop App self-update ──
const appVersion = ref('')
const appUpdateAvailable = ref(false)
const appNewVersion = ref('')
const appDownloading = ref(false)
const appDownloadPercent = ref(0)
const appDownloaded = ref(false)
const appUpdateError = ref('')
const appChecking = ref(false)

const status = computed(() => {
  switch (wsStore.state) {
    case ConnectionState.CONNECTED:
      return { label: t('components.connectionStatus.connected'), type: 'success' as const }
    case ConnectionState.CONNECTING:
      return { label: t('components.connectionStatus.connecting'), type: 'info' as const }
    case ConnectionState.RECONNECTING:
      return { label: t('components.connectionStatus.reconnecting'), type: 'warning' as const }
    case ConnectionState.FAILED:
      return { label: t('components.connectionStatus.failed'), type: 'error' as const }
    case ConnectionState.DISCONNECTED:
    default:
      return { label: t('components.connectionStatus.disconnected'), type: 'error' as const }
  }
})

const hasUpdate = computed(() => {
  if (wsStore.gatewayVersion && latestVersion.value) {
    return wsStore.gatewayVersion !== latestVersion.value
  }
  return false
})

const displayLatestVersion = computed(() => {
  return latestVersion.value
})

async function fetchNpmVersions() {
  isLoadingVersions.value = true
  try {
    const api = (window as any).api
    if (!api?.npmVersions) {
      throw new Error('npmVersions IPC not available')
    }
    const result = await api.npmVersions()
    const versions: string[] = result.ok ? result.versions : []

    if (versions.length > 0) {
      latestVersion.value = versions[0]
      versionOptions.value = versions.slice(0, 20).map((v: string) => ({ label: v, value: v }))
      selectedVersion.value = versions[0]
    } else {
      if (wsStore.gatewayVersion) {
        versionOptions.value = [{ label: wsStore.gatewayVersion, value: wsStore.gatewayVersion }]
        selectedVersion.value = wsStore.gatewayVersion
      }
    }
  } catch (error) {
    console.error('[ConnectionStatus] Failed to fetch npm versions:', error)
    if (wsStore.gatewayVersion) {
      versionOptions.value = [{ label: wsStore.gatewayVersion, value: wsStore.gatewayVersion }]
      selectedVersion.value = wsStore.gatewayVersion
    }
  } finally {
    isLoadingVersions.value = false
  }
}

const updateVersionOptions = async () => {
  if (wsStore.state === ConnectionState.CONNECTED) {
    await fetchNpmVersions()
  }
}

let unsubscribeConnected: (() => void) | null = null
let unsubUpdater: (() => void) | null = null

onMounted(async () => {
  await updateVersionOptions()

  unsubscribeConnected = wsStore.subscribe('connected', async () => {
    await updateVersionOptions()
  })

  // Load current app version
  const api = (window as any).api
  if (api?.getVersion) {
    appVersion.value = await api.getVersion()
  }

  // Listen for updater status events from main process
  if (api?.onUpdaterStatus) {
    unsubUpdater = api.onUpdaterStatus((data: any) => {
      switch (data.event) {
        case 'checking':
          appChecking.value = true
          break
        case 'available':
          appChecking.value = false
          appUpdateAvailable.value = true
          appNewVersion.value = data.version || ''
          break
        case 'not-available':
          appChecking.value = false
          appUpdateAvailable.value = false
          break
        case 'progress':
          appDownloading.value = true
          appDownloadPercent.value = data.percent || 0
          break
        case 'downloaded':
          appDownloading.value = false
          appDownloaded.value = true
          appDownloadPercent.value = 100
          break
        case 'error':
          appChecking.value = false
          appDownloading.value = false
          appUpdateError.value = data.error || '更新失败'
          break
      }
    })
  }
})

onUnmounted(() => {
  unsubscribeConnected?.()
  unsubscribeConnected = null
  unsubUpdater?.()
  unsubUpdater = null
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Parse "retry after Ns" from rate limit error */
function parseRetryDelay(errMsg: string): number | null {
  const m = /retry after (\d+)s/i.exec(errMsg)
  return m ? parseInt(m[1]!, 10) * 1000 : null
}

let progressTimer: ReturnType<typeof setInterval> | null = null

function startProgressSimulation() {
  updateProgress.value = 5
  if (progressTimer) clearInterval(progressTimer)
  progressTimer = setInterval(() => {
    // Gradually increase but never reach 100
    if (updateProgress.value < 85) {
      updateProgress.value += Math.random() * 3 + 1
    } else if (updateProgress.value < 95) {
      updateProgress.value += 0.5
    }
  }, 1000)
}

function stopProgressSimulation() {
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
}

async function checkAppUpdate() {
  appUpdateError.value = ''
  const api = (window as any).api
  if (api?.updaterCheck) {
    const result = await api.updaterCheck()
    if (!result.ok && result.error) {
      appUpdateError.value = result.error
    }
  }
}

async function downloadAppUpdate() {
  appUpdateError.value = ''
  appDownloading.value = true
  appDownloadPercent.value = 0
  const api = (window as any).api
  if (api?.updaterDownload) {
    const result = await api.updaterDownload()
    if (!result.ok && result.error) {
      appDownloading.value = false
      appUpdateError.value = result.error
    }
  }
}

function installAppUpdate() {
  const api = (window as any).api
  if (api?.updaterInstall) {
    api.updaterInstall()
  }
}

async function handleCustomUpdate() {
  if (!selectedVersion.value) return

  const version = selectedVersion.value
  isUpdating.value = true
  updateProgress.value = 0
  updateStatusMessage.value = '正在准备升级...'
  startProgressSimulation()

  const MAX_RETRIES = 3

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      updateStatusMessage.value = '正在通过网关升级 OpenClaw...'

      const result = await wsStore.rpc.runUpdate({
        version,
        restartDelayMs: 3000,
        timeoutMs: 180000,
      })

      stopProgressSimulation()

      if (result.ok) {
        updateProgress.value = 100
        const before = result.result?.before?.version || wsStore.gatewayVersion
        const after = result.result?.after?.version || version
        if (result.restart?.ok) {
          updateStatusMessage.value = `升级成功 ${before} → ${after}，网关重启中...`
          message.success(`升级成功: ${before} → ${after}，网关将在数秒后重启`)
        } else {
          updateStatusMessage.value = `升级完成 ${before} → ${after}`
          message.success(`升级完成: ${before} → ${after}`)
        }
      } else {
        updateProgress.value = 100
        const reason = result.result?.reason || '升级失败'
        updateStatusMessage.value = reason
        message.error(`升级失败: ${reason}`)
      }

      // Success or non-retryable failure — break out
      break
    } catch (err: any) {
      const errMsg: string = err?.message || '未知错误'
      const retryDelay = parseRetryDelay(errMsg)

      if (retryDelay && attempt < MAX_RETRIES) {
        // Rate limited — wait and retry
        const secs = Math.ceil(retryDelay / 1000)
        updateStatusMessage.value = `请求频率限制，${secs} 秒后自动重试 (${attempt}/${MAX_RETRIES})...`
        updateProgress.value = Math.min(updateProgress.value, 20)

        // Countdown
        for (let s = secs; s > 0; s--) {
          updateStatusMessage.value = `请求频率限制，${s} 秒后自动重试 (${attempt}/${MAX_RETRIES})...`
          await sleep(1000)
        }
        continue
      }

      // Non-retryable error
      stopProgressSimulation()
      updateProgress.value = 0
      updateStatusMessage.value = errMsg
      message.error(`升级出错: ${errMsg}`)
      break
    }
  }

  isUpdating.value = false
  setTimeout(() => {
    updateStatusMessage.value = ''
    updateProgress.value = 0
  }, 8000)
}
</script>

<template>
  <NSpace :size="8" align="center">
    <!-- Desktop App version & update -->
    <NPopover
      v-if="appUpdateAvailable || appDownloading || appDownloaded"
      trigger="click"
      placement="bottom"
      :width="300"
    >
      <template #trigger>
        <NTag
          size="small"
          :bordered="false"
          round
          :type="appDownloaded ? 'success' : 'warning'"
          style="cursor: pointer;"
        >
          {{
            appDownloaded
              ? `Desktop 新版本已就绪`
              : appDownloading
              ? `Desktop 下载中 ${Math.round(appDownloadPercent)}%`
              : `Desktop 新版本 v${appNewVersion}`
          }}
        </NTag>
      </template>
      <div style="padding: 12px;">
        <div style="margin-bottom: 8px; font-size: 13px;">
          当前 Desktop 版本 v{{ appVersion }}
        </div>

        <!-- Download progress -->
        <NProgress
          v-if="appDownloading"
          type="line"
          :percentage="Math.round(appDownloadPercent)"
          :show-indicator="true"
          style="margin-bottom: 8px;"
        />

        <NSpace :size="8">
          <NButton
            v-if="!appDownloaded && !appDownloading"
            size="small"
            type="primary"
            @click="downloadAppUpdate"
          >
            下载 v{{ appNewVersion }}
          </NButton>
          <NButton
            v-if="appDownloaded"
            size="small"
            type="primary"
            @click="installAppUpdate"
          >
            立即安装并重启
          </NButton>
        </NSpace>

        <div v-if="appUpdateError" style="margin-top: 6px; font-size: 12px; color: #d03050;">
          {{ appUpdateError }}
        </div>
      </div>
    </NPopover>
    <NTag
      v-else-if="appVersion"
      size="small"
      :bordered="false"
      round
      :type="appChecking ? undefined : 'default'"
      style="cursor: pointer;"
      @click="checkAppUpdate"
    >
      Desktop v{{ appVersion }}{{ appChecking ? ' · 检查中...' : '' }}
    </NTag>

    <!-- Version: up to date (green) -->
    <NTag
      v-if="wsStore.gatewayVersion && !hasUpdate && latestVersion"
      size="small"
      :bordered="false"
      round
      type="success"
    >
      OpenClaw {{ wsStore.gatewayVersion }} · 已是最新
    </NTag>
    <!-- Version: checking or no version info yet -->
    <NTag
      v-else-if="wsStore.gatewayVersion && !latestVersion"
      size="small"
      :bordered="false"
      round
    >
      OpenClaw {{ wsStore.gatewayVersion }}
    </NTag>
    <!-- Version: update available -->
    <NPopover
      v-if="hasUpdate && wsStore.state === ConnectionState.CONNECTED && displayLatestVersion"
      trigger="click"
      placement="bottom"
      :width="300"
    >
      <template #trigger>
        <NTag
          size="small"
          :bordered="false"
          round
          type="warning"
          style="cursor: pointer;"
        >
          {{ isUpdating ? '升级中...' : `检测到新版本 ${displayLatestVersion}` }}
        </NTag>
      </template>
      <div style="padding: 12px;">
        <div style="margin-bottom: 8px; font-size: 13px;">
          当前网关版本 {{ wsStore.gatewayVersion }}，可升级到：
        </div>
        <NSpace align="center" :size="8">
          <NSelect
            v-model:value="selectedVersion"
            :options="versionOptions"
            size="small"
            style="width: 180px;"
            :disabled="isUpdating || isLoadingVersions"
            :loading="isLoadingVersions"
          />
          <NButton
            size="small"
            type="primary"
            @click="handleCustomUpdate"
            :loading="isUpdating"
            :disabled="isUpdating || !selectedVersion || isLoadingVersions"
          >
            升级
          </NButton>
        </NSpace>

        <!-- Progress bar -->
        <NProgress
          v-if="isUpdating || updateProgress > 0"
          type="line"
          :percentage="Math.round(updateProgress)"
          :show-indicator="true"
          :status="updateProgress >= 100 ? 'success' : 'default'"
          style="margin-top: 10px;"
        />

        <div v-if="updateStatusMessage" style="margin-top: 6px; font-size: 12px; color: var(--text-color-3);">
          {{ updateStatusMessage }}
        </div>
      </div>
    </NPopover>
    <NTag
      :type="status.type"
      round
      size="small"
      :bordered="false"
    >
      <template #icon>
        <span
          style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px;"
          :style="{
            backgroundColor: status.type === 'success' ? '#18a058' : status.type === 'warning' ? '#f0a020' : status.type === 'error' ? '#d03050' : '#2080f0'
          }"
        />
      </template>
      {{ status.label }}
    </NTag>
  </NSpace>
</template>
