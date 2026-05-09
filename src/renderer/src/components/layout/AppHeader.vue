<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NBreadcrumb, NBreadcrumbItem, NButton, NSpace, NTooltip, NIcon } from 'naive-ui'
import {
  SunnyOutline,
  MoonOutline,
  LogOutOutline,
  LanguageOutline,
  ExpandOutline,
  ContractOutline
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useTheme } from '@/composables/useTheme'
import { useConnectionStore } from '@/stores/connection'
import { useLocaleStore } from '@/stores/locale'
import { useModelStore } from '@/stores/model'
import { useWideModeStore } from '@/stores/wideMode'
import ConnectionStatus from '@/components/common/ConnectionStatus.vue'
import ModelStateBadge from './ModelStateBadge.vue'
import { shouldShowModelBadge } from './modelBadgeVisibility'

const route = useRoute()
const router = useRouter()
const { isDark, toggle } = useTheme()
const connectionStore = useConnectionStore()
const modelStore = useModelStore()
const localeStore = useLocaleStore()
const wideModeStore = useWideModeStore()
const { t } = useI18n()

// Bug 4 fix: keep the badge mounted during disconnect so the stale
// model name + reason stay visible. Hide only when no data has ever
// been bootstrapped (kind === 'unknown').
const showModelBadge = computed(() =>
  shouldShowModelBadge(connectionStore.status, modelStore.state)
)

const breadcrumbs = computed(() => {
  const items: { label: string; name?: string }[] = [{ label: t('common.home'), name: 'Dashboard' }]
  if (route.name !== 'Dashboard') {
    const titleKey = route.meta.titleKey as string | undefined
    const fallbackTitle = route.meta.title as string | undefined
    items.push({ label: titleKey ? t(titleKey) : fallbackTitle || '' })
  }
  return items
})

const currentRouteLabel = computed(() => {
  const titleKey = route.meta.titleKey as string | undefined
  const fallbackTitle = route.meta.title as string | undefined
  return titleKey ? t(titleKey) : fallbackTitle || ''
})

const pageTitle = computed(() => {
  const name = route.name as string
  if (name === 'Dashboard')
    return localeStore.locale === 'zh-CN' ? '今日控制塔' : 'Today Control Tower'
  if (name === 'Chat')
    return localeStore.locale === 'zh-CN' ? '在线对话（工作台）' : 'Live Chat Workspace'
  if (name === 'Cron')
    return localeStore.locale === 'zh-CN' ? '任务计划按业务流分组' : 'Task Workbench'
  if (name === 'Skills') return localeStore.locale === 'zh-CN' ? '技能管理' : 'Skills'
  if (name === 'Settings') return localeStore.locale === 'zh-CN' ? '系统设置' : 'Settings'
  return currentRouteLabel.value
})

const languageToggleTarget = computed(() =>
  localeStore.locale === 'zh-CN' ? t('common.languageEn') : t('common.languageZh')
)

async function handleLogout() {
  await connectionStore.disconnect()
  router.push({ name: 'Connection' })
}
</script>

<template>
  <div class="app-header-shell">
    <div class="app-header-title-block">
      <NBreadcrumb class="app-header-crumb">
        <NBreadcrumbItem
          v-for="(item, index) in breadcrumbs"
          :key="index"
          @click="item.name ? router.push({ name: item.name }) : undefined"
        >
          {{ item.label }}
        </NBreadcrumbItem>
      </NBreadcrumb>
      <div class="app-header-title">{{ pageTitle }}</div>
    </div>

    <NSpace :size="8" align="center" class="app-header-actions">
      <ModelStateBadge v-if="showModelBadge" />
      <ConnectionStatus />

      <NTooltip>
        <template #trigger>
          <NButton quaternary circle @click="toggle">
            <template #icon>
              <NIcon :component="isDark ? SunnyOutline : MoonOutline" />
            </template>
          </NButton>
        </template>
        {{ isDark ? t('common.switchToLight') : t('common.switchToDark') }}
      </NTooltip>

      <NTooltip>
        <template #trigger>
          <NButton quaternary circle @click="wideModeStore.toggle">
            <template #icon>
              <NIcon :component="wideModeStore.isWideMode ? ContractOutline : ExpandOutline" />
            </template>
          </NButton>
        </template>
        {{
          wideModeStore.isWideMode ? t('common.switchToNormalWidth') : t('common.switchToWideMode')
        }}
      </NTooltip>

      <NTooltip>
        <template #trigger>
          <NButton quaternary circle @click="localeStore.toggle">
            <template #icon>
              <NIcon :component="LanguageOutline" />
            </template>
          </NButton>
        </template>
        {{ t('common.toggleLanguage', { target: languageToggleTarget }) }}
      </NTooltip>

      <NTooltip>
        <template #trigger>
          <NButton quaternary circle @click="handleLogout">
            <template #icon>
              <NIcon :component="LogOutOutline" />
            </template>
          </NButton>
        </template>
        {{ t('common.logout') }}
      </NTooltip>
    </NSpace>
  </div>
</template>

<style scoped>
.app-header-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  gap: 16px;
}

.app-header-title-block {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.app-header-crumb {
  color: var(--text-secondary);
  font-size: 13px;
}

.app-header-title {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 780;
  line-height: 1.12;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-header-actions {
  flex-shrink: 0;
}

@media (max-width: 760px) {
  .app-header-shell {
    align-items: flex-start;
    flex-direction: column;
  }

  .app-header-actions {
    flex-wrap: wrap;
  }
}
</style>
