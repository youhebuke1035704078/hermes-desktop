import { readdir, readFile, lstat } from 'fs/promises'
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
  source?: 'bundled' | 'workspace' | 'managed' | 'extra' | 'user_created'
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
  skillsRoot: string
): SkillMeta {
  const hermes = fm.metadata?.hermes || {}
  // Category: metadata.hermes.category overrides filesystem-derived
  const relPath = relative(skillsRoot, skillDir)
  const fsCategory = relPath.split('/')[0] || 'uncategorized'
  const category = hermes.category || fsCategory
  const source = normalizeSkillSource(hermes.source || hermes.origin)

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
    source
  }
}

function normalizeSkillSource(value: unknown): SkillMeta['source'] {
  const source = String(value || '').trim().toLowerCase().replace(/-/g, '_')
  if (['user', 'custom', 'created', 'self_created', 'agent_created'].includes(source)) {
    return 'user_created'
  }
  if (['bundled', 'workspace', 'managed', 'extra', 'user_created'].includes(source)) {
    return source as SkillMeta['source']
  }
  return 'bundled'
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
        // lstat (not stat): skip symlinks during recursion so a symlink inside
        // a user-approved external skills directory cannot point to an
        // arbitrary filesystem location (e.g. /etc) and cause us to read
        // unrelated files.
        const s = await lstat(fullPath)
        if (s.isSymbolicLink()) continue
        if (s.isDirectory()) {
          // Check if this directory has a SKILL.md
          const skillMdPath = join(fullPath, 'SKILL.md')
          try {
            const skillStat = await lstat(skillMdPath)
            if (!skillStat.isSymbolicLink()) {
              const content = await readFile(skillMdPath, 'utf-8')
              const fm = parseFrontmatter(content)
              if (fm) {
                results.push(frontmatterToMeta(fm, fullPath, rootDir))
              }
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
  return Array.from(seen.values()).sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  )
}

/**
 * Set a nested value in an object using a dot-delimited key path.
 * e.g. setNestedValue(obj, 'wiki.path', '/foo') → obj.wiki.path = '/foo'
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function setNestedValue(obj: Record<string, any>, dotPath: string, value: any): void {
  const keys = dotPath.split('.')
  if (keys.some((k) => FORBIDDEN_KEYS.has(k))) return
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
