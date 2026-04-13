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

---

## Feature 1: Dashboard Page

### Files
- **New**: `src/renderer/src/views/dashboard/DashboardPage.vue`
- **Modified**: `src/renderer/src/router/routes.ts` (add route)
- **Modified**: `src/renderer/src/components/layout/AppSidebar.vue` (add icon)
- **Modified**: `src/renderer/src/i18n/messages/zh-CN.ts`, `en-US.ts` (add translations)

### Route
- Path: `/dashboard`
- Name: `Dashboard`
- Icon: `GridOutline`
- Position: after Chat, before Sessions
- Visibility: Hermes REST mode only (add `Dashboard` to `WS_ONLY_ROUTES` inverted — or add a `HERMES_ONLY_ROUTES` set in AppSidebar)

### Data Sources
- `useHermesChatStore()` — conversations array
- `useCronStore()` — jobs array
- `useConnectionStore()` — server info, model name
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
|                       | Version: v0.8.0          |
|                       | Sync: Connected          |
+--------------------------------------------------+
```

**Metric cards** — `NGrid cols="1 s:2 m:4"` with `NCard embedded`:
1. Conversations: `conversations.length`
2. Messages: sum of all `conv.messages.length`
3. Cron Jobs: `{enabled} / {total}` with NText type coloring
4. Server: Online/Offline status + model name + version (from connection store)

**Left column — Recent Conversations**:
- `NGrid cols="1 m:2"`, left item
- List of up to 5 most recent conversations (sorted by updatedAt desc)
- Each row: title (truncated), message count, relative time (date-fns `formatDistanceToNow`)
- Click navigates to Chat page with `hermesChatStore.switchTo(id)` + `router.push({ name: 'Chat' })`
- "View all" link at bottom navigates to Sessions page

**Right column — Cron Runs + Server Info**:
- Top card: Recent Cron Runs — jobs filtered to those with `state?.lastRunAtMs`, sorted by lastRunAtMs desc, top 5
  - Each row: job name, status tag (ok/error), relative time
  - Click navigates to Cron page
- Bottom card: Server Info — model, version (from mgmt API or connection store), sync status badge

### Refresh Behavior
- Refresh button calls `cronStore.fetchJobs()` (conversations are already reactive from hermes-chat store)
- On mount: `cronStore.fetchJobs()` if not already loaded

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

**Metric cards** (4 columns, same responsive grid):
1. Total Conversations
2. Active Today (updatedAt within 24 hours)
3. Total Messages (sum across all conversations)
4. Model (display current model name)

**Search/filter**: filter by title and message content (substring match on `conv.title` and `conv.messages[*].content`)

**Table columns** (simplified from ACP mode):
- Title (with fallback "Untitled")
- Messages (count)
- Model
- Last Activity (relative time)
- Actions: View detail, Export JSON, Delete (with NPopconfirm)

**Removed in Hermes REST mode**: channel filter, model filter, peer column, batch model assignment, create session button (replaced with "New Conversation" that creates via hermesChatStore and navigates to Chat)

### SessionDetailPage Changes (Hermes REST mode)

**Data source**: `hermesChatStore.conversations.find(c => c.id === route.params.key)`

**Display**:
- Header: conversation title (editable via `hermesChatStore.renameConversation`)
- Metadata: message count, model, resolvedModel, created/updated timestamps
- Transcript: iterate `conversation.messages`, render by role with color coding (user=blue, assistant=green, system=gray) — same pattern as ACP mode
- Actions: Back to list, Export (download as JSON), Delete, Open in Chat (switchTo + navigate)

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
- Render: `formatDistanceToNow(job.state?.lastRunAtMs)` or `-` if null
- Uses date-fns (already in dependencies)

**lastStatus column** (width: 100):
- Render: `NTag` with type mapping:
  - `ok` → type="success", text="OK"
  - `error` → type="error", text="Error"
  - `skipped` → type="warning", text="Skipped"
  - null → NText depth=3, text="-"

### Expandable Rows

Enable NDataTable `expandable` via `:row-props` or `expand` slot:

**Expanded content** — rendered as a small card/description list:
- Last Run Time: full ISO timestamp formatted for locale (`toLocaleString`)
- Duration: `lastDurationMs` formatted as `X.Xs` (e.g., "3.2s"), or `-`
- Consecutive Errors: `consecutiveErrors` value, red NText if > 0
- Error Detail: `lastError` in NAlert type="error", only when lastStatus === 'error'
- Next Run: full ISO timestamp of `nextRun`

**Expand trigger**: NDataTable built-in expand icon column (default-expand-column-width: 32)

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

---

## Sidebar Visibility Logic

Current `AppSidebar.vue` hides `WS_ONLY_ROUTES` (Sessions) in Hermes REST mode. Changes:

- **Remove** Sessions from `WS_ONLY_ROUTES` — Sessions now works in both modes
- **Add** `HERMES_ONLY_ROUTES = new Set(['Dashboard'])` — Dashboard only shows in Hermes REST mode
- Filter logic: hide route if `(isHermesRest && WS_ONLY_ROUTES.has(name)) || (!isHermesRest && HERMES_ONLY_ROUTES.has(name))`

---

## Non-Goals

- No new REST API endpoints
- No WebSocket/SSE event integration for Dashboard (data is refreshed on mount + manual refresh)
- No persistent Dashboard state (no localStorage for dashboard preferences)
- No drag-to-reorder Dashboard cards
- No `/v1/runs` monitoring (API does not exist on Hermes Agent)
