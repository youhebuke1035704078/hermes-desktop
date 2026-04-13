/**
 * Stub store — the full cron store was removed during the Hermes Desktop fork.
 * Provides the minimal interface consumed by useAlertNotifier and SessionsPage.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { CronJob } from '@/api/types'

export const useCronStore = defineStore('cron', () => {
  const jobs = ref<CronJob[]>([])

  async function fetchJobs(): Promise<void> {
    // no-op stub
  }

  return { jobs, fetchJobs }
})
