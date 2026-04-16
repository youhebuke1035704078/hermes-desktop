<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { NTag, NSpace, NButton, NPopover, NProgress } from 'naive-ui'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// ── Desktop App self-update ──
const appVersion = ref('')
const appUpdateAvailable = ref(false)
const appNewVersion = ref('')
const appDownloading = ref(false)
const appDownloadPercent = ref(0)
const appDownloaded = ref(false)
const appUpdateError = ref('')
const appChecking = ref(false)

const installCountdown = ref(0)

const updateStatusText = computed(() => {
  if (installCountdown.value > 0)
    return t('components.connectionStatus.installingIn', { count: installCountdown.value })
  if (appDownloaded.value) return t('components.connectionStatus.ready')
  if (appDownloading.value)
    return t('components.connectionStatus.downloading', {
      percent: Math.round(appDownloadPercent.value),
    })
  if (appUpdateAvailable.value) return t('components.connectionStatus.updateDetected')
  if (appChecking.value) return t('components.connectionStatus.checking')
  return t('components.connectionStatus.upToDate')
})

let unsubUpdater: (() => void) | null = null

onMounted(async () => {
  const api = (window as any).api
  if (api?.getVersion) {
    appVersion.value = await api.getVersion()
  }

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
          // Auto-install after 3s countdown
          startAutoInstall()
          break
        case 'error':
          appChecking.value = false
          appDownloading.value = false
          appUpdateError.value = data.error || t('components.connectionStatus.updateFailed')
          break
      }
    })
  }
})

onUnmounted(() => {
  unsubUpdater?.()
  unsubUpdater = null
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
})

async function checkAppUpdate() {
  appUpdateError.value = ''
  const api = (window as any).api
  if (api?.updaterCheck) {
    try {
      const result = await api.updaterCheck()
      if (!result.ok && result.error) {
        appUpdateError.value = result.error
      }
    } finally {
      // Safety net: if the updater IPC fires 'checking' but a final
      // 'available'/'not-available'/'error' event never arrives (network error,
      // stale listener), appChecking would stay true and disable the button.
      appChecking.value = false
    }
  }
}

let countdownTimer: ReturnType<typeof setInterval> | null = null

function startAutoInstall() {
  installCountdown.value = 3
  countdownTimer = setInterval(() => {
    installCountdown.value--
    if (installCountdown.value <= 0) {
      if (countdownTimer) clearInterval(countdownTimer)
      countdownTimer = null
      installAppUpdate()
    }
  }, 1000)
}

function installAppUpdate() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  installCountdown.value = 0
  const api = (window as any).api
  if (api?.updaterInstall) {
    api.updaterInstall()
  }
}
</script>

<template>
  <NPopover
    v-if="appVersion"
    trigger="click"
    placement="bottom"
    :width="320"
  >
    <template #trigger>
      <NTag
        size="small"
        :bordered="false"
        round
        :type="appUpdateAvailable || appDownloading ? 'warning' : appDownloaded ? 'success' : 'default'"
        style="cursor: pointer;"
      >
        Desktop v{{ appVersion }} · {{ updateStatusText }}
      </NTag>
    </template>
    <div style="padding: 12px;">
      <div style="margin-bottom: 8px; font-size: 13px;">
        {{ t('components.connectionStatus.currentVersion', { version: appVersion })
        }}{{ appUpdateAvailable && appNewVersion
          ? t('components.connectionStatus.upgradableTo', { version: appNewVersion })
          : '' }}
      </div>

      <!-- Download progress -->
      <NProgress
        v-if="appDownloading || appDownloaded"
        type="line"
        :percentage="Math.round(appDownloadPercent)"
        :show-indicator="true"
        :status="appDownloaded ? 'success' : 'default'"
        style="margin-bottom: 8px;"
      />

      <NSpace :size="8">
        <!-- No update: check button -->
        <NButton
          v-if="!appUpdateAvailable && !appDownloading && !appDownloaded"
          size="small"
          :type="appChecking ? 'default' : 'primary'"
          :loading="appChecking"
          :disabled="appChecking"
          @click="checkAppUpdate"
        >
          {{ appChecking
            ? t('components.connectionStatus.checking')
            : t('components.connectionStatus.checkForUpdate') }}
        </NButton>
        <!-- Downloaded: install now (or wait for countdown) -->
        <NButton
          v-if="appDownloaded"
          size="small"
          type="primary"
          @click="installAppUpdate"
        >
          {{ installCountdown > 0
            ? t('components.connectionStatus.installingInShort', { count: installCountdown })
            : t('components.connectionStatus.installNow') }}
        </NButton>
      </NSpace>

      <div v-if="appUpdateError" style="margin-top: 6px; font-size: 12px; color: #d03050;">
        {{ appUpdateError }}
      </div>
      <div v-else-if="appDownloading" style="margin-top: 6px; font-size: 12px; color: var(--text-color-3);">
        {{ t('components.connectionStatus.downloadingInBackground') }}
      </div>
      <div v-else-if="!appUpdateAvailable && !appDownloading && !appDownloaded && !appChecking" style="margin-top: 6px; font-size: 12px; color: var(--text-color-3);">
        {{ t('components.connectionStatus.clickToCheck') }}
      </div>
    </div>
  </NPopover>
</template>
