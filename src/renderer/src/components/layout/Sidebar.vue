<script setup lang="ts">
import { h, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NMenu, NTag, NButton, NIcon, type MenuOption } from 'naive-ui'
import {
  GridOutline,
  ChatbubblesOutline,
  PersonOutline,
  CubeOutline,
  GitNetworkOutline,
  ServerOutline,
  PlayOutline,
  AlertCircleOutline,
  DocumentTextOutline,
  FlashOutline,
  BuildOutline,
  PulseOutline,
  TerminalOutline,
  DesktopOutline,
  FolderOutline,
  CloudDownloadOutline,
  PeopleOutline,
  SettingsOutline
} from '@vicons/ionicons5'
import { useConnectionStore } from '../../stores/connection'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const connectionStore = useConnectionStore()

const activeKey = computed(() => {
  const path = route.path.replace(/^\//, '')
  return path || 'dashboard'
})

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions = computed<MenuOption[]>(() => [
  {
    key: 'dashboard',
    label: t('nav.dashboard'),
    icon: renderIcon(GridOutline)
  },
  { type: 'divider', key: 'd1' },
  {
    key: 'agent-group',
    label: t('navGroup.agentManagement'),
    type: 'group',
    children: [
      { key: 'sessions', label: t('nav.sessions'), icon: renderIcon(ChatbubblesOutline) },
      { key: 'agents', label: t('nav.agents'), icon: renderIcon(PersonOutline) },
      { key: 'models', label: t('nav.models'), icon: renderIcon(CubeOutline) },
      { key: 'channels', label: t('nav.channels'), icon: renderIcon(GitNetworkOutline) }
    ]
  },
  { type: 'divider', key: 'd2' },
  {
    key: 'ops-group',
    label: t('navGroup.opsMonitor'),
    type: 'group',
    children: [
      { key: 'services', label: t('nav.services'), icon: renderIcon(ServerOutline) },
      { key: 'tasks', label: t('nav.tasks'), icon: renderIcon(PlayOutline) },
      { key: 'alerts', label: t('nav.alerts'), icon: renderIcon(AlertCircleOutline) },
      { key: 'logs', label: t('nav.logs'), icon: renderIcon(DocumentTextOutline) },
      { key: 'skills', label: t('nav.skills'), icon: renderIcon(FlashOutline) },
      { key: 'tools', label: t('nav.tools'), icon: renderIcon(BuildOutline) },
      { key: 'noise', label: t('nav.noise'), icon: renderIcon(PulseOutline) }
    ]
  },
  { type: 'divider', key: 'd3' },
  {
    key: 'tools-group',
    label: t('navGroup.tools'),
    type: 'group',
    children: [
      { key: 'terminal', label: t('nav.terminal'), icon: renderIcon(TerminalOutline) },
      { key: 'remote-desktop', label: t('nav.remoteDesktop'), icon: renderIcon(DesktopOutline) },
      { key: 'files', label: t('nav.files'), icon: renderIcon(FolderOutline) },
      { key: 'backup', label: t('nav.backup'), icon: renderIcon(CloudDownloadOutline) }
    ]
  },
  { type: 'divider', key: 'd4' },
  {
    key: 'system-group',
    label: t('navGroup.system'),
    type: 'group',
    children: [
      { key: 'office', label: t('nav.office'), icon: renderIcon(PeopleOutline) },
      { key: 'settings', label: t('nav.settings'), icon: renderIcon(SettingsOutline) }
    ]
  }
])

function handleMenuUpdate(key: string) {
  router.push(`/${key}`)
}

function handleSwitchServer() {
  connectionStore.disconnect()
  router.push('/connection')
}
</script>

<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="server-info" v-if="connectionStore.currentServer">
        <NTag :type="connectionStore.status === 'connected' ? 'success' : 'error'" size="small" round>
          {{ connectionStore.currentServer.name }}
        </NTag>
        <NButton size="tiny" quaternary @click="handleSwitchServer">
          {{ t('common.switchServer') }}
        </NButton>
      </div>
    </div>
    <NMenu
      :value="activeKey"
      :options="menuOptions"
      :indent="18"
      @update:value="handleMenuUpdate"
    />
  </div>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.sidebar-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--n-border-color, #e0e0e6);
}

.server-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
