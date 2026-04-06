<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NAlert } from 'naive-ui'
import { useConnectionStore } from '../../stores/connection'

const { t } = useI18n()
const route = useRoute()
const connectionStore = useConnectionStore()

const pageTitle = computed(() => {
  const path = route.path.replace(/^\//, '') || 'dashboard'
  const key = path.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
  return t(`nav.${key}`, t('nav.dashboard'))
})

const isDisconnected = computed(() => connectionStore.status === 'disconnected' && connectionStore.currentServer)
</script>

<template>
  <div class="topbar">
    <NAlert v-if="isDisconnected" type="error" :show-icon="false" class="disconnect-banner">
      {{ t('common.disconnected') }}
    </NAlert>
    <div class="topbar-content">
      <h2 class="page-title">{{ pageTitle }}</h2>
    </div>
  </div>
</template>

<style scoped>
.topbar {
  flex-shrink: 0;
}

.disconnect-banner {
  border-radius: 0;
}

.topbar-content {
  padding: 12px 24px;
  border-bottom: 1px solid var(--n-border-color, #e0e0e6);
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
</style>
