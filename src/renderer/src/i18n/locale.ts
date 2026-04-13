import { safeGet, safeSet } from '@/utils/safe-storage'

export type AppLocale = 'zh-CN' | 'en-US'

const STORAGE_KEY = 'hermes_locale'

export function normalizeLocale(input?: string | null): AppLocale | null {
  if (!input) return null
  const raw = String(input).trim()
  if (!raw) return null

  const lower = raw.toLowerCase()
  if (lower === 'zh-cn') return 'zh-CN'
  if (lower === 'en-us') return 'en-US'

  if (lower.startsWith('zh')) return 'zh-CN'
  if (lower.startsWith('en')) return 'en-US'

  return null
}

export function getSystemLocale(): AppLocale {
  if (typeof navigator === 'undefined') return 'zh-CN'

  const candidates = (navigator.languages?.length ? navigator.languages : [navigator.language]).filter(Boolean)
  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate)
    if (normalized) return normalized
  }

  return 'zh-CN'
}

export function getStoredLocale(): AppLocale | null {
  return normalizeLocale(safeGet(STORAGE_KEY))
}

export function getPreferredLocale(): AppLocale {
  return getStoredLocale() || getSystemLocale()
}

export function saveLocale(locale: AppLocale): void {
  safeSet(STORAGE_KEY, locale)
}

export const LOCALE_STORAGE_KEY = STORAGE_KEY

