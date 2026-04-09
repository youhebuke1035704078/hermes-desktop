<script setup lang="ts">
import { ref } from 'vue'
import { NTabs, NTabPane } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import AgentsPage from './AgentsPage.vue'
import MyWorldPage from '../myworld/MyWorldPage.vue'

const { t } = useI18n()
const activeTab = ref('list')
</script>

<template>
  <NTabs v-model:value="activeTab" type="line" animated>
    <NTabPane name="list" :tab="t('pages.agents.tabs.list')">
      <AgentsPage />
    </NTabPane>
    <NTabPane name="world" :tab="t('pages.agents.tabs.world')" display-directive="show:lazy">
      <MyWorldPage />
    </NTabPane>
  </NTabs>
</template>
