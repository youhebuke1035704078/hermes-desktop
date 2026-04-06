<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard, NButton, NDataTable, NSpace, NEmpty,
  NSpin, NInput, useMessage, type DataTableColumns
} from 'naive-ui'
import { useSessionStore } from '../../stores/session'
import { formatRelativeTime, parseSessionKey } from '../../utils/format'

const { t } = useI18n()
const message = useMessage()
const sessionStore = useSessionStore()
const search = ref('')

onMounted(async () => {
  await sessionStore.fetchSessions()
})

const filteredSessions = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return sessionStore.sessions
  return sessionStore.sessions.filter((s: any) => {
    const key = (s.key || s.id || '').toLowerCase()
    const agent = (s.agentId || '').toLowerCase()
    const label = (s.label || '').toLowerCase()
    return key.includes(q) || agent.includes(q) || label.includes(q)
  })
})

const columns = computed<DataTableColumns>(() => [
  {
    title: '会话',
    key: 'key',
    width: 260,
    ellipsis: { tooltip: true },
    render: (row: any) => {
      const parsed = parseSessionKey(row.key || row.id || '')
      return row.label || `${parsed.agent}/${parsed.channel}/${parsed.peer || '?'}`
    }
  },
  {
    title: 'Agent',
    key: 'agentId',
    width: 120,
    render: (row: any) => row.agentId || parseSessionKey(row.key || '').agent || 'main'
  },
  {
    title: '渠道',
    key: 'channel',
    width: 100,
    render: (row: any) => parseSessionKey(row.key || row.id || '').channel || '-'
  },
  {
    title: '消息数',
    key: 'messageCount',
    width: 80,
    render: (row: any) => String(row.messageCount || 0)
  },
  {
    title: 'Token',
    key: 'tokens',
    width: 120,
    render: (row: any) => {
      if (!row.tokenUsage) return '-'
      return `${row.tokenUsage.totalInput || 0} / ${row.tokenUsage.totalOutput || 0}`
    }
  },
  {
    title: '最近活跃',
    key: 'lastActivity',
    width: 140,
    render: (row: any) => {
      const ts = row.lastActivityAt || row.updatedAt || row.createdAt
      return ts ? formatRelativeTime(ts) : '-'
    }
  }
])

// Exposed for template use
defineExpose({ handleDelete: async (key: string) => {
  try {
    await sessionStore.deleteSession(key)
    message.success('会话已删除')
  } catch (e: any) {
    message.error(e?.message || '删除失败')
  }
}})

async function handleRefresh() {
  await sessionStore.fetchSessions()
}
</script>

<template>
  <div>
    <NCard>
      <template #header>
        <NSpace justify="space-between" align="center">
          <span>{{ t('nav.sessions') }} ({{ filteredSessions.length }})</span>
          <NSpace>
            <NInput v-model:value="search" :placeholder="t('common.search')" clearable size="small" style="width: 200px" />
            <NButton size="small" @click="handleRefresh">刷新</NButton>
          </NSpace>
        </NSpace>
      </template>

      <NSpin :show="sessionStore.loading">
        <NEmpty v-if="filteredSessions.length === 0" :description="t('common.noData')" />
        <NDataTable
          v-else
          :columns="columns"
          :data="filteredSessions"
          :row-key="(row: any) => row.key || row.id"
          :max-height="600"
          size="small"
          striped
        />
      </NSpin>
    </NCard>
  </div>
</template>
