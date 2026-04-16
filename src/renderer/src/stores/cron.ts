/**
 * Cron store — manages Hermes Agent scheduled jobs via REST API.
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useConnectionStore } from './connection'
import type { CronJob, CronStatus } from '@/api/types'
import * as cronApi from '@/api/hermes-cron-api'

export const useCronStore = defineStore('cron', () => {
  const jobs = ref<CronJob[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const lastError = ref<string | null>(null)

  const status = computed<CronStatus>(() => ({
    enabled: true,
    jobs: jobs.value.length,
    running: jobs.value.filter(j => j.state?.runningAtMs).length,
  }))

  function getApiOpts(): cronApi.CronApiOptions {
    const conn = useConnectionStore()
    return {
      baseUrl: conn.currentServer?.url || '',
      token: conn.hermesAuthToken,
    }
  }

  async function fetchJobs(): Promise<void> {
    loading.value = true
    lastError.value = null
    try {
      jobs.value = await cronApi.listJobs(getApiOpts())
    } catch (e: any) {
      lastError.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function createJob(params: {
    name: string
    schedule: string
    prompt: string
    deliver?: string
    enabled?: boolean
  }): Promise<CronJob | null> {
    saving.value = true
    lastError.value = null
    try {
      const job = await cronApi.createJob(getApiOpts(), params)
      jobs.value.push(job)
      return job
    } catch (e: any) {
      lastError.value = e.message
      return null
    } finally {
      saving.value = false
    }
  }

  async function updateJob(id: string, params: Record<string, any>): Promise<boolean> {
    saving.value = true
    lastError.value = null
    try {
      const updated = await cronApi.updateJob(getApiOpts(), id, params)
      const idx = jobs.value.findIndex(j => j.id === id)
      if (idx !== -1) jobs.value[idx] = updated
      return true
    } catch (e: any) {
      lastError.value = e.message
      return false
    } finally {
      saving.value = false
    }
  }

  async function deleteJob(id: string): Promise<boolean> {
    saving.value = true
    lastError.value = null
    try {
      await cronApi.deleteJob(getApiOpts(), id)
      jobs.value = jobs.value.filter(j => j.id !== id)
      return true
    } catch (e: any) {
      lastError.value = e.message
      return false
    } finally {
      saving.value = false
    }
  }

  async function toggleJob(id: string, enabled: boolean): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    lastError.value = null
    try {
      if (enabled) {
        await cronApi.resumeJob(getApiOpts(), id)
      } else {
        await cronApi.pauseJob(getApiOpts(), id)
      }
      const idx = jobs.value.findIndex(j => j.id === id)
      if (idx !== -1) jobs.value[idx] = { ...jobs.value[idx], enabled }
      return true
    } catch (e: any) {
      lastError.value = e.message
      return false
    } finally {
      saving.value = false
    }
  }

  async function runJob(id: string): Promise<boolean> {
    lastError.value = null
    try {
      await cronApi.runJob(getApiOpts(), id)
      return true
    } catch (e: any) {
      lastError.value = e.message
      return false
    }
  }

  return {
    jobs,
    loading,
    saving,
    lastError,
    status,
    fetchJobs,
    createJob,
    updateJob,
    deleteJob,
    toggleJob,
    runJob,
  }
})
