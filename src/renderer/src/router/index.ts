import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from './routes'
import { useConnectionStore } from '@/stores/connection'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  // Electron uses file:// protocol — hash history is required
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async (to, _from, next) => {
  const connectionStore = useConnectionStore()
  const authStore = useAuthStore()

  // Connection page is always accessible
  if (to.name === 'Connection') {
    next()
    return
  }

  // If not connected to any server, redirect to connection page
  if (!connectionStore.currentServer) {
    next({ name: 'Connection' })
    return
  }

  // All other routes require auth (unless server has auth disabled)
  if (authStore.authEnabled && !authStore.isAuthenticated) {
    next({ name: 'Connection' })
    return
  }

  next()
})

export default router
