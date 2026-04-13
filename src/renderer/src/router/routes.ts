import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '/connection',
    name: 'Connection',
    component: () => import('@/views/connection/index.vue'),
    meta: { titleKey: 'routes.connection', public: true },
  },
  {
    path: '/login',
    redirect: { name: 'Connection' },
  },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Chat',
        component: () => import('@/views/chat/ChatPage.vue'),
        meta: { titleKey: 'routes.chat', icon: 'ChatboxEllipsesOutline' },
      },
      {
        path: 'sessions',
        name: 'Sessions',
        component: () => import('@/views/sessions/SessionsPage.vue'),
        meta: { titleKey: 'routes.sessions', icon: 'ChatbubblesOutline' },
      },
      {
        path: 'sessions/:key',
        name: 'SessionDetail',
        component: () => import('@/views/sessions/SessionDetailPage.vue'),
        meta: { titleKey: 'routes.sessionDetail', hidden: true },
      },
      {
        path: 'cron',
        name: 'Cron',
        component: () => import('@/views/cron/CronPage.vue'),
        meta: { titleKey: 'routes.cron', icon: 'CalendarOutline' },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/settings/SettingsPage.vue'),
        meta: { titleKey: 'routes.settings', icon: 'CogOutline' },
      },
    ],
  },
]
