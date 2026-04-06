<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue'
import { NCard, NDataTable, NButton, NSpace, NTag, NIcon, NInput } from 'naive-ui'
import { RefreshOutline, SearchOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useGatewayStore } from '../../stores/gateway'
import type { Tool } from '../../api/types'

const gwStore = useGatewayStore()
const { t } = useI18n()
const tools = ref<Tool[]>([])
const loading = ref(false)
const searchQuery = ref('')

const filteredTools = computed(() => {
  if (!searchQuery.value) return tools.value
  const q = searchQuery.value.toLowerCase()
  return tools.value.filter(
    (item) => item.name.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q)
  )
})

const columns = computed(() => [
  { title: '工具名称', key: 'name', width: 200 },
  { title: '类型', key: 'type', width: 100, render: (row: Tool) => h(NTag, { size: 'small', bordered: false }, { default: () => row.type || '-' }) },
  { title: '描述', key: 'description', ellipsis: { tooltip: true }, render: (row: Tool) => row.description || '-' },
  { title: '来源', key: 'source', width: 100, render: (row: Tool) => row.source || '-' }
])

async function fetchTools() {
  loading.value = true
  try {
    tools.value = (await gwStore.rpc.listTools()) as Tool[]
  } catch {
    tools.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchTools)
</script>

<template>
  <NCard :title="t('nav.tools')">
    <template #header-extra>
      <NSpace :size="8">
        <NInput v-model:value="searchQuery" :placeholder="t('common.search')" size="small" clearable style="width: 200px">
          <template #prefix><NIcon :component="SearchOutline" /></template>
        </NInput>
        <NButton size="small" @click="fetchTools">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          刷新
        </NButton>
      </NSpace>
    </template>
    <NDataTable :columns="columns" :data="filteredTools" :loading="loading" :bordered="false" :pagination="{ pageSize: 20 }" :row-key="(row: Tool) => row.name" striped />
  </NCard>
</template>
