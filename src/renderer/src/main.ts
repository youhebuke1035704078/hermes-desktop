import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from '@/i18n'
import { setOnUnauthorized } from '@/api/desktop-http-client'
import { useConnectionStore } from '@/stores/connection'
import { useAuthStore } from '@/stores/auth'
import './assets/styles/main.css'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(i18n)
app.use(router)
app.mount('#app')

// ─── Global 401 handler (registered after pinia & router are ready) ───
// Attempts silent re-authentication with stored credentials before disconnecting.
let isReAuthenticating = false
setOnUnauthorized(async () => {
  // Prevent re-entrant calls (multiple 401s firing simultaneously)
  if (isReAuthenticating) return
  isReAuthenticating = true

  const connectionStore = useConnectionStore()
  try {
    const authStore = useAuthStore()
    const serverId = connectionStore.currentServer?.id

    // Try silent re-auth with encrypted credentials from Electron store
    if (serverId && window.api && authStore.authEnabled) {
      try {
        const server = connectionStore.servers.find(s => s.id === serverId)
        const password = await window.api.decryptPassword(serverId)
        if (server && password && server.username !== '_noauth_') {
          const ok = await authStore.login(server.username, password)
          if (ok) {
            console.log('[Auth] Silent re-authentication successful')
            return // Token refreshed, no need to disconnect
          }
        }
      } catch (e) {
        console.warn('[Auth] Silent re-auth failed (IPC/decrypt error):', e)
        // Fall through to disconnect
      }
    }

    // Re-auth failed → disconnect and redirect to Connection page
    await connectionStore.disconnect()
    router.push({ name: 'Connection' })
  } catch (e) {
    console.error('[Auth] onUnauthorized handler error:', e)
    // Last resort: force disconnect
    try { await connectionStore.disconnect() } catch { /* ignore */ }
    router.push({ name: 'Connection' })
  } finally {
    isReAuthenticating = false
  }
})
