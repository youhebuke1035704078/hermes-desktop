<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  NCard,
  NSpace,
  NText,
  NTag,
  NIcon,
  NButton,
  NAlert,
  NEmpty,
  NSelect,
} from 'naive-ui'
import { RefreshOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useWebSocketStore } from '@/stores/websocket'
import { useCronStore } from '@/stores/cron'

interface GatewayAlert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  state: 'active' | 'resolved'
  title: string
  message: string
  source: string
  createdAt: string
}

const { t } = useI18n()
const wsStore = useWebSocketStore()
const cronStore = useCronStore()

const loading = ref(false)
const error = ref('')
const alerts = ref<GatewayAlert[]>([])
const filterSeverity = ref<string | null>(null)

const severityOptions = [
  { label: t('pages.alerts.critical'), value: 'critical' },
  { label: t('pages.alerts.warning'), value: 'warning' },
  { label: t('pages.alerts.info'), value: 'info' },
]

const stats = computed(() => ({
  critical: alerts.value.filter(a => a.severity === 'critical').length,
  warning: alerts.value.filter(a => a.severity === 'warning').length,
  info: alerts.value.filter(a => a.severity === 'info').length,
}))

const hasStats = computed(() => stats.value.critical + stats.value.warning + stats.value.info > 0)

const filteredAlerts = computed(() => {
  if (!filterSeverity.value) return alerts.value
  return alerts.value.filter(a => a.severity === filterSeverity.value)
})

function severityTagType(s: string): 'error' | 'warning' | 'info' {
  if (s === 'critical') return 'error'
  if (s === 'warning') return 'warning'
  return 'info'
}

function formatTime(ts: string): string {
  try { return new Date(ts).toLocaleString() } catch { return ts }
}

/** Build alerts from gateway health events and cron run failures */
async function refresh() {
  loading.value = true
  error.value = ''
  const collected: GatewayAlert[] = []

  try {
    // 1. Check health via RPC
    try {
      const health = await wsStore.rpc.getHealth()
      if (health) {
        // Check individual channels for issues
        if (health.channels) {
          for (const [name, ch] of Object.entries(health.channels)) {
            const notOk = ch.configured && !ch.linked
            if (notOk) {
              collected.push({
                id: `channel-${name}`,
                severity: 'warning',
                state: 'active',
                title: `${t('pages.alerts.channelIssue')}: ${name}`,
                message: `configured=${ch.configured} linked=${ch.linked}`,
                source: name,
                createdAt: new Date().toISOString(),
              })
            }
          }
        }
      }
    } catch { /* health RPC not critical */ }

    // 2. Check cron job failures
    await cronStore.fetchJobs()
    for (const job of cronStore.jobs) {
      if (!job.state) continue
      const state = job.state

      // Consecutive errors
      if (state.consecutiveErrors && state.consecutiveErrors > 0) {
        collected.push({
          id: `cron-err-${job.id}`,
          severity: state.consecutiveErrors >= 3 ? 'critical' : 'warning',
          state: 'active',
          title: `Cron: ${job.name}`,
          message: state.lastError
            || `${state.consecutiveErrors} ${t('pages.alerts.consecutiveFailures')}`,
          source: 'cron',
          createdAt: state.lastRunAtMs ? new Date(state.lastRunAtMs).toISOString() : new Date().toISOString(),
        })
      }

      // Last run failed (but not consecutive)
      if (!state.consecutiveErrors && state.lastStatus === 'error') {
        collected.push({
          id: `cron-last-${job.id}`,
          severity: 'info',
          state: 'resolved',
          title: `Cron: ${job.name}`,
          message: state.lastError || t('pages.alerts.lastRunFailed'),
          source: 'cron',
          createdAt: state.lastRunAtMs ? new Date(state.lastRunAtMs).toISOString() : new Date().toISOString(),
        })
      }
    }

    // 3. Check cron scheduler status
    try {
      const cronStatus = await wsStore.rpc.getCronStatus()
      if (cronStatus && !cronStatus.enabled) {
        collected.push({
          id: 'cron-scheduler-paused',
          severity: 'warning',
          state: 'active',
          title: t('pages.alerts.schedulerPaused'),
          message: t('pages.alerts.schedulerPausedMsg'),
          source: 'cron',
          createdAt: new Date().toISOString(),
        })
      }
    } catch { /* ignore */ }

    // Sort: critical first, then warning, then info; active before resolved
    collected.sort((a, b) => {
      const sevOrder = { critical: 0, warning: 1, info: 2 }
      const stateOrder = { active: 0, resolved: 1 }
      const sd = (sevOrder[a.severity] ?? 2) - (sevOrder[b.severity] ?? 2)
      if (sd !== 0) return sd
      return (stateOrder[a.state] ?? 1) - (stateOrder[b.state] ?? 1)
    })

    alerts.value = collected
  } catch (e: unknown) {
    error.value = (e as Error)?.message || t('pages.alerts.loadFailed')
  } finally {
    loading.value = false
  }
}

let refreshTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if ((window as any).api?.clearBadge) (window as any).api.clearBadge()
  refresh()
  refreshTimer = setInterval(refresh, 30000)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<template>
  <NSpace vertical :size="16">
    <NCard :title="t('routes.alerts')" class="app-card">
      <template #header-extra>
        <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" :loading="loading" @click="refresh">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          {{ t('common.refresh') }}
        </NButton>
      </template>

      <NAlert v-if="error" type="error" :bordered="false" style="margin-bottom: 16px;">
        {{ error }}
      </NAlert>

      <NText depth="3" style="font-size: 12px; display: block; margin-bottom: 16px;">
        {{ t('pages.alerts.subtitle') }}
      </NText>

      <!-- Active stats summary -->
      <NSpace v-if="hasStats" :size="8" style="margin-bottom: 14px;">
        <NTag v-if="stats.critical" type="error" :bordered="false" round size="small">
          {{ t('pages.alerts.critical') }} {{ stats.critical }}
        </NTag>
        <NTag v-if="stats.warning" type="warning" :bordered="false" round size="small">
          {{ t('pages.alerts.warning') }} {{ stats.warning }}
        </NTag>
        <NTag v-if="stats.info" type="info" :bordered="false" round size="small">
          {{ t('pages.alerts.info') }} {{ stats.info }}
        </NTag>
      </NSpace>

      <!-- Filters -->
      <NSpace :size="12" style="margin-bottom: 16px;">
        <NSelect
          v-model:value="filterSeverity"
          clearable
          :options="severityOptions"
          :placeholder="t('pages.alerts.allSeverity')"
          style="width: 150px;"
          size="small"
        />
      </NSpace>

      <!-- Alert list -->
      <NSpace vertical :size="10">
        <NCard
          v-for="alert in filteredAlerts"
          :key="alert.id"
          size="small"
          embedded
          :class="['alert-card', `alert-card--${alert.severity}`]"
        >
          <div class="alert-body">
            <div class="alert-header">
              <NSpace :size="8" align="center">
                <NTag :type="severityTagType(alert.severity)" :bordered="false" round size="small">
                  {{ t(`pages.alerts.${alert.severity}`) }}
                </NTag>
                <NText strong>{{ alert.title }}</NText>
              </NSpace>
              <NTag
                :type="alert.state === 'resolved' ? 'success' : 'default'"
                :bordered="false" round size="small"
              >
                {{ t(`pages.alerts.${alert.state}`) }}
              </NTag>
            </div>

            <NText v-if="alert.message" depth="2" style="font-size: 13px; margin-top: 6px; display: block;">
              {{ alert.message }}
            </NText>

            <NSpace :size="12" class="alert-meta" wrap>
              <NText depth="3" style="font-size: 12px;">
                {{ t('pages.alerts.source') }}: {{ alert.source }}
              </NText>
              <NText depth="3" style="font-size: 12px;">{{ formatTime(alert.createdAt) }}</NText>
            </NSpace>
          </div>
        </NCard>
      </NSpace>

      <NEmpty
        v-if="!loading && filteredAlerts.length === 0 && !error"
        :description="t('pages.alerts.noAlerts')"
        style="margin: 24px 0;"
      />
    </NCard>
  </NSpace>
</template>

<style scoped>
.alert-card {
  border-left: 3px solid transparent;
  border-radius: var(--radius-lg);
  transition: border-left-color 0.2s;
}
.alert-card--critical { border-left-color: #e03050; }
.alert-card--warning { border-left-color: #f0a020; }
.alert-card--info { border-left-color: #2080f0; }
.alert-body { display: flex; flex-direction: column; }
.alert-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.alert-meta { margin-top: 8px; }
</style>
