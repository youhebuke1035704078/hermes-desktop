# Skill Management Module Design

**Date:** 2026-04-14
**Target version:** v0.2.0
**Scope:** Full skill management — browse, enable/disable, config variable editing, external directory management

---

## 1. Data Architecture

### 1.1 Data Source

All skill data comes from the local filesystem. No Hermes Agent REST API is required.

- **Skill metadata:** Scanned from `~/.hermes/skills/` by reading `SKILL.md` files and parsing YAML frontmatter
- **Skill config:** Read/written from `~/.hermes/config.yaml` under the `skills` section
- **YAML parsing:** `js-yaml` library (installed as production dependency for main process)

### 1.2 IPC Handlers (main process, `src/main/index.ts`)

**`hermes:skills`** — Read all skill data in a single call:
1. Recursively scan `~/.hermes/skills/` at any depth, finding all `SKILL.md` files. Category is determined by the first-level subdirectory name (e.g. `apple/apple-reminders/SKILL.md` → category `"apple"`, `mlops/evaluation/weights-and-biases/SKILL.md` → category `"mlops"`)
2. For each `SKILL.md`, parse YAML frontmatter. If `metadata.hermes.category` exists in frontmatter, it overrides the filesystem-derived category
3. Read `~/.hermes/config.yaml` for `skills.disabled`, `skills.config`, `skills.external_dirs` (all confirmed fields in Hermes Agent `skill_utils.py`)
4. Also scan any directories listed in `skills.external_dirs`
5. Return `{ ok, skills: SkillMeta[], disabled: string[], configValues: Record<string,any>, externalDirs: string[] }`

**`hermes:skills:config`** — Write config changes:
- Accepts `{ action, payload }` where action is one of:
  - `toggle` — `{ name: string, disabled: boolean }` → add/remove from `skills.disabled[]`
  - `setConfigValue` — `{ key: string, value: any }` → set `skills.config.<key>`. Dot-delimited keys (e.g. `wiki.path`) expand to nested YAML: `skills: { config: { wiki: { path: value } } }`. Use a `setNestedValue(obj, dotPath, value)` utility
  - `addExternalDir` — `{ path: string }` → push to `skills.external_dirs[]`
  - `removeExternalDir` — `{ path: string }` → filter from `skills.external_dirs[]`
- Implementation: `js-yaml.load()` → modify → `js-yaml.dump()` → `writeFile()`
- Returns `{ ok: boolean, error?: string }`

### 1.3 Type Definitions (`src/renderer/src/api/types/index.ts`)

Update the existing `Skill` interface and add new types:

```typescript
interface SkillMeta {
  name: string
  description: string
  version: string
  author: string
  category: string          // first-level subdir name, or metadata.hermes.category override
  platforms: string[]        // from frontmatter `platforms`, defaults to [] (= all platforms)
  prerequisites?: {
    commands?: string[]
    env_vars?: string[]
  }
  configVars?: {             // from frontmatter `metadata.hermes.config` (NOT top-level)
    key: string
    description: string
    default?: any
    prompt?: string
  }[]
  tags?: string[]            // from frontmatter `metadata.hermes.tags` (NOT top-level)
  license?: string
  dirPath: string            // absolute path to skill directory
  relatedSkills?: string[]   // from frontmatter `metadata.hermes.related_skills`
  homepage?: string          // from frontmatter `metadata.hermes.homepage`
}

interface SkillsState {
  skills: SkillMeta[]
  disabled: string[]
  configValues: Record<string, any>
  externalDirs: string[]
}
```

**Frontmatter field mapping** (actual SKILL.md structure → SkillMeta):
| SKILL.md path | SkillMeta field |
|---------------|----------------|
| `name` | `name` |
| `description` | `description` |
| `version` | `version` |
| `author` | `author` |
| `license` | `license` |
| `platforms` | `platforms` (default `[]`) |
| `prerequisites.commands` | `prerequisites.commands` |
| `prerequisites.env_vars` | `prerequisites.env_vars` |
| `metadata.hermes.tags` | `tags` |
| `metadata.hermes.config` | `configVars` |
| `metadata.hermes.category` | `category` (overrides filesystem) |
| `metadata.hermes.related_skills` | `relatedSkills` |
| `metadata.hermes.homepage` | `homepage` |

### 1.4 Preload Bridge (`src/preload/index.ts`, `src/preload/index.d.ts`)

Add two new methods to `window.api`:

```typescript
hermesSkills: () => Promise<{
  ok: boolean
  skills: SkillMeta[]
  disabled: string[]
  configValues: Record<string, any>
  externalDirs: string[]
  error?: string
}>
hermesSkillsConfig: (action: string, payload: any) => Promise<{ ok: boolean; error?: string }>
```

### 1.5 Pinia Store (`src/renderer/src/stores/skill.ts`)

Rewrite the existing stub store. **Backward compatibility:** The existing store exports `skills: Skill[]`, `fetchSkills()`, and `isSkillVisibleInChat()`, consumed by `ChatPage.vue` and `AgentChatPanel.vue`. The rewritten store must preserve these:
- Keep exporting a `skills` array (now `SkillMeta[]` — the old `Skill` type is replaced)
- Keep `isSkillVisibleInChat(name)` → returns `!isDisabled(name)`
- Keep `fetchSkills()` as async action
- `ChatPage.vue` filters by `skill.disabled` and `skill.eligible` — after rewrite, use `isDisabled(skill.name)` check instead since `SkillMeta` has no `disabled` / `eligible` fields (disabled state lives in the `disabled[]` array)

**State:**
- `skills: SkillMeta[]`
- `disabled: string[]`
- `configValues: Record<string, any>`
- `externalDirs: string[]`
- `loading: boolean`
- `selectedSkillName: string | null`

**Getters:**
- `enabledCount` — skills not in disabled list
- `disabledCount` — skills in disabled list
- `configVarCount` — total config vars across all skills
- `categories` — unique sorted category list
- `selectedSkill` — full SkillMeta for selectedSkillName
- `isDisabled(name)` — check if skill is in disabled list

**Actions:**
- `fetchSkills()` — call `window.api.hermesSkills()`, populate state
- `toggleSkill(name)` — call `window.api.hermesSkillsConfig('toggle', { name, disabled })`, update local state optimistically, rollback on failure
- `setConfigValue(key, value)` — call config IPC, update local state
- `addExternalDir(path)` — call config IPC, then re-fetch skills (new dir may contain skills)
- `removeExternalDir(path)` — call config IPC, then re-fetch skills

### 1.6 Frontmatter Parsing (main process utility)

Simple parser in `src/main/skill-parser.ts`:
1. Read file content
2. Extract text between first `---` and second `---`
3. Parse with `js-yaml.load()`
4. Extract fields from correct paths: top-level (`name`, `description`, `version`, `author`, `license`, `platforms`, `prerequisites`) and nested (`metadata.hermes.tags`, `metadata.hermes.config`, `metadata.hermes.category`, `metadata.hermes.related_skills`, `metadata.hermes.homepage`)
5. Determine category: use `metadata.hermes.category` if present, otherwise derive from first-level parent directory name relative to skills root
6. Default `platforms` to `[]` when field is absent (not `undefined`)
7. Return `SkillMeta` or `null` on failure (skip malformed files, `console.warn`)

---

## 2. Page Structure & Components

### 2.1 Route

```typescript
{
  path: 'skills',
  name: 'Skills',
  component: () => import('@/views/skills/SkillsPage.vue'),
  meta: { titleKey: 'routes.skills', icon: 'ExtensionPuzzleOutline' },
}
```

Position: after Cron, before Settings. In `AppSidebar.vue`:
- Add `'Skills'` to `HERMES_ONLY_ROUTES`
- Import `ExtensionPuzzleOutline` from `@vicons/ionicons5`
- Add `ExtensionPuzzleOutline` to the `iconMap` object

### 2.2 Layout — Three Zones

**Zone 1: Top Stats + Filters** (inside `NCard` header area)

Metric cards (NGrid 4-col):
- Total skills count
- Enabled count (green)
- Disabled count (red)
- Config variables count (blue)

Filter bar below metrics:
- NInput search (filters by name, description, tags)
- NSelect category filter (options from `categories` getter + "All")
- NSelect status filter ("All" / "Enabled" / "Disabled")

**Zone 2: Left Table** (~60% width)

NDataTable with columns:
| Column | Width | Content |
|--------|-------|---------|
| Name | 280px min | Skill name (bold) + description (secondary text, ellipsis) |
| Category | 120px | Category tag |
| Platform | 100px | Platform tags or "All" |
| Status | 80px | NSwitch (directly toggles enable/disable) |

- Click row → sets `selectedSkillName` in store → right panel shows details
- Selected row highlighted via `row-class-name`
- Default sort: by category, then name

**Zone 3: Right Detail Panel** (~40% width)

When no skill selected:
- Empty state: "Select a skill to view details"

When skill selected:
- **Header:** name, version, author, license
- **Tags:** platform tags + skill tags (NTag row)
- **Toggle:** NSwitch with "Enabled" / "Disabled" label
- **Prerequisites:** list commands and env_vars with status indicators
- **Config Variables:** NDescriptions-style list, each with:
  - Key name
  - Description / prompt text
  - NInput for value (pre-filled from configValues, placeholder = default)
  - Save on blur or Enter, debounced 500ms
- If no config vars: "No configuration variables"

### 2.3 Responsive Behavior

- `>= 900px`: Side-by-side layout (table + panel)
- `< 900px`: Full-width table only. Click row → open NDrawer from right with detail panel content
- Implementation: track `window.innerWidth` via a `resize` event listener → `isNarrow` ref controls layout mode and NDrawer visibility

### 2.4 External Directories Section

Separate `NCard` below the main layout, wrapped in `NCollapse`:
- Title: "External Skill Directories"
- List current directories with delete button (NPopconfirm)
- NInput + "Add" button to add new path
- After add/remove: re-fetch skills to reflect changes

---

## 3. Config Write & Error Handling

### 3.1 config.yaml Write Strategy

- Use `js-yaml.load()` to parse, modify target field, `js-yaml.dump()` to serialize, `writeFile()` to save
- js-yaml does not preserve comments (YAML spec limitation) — acceptable, matches Hermes Agent's own behavior
- No file locking needed — single-user desktop app, write frequency is very low

### 3.2 Write Operations

| Operation | config.yaml path | Behavior |
|-----------|-----------------|----------|
| Toggle skill | `skills.disabled[]` | Disable → push name; Enable → filter out name |
| Set config var | `skills.config.<key>` | Direct assignment |
| Add external dir | `skills.external_dirs[]` | Push path |
| Remove external dir | `skills.external_dirs[]` | Filter out path |

### 3.3 Error Handling

| Scenario | Behavior |
|----------|----------|
| `~/.hermes/skills/` missing | Return empty skills array, page shows empty state |
| `config.yaml` missing | Create new file with `skills: {}` structure |
| `config.yaml` has no `skills` field | Auto-create `skills: {}` node on write |
| `SKILL.md` frontmatter parse failure | Skip that skill, `console.warn`, load others normally |
| File write failure | Return `{ ok: false, error }`, renderer shows NMessage.error |
| External dir path invalid | Show error, don't add to list. Valid = absolute path or starts with `~`, resolves under `$HOME`, not a duplicate |

### 3.4 UI Feedback

- **Toggle:** NSwitch changes optimistically. On IPC failure → rollback switch state + NMessage.error
- **Config var edit:** NInput blur/Enter → save with 500ms debounce. Success → NMessage.success. Failure → NMessage.error, value reverts. Debounce timer must be canceled when `selectedSkillName` changes to prevent stale saves
- **External dir add/remove:** After successful IPC → re-fetch full skill list (new directory may bring new skills)

---

## 4. i18n Keys

Add under `pages.skills` in both `zh-CN.ts` and `en-US.ts`:

```
pages.skills.title — "Skill 管理" / "Skill Management"
pages.skills.refresh — "刷新" / "Refresh"
pages.skills.metrics.total — "总数" / "Total"
pages.skills.metrics.enabled — "已启用" / "Enabled"
pages.skills.metrics.disabled — "已禁用" / "Disabled"
pages.skills.metrics.configVars — "配置变量" / "Config Vars"
pages.skills.search — "搜索 skill 名称 / 描述 / 标签" / "Search by name / description / tags"
pages.skills.categoryFilter — "分类" / "Category"
pages.skills.categoryAll — "全部" / "All"
pages.skills.statusFilter — "状态" / "Status"
pages.skills.statusAll — "全部" / "All"
pages.skills.statusEnabled — "已启用" / "Enabled"
pages.skills.statusDisabled — "已禁用" / "Disabled"
pages.skills.columns.name — "名称" / "Name"
pages.skills.columns.category — "分类" / "Category"
pages.skills.columns.platform — "平台" / "Platform"
pages.skills.columns.status — "状态" / "Status"
pages.skills.detail.empty — "选择一个 skill 查看详情" / "Select a skill to view details"
pages.skills.detail.version — "版本" / "Version"
pages.skills.detail.author — "作者" / "Author"
pages.skills.detail.license — "许可证" / "License"
pages.skills.detail.platforms — "平台" / "Platforms"
pages.skills.detail.platformAll — "全平台" / "All Platforms"
pages.skills.detail.tags — "标签" / "Tags"
pages.skills.detail.enabled — "已启用" / "Enabled"
pages.skills.detail.disabled — "已禁用" / "Disabled"
pages.skills.detail.prerequisites — "前置要求" / "Prerequisites"
pages.skills.detail.commands — "所需命令" / "Required Commands"
pages.skills.detail.envVars — "所需环境变量" / "Required Env Vars"
pages.skills.detail.noPrerequisites — "无前置要求" / "No prerequisites"
pages.skills.detail.configVars — "配置变量" / "Config Variables"
pages.skills.detail.noConfigVars — "无配置变量" / "No config variables"
pages.skills.detail.configDefault — "默认: {value}" / "Default: {value}"
pages.skills.detail.configSaved — "配置已保存" / "Config saved"
pages.skills.detail.configFailed — "保存失败" / "Save failed"
pages.skills.toggle.enabled — "已启用 {name}" / "Enabled {name}"
pages.skills.toggle.disabled — "已禁用 {name}" / "Disabled {name}"
pages.skills.toggle.failed — "切换失败" / "Toggle failed"
pages.skills.externalDirs.title — "外部 Skill 目录" / "External Skill Directories"
pages.skills.externalDirs.add — "添加目录" / "Add Directory"
pages.skills.externalDirs.placeholder — "输入目录路径，如 ~/my-skills" / "Enter directory path, e.g. ~/my-skills"
pages.skills.externalDirs.empty — "暂无外部目录" / "No external directories"
pages.skills.externalDirs.confirmRemove — "确定移除此目录？" / "Remove this directory?"
pages.skills.externalDirs.added — "目录已添加" / "Directory added"
pages.skills.externalDirs.removed — "目录已移除" / "Directory removed"
pages.skills.externalDirs.failed — "操作失败" / "Operation failed"
pages.skills.empty — "未发现任何 skill。请检查 ~/.hermes/skills/ 目录。" / "No skills found. Check ~/.hermes/skills/ directory."
pages.skills.detail.relatedSkills — "关联 Skill" / "Related Skills"
pages.skills.detail.homepage — "主页" / "Homepage"
```

Note: `routes.skills` already exists in both i18n files (zh-CN: `'技能管理'`, en-US: `'Skills'`). No need to add it again.

---

## 5. Dependencies

- **js-yaml** — `npm install js-yaml && npm install -D @types/js-yaml`
  - Used only in main process (`src/main/skill-parser.ts` and `hermes:skills:config` handler)
  - Production dependency (bundled into Electron main)

---

## 6. Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/skill-parser.ts` | **Create** | Frontmatter parser + skill scanner |
| `src/main/index.ts` | Modify | Add `hermes:skills` and `hermes:skills:config` IPC handlers |
| `src/preload/index.ts` | Modify | Add `hermesSkills` and `hermesSkillsConfig` bridge methods |
| `src/preload/index.d.ts` | Modify | Add type declarations for new bridge methods |
| `src/renderer/src/api/types/index.ts` | Modify | Add `SkillMeta`, `SkillsState` types |
| `src/renderer/src/stores/skill.ts` | **Rewrite** | Full skill store with fetch, toggle, config, external dirs |
| `src/renderer/src/views/skills/SkillsPage.vue` | **Create** | Main skill management page |
| `src/renderer/src/router/routes.ts` | Modify | Add Skills route |
| `src/renderer/src/components/layout/AppSidebar.vue` | Modify | Add 'Skills' to HERMES_ONLY_ROUTES, import + add ExtensionPuzzleOutline to iconMap |
| `src/renderer/src/views/chat/ChatPage.vue` | Modify | Update `availableSkills` computed to use new store shape (replace `skill.disabled` / `skill.eligible` with `skillStore.isDisabled()`) |
| `src/renderer/src/i18n/messages/zh-CN.ts` | Modify | Add `pages.skills` and `routes.skills` keys |
| `src/renderer/src/i18n/messages/en-US.ts` | Modify | Add `pages.skills` and `routes.skills` keys |
| `package.json` | Modify | Add js-yaml + @types/js-yaml dependencies |

---

## 7. Known Limitations

- **No live file watching:** Changes to `~/.hermes/skills/` outside the app require manual Refresh. Consistent with Cron module behavior. A `fs.watch` based auto-refresh can be added as a follow-up.
- **js-yaml strips comments:** First config.yaml write will remove user comments. Matches Hermes Agent's own behavior.
- **No skill content preview:** The detail panel shows metadata only, not the full Markdown body of SKILL.md. Showing full content is a possible future enhancement.
