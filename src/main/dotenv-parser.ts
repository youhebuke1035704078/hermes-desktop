/**
 * Pure parser for ~/.hermes/.env.
 *
 * Only extracts the API_SERVER_KEY so the main process can hand the
 * renderer's connection store a token to use for /v1/chat, /v1/models,
 * and the SSE lifecycle stream. Full dotenv parsing is deliberately
 * out of scope — if we need more keys later, promote this to a map.
 *
 * Bug 5 (fallback-visibility post-merge):
 * connection.ts:connectLocal() previously set authStore.authEnabled
 * = false unconditionally, so subsequent HTTP/SSE calls went without
 * an Authorization header. When API_SERVER_KEY is configured in
 * ~/.hermes/.env, those calls return 401 and the renderer silently
 * fails to bootstrap the fallback chain or stream assistant messages.
 */

/**
 * Extract API_SERVER_KEY from a dotenv file body. Returns null if
 * the key is absent, commented out, or empty. Supports quoted values
 * (single or double), leading/trailing whitespace, `#` comment lines,
 * and CRLF line endings. Returns the first occurrence when duplicated.
 */
export function extractApiServerKey(envContent: string): string | null {
  if (!envContent) return null
  // Normalize CRLF → LF so the regex line-splitting is uniform.
  const normalized = envContent.replace(/\r\n/g, '\n')
  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    // Anchor the key to the start so API_SERVER_KEY_EXTRA doesn't match.
    const match = line.match(/^API_SERVER_KEY\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[1].trim()
    // Strip matching surrounding quotes.
    if (value.length >= 2) {
      const first = value[0]
      const last = value[value.length - 1]
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1)
      }
    }
    return value.length > 0 ? value : null
  }
  return null
}
