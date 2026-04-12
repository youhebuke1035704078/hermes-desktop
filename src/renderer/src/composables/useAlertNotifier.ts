import { ref, onUnmounted } from 'vue'
import { useWebSocketStore } from '@/stores/websocket'
import { useCronStore } from '@/stores/cron'
import { isChannelExplicitlyUnlinked } from '@/utils/health'

/**
 * Polls gateway health + cron state to detect alerts.
 * Maintains an activeAlertCount for sidebar badge display.
 */
export function useAlertNotifier(options: { interval?: number } = {}) {
  const { interval = 30000 } = options

  const activeAlertCount = ref(0)
  const enabled = ref(true)
  const isFirstFetch = ref(true)
  const knownAlertIds = ref(new Set<string>())
  let timer: ReturnType<typeof setInterval> | null = null

  function sendNotification(title: string, severity: 'critical' | 'warning' | 'info') {
    const label = severity === 'critical' ? '严重' : severity === 'warning' ? '警告' : '提示'
    if (window.api?.notifyAlert) {
      window.api.notifyAlert({ title: `[${label}] ${title}`, body: title, severity, silent: severity === 'info' })
    } else if (window.api?.notify) {
      window.api.notify('告警通知', `[${label}] ${title}`)
    }
  }

  function updateBadge(count: number) {
    activeAlertCount.value = count
    if (window.api?.setBadge) {
      window.api.setBadge(count)
    }
  }

  async function check() {
    if (!enabled.value) return
    const wsStore = useWebSocketStore()
    const cronStore = useCronStore()

    const alertIds: Array<{ id: string; title: string; severity: 'critical' | 'warning' | 'info' }> = []

    try {
      // 1. Health: check channels
      try {
        const health = await wsStore.rpc.getHealth()
        if (health?.channels) {
          for (const [name, ch] of Object.entries(health.channels)) {
            // Only alert when we have an EXPLICIT unlinked signal. The old
            // `!ch.linked` check and even the boolean `isChannelLinked()`
            // fire false positives when the gateway omits the `linked`
            // field (webhook-only plugins, older gateways, multi-account
            // channels with partial account data). Use the tri-state
            // helper so 'unknown' states don't turn into desktop noise.
            if (ch.configured && isChannelExplicitlyUnlinked(ch)) {
              alertIds.push({ id: `channel-${name}`, title: `通道异常: ${name}`, severity: 'warning' })
            }
          }
        }
      } catch { /* ignore */ }

      // 2. Cron failures
      try {
        if (cronStore.jobs.length === 0) await cronStore.fetchJobs()
        for (const job of cronStore.jobs) {
          if (!job.state) continue
          if (job.state.consecutiveErrors && job.state.consecutiveErrors > 0) {
            alertIds.push({
              id: `cron-${job.id}`,
              title: `Cron 失败: ${job.name} (连续${job.state.consecutiveErrors}次)`,
              severity: job.state.consecutiveErrors >= 3 ? 'critical' : 'warning',
            })
          }
        }
      } catch { /* ignore */ }

      // 3. Scheduler disabled
      try {
        const status = await wsStore.rpc.getCronStatus()
        if (status && !status.enabled) {
          alertIds.push({ id: 'scheduler-disabled', title: '定时调度器已禁用', severity: 'warning' })
        }
      } catch { /* ignore */ }

      // Count active alerts (critical + warning only for badge)
      const critWarn = alertIds.filter(a => a.severity === 'critical' || a.severity === 'warning')
      updateBadge(critWarn.length)

      // Send notifications for new alerts (skip first fetch)
      if (!isFirstFetch.value) {
        for (const alert of alertIds) {
          if (!knownAlertIds.value.has(alert.id) && alert.severity !== 'info') {
            sendNotification(alert.title, alert.severity)
          }
        }
      }
      isFirstFetch.value = false
      knownAlertIds.value = new Set(alertIds.map(a => a.id))
    } catch { /* ignore */ }
  }

  function start() {
    if (timer) return
    check()
    timer = setInterval(check, interval)
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null }
  }

  function setEnabled(val: boolean) {
    enabled.value = val
    if (!val) stop()
    else if (!timer) start()
  }

  function clearBadge() {
    if (window.api?.clearBadge) window.api.clearBadge()
  }

  start()
  onUnmounted(stop)

  return { enabled, activeAlertCount, setEnabled, stop, clearBadge }
}
