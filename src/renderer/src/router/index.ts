import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/connection',
      component: () => import('../views/connection/index.vue'),
      meta: { noAuth: true }
    },
    {
      path: '/',
      component: () => import('../components/layout/MainLayout.vue'),
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', component: () => import('../views/dashboard/index.vue') },
        // Agent 管理
        { path: 'sessions', component: () => import('../views/sessions/index.vue') },
        { path: 'agents', component: () => import('../views/agents/index.vue') },
        { path: 'models', component: () => import('../views/models/index.vue') },
        { path: 'channels', component: () => import('../views/channels/index.vue') },
        // 运维监控
        { path: 'services', component: () => import('../views/services/index.vue') },
        { path: 'tasks', component: () => import('../views/tasks/index.vue') },
        { path: 'alerts', component: () => import('../views/alerts/index.vue') },
        { path: 'logs', component: () => import('../views/logs/index.vue') },
        { path: 'skills', component: () => import('../views/skills/index.vue') },
        { path: 'tools', component: () => import('../views/tools/index.vue') },
        { path: 'noise', component: () => import('../views/noise/index.vue') },
        // 工具箱
        { path: 'terminal', component: () => import('../views/terminal/index.vue') },
        { path: 'remote-desktop', component: () => import('../views/remote-desktop/index.vue') },
        { path: 'files', component: () => import('../views/files/index.vue') },
        { path: 'backup', component: () => import('../views/backup/index.vue') },
        // 系统
        { path: 'office', component: () => import('../views/office/index.vue') },
        { path: 'settings', component: () => import('../views/settings/index.vue') }
      ]
    }
  ]
})

router.beforeEach((to) => {
  if (to.meta.noAuth) return true
  const authStore = useAuthStore()
  if (!authStore.isAuthenticated) {
    return '/connection'
  }
  return true
})

export default router
