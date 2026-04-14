import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { BackupItem } from '@/api/types/backup'

export interface BackupProgress {
  progress: number
  message: string
  status: string
}

export const useBackupStore = defineStore('backup', () => {
  const backups = ref<BackupItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const busy = ref(false) // true while a create/restore/upload/delete is in flight
  const currentTask = ref<string | null>(null) // e.g. 'create' | 'restore' | 'upload'
  const progress = ref<BackupProgress | null>(null)

  // ── Getters ──
  const totalSize = computed(() => backups.value.reduce((sum, b) => sum + (b.size || 0), 0))
  const count = computed(() => backups.value.length)
  const latestBackup = computed(() => {
    if (!backups.value.length) return null
    return [...backups.value].sort((a, b) => {
      const at = new Date(a.createdAt).getTime()
      const bt = new Date(b.createdAt).getTime()
      return bt - at
    })[0]
  })

  // ── Actions ──
  async function fetchBackups(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await window.api.backupList()
      if (result.ok) {
        backups.value = result.backups
      } else {
        error.value = result.error || 'Failed to fetch backups'
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function createBackup(): Promise<{ ok: boolean; filename?: string; error?: string }> {
    if (busy.value) return { ok: false, error: 'Another task is running' }
    busy.value = true
    currentTask.value = 'create'
    progress.value = { progress: 0, message: 'Starting backup...', status: 'running' }
    try {
      const result = await window.api.backupCreate()
      if (result.ok) {
        await fetchBackups()
        return { ok: true, filename: result.filename }
      }
      return { ok: false, error: result.error }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      busy.value = false
      currentTask.value = null
      progress.value = null
    }
  }

  async function deleteBackup(filename: string): Promise<{ ok: boolean; error?: string }> {
    if (busy.value) return { ok: false, error: 'Another task is running' }
    busy.value = true
    currentTask.value = 'delete'
    try {
      const result = await window.api.backupDelete(filename)
      if (result.ok) {
        backups.value = backups.value.filter((b) => b.filename !== filename)
      }
      return result
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      busy.value = false
      currentTask.value = null
    }
  }

  async function downloadBackup(filename: string): Promise<{ ok: boolean; error?: string }> {
    try {
      return await window.api.backupDownload(filename)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async function restoreBackup(filename: string): Promise<{ ok: boolean; error?: string }> {
    if (busy.value) return { ok: false, error: 'Another task is running' }
    busy.value = true
    currentTask.value = 'restore'
    progress.value = { progress: 0, message: 'Starting restore...', status: 'running' }
    try {
      const result = await window.api.backupRestore(filename)
      if (result.ok) {
        await fetchBackups()
      }
      return result
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      busy.value = false
      currentTask.value = null
      progress.value = null
    }
  }

  async function uploadBackup(): Promise<{ ok: boolean; filename?: string; error?: string }> {
    if (busy.value) return { ok: false, error: 'Another task is running' }
    busy.value = true
    currentTask.value = 'upload'
    try {
      const result = await window.api.backupUpload()
      if (result.ok) {
        await fetchBackups()
      }
      return result
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      busy.value = false
      currentTask.value = null
    }
  }

  /** Attach the progress event listener — call once in the page's onMounted */
  let offProgress: (() => void) | null = null
  function bindProgressListener(): void {
    if (offProgress) return
    offProgress = window.api.onBackupProgress((data) => {
      progress.value = data
    })
  }

  function unbindProgressListener(): void {
    if (offProgress) {
      offProgress()
      offProgress = null
    }
  }

  return {
    backups, loading, error, busy, currentTask, progress,
    totalSize, count, latestBackup,
    fetchBackups, createBackup, deleteBackup, downloadBackup, restoreBackup, uploadBackup,
    bindProgressListener, unbindProgressListener,
  }
})
