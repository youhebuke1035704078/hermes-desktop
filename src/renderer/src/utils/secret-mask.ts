import { getPreferredLocale } from '@/i18n/locale'

// Anchored patterns: a secret indicator must be either the ENTIRE field name,
// or attached to it at a word boundary (underscore, hyphen, or case-break).
// This avoids false positives like `design`/`campaign` matching a bare `sign`,
// or `phases`/`cases` matching a bare `aes`.
//
// Broad coverage: api_key, access_key, private_key, client_secret, app_secret,
// refresh_token, session_token, jwt, authorization, hmac, mfa, otp, webhook,
// signing_key, xsrf, csrf, private_pem, ssh_key, etc.
const WORD_BOUNDARY = '(?:^|[-_.]|(?<=[a-z])(?=[A-Z]))'
const SECRET_KEY_PATTERN = new RegExp(
  `${WORD_BOUNDARY}(` +
    'token|secret|password|passwd|pwd|' +
    'api[-_]?key|access[-_]?key|private[-_]?key|public[-_]?key|signing[-_]?key|' +
    'client[-_]?secret|app[-_]?secret|webhook[-_]?secret|' +
    'encrypt(?:ed|ion)?|aes|credential|bearer|cookie|' +
    'signature|hmac|jwt|authorization|' +
    'mfa|otp|pin|totp|' +
    'xsrf|csrf|' +
    'ssh[-_]?key|gpg[-_]?key|' +
    'refresh[-_]?token|session[-_]?token|session[-_]?id' +
  ')$',
  'i',
)

export function isSecretFieldKey(key: string): boolean {
  const normalized = key.trim().replace(/\s+/g, '')
  if (!normalized) return false
  return SECRET_KEY_PATTERN.test(normalized)
}

export function hasSecretValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return true
  return false
}

export function maskSecretValue(value: unknown): string {
  if (!hasSecretValue(value)) return getPreferredLocale() === 'zh-CN' ? '未配置' : 'Not set'
  const text = String(value)
  if (text.length <= 4) return '****'
  return `${text.slice(0, 2)}****${text.slice(-2)}`
}

export function normalizeSecretInput(value: string): string | null {
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}
