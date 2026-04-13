<script setup lang="ts">
import { computed, ref } from 'vue'

import { useRoute, useRouter } from 'vue-router'
import { NIcon, NTooltip } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useAlertNotifier } from '@/composables/useAlertNotifier'
import {
  GridOutline,
  ChatboxEllipsesOutline,
  ChatbubblesOutline,
  CogOutline,
  CalendarOutline,
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
const WS_ONLY_ROUTES = new Set(['Sessions'])
const isHermesRest = computed(() => connectionStore.serverType === 'hermes-rest')

const iconMap: Record<string, any> = {
  GridOutline,
  ChatboxEllipsesOutline,
  ChatbubblesOutline,
  CogOutline,
  CalendarOutline,
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
    .filter((child) => !child.meta?.hidden)
    .filter((child) => !(isHermesRest.value && WS_ONLY_ROUTES.has(child.name as string)))
    .map((child) => ({
      key: child.name as string,
      titleKey: child.meta?.titleKey as string,
      iconName: child.meta?.icon as string,
    }))
})

// ── Persisted drag order ──
const STORAGE_KEY = 'sidebar-menu-order'

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

const activeKey = computed(() => route.name as string)

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
  <div style="display: flex; flex-direction: column; height: 100%;">
    <div class="sidebar-logo" :class="{ 'sidebar-logo--collapsed': collapsed }">
      <img
        v-if="!collapsed"
        src="@/assets/logo.png"
        alt="Hermes"
        style="width: 160px; height: auto;"
      />
      <img
        v-else
        src="@/assets/logo.png"
        alt="Hermes"
        style="width: 36px; height: auto; border-radius: 4px;"
      />
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
              'sidebar-item--dragging': dragIdx === index,
            }"
            draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent="onDragOver(index, $event)"
            @dragleave="overIdx = null"
            @drop="onDrop(index)"
            @dragend="resetDrag"
            @click="handleSelect(item.key)"
          >
            <NIcon :component="iconMap[item.iconName]" :size="20" />
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

.sidebar-menu {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.sidebar-item {
  display: flex;
  align-items: center;
  padding: 0 24px;
  height: 42px;
  gap: 12px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.82);
  transition: background-color 0.2s, color 0.2s, opacity 0.2s;
  user-select: none;
  font-size: 14px;
  position: relative;
  border-top: 2px solid transparent;
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.09);
}

.sidebar-item--active {
  color: #63e2b7;
  background: rgba(99, 226, 183, 0.1);
}

.sidebar-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  background: #63e2b7;
  border-radius: 0 3px 3px 0;
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
</style>
