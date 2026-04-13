# Phase 1 Remaining Features Design

**Date**: 2026-04-13
**Scope**: Dashboard page, Sessions Hermes REST adaptation, Cron run history enhancement
**Version**: v0.1.7 target

## Context

Hermes Desktop v0.1.6 has conversation server sync and cron job management working. The Hermes Agent REST API does not expose a `/v1/runs` endpoint, so "agent run monitoring" is reframed as three features that surface existing data in new views.

Data sources available in Hermes REST mode:
- `hermes-chat store`: conversations with messages, timestamps, model
- `cron store`: jobs with schedule, state (lastRunAtMs, lastStatus, lastError, lastDurationMs, consecutiveErrors)
- `connection store`: server URL, serverType, model name, auth token
- `management API` (port 8643): health, version, sync status

No new API endpoints are required. All three features consume existing store data.

**Utility note**: For relative time formatting, use the existing `formatRelativeTime` utility from `@/utils/format` (already used in SessionsPage and SessionDetailPage). Do NOT introduce `date-fns` `formatDistanceToNow` as a parallel approach.

---

## Feature 1: Dashboard Page

### Files
- **New**: `src/renderer/src/views/dashboard/DashboardPage.vue`
- **Modified**: `src/renderer/src/router/routes.ts` (add route)
- **Modified**: `src/renderer/src/components/layout/AppSidebar.vue` (add visibility logic)
- **Modified**: `src/renderer/src/i18n/messages/zh-CN.ts`, `en-US.ts` (add translations)

### Route

Add to `routes.ts` children array, after Chat and before Sessions:

```typescript
{
  path: 'dashboard',
  name: 'Dashboard',
  component: () => import('@/views/dashboard/DashboardPage.vue'),
  meta: { titleKey: 'routes.dashboard', icon: 'GridOutline' },
},
```

`GridOutline` is already imported in `AppSidebar.vue`'s `iconMap`.

Visibility: Hermes REST mode only (see Sidebar Visibility Logic section).

### Data Sources
- `useHermesChatStore()` — conversations array
- `useCronStore()` — jobs array
- `useConnectionStore()` — server info, model name, `hermesResolvedModel`
- `hermesChatStore.serverSyncAvailable` — sync status

### Layout (Option B — Sectioned)

```
+--------------------------------------------------+
| [GridOutline] Dashboard              [Refresh]   |
+--------------------------------------------------+
| [Conversations] [Messages] [Cron Jobs] [Server]  |
|     12             247       3/5 on    Online     |
|                                       gpt-5.4    |
+--------------------------------------------------+
| Recent Conversations  | Recent Cron Runs         |
| ───────────────────── | ──────────────────────── |
| Python script...   2m | Morning Report   OK  35m |
| Tailscale VPN...  1hr | Heartbeat Check ERR  2hr |
| React debug...    3hr | Main Reminder    OK  3hr |
|                       | ──────────────────────── |
| [View all →]          | Server Info              |
|                       | Model: gpt-5.4           |
|                       | Sync: Connected          |
+--------------------------------------------------+
```

**Metric cards** — `NGrid cols="1 s:2 m:4" responsive="screen"` with `NCard embedded`:
1. Conversations: `conversations.length`
2. Messages: sum of all `conv.messages.length`
3. Cron Jobs: `{enabled} / {total}` with NText type coloring
4. Server: Online/Offline (based on connection state) + model name from `connectionStore.hermesResolvedModel`

**Left column — Recent Conversations** (`NGrid cols="1 m:2" responsive="screen"`, left item):
- List of up to 5 most recent conversations (sorted by updatedAt desc)
- Each row: title (truncated), message count, relative time (`formatRelativeTime` from `@/utils/format`)
- Click navigates to Chat page with `hermesChatStore.switchTo(id)` + `router.push({ name: 'Chat' })`
- "View all" link at bottom navigates to Sessions page
- **Empty state**: When no conversations exist, show `NText depth=3` centered: "No conversations yet. Start a chat to see activity here."

**Right column — Cron Runs + Server Info**:
- Top card: Recent Cron Runs — jobs filtered to those with `state?.lastRunAtMs`, sorted by lastRunAtMs desc, top 5
  - Each row: job name, status tag (ok/error), relative time
  - Click navigates to Cron page
  - **Empty state**: When no jobs have run data, show `NText depth=3`: "No cron runs yet."
- Bottom card: Server Info — model from `connectionStore.hermesResolvedModel`, sync status badge (`hermesChatStore.serverSyncAvailable` ? "Connected" : "Local only")
  - Note: version is not available from stores directly; show model and sync status only. Version display is already handled in SettingsPage.

### Refresh Behavior
- Refresh button calls both `cronStore.fetchJobs()` AND `hermesChatStore.loadFromServer()` (re-syncs conversations from mgmt API if available)
- On mount: `cronStore.fetchJobs()` if not already loaded; hermes-chat store data is already loaded at app startup

---

## Feature 2: Sessions Page Hermes REST Adaptation

### Files
- **Modified**: `src/renderer/src/views/sessions/SessionsPage.vue`
- **Modified**: `src/renderer/src/views/sessions/SessionDetailPage.vue`
- **Modified**: `src/renderer/src/i18n/messages/zh-CN.ts`, `en-US.ts` (minor additions)

### Detection
- `const isHermesRest = computed(() => connectionStore.serverType === 'hermes-rest')`
- When `isHermesRest`, import and use `useHermesChatStore()` instead of `useSessionStore()`

### SessionsPage Changes (Hermes REST mode)

**Data mapping** — computed that maps `HermesConversation[]` to display format:
```typescript
interface SessionRow {
  key: string          // conversation.id
  title: string        // conversation.title || 'Untitled'
  messageCount: number // conversation.messages.length
  model: string        // conversation.model
  lastActivity: number // conversation.updatedAt (ms)
  createdAt: number    // conversation.createdAt (ms)
}
```

**Metric cards** (4 columns, `NGrid cols="1 s:2 m:4" responsive="screen"`):
1. Total Conversations
2. Active Today (updatedAt within 24 hours)
3. Total Messages (sum across all conversations)
4. Model (display current model name)

**Search/filter**: filter by `conv.title` substring match only (title-only search keeps the computed lightweight; searching message content across 50 conversations on every keystroke would be expensive)

**Table columns** (simplified from ACP mode):
- Title (with fallback "Untitled")
- Messages (count)
- Model
- Last Activity (relative time via `formatRelativeTime`)
- Actions: View detail, Open in Chat (switchTo + navigate), Export JSON, Delete (with NPopconfirm)

**"Open in Chat" action**: calls `hermesChatStore.switchTo(id)` + `router.push({ name: 'Chat' })` — available directly from the table row, no need to go through detail page first.

**Export JSON**: serialize the `HermesConversation` object to JSON and trigger a browser download via `URL.createObjectURL(new Blob([json]))` + click on a temporary `<a>` element. No store method needed.

**Removed in Hermes REST mode**: channel filter, model filter, peer column, batch model assignment, create session button (replaced with "New Conversation" that creates via `hermesChatStore.createConversation()` and navigates to Chat)

**Loading state**: hermes-chat store data loads synchronously from localStorage, so no loading spinner is needed for the initial render. The "New Conversation" and "Delete" actions are also synchronous. No `loading` ref is required.

### SessionDetailPage Changes (Hermes REST mode)

**Routing**: reuses the existing `sessions/:key` route. The `:key` param receives the conversation `id` (e.g., `conv-1713000000-abc123`). These IDs are URL-safe (alphanumeric + hyphens) and do not need encoding.

**Data source**: `hermesChatStore.conversations.find(c => c.id === route.params.key)`

**Display**:
- Header: conversation title (editable via `hermesChatStore.renameConversation`)
- Metadata: message count, model, resolvedModel, created/updated timestamps
- Transcript: iterate `conversation.messages`, render by role with color coding (user=blue, assistant=green, system=gray) — same pattern as ACP mode
- Actions: Back to list, Export JSON (same blob download approach), Delete, Open in Chat (switchTo + navigate)

**Not found**: if conversation ID does not match any conversation, show an empty state with "Conversation not found" and a back button.

### ACP WebSocket mode
No changes. All existing logic stays behind `v-if="!isHermesRest"` / `v-else` branches.

---

## Feature 3: Cron Run History Enhancement

### Files
- **Modified**: `src/renderer/src/views/cron/CronPage.vue`
- **Modified**: `src/renderer/src/i18n/messages/zh-CN.ts`, `en-US.ts` (new keys)

### New Table Columns

Insert after "nextRun" column, before "status" column:

**lastRun column** (width: 160):
- Render: `formatRelativeTime(job.state?.lastRunAtMs)` from `@/utils/format`, or `-` if null

**lastStatus column** (width: 100):
- Render: `NTag` with type mapping:
  - `ok` → type="success", text="OK"
  - `error` → type="error", text="Error"
  - `skipped` → type="warning", text="Skipped" (defensive; the backend may not currently produce this value, but the type allows it)
  - null → NText depth=3, text="-"

### Expandable Rows

Enable NDataTable expandable rows via the `render-expand` prop (Naive UI's render function approach):

```typescript
// Add to NDataTable props:
// :render-expand="renderExpand"

function renderExpand(row: CronJob) {
  // returns VNode with run detail card
}
```

The `render-expand` prop automatically adds an expand icon column (width ~32px) to the left of the table.

**Expanded content** — rendered as `NDescriptions` (label-placement="left", column=1, bordered):
- Last Run Time: full timestamp formatted via `toLocaleString('zh-CN')`, or `t('pages.cron.expandedRow.noData')`
- Duration: `lastDurationMs` formatted as `(X.Xs)` (e.g., "3.2s"), or `-`
- Consecutive Errors: `consecutiveErrors` value, `NText type="error"` if > 0, otherwise `NText depth=3` showing "0"
- Error Detail: `lastError` in `NAlert type="error"`, only rendered when `lastStatus === 'error'` and `lastError` is truthy
- Next Run: full timestamp of `nextRun` via `toLocaleString('zh-CN')`, or `-`

**When no run data**: if `!job.state?.lastRunAtMs`, the expanded row shows a single centered `NText depth=3`: "No run data yet"

### New i18n Keys
```
pages.cron.table.jobs.lastRun       — "Last Run" / "上次运行"
pages.cron.table.jobs.lastStatus    — "Result" / "运行结果"
pages.cron.expandedRow.lastRunTime  — "Last Run Time" / "上次运行时间"
pages.cron.expandedRow.duration     — "Duration" / "执行时长"
pages.cron.expandedRow.consecutiveErrors — "Consecutive Errors" / "连续错误"
pages.cron.expandedRow.errorDetail  — "Error Detail" / "错误详情"
pages.cron.expandedRow.nextRunTime  — "Next Run Time" / "下次运行时间"
pages.cron.expandedRow.noData       — "No run data yet" / "暂无运行数据"
```

### Incidental cleanup

The cancel button in the CronPage modal currently uses a fragile locale-sniffing pattern:
```
t('pages.settings.saveFile') === '保存' ? '取消' : 'Cancel'
```
Replace with a proper i18n key: `t('common.cancel')` (add to both locale files if missing).

---

## Sidebar Visibility Logic

Current `AppSidebar.vue` hides `WS_ONLY_ROUTES` (Sessions) in Hermes REST mode. Changes:

- **Remove** Sessions from `WS_ONLY_ROUTES` — Sessions now works in both modes
- **Add** `HERMES_ONLY_ROUTES = new Set(['Dashboard'])` — Dashboard only shows in Hermes REST mode
- Filter logic in `baseMenuItems` computed: hide route if `(isHermesRest && WS_ONLY_ROUTES.has(name)) || (!isHermesRest && HERMES_ONLY_ROUTES.has(name))`

---

## Non-Goals

- No new REST API endpoints
- No WebSocket/SSE event integration for Dashboard (data is refreshed on mount + manual refresh)
- No persistent Dashboard state (no localStorage for dashboard preferences)
- No drag-to-reorder Dashboard cards
- No `/v1/runs` monitoring (API does not exist on Hermes Agent)
- No version display on Dashboard (already handled in SettingsPage; adding it here would require an extra mgmt API call)
