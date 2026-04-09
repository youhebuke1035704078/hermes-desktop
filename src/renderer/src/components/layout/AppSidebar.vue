<script setup lang="ts">
import { h, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NMenu, NText, NBadge } from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useAlertNotifier } from '@/composables/useAlertNotifier'
import {
  GridOutline,
  ChatboxEllipsesOutline,
  ChatbubblesOutline,
  BookOutline,
  CalendarOutline,
  SparklesOutline,
  GitNetworkOutline,
  ExtensionPuzzleOutline,
  CogOutline,
  PulseOutline,
  FolderOutline,
  PeopleOutline,
  BusinessOutline,
  StorefrontOutline,
  ConstructOutline,
  ArchiveOutline,
  NotificationsOutline,
} from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'
import { routes } from '@/router/routes'

defineProps<{ collapsed: boolean }>()

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { activeAlertCount } = useAlertNotifier()

const iconMap: Record<string, unknown> = {
  GridOutline,
  ChatboxEllipsesOutline,
  ChatbubblesOutline,
  BookOutline,
  CalendarOutline,
  SparklesOutline,
  GitNetworkOutline,
  ExtensionPuzzleOutline,
  CogOutline,
  PulseOutline,
  FolderOutline,
  PeopleOutline,
  BusinessOutline,
  StorefrontOutline,
  ConstructOutline,
  ArchiveOutline,
  NotificationsOutline,
}

function renderIcon(iconName: string) {
  const icon = iconMap[iconName]
  if (!icon) return undefined
  return () => h(NIcon, null, { default: () => h(icon as any) })
}

const menuOptions = computed<MenuOption[]>(() => {
  const mainRoute = routes.find((r) => r.path === '/')
  if (!mainRoute?.children) return []

  return mainRoute.children
    .filter((child) => !child.meta?.hidden)
    .map((child) => {
      const option: MenuOption = {
        label: child.meta?.titleKey ? t(child.meta.titleKey as string) : (child.meta?.title as string),
        key: child.name as string,
        icon: child.meta?.icon ? renderIcon(child.meta.icon as string) : undefined,
      }
      if (child.name === 'Alerts' && activeAlertCount.value > 0) {
        option.extra = () => h(NBadge, { value: activeAlertCount.value, type: 'error' })
      }
      return option
    })
})

const activeKey = computed(() => {
  return route.name as string
})

function handleSelect(key: string) {
  router.push({ name: key })
}
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100%;">
    <div class="sidebar-logo" :class="{ 'sidebar-logo--collapsed': collapsed }">
      <img src="@/assets/logo.png" alt="logo" style="width: 32px; height: 32px; border-radius: 6px;" />
      <NText
        v-if="!collapsed"
        strong
        style="font-size: 18px; white-space: nowrap; letter-spacing: -0.5px;"
      >
        OpenClaw Desktop
      </NText>
    </div>

    <NMenu
      :value="activeKey"
      :collapsed="collapsed"
      :collapsed-width="64"
      :collapsed-icon-size="20"
      :options="menuOptions"
      :indent="24"
      @update:value="handleSelect"
    />
  </div>
</template>

<style scoped>
.sidebar-logo {
  display: flex;
  align-items: center;
  padding: 20px 24px;
  gap: 10px;
  /* macOS hiddenInset titlebar: leave space for traffic lights */
  padding-top: 38px;
  -webkit-app-region: drag;
}

.sidebar-logo--collapsed {
  justify-content: center;
  padding-left: 16px;
  padding-right: 16px;
}
</style>
