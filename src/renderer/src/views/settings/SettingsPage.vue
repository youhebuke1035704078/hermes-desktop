<script setup lang="ts">
import { computed } from 'vue'
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
} from 'naive-ui'
import {
  ServerOutline,
  SwapHorizontalOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useThemeStore, type ThemeMode } from '@/stores/theme'
import { useWebSocketStore } from '@/stores/websocket'
import { useConnectionStore } from '@/stores/connection'
import { ConnectionState } from '@/api/types'

const router = useRouter()
const themeStore = useThemeStore()
const wsStore = useWebSocketStore()
const connectionStore = useConnectionStore()
const { t } = useI18n()

const themeOptions = computed(() => ([
  { label: t('pages.settings.themeLight'), value: 'light' },
  { label: t('pages.settings.themeDark'), value: 'dark' },
]))

const connectionStatus = computed(() => {
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

function handleThemeChange(mode: ThemeMode) {
  themeStore.setMode(mode)
}

async function handleDisconnect() {
  await connectionStore.disconnect()
  router.push({ name: 'Connection' })
}

function handleSwitchServer() {
  router.push({ name: 'Connection' })
}

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
        <NText>OpenClaw Desktop</NText>
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
