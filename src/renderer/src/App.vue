<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  NMessageProvider, NDialogProvider, NConfigProvider, NNotificationProvider,
  zhCN, dateZhCN, darkTheme, type GlobalThemeOverrides
} from 'naive-ui'

const isDark = ref(
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
)

// Listen for OS theme changes
window.matchMedia?.('(prefers-color-scheme: dark)')
  .addEventListener('change', (e) => { isDark.value = e.matches })

const theme = computed(() => isDark.value ? darkTheme : null)

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#18a058',
    primaryColorHover: '#36ad6a',
    primaryColorPressed: '#0c7a43',
    primaryColorSuppl: '#36ad6a',
    borderRadius: '6px',
    borderRadiusSmall: '4px'
  }
}
</script>

<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme="theme" :theme-overrides="themeOverrides">
    <NNotificationProvider>
      <NMessageProvider>
        <NDialogProvider>
          <router-view />
        </NDialogProvider>
      </NMessageProvider>
    </NNotificationProvider>
  </NConfigProvider>
</template>
