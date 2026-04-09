import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  BackupItem,
  BackupTask,
  BackupTaskProgress,
} from '@/api/types/backup'

export const useBackupStore = defineStore('backup', () => {
  const backupList = ref<BackupItem[]>([])
  const tasks = ref<Map<string, BackupTask>>(new Map())
  const loading = ref(false)
  const initialized = ref(false)

  const activeTasks = computed(() => {
    return Array.from(tasks.value.values()).filter(
      (t) => t.status === 'pending' || t.status === 'running'
    )
  })

  const hasActiveTask = computed(() => activeTasks.value.length > 0)

  const createTasks = computed(() =>
    Array.from(tasks.value.values()).filter((t) => t.type === 'create')
  )

  const restoreTasks = computed(() =>
    Array.from(tasks.value.values()).filter((t) => t.type === 'restore')
  )

  const uploadTasks = computed(() =>
    Array.from(tasks.value.values()).filter((t) => t.type === 'upload')
  )

  function generateTaskId(): string {
    return `backup-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function createTask(
    type: BackupTask['type'],
    filename?: string
  ): BackupTask {
    const task: BackupTask = {
      id: generateTaskId(),
      type,
      status: 'pending',
      progress: 0,
      message: '',
      filename,
      startedAt: Date.now(),
    }
    tasks.value.set(task.id, task)
    return task
  }

  function updateTask(
    taskId: string,
    updates: Partial<BackupTask>
  ): void {
    const task = tasks.value.get(taskId)
    if (task) {
      Object.assign(task, updates)
      tasks.value.set(taskId, { ...task })
    }
  }

  function updateTaskProgress(progress: BackupTaskProgress): void {
    const task = tasks.value.get(progress.taskId)
    if (task) {
      task.status = progress.status
      task.progress = progress.progress
      task.message = progress.message
      tasks.value.set(progress.taskId, { ...task })
    }
  }

  function completeTask(
    taskId: string,
    result?: BackupTask['result'],
    error?: string
  ): void {
    const task = tasks.value.get(taskId)
    if (task) {
      task.status = error ? 'failed' : 'completed'
      task.progress = 100
      task.completedAt = Date.now()
      task.result = result
      task.error = error
      tasks.value.set(taskId, { ...task })
    }
  }

  function removeTask(taskId: string): void {
    tasks.value.delete(taskId)
  }

  async function clearCompletedTasks(): Promise<void> {
    for (const [id, task] of tasks.value.entries()) {
      if (task.status === 'completed' || task.status === 'failed') {
        tasks.value.delete(id)
      }
    }
  }

  function markRunningTasksAsFailed(error: string): void {
    for (const [id, task] of tasks.value.entries()) {
      if (task.status === 'running' || task.status === 'pending') {
        task.status = 'failed'
        task.error = error
        task.message = 'Task interrupted'
        tasks.value.set(id, { ...task })
      }
    }
  }

  async function fetchTasks(): Promise<void> {
    // Tasks are tracked client-side only
  }

  async function fetchBackupList(): Promise<void> {
    loading.value = true
    try {
      const api = (window as any).api
      if (!api?.backupList) throw new Error('备份功能不可用')
      const result = await api.backupList()
      if (!result.ok) throw new Error(result.error || '获取备份列表失败')
      backupList.value = result.backups
    } finally {
      loading.value = false
    }
  }

  async function createBackup(): Promise<BackupTask> {
    const api = (window as any).api
    if (!api?.backupCreate) throw new Error('备份功能不可用')

    const task = createTask('create')
    updateTask(task.id, { status: 'running', progress: 5, message: '正在创建备份...' })

    // Listen for progress
    let unsub: (() => void) | null = null
    if (api.onBackupProgress) {
      unsub = api.onBackupProgress((data: { progress: number; message: string; status: string }) => {
        updateTask(task.id, { progress: data.progress, message: data.message })
      })
    }

    try {
      const result = await api.backupCreate()
      unsub?.()
      if (!result.ok) {
        completeTask(task.id, undefined, result.error || '备份失败')
        throw new Error(result.error || '备份失败')
      }
      completeTask(task.id, { filename: result.filename, size: result.size })
      await fetchBackupList()
      return tasks.value.get(task.id)!
    } catch (e) {
      unsub?.()
      if (!tasks.value.get(task.id)?.completedAt) {
        completeTask(task.id, undefined, (e as Error).message)
      }
      throw e
    }
  }

  async function restoreBackup(params: { filename: string }): Promise<BackupTask> {
    const api = (window as any).api
    if (!api?.backupRestore) throw new Error('备份功能不可用')

    const task = createTask('restore', params.filename)
    updateTask(task.id, { status: 'running', progress: 5, message: '正在恢复备份...' })

    let unsub: (() => void) | null = null
    if (api.onBackupProgress) {
      unsub = api.onBackupProgress((data: { progress: number; message: string; status: string }) => {
        updateTask(task.id, { progress: data.progress, message: data.message })
      })
    }

    try {
      const result = await api.backupRestore(params.filename)
      unsub?.()
      if (!result.ok) {
        completeTask(task.id, undefined, result.error || '恢复失败')
        throw new Error(result.error || '恢复失败')
      }
      completeTask(task.id, { filename: params.filename })
      return tasks.value.get(task.id)!
    } catch (e) {
      unsub?.()
      if (!tasks.value.get(task.id)?.completedAt) {
        completeTask(task.id, undefined, (e as Error).message)
      }
      throw e
    }
  }

  async function deleteBackup(filename: string): Promise<void> {
    const api = (window as any).api
    if (!api?.backupDelete) throw new Error('备份功能不可用')
    const result = await api.backupDelete(filename)
    if (!result.ok) throw new Error(result.error || '删除失败')
    await fetchBackupList()
  }

  async function uploadBackup(_file: File): Promise<BackupTask> {
    const api = (window as any).api
    if (!api?.backupUpload) throw new Error('备份功能不可用')

    const task = createTask('upload')
    updateTask(task.id, { status: 'running', progress: 50, message: '正在上传备份文件...' })

    try {
      const result = await api.backupUpload()
      if (!result.ok) {
        completeTask(task.id, undefined, result.error || '上传失败')
        throw new Error(result.error || '上传失败')
      }
      completeTask(task.id, { filename: result.filename, size: result.size })
      await fetchBackupList()
      return tasks.value.get(task.id)!
    } catch (e) {
      if (!tasks.value.get(task.id)?.completedAt) {
        completeTask(task.id, undefined, (e as Error).message)
      }
      throw e
    }
  }

  async function downloadBackup(filename: string): Promise<void> {
    const api = (window as any).api
    if (!api?.backupDownload) throw new Error('备份功能不可用')
    const result = await api.backupDownload(filename)
    if (!result.ok && result.error !== 'Cancelled') {
      throw new Error(result.error || '下载失败')
    }
  }

  async function initialize(): Promise<void> {
    if (initialized.value) return

    try {
      await fetchBackupList()
      initialized.value = true
    } catch (error) {
      console.error('[BackupStore] Initialize failed:', error)
    }
  }

  return {
    backupList,
    tasks,
    loading,
    initialized,
    activeTasks,
    hasActiveTask,
    createTasks,
    restoreTasks,
    uploadTasks,
    initialize,
    fetchBackupList,
    fetchTasks,
    createBackup,
    restoreBackup,
    deleteBackup,
    uploadBackup,
    downloadBackup,
    createTask,
    updateTask,
    updateTaskProgress,
    completeTask,
    removeTask,
    clearCompletedTasks,
    markRunningTasksAsFailed,
  }
})
