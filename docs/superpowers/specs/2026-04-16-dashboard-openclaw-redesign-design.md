# Dashboard openclaw-desktop Redesign

**Date:** 2026-04-16
**Target version:** v0.5.0
**Scope:** Wholesale UI rewrite of the Dashboard tab (`DashboardPage.vue`) to mirror openclaw-desktop's `Dashboard.vue` visual language, adapted to hermes-rest's data availability.

---

## 1. Motivation

The current v0.4.4 `DashboardPage.vue` is a functional but text-heavy layout (basic stat row → token usage card with presets → trend + top models → recent conversations + cron runs + server info). User wants the polished visual treatment from `openclaw-desktop/src/renderer/src/views/Dashboard.vue`: gradient hero card, SVG trend chart with hover, structured segment bars, consolidated KPI grid.

User directive (2026-04-16): *"仪表盘这个tab你都参考openclaw desktop来做 别的模块可以去掉"* — explicit permission to drop existing modules that don't fit the openclaw layout.

## 2. Data reconciliation

openclaw-desktop operates against a richer server (`openclaw` with cost data, provider attribution, tool usage, skills). hermes-desktop in REST mode has only what `buildHermesRestUsageData` computes from local conversation tokens. Panels with no data are **removed entirely**, not stubbed.

| openclaw panel | hermes-rest data | action |
|---|---|---|
| Hero: title + subtitle + connection tag + coverage tag + last-updated tag | all available | keep |
| Range presets | v0.4.4 already has 6 (`all/today/yesterday/7d/15d/30d`) | keep existing |
| Usage mode toggle (tokens/cost) | cost always 0 | **drop** |
| Custom date range inputs | v0.4.4 uses presets only | **drop** (keep preset pills) |
| Stat row: sessions/crons/models/skills/totalTokens | no skills concept | replace with 4 cards |
| KPI grid (6 metrics) | no tools/errors/cache | reduce to 4 |
| SVG trend chart with grid + hover tooltip | `daily[]` from `tokenUsageHistory` | keep (port code) |
| Structure segment bar (4 segments) | only input/output non-zero | keep (2 segments) |
| Top Models / Providers / Tools | no providers, no tools | keep Top Models only |
| (current hermes) Recent Conversations / Cron Runs / Server Info | n/a | **drop** per directive |

## 3. Final layout

```
┌─ Hero card (gradient background) ─────────────────────────────────┐
│ Title + subtitle                   [connection][coverage][updated]│
│ [today][yesterday][7d][15d][30d][all] [Refresh][Sessions][Cron]   │
│ [warning alert if usageError is set]                              │
└────────────────────────────────────────────────────────────────────┘
┌─ 4 stat cards ─────────────────────────────────────────────────────┐
│ [Conversations] [Cron Jobs] [Models Seen] [Total Tokens]           │
└────────────────────────────────────────────────────────────────────┘
┌─ KPI grid card (4 cells) ──────────────────────────────────────────┐
│ [Messages] [Total Tokens] [Active Days] [Last Used]                │
└────────────────────────────────────────────────────────────────────┘
┌─ Trend (span 2 of 3) ──────────────┬─ Structure (span 1 of 3) ────┐
│ SVG line + area + hover tooltip    │ 2-segment token bar + legend │
│ 250px tall, grid lines, axis notes │ input: 150K / output: 280K   │
└─────────────────────────────────────┴───────────────────────────────┘
┌─ Top Models (full-width card) ─────────────────────────────────────┐
│ Rows: provider/model label, gradient bar, token count              │
└────────────────────────────────────────────────────────────────────┘
```

## 4. Component responsibilities

### 4.1 Hero card
- **Title:** reuse `pages.dashboard.hero.title` / `hero.subtitle` i18n keys (ADD these; not present in hermes i18n yet).
- **Connection tag:** derive from `connectionStore.status`:
  - `connected` → success / "Connected"
  - `disconnected` → error / "Disconnected"
  - other → warning / state string
- **Coverage tag:** `n of m conversations have usage data` — count conversations where `tokenUsage.totalInput + tokenUsage.totalOutput > 0` vs total.
- **Last-updated tag:** track `lastUpdatedAt` ref; on refresh or on `setRangePreset`, set to `Date.now()`; render with `formatRelativeTime()`.
- **Range presets:** keep all 6 from v0.4.4 (`all/today/yesterday/7d/15d/30d`).
- **Nav buttons:** Refresh (primary), Sessions (secondary), Cron (secondary).
- **Alert:** show `<NAlert type="warning">` only if `usageError` is set.
- **Styling:** port openclaw's `.dashboard-hero` gradient CSS block (radial-gradient + linear-gradient).

### 4.2 Stat row (4 cards, responsive)
1. **Conversations** — `hermesChatStore.conversations.length`
2. **Cron Jobs** — `cronStore.jobs.length` with enabled count as sub-text
3. **Models Seen** — unique `resolvedModel` values across all conversations (fallback to `model` if no resolved). Chosen because `hermes-agent` is static; resolvedModel is what changes.
4. **Total Tokens** — `usageData.totals.totalTokens`

Each uses `<NCard embedded :bordered="false" size="small">` with 22px value and 12px label (openclaw's StatCard pattern, inlined since hermes has no StatCard component).

### 4.3 KPI grid (4 cells, 2×2 on narrow, 1 row on wide)
Per user Q1=B:
1. **Messages** — `usageData.aggregates.messages.total`
2. **Total Tokens** — duplicate of stat row for prominence; formatted with `formatTokens`
3. **Active Days** — `usageData.aggregates.daily.length` when a filter is applied; when preset is `all` (no filter), count distinct YMD dates from `tokenUsageHistory` across all conversations. Shows `0` if no history exists.
4. **Last Used** — `Math.max(...hermesChatStore.conversations.flatMap(c => c.tokenUsageHistory?.map(e => e.ts) || [0]))`, formatted relative (`formatRelativeTime`). Shows "Never" hint text if result is `0`.

Each cell: small text label + 22px bold value + 12px hint text.

### 4.4 Trend chart (spans 2/3 of row)
Port openclaw's SVG implementation wholesale:
- `trendGeometry` computed — width 760, height 240, left 56, right 18, top 18, bottom 44. Produces `{points, polyline, areaPath, guides, ...}`.
- `trendHoverIndex` ref + `hoveredTrendPoint` computed + `trendTooltipStyle` ref.
- `handleTrendMouseMove` + `clearTrendHover` handlers — measure SVG `getBoundingClientRect`, find nearest point by X, position tooltip clamped inside rect with 8px margin.
- Template renders `<path>` area, `<polyline>` line, `<line>` hover guide, `<circle>` per point with `r=6` on hover.
- CSS ported from openclaw: `.trend-grid-line`, `.trend-line`, `.trend-point`, `.trend-area`, `.trend-tooltip`.
- Header-extra: small tag showing date-range string + token total.
- Empty state (`trendGeometry.points.length === 0`): centered "No data" text with `pages.dashboard.trend.empty`.

Data source: `usageData.aggregates.daily` (already populated when time-range filter is set in v0.4.4). When no filter (preset=`all`), hermes-rest doesn't fill `daily[]` — card shows empty state. This is acceptable and matches existing v0.4.4 behavior.

### 4.5 Structure segment bar (spans 1/3 of row)
2 segments only (input + output). Layout:
- Header row: "Total Tokens" label left, `formatTokens(total)` right.
- Segment track: single 10px-high rounded bar with two colored regions sized proportionally.
- Legend: two rows under the track, each with colored dot + label + value.

Colors: input = `#60a5fa` (hermes's current blue), output = `#4ade80` (hermes's current green).

### 4.6 Top Models (full width)
Port openclaw's `.top-pane-card` style:
- Title "Top Models" as row above.
- Each row: flex layout with model name (left, ellipsis) + token count (right), below it a 6px-high gradient bar with width `clamp(8%, value/max * 100%, 100%)`.
- Bar gradient: `linear-gradient(90deg, rgba(42,127,255,0.9), rgba(42,127,255,0.45))`.
- Empty state: "No data" text.
- Top 5 entries sorted by `totals.totalTokens` desc.

## 5. Script changes (`DashboardPage.vue`)

### 5.1 Add
- `lastUpdatedAt` ref, updated on `fetchUsageData()` success and on `setRangePreset`.
- `lastUpdatedText` computed using `formatRelativeTime`.
- `modelsSeen` computed — `new Set(conversations.map(c => c.resolvedModel || c.model).filter(Boolean)).size`.
- `connectionLabel` / `connectionType` computeds (copy openclaw's pattern).
- `coverageText` computed — "n/m" or "no data".
- `activeDays` computed — from `aggregates.daily.length` when filter applied, else from unique YMD across all `tokenUsageHistory` of all conversations.
- `lastUsedMs` computed — `Math.max(...flatten all tokenUsageHistory ts)`.
- `trendGeometry` / `trendSeries` / `trendAxisLabels` computeds — ported from openclaw (tokens-only variant).
- `trendSvgRef` / `trendHoverIndex` / `trendTooltipStyle` refs.
- `hoveredTrendPoint` / `hoveredTrendText` computeds.
- `handleTrendMouseMove` / `clearTrendHover` functions.
- `topBarWidth(value, max)` helper.

### 5.2 Remove
- `recentConversations` computed and its template.
- `recentCronRuns` computed and its template.
- "Server Info" card block and its i18n keys.
- `openConversation`, `goSessions`, `goCron` — keep nav handlers for new hero buttons only.
- Token Breakdown bar using `<NProgress>` — replaced by new structure segment bar.

### 5.3 Keep unchanged
- `buildFilterFromPreset`, `setRangePreset`, watcher on conversations.
- `fetchUsageData` / `handleRefresh`.
- `isHermesRest` / `showDailyTrend` (still used to decide whether to show trend card).

## 6. I18n additions

New keys under `pages.dashboard`:
- `hero.title` — "Dashboard"
- `hero.subtitle` — "Track your hermes-agent activity and token usage"
- `usage.coverage.none` — "No usage data yet"
- `usage.coverage.text` — "{withUsage}/{total} with usage"
- `connection.connected` / `disconnected` / `unknown`
- `lastUpdated.none` — "Not yet refreshed"
- `lastUpdated.text` — "Updated {time}"
- `kpis.totalTokens.label` / `kpis.totalTokens.hint`
- `kpis.activeDays.label` / `kpis.activeDays.hint` (reuse openclaw-style key naming)
- `kpis.lastUsed.label` / `kpis.lastUsed.hint`
- `stats.modelsSeen` — "Models Seen"

Keep existing range preset / usage segment keys from v0.4.4.

Drop:
- `pages.dashboard.recentConversations`, `emptyConversations`, `messagesCount`, `viewAll`
- `pages.dashboard.recentCronRuns`, `emptyCronRuns`
- `pages.dashboard.serverInfo`, `model`, `syncStatus`, `syncConnected`, `syncLocalOnly`

## 7. CSS

New scoped styles (port from openclaw):
- `.dashboard-page` — flex column gap 12px
- `.dashboard-hero` — gradient background (radial + linear)
- `.dashboard-hero-top`, `.dashboard-hero-title` (18px 700), `.dashboard-hero-subtitle` (13px secondary)
- `.dashboard-filters-row`, responsive grid on narrow
- `.kpi-grid` — 4-col grid, 2-col on narrow, 1-col on very narrow
- `.kpi-card`, `.kpi-value`
- `.trend-chart-panel`, `.trend-chart-canvas`, `.trend-chart-svg`
- `.trend-grid-line`, `.trend-grid-label`, `.trend-line`, `.trend-area`, `.trend-hover-line`, `.trend-point`, `.trend-point-active`, `.trend-tooltip`, `.trend-axis-note`, `.daily-empty`
- `.segment-track`, `.segment-item`, `.segment-list`, `.segment-row`, `.segment-row-label`, `.segment-dot`
- `.top-pane-card`, `.top-title`, `.top-list`, `.top-row`, `.top-row-main`, `.top-row-bar`, `.top-row-bar-inner`, `.top-row-bar-inner-model`, `.top-empty`

## 8. Testing strategy

No data model changes → existing `hermes-chat-token-usage.test.ts` and `hermes-rest-usage.test.ts` continue to pass unchanged.

New pure helpers in `DashboardPage.vue` are small enough to verify visually; extracting them to a testable module (e.g. `dashboard-helpers.ts`) is **YAGNI** for a one-off view.

Verification:
- `pnpm typecheck` clean
- `pnpm test` — 148/148 tests still pass
- Manual: launch dev build, cycle through presets, hover trend chart, verify stat/KPI values match previous v0.4.4 numbers.

## 9. Out of scope

- New usage data fields (cost, tools, cache read) — would require server-side changes.
- Custom date range picker inputs — preset pills are sufficient.
- Cron / Sessions redesign.
- Making Top Models / KPI content reactive to time range (beyond what v0.4.4 already does).
- ACP-mode trend card optimizations.

## 10. Version & release

- Version bump: `0.4.4` → `0.5.0` (minor — wholesale UI change, not additive).
- Release notes describe visual overhaul, port from openclaw, removed modules list.
- Branch: `feat/dashboard-openclaw-redesign`.
