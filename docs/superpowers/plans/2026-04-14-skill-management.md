# Skill Management Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full skill management page to Hermes Desktop that reads skills from `~/.hermes/skills/`, displays them in a table+detail-panel layout, and allows toggling enable/disable, editing config variables, and managing external skill directories — all via `~/.hermes/config.yaml`.

**Architecture:** Filesystem-based data access through Electron IPC. Main process scans skill directories and parses YAML frontmatter using `js-yaml`. Renderer displays skills in a NDataTable (left) + detail panel (right) layout. Config writes go through a single IPC handler that patches `config.yaml` with `js-yaml`.

**Tech Stack:** Electron IPC, js-yaml, Vue 3 Composition API, Pinia, Naive UI, vue-i18n, @vicons/ionicons5

**Spec:** `docs/superpowers/specs/2026-04-14-skill-management-design.md`

---

### Task 1: Install js-yaml dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install js-yaml and its types**

Run:
```bash
cd /Users/youhebuke/hermes-desktop && npm install js-yaml && npm install -D @types/js-yaml
```

- [ ] **Step 2: Verify installation**

Run: `grep js-yaml package.json`
Expected: `"js-yaml": "^4.x.x"` in dependencies, `"@types/js-yaml": "^4.x.x"` in devDependencies

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add js-yaml dependency for skill management config parsing"
```

---

### Task 2: Create skill-parser.ts (main process)

**Files:**
- Create: `src/main/skill-parser.ts`

This file exports two functions: `parseFrontmatter()` to extract YAML metadata from a single SKILL.md, and `scanSkillsDirectory()` to recursively find and parse all skills under a given root directory.

- [ ] **Step 1: Create `src/main/skill-parser.ts`**

```typescript
import { readdir, readFile, stat } from 'fs/promises'
import { join, relative } from 'path'
import * as yaml from 'js-yaml'

export interface SkillMeta {
  name: string
  description: string
  version: string
  author: string
  category: string
  platforms: string[]
  prerequisites?: { commands?: string[]; env_vars?: string[] }
  configVars?: { key: string; description: string; default?: any; prompt?: string }[]
  tags?: string[]
  license?: string
  dirPath: string
  relatedSkills?: string[]
  homepage?: string
}

/**
 * Parse YAML frontmatter from a SKILL.md file content string.
 * Returns the parsed object, or null if no valid frontmatter found.
 */
export function parseFrontmatter(content: string): Record<string, any> | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match || !match[1]) return null
  try {
    const parsed = yaml.load(match[1])
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, any>) : null
  } catch {
    return null
  }
}

/**
 * Convert raw frontmatter into a SkillMeta object.
 * `skillDir` is the absolute path to the skill directory.
 * `skillsRoot` is the root skills directory (for deriving filesystem category).
 */
export function frontmatterToMeta(
  fm: Record<string, any>,
  skillDir: string,
  skillsRoot: string,
): SkillMeta {
  const hermes = fm.metadata?.hermes || {}
  // Category: metadata.hermes.category overrides filesystem-derived
  const relPath = relative(skillsRoot, skillDir)
  const fsCategory = relPath.split('/')[0] || 'uncategorized'
  const category = hermes.category || fsCategory

  return {
    name: fm.name || '',
    description: fm.description || '',
    version: fm.version || '',
    author: fm.author || '',
    category,
    platforms: Array.isArray(fm.platforms) ? fm.platforms : [],
    prerequisites: fm.prerequisites || undefined,
    configVars: Array.isArray(hermes.config) ? hermes.config : undefined,
    tags: Array.isArray(hermes.tags) ? hermes.tags : undefined,
    license: fm.license || undefined,
    dirPath: skillDir,
    relatedSkills: Array.isArray(hermes.related_skills) ? hermes.related_skills : undefined,
    homepage: hermes.homepage || undefined,
  }
}

/**
 * Recursively scan a directory for SKILL.md files and return parsed SkillMeta[].
 * `rootDir` is the top-level skills directory used for category derivation.
 */
export async function scanSkillsDirectory(rootDir: string): Promise<SkillMeta[]> {
  const results: SkillMeta[] = []

  async function walk(dir: string): Promise<void> {
    let entries: string[]
    try {
      entries = await readdir(dir).then((items) => items.filter((n) => !n.startsWith('.')))
    } catch {
      return
    }
    for (const name of entries) {
      const fullPath = join(dir, name)
      try {
        const s = await stat(fullPath)
        if (s.isDirectory()) {
          // Check if this directory has a SKILL.md
          const skillMdPath = join(fullPath, 'SKILL.md')
          try {
            const content = await readFile(skillMdPath, 'utf-8')
            const fm = parseFrontmatter(content)
            if (fm) {
              results.push(frontmatterToMeta(fm, fullPath, rootDir))
            }
          } catch {
            // No SKILL.md here, recurse deeper
          }
          await walk(fullPath)
        }
      } catch {
        // stat failed, skip
      }
    }
  }

  await walk(rootDir)
  // Deduplicate by name (a skill with SKILL.md at its own level + deeper levels)
  const seen = new Map<string, SkillMeta>()
  for (const skill of results) {
    if (skill.name && !seen.has(skill.name)) {
      seen.set(skill.name, skill)
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
}

/**
 * Set a nested value in an object using a dot-delimited key path.
 * e.g. setNestedValue(obj, 'wiki.path', '/foo') → obj.wiki.path = '/foo'
 */
export function setNestedValue(obj: Record<string, any>, dotPath: string, value: any): void {
  const keys = dotPath.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!
    if (typeof current[k] !== 'object' || current[k] === null) {
      current[k] = {}
    }
    current = current[k]
  }
  current[keys[keys.length - 1]!] = value
}
```

- [ ] **Step 2: Verify build**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 3: Commit**

```bash
git add src/main/skill-parser.ts
git commit -m "feat: add skill frontmatter parser and directory scanner"
```

---

### Task 3: Add IPC handlers to main process

**Files:**
- Modify: `src/main/index.ts`

Add `hermes:skills` (read) and `hermes:skills:config` (write) IPC handlers.

- [ ] **Step 1: Add import at top of `src/main/index.ts`**

After the existing import line:
```typescript
import { getServers, saveServer, removeServer, decryptPassword, isEncryptionAvailable } from './store'
```

Add:
```typescript
import * as yaml from 'js-yaml'
import { scanSkillsDirectory, setNestedValue } from './skill-parser'
```

- [ ] **Step 2: Add `hermes:skills` handler**

Inside `registerIpcHandlers()`, after the `hermes:config` handler block (after line ~290), add:

```typescript
  // ── Skill management: read all skills + config ──
  ipcMain.handle('hermes:skills', async () => {
    try {
      const configPath = join(homedir(), '.hermes/config.yaml')
      const skillsDir = join(homedir(), '.hermes/skills')

      // 1. Read config.yaml for skill settings
      let disabled: string[] = []
      let configValues: Record<string, any> = {}
      let externalDirs: string[] = []
      try {
        const raw = await readFile(configPath, 'utf-8')
        const parsed = yaml.load(raw) as Record<string, any> | null
        const skillsCfg = parsed?.skills
        if (skillsCfg && typeof skillsCfg === 'object') {
          disabled = Array.isArray(skillsCfg.disabled) ? skillsCfg.disabled : []
          configValues = (skillsCfg.config && typeof skillsCfg.config === 'object') ? skillsCfg.config : {}
          externalDirs = Array.isArray(skillsCfg.external_dirs) ? skillsCfg.external_dirs : []
        }
      } catch { /* config.yaml missing or unreadable — use defaults */ }

      // 2. Scan built-in skills directory
      let skills = await scanSkillsDirectory(skillsDir)

      // 3. Scan external directories
      for (const extDir of externalDirs) {
        const resolved = extDir.replace(/^~/, homedir())
        try {
          const extSkills = await scanSkillsDirectory(resolved)
          skills = skills.concat(extSkills)
        } catch { /* skip invalid external dirs */ }
      }

      // Deduplicate by name (built-in takes precedence)
      const seen = new Set<string>()
      skills = skills.filter((s) => {
        if (seen.has(s.name)) return false
        seen.add(s.name)
        return true
      })

      return { ok: true, skills, disabled, configValues, externalDirs }
    } catch (e: any) {
      return { ok: false, skills: [], disabled: [], configValues: {}, externalDirs: [], error: e.message }
    }
  })
```

- [ ] **Step 3: Add `hermes:skills:config` handler**

Immediately after the `hermes:skills` handler, add:

```typescript
  // ── Skill management: write config changes ──
  ipcMain.handle('hermes:skills:config', async (_, action: string, payload: any) => {
    try {
      const configPath = join(homedir(), '.hermes/config.yaml')

      // Read existing config (or start fresh)
      let config: Record<string, any> = {}
      try {
        const raw = await readFile(configPath, 'utf-8')
        const parsed = yaml.load(raw)
        if (parsed && typeof parsed === 'object') config = parsed as Record<string, any>
      } catch { /* file missing — will create */ }

      // Ensure skills section exists
      if (!config.skills || typeof config.skills !== 'object') config.skills = {}
      const skills = config.skills as Record<string, any>

      switch (action) {
        case 'toggle': {
          const { name, disabled } = payload as { name: string; disabled: boolean }
          if (!Array.isArray(skills.disabled)) skills.disabled = []
          if (disabled) {
            if (!skills.disabled.includes(name)) skills.disabled.push(name)
          } else {
            skills.disabled = skills.disabled.filter((n: string) => n !== name)
          }
          break
        }
        case 'setConfigValue': {
          const { key, value } = payload as { key: string; value: any }
          if (!skills.config || typeof skills.config !== 'object') skills.config = {}
          setNestedValue(skills.config, key, value)
          break
        }
        case 'addExternalDir': {
          const { path: dirPath } = payload as { path: string }
          if (!Array.isArray(skills.external_dirs)) skills.external_dirs = []
          const resolved = dirPath.replace(/^~/, homedir())
          // Validate: must be under home and not duplicate
          const realHome = homedir()
          if (!resolved.startsWith(realHome)) {
            return { ok: false, error: 'Path must be under home directory' }
          }
          if (skills.external_dirs.includes(dirPath)) {
            return { ok: false, error: 'Directory already exists' }
          }
          skills.external_dirs.push(dirPath)
          break
        }
        case 'removeExternalDir': {
          const { path: dirPath } = payload as { path: string }
          if (Array.isArray(skills.external_dirs)) {
            skills.external_dirs = skills.external_dirs.filter((d: string) => d !== dirPath)
          }
          break
        }
        default:
          return { ok: false, error: `Unknown action: ${action}` }
      }

      // Write back
      const output = yaml.dump(config, { lineWidth: 120, noRefs: true })
      await writeFile(configPath, output, 'utf-8')
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })
```

- [ ] **Step 4: Verify build**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add hermes:skills and hermes:skills:config IPC handlers"
```

---

### Task 4: Update preload bridge

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Add bridge methods to `src/preload/index.ts`**

Inside the `api` object (after the `hermesChat` method), add:

```typescript
    hermesSkills: (): Promise<any> => ipcRenderer.invoke('hermes:skills'),
    hermesSkillsConfig: (action: string, payload: any): Promise<any> =>
      ipcRenderer.invoke('hermes:skills:config', action, payload),
```

- [ ] **Step 2: Add type declarations to `src/preload/index.d.ts`**

Inside the `HermesAPI` interface (after the `hermesChat` declaration), add:

```typescript
  hermesSkills(): Promise<{
    ok: boolean
    skills: Array<{
      name: string
      description: string
      version: string
      author: string
      category: string
      platforms: string[]
      prerequisites?: { commands?: string[]; env_vars?: string[] }
      configVars?: { key: string; description: string; default?: any; prompt?: string }[]
      tags?: string[]
      license?: string
      dirPath: string
      relatedSkills?: string[]
      homepage?: string
    }>
    disabled: string[]
    configValues: Record<string, any>
    externalDirs: string[]
    error?: string
  }>
  hermesSkillsConfig(
    action: string,
    payload: any,
  ): Promise<{ ok: boolean; error?: string }>
```

- [ ] **Step 3: Verify build**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: add hermesSkills and hermesSkillsConfig to preload bridge"
```

---

### Task 5: Update type definitions

**Files:**
- Modify: `src/renderer/src/api/types/index.ts`

- [ ] **Step 1: Replace the existing `Skill` interface**

Replace the existing `Skill` interface (lines 10-21) with:

```typescript
export interface SkillMeta {
  name: string
  description: string
  version: string
  author: string
  category: string
  platforms: string[]
  prerequisites?: { commands?: string[]; env_vars?: string[] }
  configVars?: { key: string; description: string; default?: any; prompt?: string }[]
  tags?: string[]
  license?: string
  dirPath: string
  relatedSkills?: string[]
  homepage?: string
}

/** @deprecated Use SkillMeta instead. Kept as alias for backward compatibility. */
export type Skill = SkillMeta
```

- [ ] **Step 2: Verify build**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/api/types/index.ts
git commit -m "feat: replace Skill interface with SkillMeta type"
```

---

### Task 6: Rewrite skill store

**Files:**
- Rewrite: `src/renderer/src/stores/skill.ts`

- [ ] **Step 1: Rewrite `src/renderer/src/stores/skill.ts`**

```typescript
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { SkillMeta } from '@/api/types'

export const useSkillStore = defineStore('skill', () => {
  const skills = ref<SkillMeta[]>([])
  const disabled = ref<string[]>([])
  const configValues = ref<Record<string, any>>({})
  const externalDirs = ref<string[]>([])
  const loading = ref(false)
  const selectedSkillName = ref<string | null>(null)

  // ── Getters ──
  const enabledCount = computed(() => skills.value.filter((s) => !disabled.value.includes(s.name)).length)
  const disabledCount = computed(() => skills.value.filter((s) => disabled.value.includes(s.name)).length)
  const configVarCount = computed(() =>
    skills.value.reduce((sum, s) => sum + (s.configVars?.length || 0), 0),
  )
  const categories = computed(() =>
    [...new Set(skills.value.map((s) => s.category))].sort(),
  )
  const selectedSkill = computed(() =>
    skills.value.find((s) => s.name === selectedSkillName.value) || null,
  )

  function isDisabled(name: string): boolean {
    return disabled.value.includes(name)
  }

  /** Backward compat: used by ChatPage.vue */
  function isSkillVisibleInChat(name: string): boolean {
    return !isDisabled(name)
  }

  // ── Actions ──
  async function fetchSkills(): Promise<void> {
    loading.value = true
    try {
      const result = await window.api.hermesSkills()
      if (result.ok) {
        skills.value = result.skills
        disabled.value = result.disabled
        configValues.value = result.configValues
        externalDirs.value = result.externalDirs
      }
    } catch (e) {
      console.error('[skill store] fetchSkills failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function toggleSkill(name: string): Promise<boolean> {
    const willDisable = !isDisabled(name)
    // Optimistic update
    if (willDisable) {
      disabled.value = [...disabled.value, name]
    } else {
      disabled.value = disabled.value.filter((n) => n !== name)
    }
    try {
      const result = await window.api.hermesSkillsConfig('toggle', { name, disabled: willDisable })
      if (!result.ok) {
        // Rollback
        if (willDisable) {
          disabled.value = disabled.value.filter((n) => n !== name)
        } else {
          disabled.value = [...disabled.value, name]
        }
        return false
      }
      return true
    } catch {
      // Rollback
      if (willDisable) {
        disabled.value = disabled.value.filter((n) => n !== name)
      } else {
        disabled.value = [...disabled.value, name]
      }
      return false
    }
  }

  async function setConfigValue(key: string, value: any): Promise<boolean> {
    try {
      const result = await window.api.hermesSkillsConfig('setConfigValue', { key, value })
      if (result.ok) {
        // Update local state
        const keys = key.split('.')
        let target = configValues.value as any
        for (let i = 0; i < keys.length - 1; i++) {
          if (typeof target[keys[i]!] !== 'object') target[keys[i]!] = {}
          target = target[keys[i]!]
        }
        target[keys[keys.length - 1]!] = value
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function addExternalDir(path: string): Promise<boolean> {
    try {
      const result = await window.api.hermesSkillsConfig('addExternalDir', { path })
      if (result.ok) {
        await fetchSkills() // Re-fetch to pick up new skills
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function removeExternalDir(path: string): Promise<boolean> {
    try {
      const result = await window.api.hermesSkillsConfig('removeExternalDir', { path })
      if (result.ok) {
        await fetchSkills() // Re-fetch to reflect removed skills
        return true
      }
      return false
    } catch {
      return false
    }
  }

  return {
    skills, disabled, configValues, externalDirs, loading, selectedSkillName,
    enabledCount, disabledCount, configVarCount, categories, selectedSkill,
    isDisabled, isSkillVisibleInChat,
    fetchSkills, toggleSkill, setConfigValue, addExternalDir, removeExternalDir,
  }
})
```

- [ ] **Step 2: Verify build**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/skill.ts
git commit -m "feat: rewrite skill store with full management capabilities"
```

---

### Task 7: Update ChatPage.vue backward compatibility

**Files:**
- Modify: `src/renderer/src/views/chat/ChatPage.vue`

The `availableSkills` computed (around line 1026) filters by `skill.disabled` and `skill.eligible`, which no longer exist on `SkillMeta`. Replace with store-based checks.

- [ ] **Step 1: Update `availableSkills` computed in ChatPage.vue**

Find (around line 1026):
```typescript
const availableSkills = computed(() =>
  skillStore.skills
    .filter((skill) => {
      if (skill.disabled) return false
      if (skill.eligible === false) return false
      if (!skillStore.isSkillVisibleInChat(skill.name)) return false
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name))
)
```

Replace with:
```typescript
const availableSkills = computed(() =>
  skillStore.skills
    .filter((skill) => {
      if (skillStore.isDisabled(skill.name)) return false
      if (!skillStore.isSkillVisibleInChat(skill.name)) return false
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name))
)
```

- [ ] **Step 2: Verify build**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/chat/ChatPage.vue
git commit -m "fix: update ChatPage availableSkills to use new skill store API"
```

---

### Task 8: Add i18n keys

**Files:**
- Modify: `src/renderer/src/i18n/messages/zh-CN.ts`
- Modify: `src/renderer/src/i18n/messages/en-US.ts`

The existing `pages.skills` section (around line 184 in both files) has old keys from a previous iteration. Replace it entirely with the new keys from the spec.

- [ ] **Step 1: Replace `pages.skills` section in `zh-CN.ts`**

Find the existing `skills: {` block under `pages` (around line 184) and replace the entire block with:

```typescript
    skills: {
      title: 'Skill 管理',
      refresh: '刷新',
      metrics: {
        total: '总数',
        enabled: '已启用',
        disabled: '已禁用',
        configVars: '配置变量',
      },
      search: '搜索 skill 名称 / 描述 / 标签',
      categoryFilter: '分类',
      categoryAll: '全部',
      statusFilter: '状态',
      statusAll: '全部',
      statusEnabled: '已启用',
      statusDisabled: '已禁用',
      columns: {
        name: '名称',
        category: '分类',
        platform: '平台',
        status: '状态',
      },
      detail: {
        empty: '选择一个 skill 查看详情',
        version: '版本',
        author: '作者',
        license: '许可证',
        platforms: '平台',
        platformAll: '全平台',
        tags: '标签',
        enabled: '已启用',
        disabled: '已禁用',
        prerequisites: '前置要求',
        commands: '所需命令',
        envVars: '所需环境变量',
        noPrerequisites: '无前置要求',
        configVars: '配置变量',
        noConfigVars: '无配置变量',
        configDefault: '默认: {value}',
        configSaved: '配置已保存',
        configFailed: '保存失败',
        relatedSkills: '关联 Skill',
        homepage: '主页',
      },
      toggle: {
        enabled: '已启用 {name}',
        disabled: '已禁用 {name}',
        failed: '切换失败',
      },
      externalDirs: {
        title: '外部 Skill 目录',
        add: '添加目录',
        placeholder: '输入目录路径，如 ~/my-skills',
        empty: '暂无外部目录',
        confirmRemove: '确定移除此目录？',
        added: '目录已添加',
        removed: '目录已移除',
        failed: '操作失败',
      },
      empty: '未发现任何 skill。请检查 ~/.hermes/skills/ 目录。',
    },
```

- [ ] **Step 2: Replace `pages.skills` section in `en-US.ts`**

Same location, replace with:

```typescript
    skills: {
      title: 'Skill Management',
      refresh: 'Refresh',
      metrics: {
        total: 'Total',
        enabled: 'Enabled',
        disabled: 'Disabled',
        configVars: 'Config Vars',
      },
      search: 'Search by name / description / tags',
      categoryFilter: 'Category',
      categoryAll: 'All',
      statusFilter: 'Status',
      statusAll: 'All',
      statusEnabled: 'Enabled',
      statusDisabled: 'Disabled',
      columns: {
        name: 'Name',
        category: 'Category',
        platform: 'Platform',
        status: 'Status',
      },
      detail: {
        empty: 'Select a skill to view details',
        version: 'Version',
        author: 'Author',
        license: 'License',
        platforms: 'Platforms',
        platformAll: 'All Platforms',
        tags: 'Tags',
        enabled: 'Enabled',
        disabled: 'Disabled',
        prerequisites: 'Prerequisites',
        commands: 'Required Commands',
        envVars: 'Required Env Vars',
        noPrerequisites: 'No prerequisites',
        configVars: 'Config Variables',
        noConfigVars: 'No config variables',
        configDefault: 'Default: {value}',
        configSaved: 'Config saved',
        configFailed: 'Save failed',
        relatedSkills: 'Related Skills',
        homepage: 'Homepage',
      },
      toggle: {
        enabled: 'Enabled {name}',
        disabled: 'Disabled {name}',
        failed: 'Toggle failed',
      },
      externalDirs: {
        title: 'External Skill Directories',
        add: 'Add Directory',
        placeholder: 'Enter directory path, e.g. ~/my-skills',
        empty: 'No external directories',
        confirmRemove: 'Remove this directory?',
        added: 'Directory added',
        removed: 'Directory removed',
        failed: 'Operation failed',
      },
      empty: 'No skills found. Check ~/.hermes/skills/ directory.',
    },
```

- [ ] **Step 3: Verify no duplicate `skills:` key**

Run: `grep -n "skills:" src/renderer/src/i18n/messages/zh-CN.ts | head -10`
Ensure there is only ONE `skills:` block under `pages`. If duplicates exist, remove the old one (same issue as the dashboard duplicate key bug from v0.1.10).

- [ ] **Step 4: Verify build**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/i18n/messages/zh-CN.ts src/renderer/src/i18n/messages/en-US.ts
git commit -m "i18n: replace pages.skills keys for new skill management module"
```

---

### Task 9: Add route and sidebar entry

**Files:**
- Modify: `src/renderer/src/router/routes.ts`
- Modify: `src/renderer/src/components/layout/AppSidebar.vue`

- [ ] **Step 1: Add Skills route in `routes.ts`**

After the Cron route:
```typescript
      {
        path: 'cron',
        name: 'Cron',
        ...
      },
```

Add:
```typescript
      {
        path: 'skills',
        name: 'Skills',
        component: () => import('@/views/skills/SkillsPage.vue'),
        meta: { titleKey: 'routes.skills', icon: 'ExtensionPuzzleOutline' },
      },
```

- [ ] **Step 2: Update AppSidebar.vue — add icon import**

In the `@vicons/ionicons5` import block, add `ExtensionPuzzleOutline`:

```typescript
import {
  GridOutline,
  ChatboxEllipsesOutline,
  ChatbubblesOutline,
  CogOutline,
  CalendarOutline,
  ExtensionPuzzleOutline,
} from '@vicons/ionicons5'
```

- [ ] **Step 3: Update AppSidebar.vue — add to iconMap**

```typescript
const iconMap: Record<string, any> = {
  GridOutline,
  ChatboxEllipsesOutline,
  ChatbubblesOutline,
  CogOutline,
  CalendarOutline,
  ExtensionPuzzleOutline,
}
```

- [ ] **Step 4: Update AppSidebar.vue — add to HERMES_ONLY_ROUTES**

```typescript
const HERMES_ONLY_ROUTES = new Set(['Dashboard', 'Skills'])
```

- [ ] **Step 5: Create placeholder `SkillsPage.vue`** (to avoid route error before Task 10)

Create `src/renderer/src/views/skills/SkillsPage.vue`:

```vue
<script setup lang="ts">
</script>

<template>
  <div>Skills page placeholder</div>
</template>
```

- [ ] **Step 6: Verify build**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/router/routes.ts src/renderer/src/components/layout/AppSidebar.vue src/renderer/src/views/skills/SkillsPage.vue
git commit -m "feat: add Skills route, sidebar icon, and HERMES_ONLY_ROUTES entry"
```

---

### Task 10: Implement SkillsPage.vue

**Files:**
- Rewrite: `src/renderer/src/views/skills/SkillsPage.vue`

This is the main page with three zones: top metrics+filters, left table, right detail panel. Also includes external directories section in a collapsible card at the bottom.

- [ ] **Step 1: Write the full `SkillsPage.vue`**

```vue
<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton, NCard, NCollapse, NCollapseItem, NDataTable, NDrawer, NDrawerContent,
  NGrid, NGridItem, NIcon, NInput, NPopconfirm, NSelect, NSpace, NSwitch,
  NTag, NText, useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { ExtensionPuzzleOutline, RefreshOutline, AddOutline, TrashOutline, LinkOutline } from '@vicons/ionicons5'
import { useSkillStore } from '@/stores/skill'
import type { SkillMeta } from '@/api/types'

const { t } = useI18n()
const message = useMessage()
const skillStore = useSkillStore()

// ── Filters ──
const searchQuery = ref('')
const categoryFilter = ref<string | null>(null)
const statusFilter = ref<string | null>(null)

const categoryOptions = computed(() => [
  { label: t('pages.skills.categoryAll'), value: null as any },
  ...skillStore.categories.map((c) => ({ label: c, value: c })),
])

const statusOptions = computed(() => [
  { label: t('pages.skills.statusAll'), value: null as any },
  { label: t('pages.skills.statusEnabled'), value: 'enabled' },
  { label: t('pages.skills.statusDisabled'), value: 'disabled' },
])

const filteredSkills = computed(() => {
  let list = skillStore.skills
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.tags || []).some((tag) => tag.toLowerCase().includes(q)),
    )
  }
  if (categoryFilter.value) {
    list = list.filter((s) => s.category === categoryFilter.value)
  }
  if (statusFilter.value === 'enabled') {
    list = list.filter((s) => !skillStore.isDisabled(s.name))
  } else if (statusFilter.value === 'disabled') {
    list = list.filter((s) => skillStore.isDisabled(s.name))
  }
  return list
})

// ── Responsive ──
const windowWidth = ref(window.innerWidth)
const isNarrow = computed(() => windowWidth.value < 900)
const drawerVisible = ref(false)

function onResize() {
  windowWidth.value = window.innerWidth
}
onMounted(() => {
  window.addEventListener('resize', onResize)
  if (skillStore.skills.length === 0) skillStore.fetchSkills()
})
onUnmounted(() => window.removeEventListener('resize', onResize))

// ── Selection ──
function selectSkill(name: string) {
  skillStore.selectedSkillName = name
  if (isNarrow.value) drawerVisible.value = true
}

// ── Toggle ──
async function handleToggle(name: string) {
  const ok = await skillStore.toggleSkill(name)
  if (ok) {
    const isNowDisabled = skillStore.isDisabled(name)
    message.success(
      isNowDisabled
        ? t('pages.skills.toggle.disabled', { name })
        : t('pages.skills.toggle.enabled', { name }),
    )
  } else {
    message.error(t('pages.skills.toggle.failed'))
  }
}

// ── Config var editing ──
const configEditValues = ref<Record<string, string>>({})
let configDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => skillStore.selectedSkillName,
  () => {
    // Cancel pending debounce on selection change
    if (configDebounceTimer) {
      clearTimeout(configDebounceTimer)
      configDebounceTimer = null
    }
    // Pre-fill config values for selected skill
    configEditValues.value = {}
    const skill = skillStore.selectedSkill
    if (skill?.configVars) {
      for (const cv of skill.configVars) {
        const stored = getNestedValue(skillStore.configValues, cv.key)
        configEditValues.value[cv.key] = stored != null ? String(stored) : ''
      }
    }
  },
)

function getNestedValue(obj: any, dotPath: string): any {
  const keys = dotPath.split('.')
  let current = obj
  for (const k of keys) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[k]
  }
  return current
}

function handleConfigInput(key: string) {
  if (configDebounceTimer) clearTimeout(configDebounceTimer)
  configDebounceTimer = setTimeout(async () => {
    const value = configEditValues.value[key] || ''
    const ok = await skillStore.setConfigValue(key, value)
    if (ok) {
      message.success(t('pages.skills.detail.configSaved'))
    } else {
      message.error(t('pages.skills.detail.configFailed'))
    }
  }, 500)
}

// ── External dirs ──
const newDirPath = ref('')

async function handleAddDir() {
  const path = newDirPath.value.trim()
  if (!path) return
  const ok = await skillStore.addExternalDir(path)
  if (ok) {
    message.success(t('pages.skills.externalDirs.added'))
    newDirPath.value = ''
  } else {
    message.error(t('pages.skills.externalDirs.failed'))
  }
}

async function handleRemoveDir(path: string) {
  const ok = await skillStore.removeExternalDir(path)
  if (ok) {
    message.success(t('pages.skills.externalDirs.removed'))
  } else {
    message.error(t('pages.skills.externalDirs.failed'))
  }
}

// ── Table columns ──
const columns = computed<DataTableColumns<SkillMeta>>(() => [
  {
    title: t('pages.skills.columns.name'),
    key: 'name',
    minWidth: 280,
    ellipsis: { tooltip: true },
    render(row) {
      return h('div', [
        h(NText, { strong: true, style: 'display:block' }, { default: () => row.name }),
        h(NText, { depth: 3, style: 'font-size:12px' }, { default: () => row.description || '' }),
      ])
    },
  },
  {
    title: t('pages.skills.columns.category'),
    key: 'category',
    width: 120,
    render(row) {
      return h(NTag, { size: 'small', bordered: false, round: true }, { default: () => row.category })
    },
  },
  {
    title: t('pages.skills.columns.platform'),
    key: 'platforms',
    width: 100,
    render(row) {
      if (!row.platforms.length) {
        return h(NText, { depth: 3, style: 'font-size:12px' }, { default: () => t('pages.skills.detail.platformAll') })
      }
      return h(NSpace, { size: 4 }, {
        default: () => row.platforms.map((p) =>
          h(NTag, { size: 'tiny', type: 'success', bordered: false, round: true }, { default: () => p }),
        ),
      })
    },
  },
  {
    title: t('pages.skills.columns.status'),
    key: 'status',
    width: 80,
    render(row) {
      return h(NSwitch, {
        value: !skillStore.isDisabled(row.name),
        'onUpdate:value': () => handleToggle(row.name),
        size: 'small',
      })
    },
  },
])

function rowClassName(row: SkillMeta): string {
  return row.name === skillStore.selectedSkillName ? 'skills-row-selected' : ''
}

function rowProps(row: SkillMeta) {
  return {
    style: 'cursor: pointer',
    onClick: () => selectSkill(row.name),
  }
}
</script>

<template>
  <NSpace vertical :size="16">
    <!-- Zone 1: Metrics + Filters -->
    <NCard>
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="ExtensionPuzzleOutline" :size="20" />
          <span>{{ t('pages.skills.title') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NButton secondary size="small" @click="skillStore.fetchSkills()" :loading="skillStore.loading">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          {{ t('pages.skills.refresh') }}
        </NButton>
      </template>

      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="10" :y-gap="10">
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.metrics.total') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">{{ skillStore.skills.length }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.metrics.enabled') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px; color: var(--n-color-target);">
              <NText type="success">{{ skillStore.enabledCount }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.metrics.disabled') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              <NText type="error">{{ skillStore.disabledCount }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.metrics.configVars') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              <NText type="info">{{ skillStore.configVarCount }}</NText>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Filter bar -->
      <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
        <NInput
          v-model:value="searchQuery"
          clearable
          :placeholder="t('pages.skills.search')"
          style="flex: 1; min-width: 200px;"
        />
        <NSelect
          v-model:value="categoryFilter"
          :options="categoryOptions"
          :placeholder="t('pages.skills.categoryFilter')"
          clearable
          style="width: 160px;"
        />
        <NSelect
          v-model:value="statusFilter"
          :options="statusOptions"
          :placeholder="t('pages.skills.statusFilter')"
          clearable
          style="width: 140px;"
        />
      </div>
    </NCard>

    <!-- Empty state -->
    <NCard v-if="!skillStore.loading && skillStore.skills.length === 0">
      <div style="text-align: center; padding: 40px;">
        <NText depth="3">{{ t('pages.skills.empty') }}</NText>
      </div>
    </NCard>

    <!-- Zone 2+3: Table + Detail -->
    <div v-else style="display: flex; gap: 12px; align-items: flex-start;">
      <!-- Left: Table -->
      <NCard :style="{ flex: isNarrow ? '1' : '0 0 60%', minWidth: 0 }">
        <NDataTable
          :columns="columns"
          :data="filteredSkills"
          :row-key="(row: SkillMeta) => row.name"
          :row-class-name="rowClassName"
          :row-props="rowProps"
          :loading="skillStore.loading"
          :scroll-x="600"
          size="small"
          :pagination="{ pageSize: 20 }"
        />
      </NCard>

      <!-- Right: Detail Panel (wide screen) -->
      <NCard v-if="!isNarrow" style="flex: 0 0 38%; min-width: 280px; position: sticky; top: 12px;">
        <div v-if="!skillStore.selectedSkill" style="text-align: center; padding: 40px;">
          <NText depth="3">{{ t('pages.skills.detail.empty') }}</NText>
        </div>
        <template v-else>
          <SkillDetail />
        </template>
      </NCard>
    </div>

    <!-- Drawer for narrow screens -->
    <NDrawer v-model:show="drawerVisible" :width="360" placement="right">
      <NDrawerContent :title="skillStore.selectedSkill?.name || ''">
        <SkillDetail v-if="skillStore.selectedSkill" />
      </NDrawerContent>
    </NDrawer>

    <!-- External Directories -->
    <NCard>
      <NCollapse>
        <NCollapseItem :title="t('pages.skills.externalDirs.title')" name="external-dirs">
          <div v-if="skillStore.externalDirs.length === 0" style="text-align: center; padding: 16px;">
            <NText depth="3">{{ t('pages.skills.externalDirs.empty') }}</NText>
          </div>
          <div v-else style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
            <div
              v-for="dir in skillStore.externalDirs"
              :key="dir"
              style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--n-color-embedded); border-radius: 6px;"
            >
              <NText code style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;">{{ dir }}</NText>
              <NPopconfirm @positive-click="handleRemoveDir(dir)">
                <template #trigger>
                  <NButton size="tiny" type="error" quaternary>
                    <template #icon><NIcon :component="TrashOutline" /></template>
                  </NButton>
                </template>
                {{ t('pages.skills.externalDirs.confirmRemove') }}
              </NPopconfirm>
            </div>
          </div>
          <NSpace>
            <NInput
              v-model:value="newDirPath"
              :placeholder="t('pages.skills.externalDirs.placeholder')"
              style="width: 300px;"
              @keyup.enter="handleAddDir"
            />
            <NButton type="primary" @click="handleAddDir" :disabled="!newDirPath.trim()">
              <template #icon><NIcon :component="AddOutline" /></template>
              {{ t('pages.skills.externalDirs.add') }}
            </NButton>
          </NSpace>
        </NCollapseItem>
      </NCollapse>
    </NCard>
  </NSpace>
</template>

<!-- Inline SkillDetail component -->
<script lang="ts">
import { defineComponent } from 'vue'

const SkillDetail = defineComponent({
  name: 'SkillDetail',
  setup() {
    const skillStore = useSkillStore()
    const { t } = useI18n()
    const message = useMessage()
    return { skillStore, t, message }
  },
  computed: {
    skill() { return this.skillStore.selectedSkill },
  },
  render() {
    const skill = this.skill
    if (!skill) return null
    const { t, skillStore } = this

    return h(NSpace, { vertical: true, size: 16 }, {
      default: () => [
        // Header
        h('div', [
          h(NText, { strong: true, style: 'font-size: 18px; display: block;' }, { default: () => skill.name }),
          h(NText, { depth: 3, style: 'font-size: 13px; margin-top: 4px; display: block;' }, { default: () => skill.description }),
        ]),

        // Meta info
        h(NSpace, { size: 8, style: 'flex-wrap: wrap;' }, {
          default: () => [
            skill.version ? h(NTag, { size: 'small', bordered: false }, { default: () => `v${skill.version}` }) : null,
            skill.author ? h(NTag, { size: 'small', bordered: false }, { default: () => skill.author }) : null,
            skill.license ? h(NTag, { size: 'small', bordered: false }, { default: () => skill.license }) : null,
          ].filter(Boolean),
        }),

        // Platforms
        h(NSpace, { size: 4 }, {
          default: () =>
            skill.platforms.length
              ? skill.platforms.map((p: string) => h(NTag, { size: 'small', type: 'success', bordered: false, round: true }, { default: () => p }))
              : [h(NTag, { size: 'small', bordered: false, round: true }, { default: () => t('pages.skills.detail.platformAll') })],
        }),

        // Tags
        skill.tags?.length
          ? h('div', [
              h(NText, { depth: 3, style: 'font-size: 12px; display: block; margin-bottom: 4px;' }, { default: () => t('pages.skills.detail.tags') }),
              h(NSpace, { size: 4 }, {
                default: () => skill.tags!.map((tag: string) => h(NTag, { size: 'tiny', bordered: false }, { default: () => tag })),
              }),
            ])
          : null,

        // Toggle
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-top: 1px solid var(--n-border-color); border-bottom: 1px solid var(--n-border-color);' }, [
          h(NText, {}, {
            default: () => skillStore.isDisabled(skill.name) ? t('pages.skills.detail.disabled') : t('pages.skills.detail.enabled'),
          }),
          h(NSwitch, {
            value: !skillStore.isDisabled(skill.name),
            'onUpdate:value': async () => {
              const ok = await skillStore.toggleSkill(skill.name)
              if (ok) {
                const msg = skillStore.isDisabled(skill.name)
                  ? t('pages.skills.toggle.disabled', { name: skill.name })
                  : t('pages.skills.toggle.enabled', { name: skill.name })
                this.message.success(msg)
              } else {
                this.message.error(t('pages.skills.toggle.failed'))
              }
            },
          }),
        ]),

        // Prerequisites
        h('div', [
          h(NText, { strong: true, style: 'font-size: 13px; display: block; margin-bottom: 6px;' }, { default: () => t('pages.skills.detail.prerequisites') }),
          skill.prerequisites?.commands?.length || skill.prerequisites?.env_vars?.length
            ? h(NSpace, { vertical: true, size: 4 }, {
                default: () => [
                  ...(skill.prerequisites?.commands || []).map((cmd: string) =>
                    h(NText, { code: true, style: 'font-size: 12px;' }, { default: () => cmd }),
                  ),
                  ...(skill.prerequisites?.env_vars || []).map((env: string) =>
                    h(NText, { code: true, style: 'font-size: 12px;' }, { default: () => `$${env}` }),
                  ),
                ],
              })
            : h(NText, { depth: 3, style: 'font-size: 12px;' }, { default: () => t('pages.skills.detail.noPrerequisites') }),
        ]),

        // Config Variables
        h('div', [
          h(NText, { strong: true, style: 'font-size: 13px; display: block; margin-bottom: 6px;' }, { default: () => t('pages.skills.detail.configVars') }),
          skill.configVars?.length
            ? h(NSpace, { vertical: true, size: 8 }, {
                default: () => skill.configVars!.map((cv: any) =>
                  h('div', { key: cv.key }, [
                    h(NText, { code: true, style: 'font-size: 12px; display: block;' }, { default: () => cv.key }),
                    cv.description ? h(NText, { depth: 3, style: 'font-size: 11px; display: block; margin: 2px 0;' }, { default: () => cv.description }) : null,
                    h(NInput, {
                      size: 'small',
                      value: (this as any).$parent?.configEditValues?.[cv.key] ?? '',
                      placeholder: cv.default != null ? `${t('pages.skills.detail.configDefault', { value: cv.default })}` : '',
                      onBlur: () => (this as any).$parent?.handleConfigInput?.(cv.key),
                      onKeyup: (e: KeyboardEvent) => { if (e.key === 'Enter') (this as any).$parent?.handleConfigInput?.(cv.key) },
                      'onUpdate:value': (val: string) => {
                        if ((this as any).$parent?.configEditValues) {
                          (this as any).$parent.configEditValues[cv.key] = val
                        }
                      },
                    }),
                  ]),
                ),
              })
            : h(NText, { depth: 3, style: 'font-size: 12px;' }, { default: () => t('pages.skills.detail.noConfigVars') }),
        ]),

        // Related Skills
        skill.relatedSkills?.length
          ? h('div', [
              h(NText, { strong: true, style: 'font-size: 13px; display: block; margin-bottom: 6px;' }, { default: () => t('pages.skills.detail.relatedSkills') }),
              h(NSpace, { size: 4 }, {
                default: () => skill.relatedSkills!.map((rs: string) => h(NTag, { size: 'small', bordered: false }, { default: () => rs })),
              }),
            ])
          : null,

        // Homepage
        skill.homepage
          ? h('div', { style: 'display: flex; align-items: center; gap: 4px;' }, [
              h(NIcon, { component: LinkOutline, size: 14 }),
              h(NText, { depth: 3, style: 'font-size: 12px;' }, { default: () => skill.homepage }),
            ])
          : null,
      ].filter(Boolean),
    })
  },
})
</script>

<style scoped>
:deep(.skills-row-selected td) {
  background-color: var(--n-color-hover) !important;
}
</style>
```

**Note on SkillDetail:** The detail component is defined inline using `defineComponent` with a render function to avoid creating a separate file. It accesses the parent's `configEditValues` and `handleConfigInput` via `$parent`. This is pragmatic for a single-page component. If it grows too complex in the future, extract to a separate file.

- [ ] **Step 2: Verify build**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: `✓ built in` with no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/skills/SkillsPage.vue
git commit -m "feat: implement SkillsPage with table, detail panel, and external dirs"
```

---

### Task 11: Final build verification and version bump

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Full build verification**

Run: `npx electron-vite build 2>&1 | tail -10`
Expected: `✓ built in` with no errors, all chunks built

- [ ] **Step 2: Bump version to 0.2.0**

In `package.json`, change `"version": "0.1.11"` to `"version": "0.2.0"`

- [ ] **Step 3: Commit, tag, push**

```bash
git add package.json
git commit -m "chore: bump version to 0.2.0 — skill management module"
git tag v0.2.0
git push && git push origin v0.2.0
```
