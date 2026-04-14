<script setup lang="ts">
import { computed, h, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton, NCard, NDataTable, NGrid, NGridItem, NIcon,
  NPopconfirm, NProgress, NSpace, NText, useMessage, useDialog,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  SaveOutline, RefreshOutline, CloudDownloadOutline, CloudUploadOutline,
  TrashOutline, ArchiveOutline, AddOutline,
} from '@vicons/ionicons5'
import { useBackupStore } from '@/stores/backup'
import type { BackupItem } from '@/api/types/backup'

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const backupStore = useBackupStore()

// ── Format helpers ──
function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString()
  } catch {
    return iso
  }
}

// ── Actions ──
async function handleCreate(): Promise<void> {
  const result = await backupStore.createBackup()
  if (result.ok) {
    message.success(t('pages.backup.createSuccess', { filename: result.filename || '' }))
  } else {
    message.error(t('pages.backup.createFailed', { error: result.error || '' }))
  }
}

async function handleDelete(filename: string): Promise<void> {
  const result = await backupStore.deleteBackup(filename)
  if (result.ok) {
    message.success(t('pages.backup.deleteSuccess'))
  } else {
    message.error(t('pages.backup.deleteFailed', { error: result.error || '' }))
  }
}

async function handleDownload(filename: string): Promise<void> {
  const result = await backupStore.downloadBackup(filename)
  if (result.ok) {
    message.success(t('pages.backup.downloadSuccess'))
  } else {
    message.error(t('pages.backup.downloadFailed', { error: result.error || '' }))
  }
}

async function handleRestore(filename: string): Promise<void> {
  dialog.warning({
    title: t('pages.backup.restoreConfirmTitle'),
    content: t('pages.backup.restoreConfirmContent', { filename }),
    positiveText: t('pages.backup.restoreConfirmOk'),
    negativeText: t('pages.backup.restoreConfirmCancel'),
    onPositiveClick: async () => {
      const result = await backupStore.restoreBackup(filename)
      if (result.ok) {
        message.success(t('pages.backup.restoreSuccess'))
      } else {
        message.error(t('pages.backup.restoreFailed', { error: result.error || '' }))
      }
    },
  })
}

async function handleUpload(): Promise<void> {
  const result = await backupStore.uploadBackup()
  if (result.ok) {
    message.success(t('pages.backup.uploadSuccess', { filename: result.filename || '' }))
  } else if (result.error && !result.error.toLowerCase().includes('cancel')) {
    message.error(t('pages.backup.uploadFailed', { error: result.error }))
  }
}

// ── Table columns ──
const columns = computed<DataTableColumns<BackupItem>>(() => [
  {
    title: t('pages.backup.columns.filename'),
    key: 'filename',
    minWidth: 260,
    ellipsis: { tooltip: true },
    render(row) {
      return h('div', [
        h(NText, { strong: true, style: 'display:block; font-family: monospace; font-size: 12px;' }, { default: () => row.filename }),
        h(NText, { depth: 3, style: 'font-size: 11px;' }, { default: () => formatDate(row.createdAt) }),
      ])
    },
  },
  {
    title: t('pages.backup.columns.size'),
    key: 'size',
    width: 110,
    render(row) {
      return h(NText, {}, { default: () => formatBytes(row.size) })
    },
  },
  {
    title: t('pages.backup.columns.date'),
    key: 'date',
    width: 140,
    render(row) {
      return h(NText, { depth: 3 }, { default: () => row.date })
    },
  },
  {
    title: t('pages.backup.columns.actions'),
    key: 'actions',
    width: 280,
    fixed: 'right',
    render(row) {
      return h(NSpace, { size: 4 }, {
        default: () => [
          h(NButton, {
            size: 'tiny',
            type: 'primary',
            quaternary: true,
            disabled: backupStore.busy,
            onClick: () => handleRestore(row.filename),
          }, {
            icon: () => h(NIcon, { component: ArchiveOutline }),
            default: () => t('pages.backup.restore'),
          }),
          h(NButton, {
            size: 'tiny',
            quaternary: true,
            disabled: backupStore.busy,
            onClick: () => handleDownload(row.filename),
          }, {
            icon: () => h(NIcon, { component: CloudDownloadOutline }),
            default: () => t('pages.backup.download'),
          }),
          h(NPopconfirm, {
            onPositiveClick: () => handleDelete(row.filename),
          }, {
            trigger: () => h(NButton, {
              size: 'tiny',
              type: 'error',
              quaternary: true,
              disabled: backupStore.busy,
            }, {
              icon: () => h(NIcon, { component: TrashOutline }),
              default: () => t('pages.backup.delete'),
            }),
            default: () => t('pages.backup.deleteConfirm'),
          }),
        ],
      })
    },
  },
])

// ── Lifecycle ──
onMounted(() => {
  backupStore.bindProgressListener()
  backupStore.fetchBackups()
})

onUnmounted(() => {
  backupStore.unbindProgressListener()
})
</script>

<template>
  <NSpace vertical :size="16">
    <!-- Metrics + Actions -->
    <NCard>
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="SaveOutline" :size="20" />
          <span>{{ t('pages.backup.title') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NSpace :size="8">
          <NButton
            type="primary"
            size="small"
            :loading="backupStore.busy && backupStore.currentTask === 'create'"
            :disabled="backupStore.busy && backupStore.currentTask !== 'create'"
            @click="handleCreate"
          >
            <template #icon><NIcon :component="AddOutline" /></template>
            {{ t('pages.backup.createNow') }}
          </NButton>
          <NButton
            secondary
            size="small"
            :loading="backupStore.busy && backupStore.currentTask === 'upload'"
            :disabled="backupStore.busy && backupStore.currentTask !== 'upload'"
            @click="handleUpload"
          >
            <template #icon><NIcon :component="CloudUploadOutline" /></template>
            {{ t('pages.backup.upload') }}
          </NButton>
          <NButton
            secondary
            size="small"
            :loading="backupStore.loading"
            @click="backupStore.fetchBackups()"
          >
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('pages.backup.refresh') }}
          </NButton>
        </NSpace>
      </template>

      <NGrid cols="1 s:2 m:3" responsive="screen" :x-gap="10" :y-gap="10">
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.backup.metrics.total') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">{{ backupStore.count }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.backup.metrics.totalSize') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              <NText type="info">{{ formatBytes(backupStore.totalSize) }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.backup.metrics.latest') }}</NText>
            <div style="font-size: 14px; font-weight: 600; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              <template v-if="backupStore.latestBackup">
                <NText type="success">{{ formatDate(backupStore.latestBackup.createdAt) }}</NText>
              </template>
              <template v-else>
                <NText depth="3">-</NText>
              </template>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Active task progress -->
      <div v-if="backupStore.progress" style="margin-top: 14px;">
        <NText depth="3" style="font-size: 12px;">{{ backupStore.progress.message }}</NText>
        <NProgress
          :percentage="Math.round(backupStore.progress.progress)"
          :show-indicator="true"
          processing
          style="margin-top: 4px;"
        />
      </div>
    </NCard>

    <!-- Empty state -->
    <NCard v-if="!backupStore.loading && backupStore.backups.length === 0">
      <div style="text-align: center; padding: 40px;">
        <NIcon :component="ArchiveOutline" :size="48" depth="3" />
        <div style="margin-top: 12px;">
          <NText depth="3">{{ t('pages.backup.empty') }}</NText>
        </div>
      </div>
    </NCard>

    <!-- Backup list -->
    <NCard v-else>
      <NDataTable
        :columns="columns"
        :data="backupStore.backups"
        :row-key="(row: BackupItem) => row.filename"
        :loading="backupStore.loading"
        :scroll-x="800"
        size="small"
        :pagination="{ pageSize: 20 }"
      />
    </NCard>
  </NSpace>
</template>
