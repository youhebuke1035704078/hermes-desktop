<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton,
  NCard,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  NText,
  useMessage
} from 'naive-ui'
import {
  DocumentTextOutline,
  RefreshOutline,
  TrashBinOutline,
  PlayCircleOutline,
  PauseCircleOutline,
  ArrowDownOutline,
  CopyOutline
} from '@vicons/ionicons5'
import { useLogsStore } from '@/stores/logs'
import { writeTextToClipboard } from '@/utils/clipboard'
import type { LogEntry, LogLevel } from '@/api/types'

const { t } = useI18n()
const message = useMessage()
const logsStore = useLogsStore()

// ── Auto-scroll ──
const autoScroll = ref(true)
const logContainer = ref<HTMLDivElement | null>(null)

async function scrollToBottom() {
  if (!autoScroll.value || !logContainer.value) return
  await nextTick()
  logContainer.value.scrollTop = logContainer.value.scrollHeight
}

/** Force-scroll to bottom regardless of autoScroll state (used by the explicit button). */
async function forceScrollToBottom() {
  if (!logContainer.value) return
  await nextTick()
  logContainer.value.scrollTop = logContainer.value.scrollHeight
  autoScroll.value = true
}

watch(
  () => logsStore.filteredEntries.length,
  () => {
    scrollToBottom()
  }
)

// ── Filter options ──
const levelOptions = computed(() => [
  { label: t('pages.logs.levelAll'), value: null as any },
  { label: 'TRACE', value: 'trace' },
  { label: 'DEBUG', value: 'debug' },
  { label: 'INFO', value: 'info' },
  { label: 'WARN', value: 'warn' },
  { label: 'ERROR', value: 'error' },
  { label: 'FATAL', value: 'fatal' }
])

const subsystemOptions = computed(() => [
  { label: t('pages.logs.subsystemAll'), value: null as any },
  ...logsStore.availableSubsystems.map((s) => ({ label: s, value: s }))
])

const refreshIntervalOptions = [
  { label: '1s', value: 1000 },
  { label: '3s', value: 3000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 }
]

const importantEntries = computed(() =>
  logsStore.entries
    .filter((entry) => entry.level === 'error' || entry.level === 'fatal' || entry.level === 'warn')
    .slice(-5)
    .reverse()
)

const visibleLogText = computed(() =>
  logsStore.filteredEntries
    .map((entry) => entry.raw || entry.message || '')
    .filter(Boolean)
    .join('\n')
)

// ── Level tag style ──
function levelType(
  level: LogLevel | null | undefined
): 'default' | 'success' | 'info' | 'warning' | 'error' {
  switch (level) {
    case 'trace':
      return 'default'
    case 'debug':
      return 'default'
    case 'info':
      return 'info'
    case 'warn':
      return 'warning'
    case 'error':
      return 'error'
    case 'fatal':
      return 'error'
    default:
      return 'default'
  }
}

function levelLabel(level: LogLevel | null | undefined): string {
  return (level || 'LOG').toUpperCase()
}

// ── Time formatting ──
function formatEntryTime(entry: LogEntry): string {
  if (!entry.time) return ''
  try {
    const d = new Date(entry.time)
    if (Number.isNaN(d.getTime())) return entry.time
    return d.toLocaleTimeString()
  } catch {
    return entry.time
  }
}

// ── File size formatting ──
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// ── Actions ──
async function handleRefresh(): Promise<void> {
  await logsStore.fetchOnce()
  scrollToBottom()
}

async function handleReset(): Promise<void> {
  logsStore.clearBuffer()
  await logsStore.fetchOnce(true)
  scrollToBottom()
}

function handleClear(): void {
  logsStore.clearBuffer()
  message.success(t('pages.logs.cleared'))
}

function handleToggleAutoRefresh(): void {
  logsStore.toggleAutoRefresh()
  if (logsStore.autoRefresh) {
    message.success(t('pages.logs.autoRefreshOn'))
  }
}

function handleIntervalChange(val: number): void {
  logsStore.refreshIntervalMs = val
  if (logsStore.autoRefresh) {
    logsStore.stopAutoRefresh()
    logsStore.startAutoRefresh()
  }
}

function focusLevel(level: LogLevel | null): void {
  logsStore.levelFilter = level
  logsStore.searchQuery = ''
}

async function copyVisibleLogs(): Promise<void> {
  if (!visibleLogText.value) {
    message.warning('当前没有可复制的日志')
    return
  }
  try {
    await writeTextToClipboard(visibleLogText.value)
    message.success('已复制当前可见日志')
  } catch {
    message.error(t('common.copyFailed'))
  }
}

// ── Lifecycle ──
onMounted(() => {
  logsStore.fetchOnce(true).then(() => scrollToBottom())
})

onUnmounted(() => {
  logsStore.stopAutoRefresh()
})
</script>

<template>
  <NSpace vertical :size="16">
    <!-- Header + Metrics + Actions -->
    <NCard>
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="DocumentTextOutline" :size="20" />
          <span>{{ t('pages.logs.title') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NSpace :size="8">
          <NButton secondary size="small" @click="handleRefresh" :loading="logsStore.loading">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('pages.logs.refresh') }}
          </NButton>
          <NButton
            :type="logsStore.autoRefresh ? 'warning' : 'primary'"
            secondary
            size="small"
            @click="handleToggleAutoRefresh"
          >
            <template #icon>
              <NIcon :component="logsStore.autoRefresh ? PauseCircleOutline : PlayCircleOutline" />
            </template>
            {{ logsStore.autoRefresh ? t('pages.logs.pause') : t('pages.logs.autoRefresh') }}
          </NButton>
          <NButton secondary size="small" @click="copyVisibleLogs">
            <template #icon><NIcon :component="CopyOutline" /></template>
            复制可见日志
          </NButton>
        </NSpace>
      </template>

      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="10" :y-gap="10">
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px">
            <NText depth="3" style="font-size: var(--font-body-sm)">{{
              t('pages.logs.metrics.total')
            }}</NText>
            <div style="font-size: var(--font-metric); font-weight: 700; margin-top: 6px">
              {{ logsStore.counts.total }}
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px">
            <NText depth="3" style="font-size: var(--font-body-sm)">{{
              t('pages.logs.metrics.errors')
            }}</NText>
            <div style="font-size: var(--font-metric); font-weight: 700; margin-top: 6px">
              <NText type="error">{{ logsStore.counts.error }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px">
            <NText depth="3" style="font-size: var(--font-body-sm)">{{
              t('pages.logs.metrics.warns')
            }}</NText>
            <div style="font-size: var(--font-metric); font-weight: 700; margin-top: 6px">
              <NText type="warning">{{ logsStore.counts.warn }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px">
            <NText depth="3" style="font-size: var(--font-body-sm)">{{
              t('pages.logs.metrics.fileSize')
            }}</NText>
            <div style="font-size: var(--font-metric); font-weight: 700; margin-top: 6px">
              <NText type="info">{{ formatBytes(logsStore.fileSize) }}</NText>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Filter bar -->
      <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; align-items: center">
        <NInput
          v-model:value="logsStore.searchQuery"
          clearable
          :placeholder="t('pages.logs.searchPlaceholder')"
          style="flex: 1; min-width: 200px"
        />
        <NSelect
          v-model:value="logsStore.levelFilter"
          :options="levelOptions"
          :placeholder="t('pages.logs.levelFilter')"
          clearable
          style="width: 140px"
        />
        <NSelect
          v-model:value="logsStore.subsystemFilter"
          :options="subsystemOptions"
          :placeholder="t('pages.logs.subsystemFilter')"
          clearable
          style="width: 160px"
        />
        <NSelect
          :value="logsStore.refreshIntervalMs"
          :options="refreshIntervalOptions"
          style="width: 90px"
          @update:value="handleIntervalChange"
        />
        <NSpace :size="6" align="center">
          <NText depth="3" style="font-size: var(--font-body-sm)">{{
            t('pages.logs.autoScroll')
          }}</NText>
          <NSwitch v-model:value="autoScroll" size="small" />
        </NSpace>
        <NSpace :size="6" align="center">
          <NButton
            size="tiny"
            secondary
            :type="logsStore.levelFilter === 'error' ? 'error' : 'default'"
            @click="focusLevel('error')"
          >
            只看错误
          </NButton>
          <NButton
            size="tiny"
            secondary
            :type="logsStore.levelFilter === 'warn' ? 'warning' : 'default'"
            @click="focusLevel('warn')"
          >
            只看警告
          </NButton>
          <NButton size="tiny" quaternary @click="focusLevel(null)"> 全部 </NButton>
        </NSpace>
      </div>

      <!-- File info line -->
      <div v-if="logsStore.fileName" style="margin-top: 8px">
        <NText depth="3" code style="font-size: 11px">{{ logsStore.fileName }}</NText>
        <NText
          v-if="logsStore.error"
          type="error"
          style="font-size: var(--font-body-sm); margin-left: 8px"
        >
          {{ logsStore.error }}
        </NText>
      </div>
    </NCard>

    <NCard v-if="importantEntries.length">
      <template #header>
        <NSpace align="center" :size="8">
          <NText strong>最近异常摘要</NText>
          <NTag size="small" type="warning" round :bordered="false"
            >{{ importantEntries.length }} 条</NTag
          >
        </NSpace>
      </template>
      <div class="important-log-list">
        <div
          v-for="(entry, idx) in importantEntries"
          :key="`${entry.time ?? ''}:${idx}`"
          class="important-log-row"
        >
          <NTag size="tiny" :type="levelType(entry.level)" :bordered="false">{{
            levelLabel(entry.level)
          }}</NTag>
          <NText depth="3" class="important-log-time">{{ formatEntryTime(entry) || '-' }}</NText>
          <NText class="important-log-message">{{ entry.message || entry.raw }}</NText>
        </div>
      </div>
    </NCard>

    <!-- Log viewer -->
    <NCard content-style="padding: 0;">
      <div ref="logContainer" class="log-viewer">
        <div
          v-if="logsStore.filteredEntries.length === 0"
          style="text-align: center; padding: 60px 16px"
        >
          <NText depth="3">{{
            logsStore.loading ? t('pages.logs.loading') : t('pages.logs.empty')
          }}</NText>
        </div>
        <div
          v-for="(entry, idx) in logsStore.filteredEntries"
          :key="`${entry.time ?? ''}:${entry.level ?? ''}:${idx}:${entry.raw?.length ?? 0}`"
          class="log-line"
          :class="{
            'log-line--error': entry.level === 'error' || entry.level === 'fatal',
            'log-line--warn': entry.level === 'warn'
          }"
        >
          <span class="log-time">{{ formatEntryTime(entry) }}</span>
          <NTag
            v-if="entry.level"
            size="tiny"
            :type="levelType(entry.level)"
            :bordered="false"
            style="margin-right: 6px; min-width: 46px; text-align: center"
          >
            {{ levelLabel(entry.level) }}
          </NTag>
          <span v-if="entry.subsystem" class="log-subsystem">[{{ entry.subsystem }}]</span>
          <span class="log-message">{{ entry.message || entry.raw }}</span>
        </div>
      </div>

      <!-- Footer controls -->
      <div class="log-footer">
        <NText depth="3" style="font-size: 11px">
          {{
            t('pages.logs.showing', {
              filtered: logsStore.filteredEntries.length,
              total: logsStore.counts.total
            })
          }}
        </NText>
        <NSpace :size="6">
          <NButton size="tiny" quaternary @click="handleClear">
            <template #icon><NIcon :component="TrashBinOutline" /></template>
            {{ t('pages.logs.clear') }}
          </NButton>
          <NButton size="tiny" quaternary @click="handleReset">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('pages.logs.reload') }}
          </NButton>
          <NButton size="tiny" quaternary @click="forceScrollToBottom">
            <template #icon><NIcon :component="ArrowDownOutline" /></template>
            {{ t('pages.logs.scrollBottom') }}
          </NButton>
        </NSpace>
      </div>
    </NCard>
  </NSpace>
</template>

<style scoped>
.log-viewer {
  max-height: calc(100vh - 420px);
  min-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Code', monospace;
  font-size: var(--font-body-sm);
  line-height: 1.6;
  padding: 8px 12px;
  background: var(--n-color-embedded);
}

.important-log-list {
  display: grid;
  gap: 8px;
}

.important-log-row {
  display: grid;
  grid-template-columns: auto 76px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  background: var(--n-color-embedded);
}

.important-log-time {
  font-size: 11px;
  white-space: nowrap;
}

.important-log-message {
  min-width: 0;
  font-size: var(--font-body-sm);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.log-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid var(--n-border-color);
  word-break: break-word;
  white-space: pre-wrap;
}

.log-line:last-child {
  border-bottom: none;
}

.log-line--error {
  background: rgba(208, 48, 80, 0.06);
}

.log-line--warn {
  background: rgba(255, 193, 7, 0.05);
}

.log-time {
  color: var(--n-text-color-3);
  flex-shrink: 0;
  min-width: 72px;
  font-size: 11px;
}

.log-subsystem {
  color: var(--n-text-color-2);
  flex-shrink: 0;
  font-weight: 600;
}

.log-message {
  flex: 1;
  min-width: 0;
  color: var(--n-text-color-1);
}

.log-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-top: 1px solid var(--n-border-color);
  background: var(--n-color);
}

@media (max-width: 640px) {
  .important-log-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .important-log-time {
    display: none;
  }
}
</style>
