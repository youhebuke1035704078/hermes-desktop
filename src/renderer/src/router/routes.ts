import type { RouteRecordRaw } from 'vue-router'

export function redirectUnknownHashRoute(to: { params: Record<string, unknown> }) {
  const pathMatch = to.params.pathMatch
  const rawPath = Array.isArray(pathMatch)
    ? pathMatch.map(String).join('/')
    : String(pathMatch || '')

  if (rawPath.startsWith('settings-')) {
    return { name: 'Settings' }
  }

  return { name: 'Dashboard' }
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/connection',
    name: 'Connection',
    component: () => import('@/views/connection/index.vue'),
    meta: { titleKey: 'routes.connection', public: true }
  },
  {
    path: '/login',
    redirect: { name: 'Connection' }
  },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: { name: 'Dashboard' }
      },
      {
        path: 'chat',
        name: 'Chat',
        component: () => import('@/views/chat/ChatPage.vue'),
        meta: { titleKey: 'routes.chat', icon: 'ChatboxEllipsesOutline' }
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/DashboardPage.vue'),
        meta: { titleKey: 'routes.dashboard', icon: 'GridOutline' }
      },
      {
        path: 'sessions',
        name: 'Sessions',
        component: () => import('@/views/sessions/SessionsPage.vue'),
        meta: { titleKey: 'routes.sessions', icon: 'ChatbubblesOutline', hidden: true }
      },
      {
        path: 'sessions/:key',
        name: 'SessionDetail',
        component: () => import('@/views/sessions/SessionDetailPage.vue'),
        meta: { titleKey: 'routes.sessionDetail', hidden: true }
      },
      {
        path: 'cron',
        name: 'Cron',
        component: () => import('@/views/cron/CronPage.vue'),
        meta: { titleKey: 'routes.cron', icon: 'CalendarOutline' }
      },
      {
        path: 'insights',
        name: 'Insights',
        component: () => import('@/views/insights/InsightsPage.vue'),
        meta: { titleKey: 'routes.insights', icon: 'AnalyticsOutline', hidden: true }
      },
      {
        path: 'channels',
        name: 'Channels',
        component: () => import('@/views/channels/ChannelsPage.vue'),
        meta: { titleKey: 'routes.channels', icon: 'PaperPlaneOutline', hidden: true }
      },
      {
        path: 'skills',
        name: 'Skills',
        component: () => import('@/views/skills/SkillsPage.vue'),
        meta: { titleKey: 'routes.skills', icon: 'ExtensionPuzzleOutline' }
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('@/views/logs/LogsPage.vue'),
        meta: { titleKey: 'routes.logs', icon: 'DocumentTextOutline', hidden: true }
      },
      {
        path: 'backup',
        name: 'Backup',
        component: () => import('@/views/backup/BackupPage.vue'),
        meta: { titleKey: 'routes.backup', icon: 'SaveOutline', hidden: true }
      },
      {
        path: 'alerts',
        name: 'Alerts',
        redirect: { name: 'Settings', query: { section: 'diagnostics' } },
        meta: { titleKey: 'routes.alerts', hidden: true }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/settings/SettingsPage.vue'),
        meta: { titleKey: 'routes.settings', icon: 'CogOutline' }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: redirectUnknownHashRoute
  }
]
