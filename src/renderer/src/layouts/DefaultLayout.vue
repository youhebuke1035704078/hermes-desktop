<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutHeader, NLayoutContent } from 'naive-ui'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { useWebSocketStore } from '@/stores/websocket'
import { useConnectionStore } from '@/stores/connection'
import { ConnectionState } from '@/api/types'

const router = useRouter()
const wsStore = useWebSocketStore()
const connectionStore = useConnectionStore()

let cleanupNavigate: (() => void) | undefined

onMounted(() => {
  // Skip WebSocket reconnect in Hermes REST mode (no WS needed)
  const isHermesRest = connectionStore.serverType === 'hermes-rest'
  if (
    !isHermesRest &&
    (wsStore.state === ConnectionState.DISCONNECTED || wsStore.state === ConnectionState.FAILED)
  ) {
    wsStore.connect().catch((err) => {
      console.warn('[DefaultLayout] Background reconnect failed:', err)
    })
  }

  // Listen for navigation events from Electron main process (e.g. notification clicks)
  if (window.api?.onNavigate) {
    cleanupNavigate = window.api.onNavigate((path: string) => {
      router.push(path)
    })
  }
})

onUnmounted(() => {
  cleanupNavigate?.()
})
</script>

<template>
  <NLayout has-sider position="absolute" class="app-layout-root">
    <NLayoutSider
      class="app-layout-sider"
      bordered
      :width="232"
      :collapsed="false"
      :native-scrollbar="false"
      style="height: 100vh"
    >
      <AppSidebar :collapsed="false" />
    </NLayoutSider>

    <NLayout class="app-layout-main">
      <NLayoutHeader bordered class="app-layout-header">
        <AppHeader />
      </NLayoutHeader>

      <NLayoutContent
        class="app-layout-content"
        :native-scrollbar="false"
        content-style="padding: 22px 24px 34px;"
      >
        <div class="page-container">
          <RouterView v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </RouterView>
        </div>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

<style scoped>
.app-layout-root {
  inset: 0;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-secondary);
}

.app-layout-main {
  height: 100vh;
  overflow: hidden;
  background: var(--bg-secondary);
}

.app-layout-sider {
  background: #15161a;
}

.app-layout-sider :deep(.n-layout-sider-scroll-container) {
  background: #15161a;
}

.app-layout-header {
  height: 68px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 12;
  background: rgba(25, 25, 29, 0.96);
  -webkit-app-region: drag;
}

/* Buttons inside header must be clickable (not draggable) */
.app-layout-header :deep(button),
.app-layout-header :deep(a),
.app-layout-header :deep(.n-tag),
.app-layout-header :deep(.n-breadcrumb) {
  -webkit-app-region: no-drag;
}

.app-layout-content {
  height: calc(100vh - 68px);
  background: var(--bg-secondary);
}

:deep(.app-layout-content .n-layout-scroll-container) {
  height: 100%;
}
</style>
