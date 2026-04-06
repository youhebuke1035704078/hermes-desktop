export function formatDate(date: string | number | Date): string {
  const parsed = typeof date === 'string' ? new Date(date) : date instanceof Date ? date : new Date(date)
  if (!Number.isFinite(parsed.getTime())) return '-'
  return parsed.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

export function formatRelativeTime(date: string | number | Date): string {
  const parsed = typeof date === 'string' ? new Date(date) : date instanceof Date ? date : new Date(date)
  if (!Number.isFinite(parsed.getTime())) return '-'
  const diff = Date.now() - parsed.getTime()
  if (diff < 0) return formatDate(date)
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)} 天前`
  return formatDate(date)
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

export function parseSessionKey(key: string): { agent: string; channel: string; peer: string } {
  const raw = key.trim()
  if (!raw) return { agent: 'main', channel: 'main', peer: '' }
  const parts = raw.split(':').filter(Boolean)
  if (parts[0] === 'agent' && parts.length >= 3) {
    return { agent: parts[1] || 'main', channel: parts[2] || 'main', peer: parts.slice(3).join(':') }
  }
  if (parts.length >= 2) {
    return { agent: parts[0] || 'main', channel: parts[1] || 'main', peer: parts.slice(2).join(':') }
  }
  return { agent: 'main', channel: 'main', peer: '' }
}

export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
