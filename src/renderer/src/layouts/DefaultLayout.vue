<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutHeader, NLayoutContent } from 'naive-ui'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { useWebSocketStore } from '@/stores/websocket'
import { ConnectionState } from '@/api/types'

const collapsed = ref(false)
const router = useRouter()
const wsStore = useWebSocketStore()

let cleanupNavigate: (() => void) | undefined

onMounted(() => {
  // Only connect if not already connected (connection store handles initial connect)
  if (wsStore.state === ConnectionState.DISCONNECTED || wsStore.state === ConnectionState.FAILED) {
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
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :collapsed="collapsed"
      show-trigger
      :native-scrollbar="false"
      style="height: 100vh;"
      @collapse="collapsed = true"
      @expand="collapsed = false"
    >
      <AppSidebar :collapsed="collapsed" />
    </NLayoutSider>

    <NLayout class="app-layout-main">
      <NLayoutHeader bordered class="app-layout-header">
        <AppHeader />
      </NLayoutHeader>

      <NLayoutContent
        class="app-layout-content"
        :native-scrollbar="false"
        content-style="padding: 24px;"
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
}

.app-layout-main {
  height: 100vh;
  overflow: hidden;
}

.app-layout-header {
  height: var(--header-height);
  padding: 0 24px;
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 12;
  background: var(--bg-card);
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
  height: calc(100vh - var(--header-height));
}

:deep(.app-layout-content .n-layout-scroll-container) {
  height: 100%;
}
</style>
