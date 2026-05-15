<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NBreadcrumb,
  NBreadcrumbItem,
  NBadge,
  NButton,
  NIcon,
  NPopover,
  NSpace,
  NTooltip
} from 'naive-ui'
import { InformationCircleOutline, NotificationsOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useConnectionStore } from '@/stores/connection'
import { useLocaleStore } from '@/stores/locale'
import { useModelStore } from '@/stores/model'
import { useOpsStore } from '@/stores/ops'
import ConnectionStatus from '@/components/common/ConnectionStatus.vue'
import ModelStateBadge from './ModelStateBadge.vue'
import { shouldShowModelBadge } from './modelBadgeVisibility'

const route = useRoute()
const router = useRouter()
const connectionStore = useConnectionStore()
const modelStore = useModelStore()
const localeStore = useLocaleStore()
const opsStore = useOpsStore()
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

const fallbackModelLabel = computed(() => {
  const state = modelStore.state
  const primary = state.primaryModel || connectionStore.hermesRealModel || ''
  const current = state.currentModel || ''
  return (
    state.fallbackChain.find((model, index) => {
      if (!model) return false
      if (primary && model === primary) return false
      if (state.kind === 'normal' && current && model === current) return false
      return index > 0 || !primary
    }) || ''
  )
})

function goNotifications() {
  router.push({ name: 'Settings', query: { section: 'diagnostics' } })
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
      <NPopover
        v-if="showModelBadge && fallbackModelLabel"
        trigger="click"
        placement="bottom-end"
        class="app-header-status-popover"
      >
        <template #trigger>
          <button class="app-header-fallback-pill" type="button">
            <span class="fallback-pill-label">备用</span>
            <strong>{{ fallbackModelLabel }}</strong>
          </button>
        </template>
        <div class="app-header-status-panel app-header-fallback-panel">
          <div class="app-header-status-title">备用模型</div>
          <div class="app-header-status-row">
            <span>当前备用</span>
            <strong>{{ fallbackModelLabel }}</strong>
          </div>
          <div class="app-header-status-row">
            <span>切换链</span>
            <strong>{{ modelStore.state.fallbackChain.join(' → ') }}</strong>
          </div>
        </div>
      </NPopover>
      <ConnectionStatus />

      <NPopover trigger="click" placement="bottom-end" class="app-header-status-popover">
        <template #trigger>
          <NButton quaternary circle>
            <template #icon>
              <NIcon :component="InformationCircleOutline" />
            </template>
          </NButton>
        </template>
        <div class="app-header-status-panel">
          <div class="app-header-status-title">状态详情</div>
          <div class="app-header-status-row">
            <span>服务器</span>
            <strong>{{ connectionStore.currentServer?.url || '-' }}</strong>
          </div>
          <div class="app-header-status-row">
            <span>连接</span>
            <strong>{{ connectionStore.status }}</strong>
          </div>
          <div class="app-header-status-row">
            <span>主模型</span>
            <strong>{{
              modelStore.displayModel || connectionStore.hermesRealModel || 'unknown'
            }}</strong>
          </div>
          <div class="app-header-status-row">
            <span>备用模型</span>
            <strong>{{ fallbackModelLabel || '-' }}</strong>
          </div>
          <div class="app-header-status-row">
            <span>通知</span>
            <strong>{{ opsStore.activeNotices.length }} 条待处理</strong>
          </div>
        </div>
      </NPopover>

      <NTooltip>
        <template #trigger>
          <NBadge
            :value="opsStore.activeNotices.length"
            :max="99"
            :show="opsStore.activeNotices.length > 0"
          >
            <NButton quaternary circle @click="goNotifications">
              <template #icon>
                <NIcon :component="NotificationsOutline" />
              </template>
            </NButton>
          </NBadge>
        </template>
        通知中心
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
  font-size: var(--font-kicker);
}

.app-header-title {
  color: var(--text-primary);
  font-size: var(--font-page-title);
  font-weight: 780;
  line-height: 1.12;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-header-actions {
  flex-shrink: 0;
}

.app-header-fallback-pill {
  height: 30px;
  max-width: 280px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.12);
  color: #7dd3fc;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.app-header-fallback-pill:hover {
  background: rgba(14, 165, 233, 0.18);
}

.app-header-fallback-pill strong {
  min-width: 0;
  max-width: 190px;
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fallback-pill-label {
  color: rgba(186, 230, 253, 0.76);
}

.app-header-status-panel {
  width: min(340px, 72vw);
  display: grid;
  gap: 8px;
}

.app-header-status-title {
  font-size: var(--font-card-title);
  font-weight: 760;
}

.app-header-status-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  font-size: var(--font-body-sm);
  line-height: var(--line-normal);
}

.app-header-status-row span {
  color: var(--text-secondary);
}

.app-header-status-row strong {
  min-width: 0;
  font-weight: 650;
  overflow-wrap: anywhere;
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
