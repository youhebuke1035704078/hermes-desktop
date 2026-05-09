<script setup lang="ts">
import { computed, ref } from 'vue'

import { useRoute, useRouter } from 'vue-router'
import { NIcon, NTooltip } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useAlertNotifier } from '@/composables/useAlertNotifier'
import {
  GridOutline,
  ChatboxEllipsesOutline,
  CogOutline,
  CalendarOutline,
  ExtensionPuzzleOutline
} from '@vicons/ionicons5'
import { routes } from '@/router/routes'
import { useConnectionStore } from '@/stores/connection'
import { safeGet, safeSet } from '@/utils/safe-storage'

defineProps<{ collapsed: boolean }>()

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const connectionStore = useConnectionStore()
const { activeAlertCount } = useAlertNotifier()

/** Routes that require ACP WebSocket — hide in Hermes REST mode */
const WS_ONLY_ROUTES = new Set<string>([])
const HERMES_ONLY_ROUTES = new Set(['Dashboard', 'Skills'])
const PRIMARY_MENU_ORDER = ['Dashboard', 'Chat', 'Cron', 'Skills', 'Settings']
const isHermesRest = computed(() => connectionStore.serverType === 'hermes-rest')

const iconMap: Record<string, any> = {
  GridOutline,
  ChatboxEllipsesOutline,
  CogOutline,
  CalendarOutline,
  ExtensionPuzzleOutline
}

interface MenuItem {
  key: string
  titleKey: string
  iconName: string
}

const baseMenuItems = computed<MenuItem[]>(() => {
  const mainRoute = routes.find((r) => r.path === '/')
  if (!mainRoute?.children) return []
  return mainRoute.children
    .filter((child) => child.name && child.meta?.titleKey && child.meta?.icon)
    .filter((child) => !child.meta?.hidden)
    .filter((child) => {
      const name = child.name as string
      if (isHermesRest.value && WS_ONLY_ROUTES.has(name)) return false
      if (!isHermesRest.value && HERMES_ONLY_ROUTES.has(name)) return false
      return true
    })
    .map((child) => ({
      key: child.name as string,
      titleKey: child.meta?.titleKey as string,
      iconName: child.meta?.icon as string
    }))
    .sort((a, b) => {
      const ai = PRIMARY_MENU_ORDER.indexOf(a.key)
      const bi = PRIMARY_MENU_ORDER.indexOf(b.key)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
})

// ── Persisted drag order ──
const STORAGE_KEY = 'sidebar-menu-order-v2'

function loadOrder(): string[] {
  try {
    const raw = safeGet(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveOrder(keys: string[]) {
  safeSet(STORAGE_KEY, JSON.stringify(keys))
}

const menuOrder = ref<string[]>(loadOrder())

const orderedMenuItems = computed<MenuItem[]>(() => {
  const items = baseMenuItems.value
  const order = menuOrder.value
  if (!order.length) return items

  const orderMap = new Map(order.map((key, i) => [key, i]))
  return items
    .map((item, origIdx) => ({ item, origIdx }))
    .sort((a, b) => {
      const ai = orderMap.has(a.item.key) ? orderMap.get(a.item.key)! : 1000 + a.origIdx
      const bi = orderMap.has(b.item.key) ? orderMap.get(b.item.key)! : 1000 + b.origIdx
      return ai - bi
    })
    .map((x) => x.item)
})

const activeParentMap: Record<string, string> = {
  Sessions: 'Chat',
  SessionDetail: 'Chat',
  Insights: 'Dashboard',
  Channels: 'Settings',
  Logs: 'Settings',
  Backup: 'Settings'
}

const activeKey = computed(() => {
  const name = route.name as string
  return activeParentMap[name] || name
})

function handleSelect(key: string) {
  router.push({ name: key })
}

// ── Drag & Drop ──
const dragIdx = ref<number | null>(null)
const overIdx = ref<number | null>(null)

function onDragStart(i: number, e: DragEvent) {
  dragIdx.value = i
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }
}

function onDragOver(i: number, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  overIdx.value = i
}

function onDrop(targetIndex: number) {
  const from = dragIdx.value
  if (from === null || from === targetIndex) {
    resetDrag()
    return
  }
  const arr = [...orderedMenuItems.value]
  const [moved] = arr.splice(from, 1)
  arr.splice(targetIndex, 0, moved)
  menuOrder.value = arr.map((m) => m.key)
  saveOrder(menuOrder.value)
  resetDrag()
}

function resetDrag() {
  dragIdx.value = null
  overIdx.value = null
}
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100%">
    <div class="sidebar-logo" :class="{ 'sidebar-logo--collapsed': collapsed }">
      <div class="sidebar-brand-mark">H</div>
      <div v-if="!collapsed" class="sidebar-brand-text">
        <div class="sidebar-brand-title">Hermes Desktop</div>
        <div class="sidebar-brand-subtitle">控制塔</div>
      </div>
    </div>

    <nav class="sidebar-menu">
      <NTooltip
        v-for="(item, index) in orderedMenuItems"
        :key="item.key"
        placement="right"
        :disabled="!collapsed"
        :delay="400"
      >
        <template #trigger>
          <div
            class="sidebar-item"
            :class="{
              'sidebar-item--active': activeKey === item.key,
              'sidebar-item--collapsed': collapsed,
              'sidebar-item--drag-over': overIdx === index && dragIdx !== index,
              'sidebar-item--dragging': dragIdx === index
            }"
            draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent="onDragOver(index, $event)"
            @dragleave="overIdx = null"
            @drop="onDrop(index)"
            @dragend="resetDrag"
            @click="handleSelect(item.key)"
          >
            <span v-if="!collapsed" class="sidebar-dot" />
            <NIcon v-else :component="iconMap[item.iconName]" :size="20" />
            <span v-if="!collapsed" class="sidebar-label">{{ t(item.titleKey) }}</span>
            <span
              v-if="item.key === 'Alerts' && activeAlertCount > 0"
              class="sidebar-badge"
              :class="{ 'sidebar-badge--collapsed': collapsed }"
            >
              {{ activeAlertCount > 99 ? '99+' : activeAlertCount }}
            </span>
          </div>
        </template>
        {{ t(item.titleKey) }}
      </NTooltip>
    </nav>

    <div v-if="!collapsed" class="sidebar-foot">
      <div class="sidebar-foot-label">今日重点</div>
      <div class="sidebar-foot-title">价格监控完整</div>
      <div class="sidebar-foot-detail">
        {{ activeAlertCount ? `${activeAlertCount} 项需关注` : '查看控制塔确认最新状态' }}
      </div>
    </div>
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

.sidebar-brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: linear-gradient(135deg, #60d7ac, #78b7ff);
  color: #111318;
  display: grid;
  place-items: center;
  font-weight: 900;
  letter-spacing: 0;
  flex: 0 0 auto;
}

.sidebar-brand-text {
  min-width: 0;
}

.sidebar-brand-title {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 760;
  line-height: 1.1;
  white-space: nowrap;
}

.sidebar-brand-subtitle {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 2px;
}

.sidebar-menu {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 14px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 42px;
  gap: 10px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.82);
  transition:
    background-color 0.2s,
    color 0.2s,
    opacity 0.2s;
  user-select: none;
  font-size: 14px;
  position: relative;
  border-top: 2px solid transparent;
  border-radius: 8px;
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.07);
}

.sidebar-item--active {
  color: #63e2b7;
  background: rgba(99, 226, 183, 0.12);
}

.sidebar-item--collapsed {
  justify-content: center;
  padding: 0;
}

.sidebar-item--drag-over {
  border-top-color: #63e2b7;
}

.sidebar-item--dragging {
  opacity: 0.4;
}

.sidebar-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  font-weight: 650;
}

.sidebar-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: currentColor;
  flex: 0 0 auto;
}

.sidebar-badge {
  font-size: 11px;
  background: #d03050;
  color: #fff;
  border-radius: 10px;
  padding: 0 6px;
  line-height: 18px;
  min-width: 18px;
  text-align: center;
  flex-shrink: 0;
}

.sidebar-badge--collapsed {
  position: absolute;
  top: 2px;
  right: 6px;
  font-size: 10px;
  padding: 0 4px;
  line-height: 16px;
  min-width: 16px;
}

.sidebar-foot {
  margin: 14px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.sidebar-foot-label {
  color: var(--text-secondary);
  font-size: 12px;
}

.sidebar-foot-title {
  color: var(--text-primary);
  margin-top: 8px;
  font-weight: 720;
}

.sidebar-foot-detail {
  color: var(--text-secondary);
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
}
</style>
