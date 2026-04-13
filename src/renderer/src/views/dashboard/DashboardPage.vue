<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NCard, NGrid, NGridItem, NText, NSpace, NButton, NIcon, NTag,
} from 'naive-ui'
import { GridOutline, RefreshOutline } from '@vicons/ionicons5'
import { useHermesChatStore } from '@/stores/hermes-chat'
import { useCronStore } from '@/stores/cron'
import { useConnectionStore } from '@/stores/connection'
import { formatRelativeTime } from '@/utils/format'

const { t } = useI18n()
const router = useRouter()
const hermesChatStore = useHermesChatStore()
const cronStore = useCronStore()
const connectionStore = useConnectionStore()

// ── Metrics ──
const totalConversations = computed(() => hermesChatStore.conversations.length)
const totalMessages = computed(() =>
  hermesChatStore.conversations.reduce((sum, c) => sum + (c.messages?.length || 0), 0),
)
const enabledJobs = computed(() => cronStore.jobs.filter(j => j.enabled).length)
const totalJobs = computed(() => cronStore.jobs.length)
const isOnline = computed(() => connectionStore.status === 'connected')
const modelName = computed(() => connectionStore.hermesRealModel || '-')

// ── Recent data ──
const recentConversations = computed(() =>
  [...hermesChatStore.conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5),
)

const recentCronRuns = computed(() =>
  [...cronStore.jobs]
    .filter(j => j.state?.lastRunAtMs)
    .sort((a, b) => (b.state?.lastRunAtMs || 0) - (a.state?.lastRunAtMs || 0))
    .slice(0, 5),
)

// ── Actions ──
function openConversation(id: string) {
  hermesChatStore.switchTo(id)
  router.push({ name: 'Chat' })
}

function goSessions() {
  router.push({ name: 'Sessions' })
}

function goCron() {
  router.push({ name: 'Cron' })
}

async function handleRefresh() {
  await cronStore.fetchJobs()
  if (hermesChatStore.serverSyncAvailable) {
    await hermesChatStore.loadFromServer()
  }
}

onMounted(() => {
  if (cronStore.jobs.length === 0) {
    cronStore.fetchJobs()
  }
})
</script>

<template>
  <NSpace vertical :size="16">
    <!-- Header -->
    <NCard>
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="GridOutline" :size="20" />
          <span>{{ t('pages.dashboard.title') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NButton secondary size="small" @click="handleRefresh" :loading="cronStore.loading">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          {{ t('pages.dashboard.refresh') }}
        </NButton>
      </template>

      <!-- Metric Cards -->
      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="10" :y-gap="10">
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.metrics.conversations') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">{{ totalConversations }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.metrics.messages') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">{{ totalMessages }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.metrics.cronJobs') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              {{ totalJobs }}
              <NText style="font-size: 12px; font-weight: 400;" type="success"> {{ enabledJobs }} {{ t('pages.dashboard.metrics.enabled') }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.dashboard.metrics.server') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              <NText :type="isOnline ? 'success' : 'error'">{{ isOnline ? t('pages.dashboard.metrics.online') : t('pages.dashboard.metrics.offline') }}</NText>
            </div>
            <NText depth="3" style="font-size: 11px;">{{ modelName }}</NText>
          </NCard>
        </NGridItem>
      </NGrid>
    </NCard>

    <!-- Two-column content -->
    <NGrid cols="1 m:2" responsive="screen" :x-gap="12" :y-gap="12">
      <!-- Left: Recent Conversations -->
      <NGridItem>
        <NCard :title="t('pages.dashboard.recentConversations')" size="small">
          <div v-if="recentConversations.length === 0" style="text-align: center; padding: 24px;">
            <NText depth="3">{{ t('pages.dashboard.emptyConversations') }}</NText>
          </div>
          <div v-else>
            <div
              v-for="conv in recentConversations"
              :key="conv.id"
              style="display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--n-border-color); cursor: pointer;"
              @click="openConversation(conv.id)"
            >
              <div style="flex: 1; min-width: 0;">
                <NText strong style="display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  {{ conv.title || t('pages.sessions.hermesRest.untitled') }}
                </NText>
                <NText depth="3" style="font-size: 12px;">
                  {{ t('pages.dashboard.messagesCount', { count: conv.messages?.length || 0 }) }}
                </NText>
              </div>
              <NText depth="3" style="font-size: 12px; white-space: nowrap;">
                {{ formatRelativeTime(conv.updatedAt) }}
              </NText>
            </div>
            <div style="text-align: center; padding-top: 12px;">
              <NButton text type="primary" @click="goSessions">{{ t('pages.dashboard.viewAll') }}</NButton>
            </div>
          </div>
        </NCard>
      </NGridItem>

      <!-- Right: Cron Runs + Server Info -->
      <NGridItem>
        <NSpace vertical :size="12">
          <!-- Recent Cron Runs -->
          <NCard :title="t('pages.dashboard.recentCronRuns')" size="small">
            <div v-if="recentCronRuns.length === 0" style="text-align: center; padding: 24px;">
              <NText depth="3">{{ t('pages.dashboard.emptyCronRuns') }}</NText>
            </div>
            <div v-else>
              <div
                v-for="job in recentCronRuns"
                :key="job.id"
                style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--n-border-color); cursor: pointer;"
                @click="goCron"
              >
                <NText style="flex: 1; font-size: 13px;">{{ job.name }}</NText>
                <NTag
                  :type="job.state?.lastStatus === 'ok' ? 'success' : job.state?.lastStatus === 'error' ? 'error' : 'warning'"
                  size="small" :bordered="false" round
                >
                  {{ job.state?.lastStatus === 'ok' ? 'OK' : job.state?.lastStatus === 'error' ? 'Error' : job.state?.lastStatus || '-' }}
                </NTag>
                <NText depth="3" style="font-size: 12px; white-space: nowrap;">
                  {{ formatRelativeTime(job.state?.lastRunAtMs || 0) }}
                </NText>
              </div>
            </div>
          </NCard>

          <!-- Server Info -->
          <NCard :title="t('pages.dashboard.serverInfo')" size="small">
            <NSpace vertical :size="8">
              <div style="display: flex; justify-content: space-between;">
                <NText depth="3">{{ t('pages.dashboard.model') }}</NText>
                <NText>{{ modelName }}</NText>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <NText depth="3">{{ t('pages.dashboard.syncStatus') }}</NText>
                <NTag
                  :type="hermesChatStore.serverSyncAvailable ? 'success' : 'default'"
                  size="small" :bordered="false" round
                >
                  {{ hermesChatStore.serverSyncAvailable ? t('pages.dashboard.syncConnected') : t('pages.dashboard.syncLocalOnly') }}
                </NTag>
              </div>
            </NSpace>
          </NCard>
        </NSpace>
      </NGridItem>
    </NGrid>
  </NSpace>
</template>
