<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  NCard,
  NGrid,
  NGridItem,
  NInputNumber,
  NModal,
  NSpace,
  NText,
  NTag,
  NIcon,
  NButton,
  NSpin,
  NAlert,
  NEmpty,
  NSelect,
  NProgress,
  useMessage,
} from 'naive-ui'
import {
  RefreshOutline,
  ServerOutline,
  TimeOutline,
  PowerOutline,
  CloudOutline,
  PersonOutline,
  DesktopOutline,
  CheckmarkCircleOutline,
  DownloadOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useWebSocketStore } from '@/stores/websocket'
import { ConnectionState } from '@/api/types'
import { formatRelativeTime } from '@/utils/format'
import type { HealthSummary, HealthChannelSummary, SystemPresenceEntry } from '@/api/types'

interface ChannelEntry {
  id: string
  label: string
  channel: HealthChannelSummary
}

const { t } = useI18n()
const wsStore = useWebSocketStore()
const message = useMessage()

const loading = ref(false)
const error = ref('')
const health = ref<HealthSummary | null>(null)
const presenceEntries = ref<SystemPresenceEntry[]>([])
const lastUpdatedAt = ref<number | null>(null)

const showRestartModal = ref(false)
const restartDelaySec = ref(3)
const restarting = ref(false)
const restartResult = ref<{ ok: boolean; message: string } | null>(null)

// ── OpenClaw upgrade ──
const isUpdating = ref(false)
const selectedVersion = ref('')
const versionOptions = ref<Array<{ label: string; value: string }>>([])
const isLoadingVersions = ref(false)
const latestVersion = ref<string | null>(null)
const updateStatusMessage = ref('')
const updateProgress = ref(0)
let progressTimer: ReturnType<typeof setInterval> | null = null

const hasUpdate = computed(() => {
  if (wsStore.gatewayVersion && latestVersion.value) {
    return wsStore.gatewayVersion !== latestVersion.value
  }
  return false
})

async function fetchNpmVersions() {
  isLoadingVersions.value = true
  try {
    const api = (window as any).api
    if (!api?.npmVersions) return
    const result = await api.npmVersions()
    const versions: string[] = result.ok ? result.versions : []
    if (versions.length > 0) {
      latestVersion.value = versions[0]
      versionOptions.value = versions.slice(0, 20).map((v: string) => ({ label: v, value: v }))
      selectedVersion.value = versions[0]
    }
  } catch { /* */ } finally {
    isLoadingVersions.value = false
  }
}

function startProgressSim() {
  updateProgress.value = 5
  if (progressTimer) clearInterval(progressTimer)
  progressTimer = setInterval(() => {
    if (updateProgress.value < 85) updateProgress.value += Math.random() * 3 + 1
    else if (updateProgress.value < 95) updateProgress.value += 0.5
  }, 1000)
}

function stopProgressSim() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null }
}

function parseRetryDelay(msg: string): number | null {
  const m = /retry after (\d+)s/i.exec(msg)
  return m ? parseInt(m[1]!, 10) * 1000 : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function handleUpgrade() {
  if (!selectedVersion.value) return
  const version = selectedVersion.value
  isUpdating.value = true
  updateProgress.value = 0
  updateStatusMessage.value = '正在准备升级...'
  startProgressSim()

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      updateStatusMessage.value = '正在通过网关升级 OpenClaw...'
      const result = await wsStore.rpc.runUpdate({ version, restartDelayMs: 3000, timeoutMs: 180000 })
      stopProgressSim()
      if (result.ok) {
        updateProgress.value = 100
        const before = result.result?.before?.version || wsStore.gatewayVersion
        const after = result.result?.after?.version || version
        updateStatusMessage.value = result.restart?.ok
          ? `升级成功 ${before} → ${after}，网关重启中...`
          : `升级完成 ${before} → ${after}`
        message.success(updateStatusMessage.value)
      } else {
        updateProgress.value = 100
        updateStatusMessage.value = result.result?.reason || '升级失败'
        message.error(updateStatusMessage.value)
      }
      break
    } catch (err: any) {
      const errMsg = err?.message || '未知错误'
      const retryDelay = parseRetryDelay(errMsg)
      if (retryDelay && attempt < 3) {
        const secs = Math.ceil(retryDelay / 1000)
        for (let s = secs; s > 0; s--) {
          updateStatusMessage.value = `请求频率限制，${s} 秒后自动重试 (${attempt}/3)...`
          await sleep(1000)
        }
        continue
      }
      stopProgressSim()
      updateProgress.value = 0
      updateStatusMessage.value = errMsg
      message.error(`升级出错: ${errMsg}`)
      break
    }
  }
  isUpdating.value = false
  setTimeout(() => { updateStatusMessage.value = ''; updateProgress.value = 0 }, 8000)
}

let refreshTimer: ReturnType<typeof setInterval> | null = null

/** Ordered channel list derived from health data */
const channelList = computed((): ChannelEntry[] => {
  if (!health.value) return []
  const h = health.value
  const order = h.channelOrder?.length ? h.channelOrder : Object.keys(h.channels ?? {})
  return order
    .filter(id => h.channels?.[id])
    .map(id => ({
      id,
      label: h.channelLabels?.[id] ?? id,
      channel: h.channels[id],
    }))
})

const agentList = computed(() => health.value?.agents ?? [])

const uptime = computed(() =>
  health.value?.durationMs != null ? Math.floor(health.value.durationMs / 1000) : 0,
)

const selfPresence = computed(() => presenceEntries.value[0] ?? null)

function channelStatus(ch: HealthChannelSummary): 'running' | 'configured' | 'offline' {
  if (ch.configured && ch.linked) return 'running'
  if (ch.configured) return 'configured'
  return 'offline'
}

function statusTagType(status: 'running' | 'configured' | 'offline'): 'success' | 'warning' | 'default' {
  if (status === 'running') return 'success'
  if (status === 'configured') return 'warning'
  return 'default'
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0) parts.push(`${mins}m`)
  return parts.join(' ') || '< 1m'
}

function accountCount(ch: HealthChannelSummary): number {
  return ch.accounts ? Object.keys(ch.accounts).length : 0
}

async function fetchData() {
  loading.value = true
  error.value = ''
  try {
    const [healthData, presence] = await Promise.all([
      wsStore.rpc.getHealth(),
      wsStore.rpc.getSystemPresence(),
    ])
    health.value = healthData as HealthSummary
    presenceEntries.value = Array.isArray(presence) ? presence : []
    lastUpdatedAt.value = Date.now()
  } catch (e: unknown) {
    error.value = (e as Error)?.message || t('pages.system.loadFailed')
  } finally {
    loading.value = false
  }
}

function openRestartModal() {
  restartResult.value = null
  restartDelaySec.value = 3
  showRestartModal.value = true
}

async function confirmRestart() {
  restarting.value = true
  restartResult.value = null
  const delayMs = Math.max(0, Math.floor((restartDelaySec.value ?? 3) * 1000))
  try {
    await wsStore.rpc.runUpdate({
      note: 'restart via desktop UI',
      restartDelayMs: delayMs,
      timeoutMs: 10000,
    })
  } catch {
    // Gateway restarts → WebSocket drops → RPC timeout / error. Expected.
  }
  // Regardless of response or error, treat as "restart initiated".
  restartResult.value = {
    ok: true,
    message: t('pages.system.restart.scheduled', { delay: restartDelaySec.value }),
  }
  message.success(t('pages.system.restart.scheduled', { delay: restartDelaySec.value }))
  restarting.value = false
}

onMounted(() => {
  void fetchData()
  void fetchNpmVersions()
  refreshTimer = setInterval(() => {
    if (wsStore.state !== ConnectionState.CONNECTED) return
    void fetchData()
  }, 30000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <NSpace vertical :size="16">
    <NCard :title="t('routes.system')" class="app-card">
      <template #header-extra>
        <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" :loading="loading" @click="fetchData">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          {{ t('common.refresh') }}
        </NButton>
      </template>

      <NAlert v-if="error" type="error" :bordered="false" style="margin-bottom: 16px;">
        {{ error }}
      </NAlert>

      <NText depth="3" style="font-size: 12px; display: block; margin-bottom: 16px;">
        {{ t('pages.system.subtitle') }}
      </NText>

      <NSpin :show="loading && !health">
        <!-- ─── Gateway Status ─── -->
        <NCard size="small" embedded class="svc-card svc-card--running">
          <div class="svc-body">
            <div class="svc-header">
              <NSpace align="center" :size="8">
                <NIcon :component="ServerOutline" color="#18a058" size="22" />
                <NText strong style="font-size: 16px;">OpenClaw Gateway</NText>
              </NSpace>
              <NSpace :size="8" align="center">
                <NTag type="success" :bordered="false" round size="small">
                  <template #icon><NIcon :component="CheckmarkCircleOutline" /></template>
                  {{ t('pages.system.running') }}
                </NTag>
                <NButton size="tiny" type="error" ghost @click="openRestartModal">
                  <template #icon><NIcon :component="PowerOutline" /></template>
                  {{ t('pages.system.restart.action') }}
                </NButton>
              </NSpace>
            </div>
            <NSpace :size="16" class="svc-meta" wrap>
              <NSpace :size="4" align="center">
                <NIcon :component="TimeOutline" size="14" />
                <NText depth="3" style="font-size: 13px;">{{ t('pages.system.uptime') }}: {{ formatUptime(uptime) }}</NText>
              </NSpace>
              <NText v-if="selfPresence?.platform" depth="3" style="font-size: 13px;">{{ selfPresence.platform }}</NText>
              <NText v-if="selfPresence?.host" depth="3" style="font-size: 13px;">{{ selfPresence.host }}</NText>
              <NText v-if="selfPresence?.ip && selfPresence.ip !== selfPresence.host" depth="3" style="font-size: 13px;">{{ selfPresence.ip }}</NText>
            </NSpace>
          </div>
        </NCard>

        <NAlert
          v-if="restartResult"
          :type="restartResult.ok ? 'success' : 'error'"
          :bordered="false"
          style="margin-top: 12px;"
        >
          {{ restartResult.message }}
        </NAlert>

        <!-- ─── OpenClaw Version Upgrade ─── -->
        <NCard size="small" embedded style="margin-top: 12px;" class="svc-card" :class="hasUpdate ? 'svc-card--configured' : 'svc-card--running'">
          <div class="svc-body">
            <div class="svc-header">
              <NSpace align="center" :size="8">
                <NIcon :component="DownloadOutline" :color="hasUpdate ? '#f0a020' : '#18a058'" size="20" />
                <NText strong>OpenClaw 版本管理</NText>
              </NSpace>
              <NTag v-if="hasUpdate" type="warning" :bordered="false" round size="small">有新版本</NTag>
              <NTag v-else-if="!isLoadingVersions" type="success" :bordered="false" round size="small">已是最新</NTag>
            </div>
            <NSpace :size="12" class="svc-meta" wrap align="center">
              <NText depth="3" style="font-size: 13px;">
                当前版本: {{ wsStore.gatewayVersion || '未知' }}
                <span v-if="isLoadingVersions" style="color: var(--text-color-3); margin-left: 6px;">版本检查中...</span>
                <span v-else-if="hasUpdate" style="color: #f0a020; font-weight: 500; margin-left: 6px;">检测到新版本</span>
                <span v-else style="color: #18a058; margin-left: 6px;">已是最新</span>
              </NText>
              <NText v-if="hasUpdate && latestVersion" depth="3" style="font-size: 13px;">最新版本: {{ latestVersion }}</NText>
            </NSpace>
            <div v-if="hasUpdate" style="margin-top: 12px;">
              <NSpace align="center" :size="8">
                <NText style="font-size: 13px;">升级到：</NText>
                <NSelect
                  v-model:value="selectedVersion"
                  :options="versionOptions"
                  size="small"
                  style="width: 180px;"
                  :disabled="isUpdating || isLoadingVersions"
                  :loading="isLoadingVersions"
                />
                <NButton
                  size="small"
                  type="primary"
                  @click="handleUpgrade"
                  :loading="isUpdating"
                  :disabled="isUpdating || !selectedVersion || isLoadingVersions"
                >
                  升级
                </NButton>
              </NSpace>
              <NProgress
                v-if="isUpdating || updateProgress > 0"
                type="line"
                :percentage="Math.round(updateProgress)"
                :show-indicator="true"
                :status="updateProgress >= 100 ? 'success' : 'default'"
                style="margin-top: 8px;"
              />
              <NText v-if="updateStatusMessage" depth="3" style="font-size: 12px; display: block; margin-top: 4px;">
                {{ updateStatusMessage }}
              </NText>
            </div>
          </div>
        </NCard>

        <!-- ─── Channels ─── -->
        <div class="section-title">
          <NSpace align="center" :size="8">
            <NIcon :component="CloudOutline" size="18" />
            <NText strong>频道管理</NText>
            <NTag v-if="channelList.length" :bordered="false" round size="small">{{ channelList.length }}</NTag>
          </NSpace>
        </div>

        <NGrid v-if="channelList.length" cols="1 s:2 m:3" responsive="screen" :x-gap="12" :y-gap="12">
          <NGridItem v-for="ch in channelList" :key="ch.id">
            <NCard size="small" embedded :class="['svc-card', `svc-card--${channelStatus(ch.channel)}`]">
              <div class="svc-body">
                <div class="svc-header">
                  <NText strong>{{ ch.label }}</NText>
                  <NTag :type="statusTagType(channelStatus(ch.channel))" :bordered="false" round size="small">
                    {{ t(`pages.system.${channelStatus(ch.channel)}`) }}
                  </NTag>
                </div>
                <NSpace :size="12" class="svc-meta" wrap>
                  <NText depth="3" style="font-size: 12px;">{{ ch.id }}</NText>
                  <NText v-if="accountCount(ch.channel) > 0" depth="3" style="font-size: 12px;">
                    {{ accountCount(ch.channel) }} {{ t('pages.system.accounts') }}
                  </NText>
                </NSpace>
              </div>
            </NCard>
          </NGridItem>
        </NGrid>
        <NEmpty v-else :description="t('pages.system.noChannels')" style="margin: 16px 0;" />

        <!-- ─── Agents ─── -->
        <div class="section-title">
          <NSpace align="center" :size="8">
            <NIcon :component="PersonOutline" size="18" />
            <NText strong>{{ t('pages.system.agents') }}</NText>
            <NTag v-if="agentList.length" :bordered="false" round size="small">{{ agentList.length }}</NTag>
          </NSpace>
        </div>

        <NGrid v-if="agentList.length" cols="1 s:2 m:3" responsive="screen" :x-gap="12" :y-gap="12">
          <NGridItem v-for="agent in agentList" :key="agent.agentId">
            <NCard size="small" embedded class="svc-card svc-card--running">
              <div class="svc-body">
                <div class="svc-header">
                  <NText strong>{{ agent.name || agent.agentId }}</NText>
                  <NSpace :size="6">
                    <NTag v-if="agent.isDefault" type="info" :bordered="false" round size="small">
                      {{ t('pages.system.defaultAgent') }}
                    </NTag>
                    <NTag type="success" :bordered="false" round size="small">
                      {{ t('pages.system.running') }}
                    </NTag>
                  </NSpace>
                </div>
                <NSpace :size="12" class="svc-meta" wrap>
                  <NText depth="3" style="font-size: 12px;">{{ agent.agentId }}</NText>
                  <NText depth="3" style="font-size: 12px;">
                    {{ agent.sessions?.count ?? 0 }} {{ t('pages.system.sessions') }}
                  </NText>
                </NSpace>
              </div>
            </NCard>
          </NGridItem>
        </NGrid>
        <NEmpty v-else :description="t('pages.system.noAgents')" style="margin: 16px 0;" />

        <!-- ─── Connected Instances ─── -->
        <div class="section-title">
          <NSpace align="center" :size="8">
            <NIcon :component="DesktopOutline" size="18" />
            <NText strong>{{ t('pages.system.instances') }}</NText>
            <NTag v-if="presenceEntries.length" type="success" :bordered="false" round size="small">
              {{ presenceEntries.length }} {{ t('pages.system.online') }}
            </NTag>
          </NSpace>
        </div>

        <NGrid v-if="presenceEntries.length" cols="1 s:2" responsive="screen" :x-gap="12" :y-gap="12">
          <NGridItem v-for="(entry, idx) in presenceEntries" :key="entry.instanceId ?? idx">
            <NCard size="small" embedded class="svc-card svc-card--running">
              <div class="svc-body">
                <div class="svc-header">
                  <NText strong>{{ entry.host || t('pages.system.unknownHost') }}</NText>
                  <NTag type="success" :bordered="false" round size="small">
                    {{ t('pages.system.online') }}
                  </NTag>
                </div>
                <NSpace :size="12" class="svc-meta" wrap>
                  <NText v-if="entry.ip" depth="3" style="font-size: 12px;">{{ entry.ip }}</NText>
                  <NText v-if="entry.version" depth="3" style="font-size: 12px;">v{{ entry.version }}</NText>
                  <NText v-if="entry.platform" depth="3" style="font-size: 12px;">{{ entry.platform }}</NText>
                  <NTag
                    v-for="role in (entry.roles ?? [])"
                    :key="role"
                    :bordered="false"
                    round
                    size="tiny"
                  >
                    {{ role }}
                  </NTag>
                </NSpace>
              </div>
            </NCard>
          </NGridItem>
        </NGrid>
        <NEmpty v-else :description="t('pages.system.noInstances')" style="margin: 16px 0;" />
      </NSpin>

      <NText v-if="lastUpdatedAt" depth="3" style="font-size: 12px; display: block; margin-top: 16px;">
        {{ t('pages.system.lastUpdated', { time: formatRelativeTime(lastUpdatedAt) }) }}
      </NText>
    </NCard>

    <!-- Restart Confirmation Modal -->
    <NModal
      v-model:show="showRestartModal"
      preset="dialog"
      type="warning"
      :title="t('pages.system.restart.confirmTitle')"
      :positive-text="t('pages.system.restart.confirm')"
      :negative-text="t('common.cancel')"
      :positive-button-props="{ type: 'error', loading: restarting }"
      :loading="restarting"
      @positive-click="confirmRestart"
    >
      <NSpace vertical :size="12">
        <NText>{{ t('pages.system.restart.confirmMessage') }}</NText>
        <NSpace align="center" :size="8">
          <NText>{{ t('pages.system.restart.delayLabel') }}</NText>
          <NInputNumber
            v-model:value="restartDelaySec"
            :min="0"
            :max="300"
            :step="1"
            size="small"
            style="width: 120px;"
          />
          <NText depth="3">{{ t('pages.system.restart.delayUnit') }}</NText>
        </NSpace>
      </NSpace>
    </NModal>
  </NSpace>
</template>

<style scoped>
.svc-card {
  border-left: 3px solid transparent;
  border-radius: var(--radius-lg);
  transition: border-left-color 0.2s;
}

.svc-card--running {
  border-left-color: #18a058;
}

.svc-card--configured {
  border-left-color: #f0a020;
}

.svc-card--offline {
  border-left-color: #d1d5db;
}

.svc-body {
  display: flex;
  flex-direction: column;
}

.svc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.svc-meta {
  margin-top: 8px;
}

.section-title {
  margin: 20px 0 10px;
}
</style>
