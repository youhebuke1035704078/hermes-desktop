import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { safeGet, safeSet } from '@/utils/safe-storage'

export type OpsSeverity = 'critical' | 'warning' | 'info' | 'success'

export interface OpsNotice {
  id: string
  title: string
  detail: string
  severity: OpsSeverity
  source: string
  createdAt: number
  resolvedAt?: number
}

export interface ConfigAuditRecord {
  id: string
  target: string
  action: string
  detail: string
  createdAt: number
}

const NOTICE_KEY = 'hermes-ops-notices-v1'
const AUDIT_KEY = 'hermes-config-audit-v1'
const MAX_ITEMS = 80

function readArray<T>(key: string): T[] {
  try {
    const raw = safeGet(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist<T>(key: string, rows: T[]): void {
  safeSet(key, JSON.stringify(rows.slice(0, MAX_ITEMS)))
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useOpsStore = defineStore('ops', () => {
  const notices = ref<OpsNotice[]>(readArray<OpsNotice>(NOTICE_KEY))
  const audits = ref<ConfigAuditRecord[]>(readArray<ConfigAuditRecord>(AUDIT_KEY))

  const activeNotices = computed(() => notices.value.filter(item => !item.resolvedAt))
  const recentNotices = computed(() => [...notices.value].sort((a, b) => b.createdAt - a.createdAt))
  const recentAudits = computed(() => [...audits.value].sort((a, b) => b.createdAt - a.createdAt))

  function pushNotice(input: Omit<OpsNotice, 'id' | 'createdAt'> & { createdAt?: number }): string {
    const id = newId('notice')
    notices.value = [
      {
        id,
        title: input.title,
        detail: input.detail,
        severity: input.severity,
        source: input.source,
        createdAt: input.createdAt || Date.now(),
        resolvedAt: input.resolvedAt,
      },
      ...notices.value,
    ].slice(0, MAX_ITEMS)
    persist(NOTICE_KEY, notices.value)
    return id
  }

  function resolveNotice(id: string): void {
    notices.value = notices.value.map(item => item.id === id ? { ...item, resolvedAt: Date.now() } : item)
    persist(NOTICE_KEY, notices.value)
  }

  function clearResolvedNotices(): void {
    notices.value = notices.value.filter(item => !item.resolvedAt)
    persist(NOTICE_KEY, notices.value)
  }

  function recordAudit(input: Omit<ConfigAuditRecord, 'id' | 'createdAt'> & { createdAt?: number }): string {
    const id = newId('audit')
    audits.value = [
      {
        id,
        target: input.target,
        action: input.action,
        detail: input.detail,
        createdAt: input.createdAt || Date.now(),
      },
      ...audits.value,
    ].slice(0, MAX_ITEMS)
    persist(AUDIT_KEY, audits.value)
    return id
  }

  function buildDiagnosticReport(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      generatedAt: new Date().toISOString(),
      notices: recentNotices.value.slice(0, 30),
      audits: recentAudits.value.slice(0, 30),
      ...extra,
    }
  }

  return {
    notices,
    audits,
    activeNotices,
    recentNotices,
    recentAudits,
    pushNotice,
    resolveNotice,
    clearResolvedNotices,
    recordAudit,
    buildDiagnosticReport,
  }
})
