# Phase 1 Remaining Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Dashboard page, adapt Sessions for Hermes REST, and enhance Cron with run history — all using existing store data, no new APIs.

**Architecture:** Three independent UI features sharing existing Pinia stores (hermes-chat, cron, connection). Dashboard is a new page; Sessions adds a Hermes REST data path; Cron adds columns and expandable rows to the existing table.

**Tech Stack:** Vue 3, TypeScript, Pinia, Naive UI, vue-router, vue-i18n, Electron

**Spec:** `docs/superpowers/specs/2026-04-13-phase1-remaining-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/renderer/src/views/dashboard/DashboardPage.vue` | Dashboard page: metric cards + two-column layout |
| Modify | `src/renderer/src/stores/hermes-chat.ts:266-280` | Export `loadFromServer` for Dashboard refresh |
| Modify | `src/renderer/src/router/routes.ts` | Add Dashboard route between Chat and Sessions |
| Modify | `src/renderer/src/components/layout/AppSidebar.vue:28,50` | Sidebar visibility: HERMES_ONLY_ROUTES + remove Sessions from WS_ONLY |
| Modify | `src/renderer/src/views/sessions/SessionsPage.vue` | Hermes REST data path using hermes-chat store |
| Modify | `src/renderer/src/views/sessions/SessionDetailPage.vue` | Hermes REST conversation detail view |
| Modify | `src/renderer/src/views/cron/CronPage.vue:55-153,374` | Add lastRun/lastStatus columns + expandable rows + fix cancel button |
| Modify | `src/renderer/src/i18n/messages/zh-CN.ts` | Add dashboard + cron expanded row i18n keys |
| Modify | `src/renderer/src/i18n/messages/en-US.ts` | Same for English |

---

### Task 1: i18n Keys (All Features)

Add all translation keys upfront so other tasks can reference them without i18n errors.

**Files:**
- Modify: `src/renderer/src/i18n/messages/zh-CN.ts`
- Modify: `src/renderer/src/i18n/messages/en-US.ts`

- [ ] **Step 1: Add Dashboard i18n keys to zh-CN.ts**

Insert a new `dashboard` section inside `pages` (before `cron` at line 513). The `routes.dashboard` key already exists at line 8.

```typescript
// Insert inside pages: { ... } before the cron key
dashboard: {
  title: '仪表盘',
  refresh: '刷新',
  metrics: {
    conversations: '会话数',
    messages: '消息数',
    cronJobs: '定时任务',
    server: '服务器',
    enabled: '已启用',
    online: '在线',
    offline: '离线',
  },
  recentConversations: '最近会话',
  recentCronRuns: '最近任务运行',
  serverInfo: '服务器信息',
  model: '模型',
  syncStatus: '同步状态',
  syncConnected: '已连接',
  syncLocalOnly: '仅本地',
  viewAll: '查看全部 →',
  emptyConversations: '暂无会话。开始聊天后这里会显示活动记录。',
  emptyCronRuns: '暂无任务运行记录。',
  messagesCount: '{count} 条消息',
},
```

- [ ] **Step 2: Add Cron expanded row i18n keys to zh-CN.ts**

Insert inside `pages.cron` object (before the closing `}` at line 753):

```typescript
// Insert inside pages.cron: { ... } before the closing brace
expandedRow: {
  lastRunTime: '上次运行时间',
  duration: '执行时长',
  consecutiveErrors: '连续错误',
  errorDetail: '错误详情',
  nextRunTime: '下次运行时间',
  noData: '暂无运行数据',
},
```

Also add to `pages.cron.table.jobs`:

```typescript
lastRun: '上次运行',
lastStatus: '运行结果',
```

- [ ] **Step 3: Add Sessions Hermes REST i18n keys to zh-CN.ts**

Insert inside `pages.sessions` (add if not grouped, or extend existing):

```typescript
// Add to pages.sessions or create the section
hermesRest: {
  activeToday: '今日活跃',
  newConversation: '新建会话',
  openInChat: '打开聊天',
  exportJson: '导出 JSON',
  untitled: '无标题',
  notFound: '会话未找到',
  notFoundHint: '该会话可能已被删除。',
},
```

- [ ] **Step 4: Mirror all keys to en-US.ts**

Add the same structure to en-US.ts with English values:

```typescript
// pages.dashboard
dashboard: {
  title: 'Dashboard',
  refresh: 'Refresh',
  metrics: {
    conversations: 'Conversations',
    messages: 'Messages',
    cronJobs: 'Cron Jobs',
    server: 'Server',
    enabled: 'enabled',
    online: 'Online',
    offline: 'Offline',
  },
  recentConversations: 'Recent Conversations',
  recentCronRuns: 'Recent Cron Runs',
  serverInfo: 'Server Info',
  model: 'Model',
  syncStatus: 'Sync',
  syncConnected: 'Connected',
  syncLocalOnly: 'Local only',
  viewAll: 'View all →',
  emptyConversations: 'No conversations yet. Start a chat to see activity here.',
  emptyCronRuns: 'No cron runs yet.',
  messagesCount: '{count} messages',
},

// pages.cron.expandedRow
expandedRow: {
  lastRunTime: 'Last Run Time',
  duration: 'Duration',
  consecutiveErrors: 'Consecutive Errors',
  errorDetail: 'Error Detail',
  nextRunTime: 'Next Run Time',
  noData: 'No run data yet',
},

// pages.cron.table.jobs additions
lastRun: 'Last Run',
lastStatus: 'Result',

// pages.sessions.hermesRest
hermesRest: {
  activeToday: 'Active Today',
  newConversation: 'New Conversation',
  openInChat: 'Open in Chat',
  exportJson: 'Export JSON',
  untitled: 'Untitled',
  notFound: 'Conversation not found',
  notFoundHint: 'This conversation may have been deleted.',
},
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/youhebuke/hermes-desktop && npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/i18n/messages/zh-CN.ts src/renderer/src/i18n/messages/en-US.ts
git commit -m "i18n: add dashboard, cron expanded row, and sessions hermes-rest keys"
```

---

### Task 2: Route & Sidebar

**Files:**
- Modify: `src/renderer/src/router/routes.ts:24-25` (insert between Chat and Sessions)
- Modify: `src/renderer/src/components/layout/AppSidebar.vue:28,50`

- [ ] **Step 1: Add Dashboard route**

In `routes.ts`, insert after the Chat route (line 24) and before Sessions (line 25):

```typescript
{
  path: 'dashboard',
  name: 'Dashboard',
  component: () => import('@/views/dashboard/DashboardPage.vue'),
  meta: { titleKey: 'routes.dashboard', icon: 'GridOutline' },
},
```

- [ ] **Step 2: Update sidebar visibility logic**

In `AppSidebar.vue`, change line 28 from:
```typescript
const WS_ONLY_ROUTES = new Set(['Sessions'])
```
to:
```typescript
const WS_ONLY_ROUTES = new Set<string>([])
const HERMES_ONLY_ROUTES = new Set(['Dashboard'])
```

Sessions is removed from WS_ONLY (it now works in both modes). Dashboard is Hermes REST only.

Change the filter at line 50 from:
```typescript
.filter((child) => !(isHermesRest.value && WS_ONLY_ROUTES.has(child.name as string)))
```
to:
```typescript
.filter((child) => {
  const name = child.name as string
  if (isHermesRest.value && WS_ONLY_ROUTES.has(name)) return false
  if (!isHermesRest.value && HERMES_ONLY_ROUTES.has(name)) return false
  return true
})
```

- [ ] **Step 3: Create minimal DashboardPage placeholder**

Create `src/renderer/src/views/dashboard/DashboardPage.vue` with a placeholder to verify routing:

```vue
<script setup lang="ts">
import { NCard, NText } from 'naive-ui'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <NCard :title="t('pages.dashboard.title')">
    <NText>Dashboard placeholder</NText>
  </NCard>
</template>
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/youhebuke/hermes-desktop && npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/router/routes.ts src/renderer/src/components/layout/AppSidebar.vue src/renderer/src/views/dashboard/DashboardPage.vue
git commit -m "feat: add Dashboard route and sidebar visibility logic"
```

---

### Task 3: Export loadFromServer from hermes-chat Store

The `loadFromServer` function is currently internal. Dashboard refresh needs it to re-sync conversations from the management API.

**Files:**
- Modify: `src/renderer/src/stores/hermes-chat.ts:266-280`

- [ ] **Step 1: Add loadFromServer to the store's return**

In `src/renderer/src/stores/hermes-chat.ts`, find the return block (line 266) and add `loadFromServer`:

```typescript
  return {
    conversations,
    activeId,
    model,
    serverSyncAvailable,
    activeConversation,
    load,
    loadFromServer,
    save,
    createConversation,
    switchTo,
    deleteConversation,
    renameConversation,
    setMessages,
    setModel,
  }
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/youhebuke/hermes-desktop && npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/hermes-chat.ts
git commit -m "refactor: export loadFromServer from hermes-chat store for Dashboard refresh"
```

---

### Task 4: Dashboard Page (Full Implementation)

**Files:**
- Modify: `src/renderer/src/views/dashboard/DashboardPage.vue` (replace placeholder)

**Data sources (import these stores):**
- `useHermesChatStore` from `@/stores/hermes-chat`
- `useCronStore` from `@/stores/cron`
- `useConnectionStore` from `@/stores/connection`

- [ ] **Step 1: Implement DashboardPage.vue**

Replace the placeholder with the full implementation:

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NCard, NGrid, NGridItem, NText, NSpace, NButton, NIcon, NTag, NSpin,
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
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/youhebuke/hermes-desktop && npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/dashboard/DashboardPage.vue
git commit -m "feat: implement Dashboard page with metrics and two-column layout"
```

---

### Task 5: Cron Run History Enhancement

**Files:**
- Modify: `src/renderer/src/views/cron/CronPage.vue:55-153` (columns) and `:374` (cancel button)

- [ ] **Step 1: Add lastRun and lastStatus columns**

In `CronPage.vue`, insert two new column definitions after the `nextRun` column (after line 90) and before the `status` column (line 91):

```typescript
{
  title: t('pages.cron.table.jobs.lastRun'),
  key: 'lastRun',
  width: 160,
  render(row) {
    if (!row.state?.lastRunAtMs) return h(NText, { depth: 3 }, { default: () => '-' })
    return h(NText, { depth: 2, style: 'font-size: 13px;' }, {
      default: () => formatRelativeTime(row.state!.lastRunAtMs!),
    })
  },
},
{
  title: t('pages.cron.table.jobs.lastStatus'),
  key: 'lastStatus',
  width: 100,
  render(row) {
    const status = row.state?.lastStatus
    if (!status) return h(NText, { depth: 3 }, { default: () => '-' })
    const typeMap: Record<string, 'success' | 'error' | 'warning'> = {
      ok: 'success',
      error: 'error',
      skipped: 'warning',
    }
    const labelMap: Record<string, string> = { ok: 'OK', error: 'Error', skipped: 'Skipped' }
    return h(NTag, {
      type: typeMap[status] || 'default',
      size: 'small',
      bordered: false,
      round: true,
    }, { default: () => labelMap[status] || status })
  },
},
```

Also add the `formatRelativeTime` import at the top of `<script setup>`:

```typescript
import { formatRelativeTime } from '@/utils/format'
```

- [ ] **Step 2: Add render-expand for expandable rows**

Add the `renderExpand` function in the `<script setup>` section (after the columns definition):

Add `NDescriptions` and `NDescriptionsItem` to the EXISTING Naive UI import block (line 3-8 of CronPage.vue — do NOT create a separate import, as `NAlert` is already imported there):

```typescript
// Add NDescriptions, NDescriptionsItem to the existing import from 'naive-ui'

function renderExpand(row: CronJob) {
  if (!row.state?.lastRunAtMs) {
    return h('div', { style: 'text-align: center; padding: 16px;' },
      h(NText, { depth: 3 }, { default: () => t('pages.cron.expandedRow.noData') }),
    )
  }
  return h(NDescriptions, { labelPlacement: 'left', column: 1, bordered: true, size: 'small', style: 'max-width: 500px;' }, {
    default: () => [
      h(NDescriptionsItem, { label: t('pages.cron.expandedRow.lastRunTime') }, {
        default: () => new Date(row.state!.lastRunAtMs!).toLocaleString(),
      }),
      h(NDescriptionsItem, { label: t('pages.cron.expandedRow.duration') }, {
        default: () => row.state?.lastDurationMs != null
          ? `${(row.state.lastDurationMs / 1000).toFixed(1)}s`
          : '-',
      }),
      h(NDescriptionsItem, { label: t('pages.cron.expandedRow.consecutiveErrors') }, {
        default: () => h(NText, {
          type: (row.state?.consecutiveErrors || 0) > 0 ? 'error' : undefined,
          depth: (row.state?.consecutiveErrors || 0) > 0 ? undefined : 3,
        }, { default: () => String(row.state?.consecutiveErrors || 0) }),
      }),
      row.state?.lastStatus === 'error' && row.state?.lastError
        ? h(NDescriptionsItem, { label: t('pages.cron.expandedRow.errorDetail') }, {
            default: () => h(NAlert, { type: 'error', style: 'font-size: 12px;' }, { default: () => row.state!.lastError }),
          })
        : null,
      h(NDescriptionsItem, { label: t('pages.cron.expandedRow.nextRunTime') }, {
        default: () => row.nextRun ? new Date(row.nextRun).toLocaleString() : '-',
      }),
    ].filter(Boolean),
  })
}
```

Then add `:render-expand="renderExpand"` and `:row-key="(row: CronJob) => row.id"` to the `NDataTable` in the template.

- [ ] **Step 3: Fix cancel button locale hack**

In line 374, replace:
```html
<NButton @click="showModal = false">{{ t('pages.settings.saveFile') === '保存' ? '取消' : 'Cancel' }}</NButton>
```
with:
```html
<NButton @click="showModal = false">{{ t('common.cancel') }}</NButton>
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/youhebuke/hermes-desktop && npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/views/cron/CronPage.vue
git commit -m "feat: add cron run history columns and expandable row details"
```

---

### Task 6: Sessions Page Hermes REST Adaptation

**Files:**
- Modify: `src/renderer/src/views/sessions/SessionsPage.vue`

This is the largest change. The Sessions page needs a complete Hermes REST data path.

- [ ] **Step 1: Read current SessionsPage.vue**

Read the full file to understand the existing structure before making changes. Key areas:
- Imports and store usage
- `fetchSessions` and data loading
- Metric cards computed values
- Table columns definition
- Action handlers (view, export, delete, create)

- [ ] **Step 2: Add Hermes REST data path**

Add these imports and computed values near the top of `<script setup>`:

```typescript
import { useHermesChatStore } from '@/stores/hermes-chat'
import { useConnectionStore } from '@/stores/connection'
import { formatRelativeTime } from '@/utils/format'

const connectionStore = useConnectionStore()
const isHermesRest = computed(() => connectionStore.serverType === 'hermes-rest')

// Hermes REST mode data
const hermesChatStore = useHermesChatStore()

interface HermesSessionRow {
  key: string
  title: string
  messageCount: number
  model: string
  lastActivity: number
  createdAt: number
}

const hermesSessionRows = computed<HermesSessionRow[]>(() => {
  if (!isHermesRest.value) return []
  return hermesChatStore.conversations.map(c => ({
    key: c.id,
    title: c.title || t('pages.sessions.hermesRest.untitled'),
    messageCount: c.messages?.length || 0,
    model: c.model || '-',
    lastActivity: c.updatedAt,
    createdAt: c.createdAt,
  }))
})

const hermesFilteredRows = computed(() => {
  if (!searchQuery.value) return hermesSessionRows.value
  const q = searchQuery.value.toLowerCase()
  return hermesSessionRows.value.filter(r => r.title.toLowerCase().includes(q))
})

// Hermes REST metrics
const hermesMetrics = computed(() => {
  const convs = hermesChatStore.conversations
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  return {
    total: convs.length,
    activeToday: convs.filter(c => now - c.updatedAt < day).length,
    totalMessages: convs.reduce((sum, c) => sum + (c.messages?.length || 0), 0),
    model: connectionStore.hermesRealModel || '-',
  }
})
```

- [ ] **Step 3: Add Hermes REST table columns**

```typescript
Also add `ChatboxEllipsesOutline` to the icon imports at the top of `<script setup>` (from `@vicons/ionicons5`).

```typescript
const hermesColumns = computed<DataTableColumns<HermesSessionRow>>(() => [
  {
    title: t('pages.sessions.list.columns.session'),
    key: 'title',
    minWidth: 200,
    render(row) {
      return h(NText, { strong: true }, { default: () => row.title })
    },
  },
  {
    title: t('pages.sessions.list.columns.messageCount'),
    key: 'messageCount',
    width: 100,
    sorter: (a, b) => a.messageCount - b.messageCount,
  },
  {
    title: t('pages.sessions.list.columns.model'),
    key: 'model',
    width: 140,
    render(row) {
      return h(NTag, { size: 'small', bordered: false }, { default: () => row.model })
    },
  },
  {
    title: t('pages.sessions.list.columns.lastActivity'),
    key: 'lastActivity',
    width: 160,
    sorter: (a, b) => a.lastActivity - b.lastActivity,
    defaultSortOrder: 'descend',
    render(row) {
      return h(NText, { depth: 2, style: 'font-size: 13px;' }, {
        default: () => formatRelativeTime(row.lastActivity),
      })
    },
  },
  {
    title: t('pages.sessions.list.columns.actions'),
    key: 'actions',
    width: 220,
    fixed: 'right',
    render(row) {
      return h(NSpace, { size: 4 }, {
        default: () => [
          // View detail
          h(NTooltip, {}, {
            trigger: () => h(NButton, {
              size: 'tiny', quaternary: true,
              onClick: () => router.push({ name: 'SessionDetail', params: { key: row.key } }),
            }, { icon: () => h(NIcon, { component: EyeOutline }) }),
            default: () => t('pages.sessions.list.viewDetail'),
          }),
          // Open in chat
          h(NTooltip, {}, {
            trigger: () => h(NButton, {
              size: 'tiny', quaternary: true, type: 'primary',
              onClick: () => { hermesChatStore.switchTo(row.key); router.push({ name: 'Chat' }) },
            }, { icon: () => h(NIcon, { component: ChatboxEllipsesOutline }) }),
            default: () => t('pages.sessions.hermesRest.openInChat'),
          }),
          // Export
          h(NTooltip, {}, {
            trigger: () => h(NButton, {
              size: 'tiny', quaternary: true,
              onClick: () => handleHermesExport(row.key),
            }, { icon: () => h(NIcon, { component: DownloadOutline }) }),
            default: () => t('pages.sessions.hermesRest.exportJson'),
          }),
          // Delete
          h(NPopconfirm, {
            onPositiveClick: () => handleHermesDelete(row.key),
          }, {
            trigger: () => h(NButton, { size: 'tiny', quaternary: true, type: 'error' }, {
              icon: () => h(NIcon, { component: TrashOutline }),
            }),
            default: () => t('pages.sessions.detail.confirmDelete'),
          }),
        ],
      })
    },
  },
])
```

- [ ] **Step 4: Add Hermes REST action handlers**

```typescript
function handleHermesExport(id: string) {
  const conv = hermesChatStore.conversations.find(c => c.id === id)
  if (!conv) return
  const json = JSON.stringify(conv, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `conversation-${id}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleHermesDelete(id: string) {
  hermesChatStore.deleteConversation(id)
}

function handleHermesNew() {
  hermesChatStore.createConversation()
  router.push({ name: 'Chat' })
}
```

- [ ] **Step 5: Update template with v-if/v-else branches**

In the template, wrap the existing metric cards section with `v-if="!isHermesRest"` and add a Hermes REST version with `v-else`. Same for the filter bar, table, and action buttons.

Key template pattern:
```html
<!-- Metrics -->
<template v-if="isHermesRest">
  <!-- 4 metric cards using hermesMetrics computed -->
</template>
<template v-else>
  <!-- existing ACP metrics -->
</template>

<!-- Search bar (simplified for Hermes REST - just search input + new button) -->

<!-- Table -->
<NDataTable
  v-if="isHermesRest"
  :columns="hermesColumns"
  :data="hermesFilteredRows"
  :row-key="(row: HermesSessionRow) => row.key"
  :pagination="{ pageSize: 12 }"
  striped
/>
<!-- existing ACP table stays with v-else -->
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/youhebuke/hermes-desktop && npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/views/sessions/SessionsPage.vue
git commit -m "feat: adapt Sessions page for Hermes REST mode using hermes-chat store"
```

---

### Task 7: Session Detail Page Hermes REST Adaptation

**Files:**
- Modify: `src/renderer/src/views/sessions/SessionDetailPage.vue`

- [ ] **Step 1: Read current SessionDetailPage.vue**

Read the full file to understand existing structure before making changes.

- [ ] **Step 2: Add Hermes REST data path**

Add imports and computed for Hermes REST mode:

```typescript
import { useHermesChatStore } from '@/stores/hermes-chat'
import { useConnectionStore } from '@/stores/connection'

const connectionStore = useConnectionStore()
const isHermesRest = computed(() => connectionStore.serverType === 'hermes-rest')
const hermesChatStore = useHermesChatStore()

const hermesConversation = computed(() => {
  if (!isHermesRest.value) return null
  const key = route.params.key as string
  return hermesChatStore.conversations.find(c => c.id === key) || null
})
```

- [ ] **Step 3: Add Hermes REST template branch**

Wrap existing template with `v-if="!isHermesRest"`. Add `v-else` branch:

Also add a reactive ref for inline title editing:

```typescript
const editingTitle = ref(false)
const titleDraft = ref('')

function startEditTitle() {
  titleDraft.value = hermesConversation.value?.title || ''
  editingTitle.value = true
}

function saveTitle() {
  if (hermesConversation.value && titleDraft.value.trim()) {
    hermesChatStore.renameConversation(hermesConversation.value.id, titleDraft.value.trim())
  }
  editingTitle.value = false
}
```

Template branch:

```html
<template v-if="isHermesRest">
  <!-- Not found state -->
  <NCard v-if="!hermesConversation" style="text-align: center; padding: 48px;">
    <NText depth="3">{{ t('pages.sessions.hermesRest.notFound') }}</NText>
    <br />
    <NButton style="margin-top: 16px;" @click="router.push({ name: 'Sessions' })">←</NButton>
  </NCard>

  <!-- Conversation detail -->
  <NSpace v-else vertical :size="16">
    <!-- Header with back + editable title + actions -->
    <NCard>
      <template #header>
        <NSpace align="center" :size="8">
          <NButton text @click="router.push({ name: 'Sessions' })">←</NButton>
          <template v-if="editingTitle">
            <NInput v-model:value="titleDraft" size="small" style="width: 300px;" @keyup.enter="saveTitle" @blur="saveTitle" autofocus />
          </template>
          <template v-else>
            <NText strong style="cursor: pointer;" @click="startEditTitle">
              {{ hermesConversation.title || t('pages.sessions.hermesRest.untitled') }}
            </NText>
          </template>
        </NSpace>
      </template>
      <template #header-extra>
        <NSpace :size="8">
          <NButton size="small" @click="handleHermesOpenChat">{{ t('pages.sessions.hermesRest.openInChat') }}</NButton>
          <NButton size="small" @click="handleHermesExport">{{ t('pages.sessions.hermesRest.exportJson') }}</NButton>
          <NPopconfirm @positive-click="handleHermesDeleteDetail">
            <template #trigger>
              <NButton size="small" type="error">{{ t('common.delete') }}</NButton>
            </template>
            {{ t('pages.sessions.detail.confirmDelete') }}
          </NPopconfirm>
        </NSpace>
      </template>

      <!-- Metadata -->
      <NDescriptions :column="2" label-placement="left" bordered size="small">
        <NDescriptionsItem :label="t('pages.sessions.list.columns.messageCount')">{{ hermesConversation.messages?.length || 0 }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('pages.sessions.list.columns.model')">{{ connectionStore.hermesRealModel || hermesConversation.model || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Created">{{ new Date(hermesConversation.createdAt).toLocaleString() }}</NDescriptionsItem>
        <NDescriptionsItem label="Updated">{{ new Date(hermesConversation.updatedAt).toLocaleString() }}</NDescriptionsItem>
      </NDescriptions>
    </NCard>

    <!-- Transcript -->
    <NCard :title="t('pages.sessions.detail.transcript')">
      <div v-for="(msg, idx) in hermesConversation.messages" :key="idx"
        style="padding: 10px 0; border-bottom: 1px solid var(--n-border-color);">
        <NSpace align="center" :size="8" style="margin-bottom: 4px;">
          <NTag :type="msg.role === 'user' ? 'info' : msg.role === 'assistant' ? 'success' : 'default'" size="small" round>
            {{ msg.role }}
          </NTag>
          <NText depth="3" style="font-size: 11px;">{{ msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '' }}</NText>
        </NSpace>
        <div style="white-space: pre-wrap; font-size: 13px; line-height: 1.6;">{{ msg.content }}</div>
      </div>
    </NCard>
  </NSpace>
</template>
```

- [ ] **Step 4: Add Hermes REST action handlers**

```typescript
function handleHermesOpenChat() {
  if (!hermesConversation.value) return
  hermesChatStore.switchTo(hermesConversation.value.id)
  router.push({ name: 'Chat' })
}

function handleHermesExport() {
  if (!hermesConversation.value) return
  const json = JSON.stringify(hermesConversation.value, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `conversation-${hermesConversation.value.id}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleHermesDeleteDetail() {
  if (!hermesConversation.value) return
  hermesChatStore.deleteConversation(hermesConversation.value.id)
  router.push({ name: 'Sessions' })
}
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/youhebuke/hermes-desktop && npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/views/sessions/SessionDetailPage.vue
git commit -m "feat: adapt Session detail page for Hermes REST conversations"
```

---

### Task 8: Final Build, Version Bump & Release

**Files:**
- Modify: `package.json` (version bump)

- [ ] **Step 1: Full build verification**

Run: `cd /Users/youhebuke/hermes-desktop && npx electron-vite build 2>&1`
Expected: All three builds (main, preload, renderer) succeed with no errors.

- [ ] **Step 2: Bump version to 0.1.7**

In `package.json`, change `"version": "0.1.6"` to `"version": "0.1.7"`.

- [ ] **Step 3: Final commit, tag, and push**

```bash
git add package.json
git commit -m "chore: bump version to 0.1.7"
git tag v0.1.7
git push origin main --tags
```
