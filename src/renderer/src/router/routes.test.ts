import { describe, expect, it } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'
import { redirectUnknownHashRoute, routes } from './routes'

function rootChildren(): RouteRecordRaw[] {
  return routes.find((route) => route.path === '/')?.children || []
}

describe('renderer routes', () => {
  it('keeps the legacy notification alerts route inside settings', async () => {
    const alertsRoute = rootChildren().find((route) => route.path === 'alerts')

    expect(alertsRoute?.redirect).toEqual({ name: 'Settings', query: { section: 'diagnostics' } })
  })

  it('redirects stale settings anchor hashes back to settings', async () => {
    const redirect = redirectUnknownHashRoute({ params: { pathMatch: ['settings-connection'] } })

    expect(redirect).toEqual({ name: 'Settings' })
  })

  it('redirects unknown hash routes to the dashboard instead of blanking the app', async () => {
    const redirect = redirectUnknownHashRoute({ params: { pathMatch: ['does-not-exist'] } })

    expect(redirect).toEqual({ name: 'Dashboard' })
  })
})
