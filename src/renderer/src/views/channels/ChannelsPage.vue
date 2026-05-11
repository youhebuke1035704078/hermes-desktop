<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NTag,
  NText,
  useMessage
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  ChatbubblesOutline,
  RefreshOutline,
  LinkOutline,
  UnlinkOutline,
  SettingsOutline,
  KeyOutline
} from '@vicons/ionicons5'
import { useChannelsStore } from '@/stores/channels'
import { useConnectionStore } from '@/stores/connection'
import type { Channel, ChannelStatus } from '@/api/types/channel'

const { t } = useI18n()
const message = useMessage()
const router = useRouter()
const channelsStore = useChannelsStore()
const connectionStore = useConnectionStore()

const isHermesRest = computed(() => connectionStore.serverType === 'hermes-rest')

// ── Filters ──
const platformFilter = ref<string | null>(null)
const statusFilter = ref<ChannelStatus | null>(null)
const searchQuery = ref('')

const platformOptions = computed(() => [
  { label: t('pages.channels.platformAll'), value: null as any },
  ...channelsStore.platforms.map((p) => ({ label: p, value: p }))
])

const statusOptions = computed(() => [
  { label: t('pages.channels.statusAll'), value: null as any },
  { label: t('pages.channels.status.connected'), value: 'connected' },
  { label: t('pages.channels.status.disconnected'), value: 'disconnected' },
  { label: t('pages.channels.status.authenticating'), value: 'authenticating' },
  { label: t('pages.channels.status.error'), value: 'error' }
])

const filteredChannels = computed(() => {
  let list = channelsStore.channels
  if (platformFilter.value) {
    list = list.filter((c) => c.platform === platformFilter.value)
  }
  if (statusFilter.value) {
    list = list.filter((c) => c.status === statusFilter.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        (c.accountName || '').toLowerCase().includes(q) ||
        (c.accountId || '').toLowerCase().includes(q)
    )
  }
  return list
})

const channelIssueSummary = computed(() => {
  if (channelsStore.error) return channelsStore.error
  if (channelsStore.errorCount > 0) return `${channelsStore.errorCount} 个渠道处于异常状态`
  if (channelsStore.channels.length === 0) return '当前没有同步到渠道数据'
  return ''
})

// ── Status styling ──
function statusType(status: ChannelStatus): 'default' | 'success' | 'info' | 'warning' | 'error' {
  switch (status) {
    case 'connected':
      return 'success'
    case 'disconnected':
      return 'default'
    case 'authenticating':
      return 'info'
    case 'error':
      return 'error'
    default:
      return 'default'
  }
}

function statusLabel(status: ChannelStatus): string {
  return t(`pages.channels.status.${status}`)
}

// ── Pairing dialog ──
const pairingDialogOpen = ref(false)
const pairingChannel = ref<Channel | null>(null)
const pairingCode = ref('')

function openPairingDialog(channel: Channel): void {
  pairingChannel.value = channel
  pairingCode.value = ''
  pairingDialogOpen.value = true
}

async function handleStartAuth(channel: Channel): Promise<void> {
  const result = await channelsStore.authChannel({
    channelId: channel.id,
    channelKey: channel.channelKey,
    accountId: channel.accountId
  })
  if (result.ok) {
    message.success(t('pages.channels.authStarted', { id: channel.id }))
    // Open pairing dialog in case backend needs a code to complete pairing
    openPairingDialog(channel)
  } else {
    message.error(t('pages.channels.authFailed', { error: result.error || '' }))
  }
}

async function handleSubmitPairing(): Promise<void> {
  if (!pairingChannel.value) return
  if (!pairingCode.value.trim()) {
    message.warning(t('pages.channels.pairingCodeRequired'))
    return
  }
  const result = await channelsStore.pairChannel({
    channelId: pairingChannel.value.id,
    channelKey: pairingChannel.value.channelKey,
    accountId: pairingChannel.value.accountId,
    code: pairingCode.value.trim()
  })
  if (result.ok) {
    message.success(t('pages.channels.pairSuccess'))
    pairingDialogOpen.value = false
    pairingChannel.value = null
  } else {
    message.error(t('pages.channels.pairFailed', { error: result.error || '' }))
  }
}

async function handleRefreshStatus(channelId: string): Promise<void> {
  await channelsStore.refreshStatus(channelId)
  message.success(t('pages.channels.statusRefreshed'))
}

function handleOpenSettings(): void {
  router.push({ name: 'Settings' })
}

// ── Detail drawer ──
const detailDrawerOpen = ref(false)

function openDetail(channel: Channel): void {
  channelsStore.selectedChannelId = channel.id
  detailDrawerOpen.value = true
}

// ── Table columns ──
const columns = computed<DataTableColumns<Channel>>(() => [
  {
    title: t('pages.channels.columns.platform'),
    key: 'platform',
    width: 120,
    render(row) {
      return h(
        NTag,
        { size: 'small', bordered: false, type: 'info' },
        {
          default: () => String(row.platform || 'unknown')
        }
      )
    }
  },
  {
    title: t('pages.channels.columns.identity'),
    key: 'id',
    minWidth: 220,
    ellipsis: { tooltip: true },
    render(row) {
      return h('div', [
        h(
          NText,
          { strong: true, style: 'display: block;' },
          {
            default: () => row.accountName || row.accountId || row.id
          }
        ),
        h(
          NText,
          { depth: 3, style: 'font-size: 11px; font-family: monospace;' },
          {
            default: () => row.id
          }
        )
      ])
    }
  },
  {
    title: t('pages.channels.columns.status'),
    key: 'status',
    width: 120,
    render(row) {
      return h(
        NTag,
        { size: 'small', bordered: false, type: statusType(row.status) },
        {
          default: () => statusLabel(row.status)
        }
      )
    }
  },
  {
    title: t('pages.channels.columns.members'),
    key: 'memberCount',
    width: 90,
    render(row) {
      return h(NText, {}, { default: () => String(row.memberCount ?? '-') })
    }
  },
  {
    title: t('pages.channels.columns.dmPolicy'),
    key: 'dmPolicy',
    width: 120,
    render(row) {
      return h(
        NText,
        { depth: 3, style: 'font-size: var(--font-body-sm);' },
        {
          default: () => String(row.dmPolicy || '-')
        }
      )
    }
  },
  {
    title: t('pages.channels.columns.actions'),
    key: 'actions',
    width: 230,
    fixed: 'right',
    render(row) {
      const actions = [
        h(
          NButton,
          {
            size: 'tiny',
            quaternary: true,
            onClick: () => handleRefreshStatus(row.id)
          },
          {
            icon: () => h(NIcon, { component: RefreshOutline })
          }
        )
      ]
      if (isHermesRest.value) {
        return h(NSpace, { size: 4 }, { default: () => actions })
      }
      actions.unshift(
        h(
          NButton,
          {
            size: 'tiny',
            quaternary: true,
            type: 'primary',
            loading: channelsStore.isAuthInFlight(row.id),
            onClick: () => handleStartAuth(row)
          },
          {
            icon: () =>
              h(NIcon, { component: row.status === 'connected' ? UnlinkOutline : LinkOutline }),
            default: () =>
              row.status === 'connected' ? t('pages.channels.reauth') : t('pages.channels.auth')
          }
        )
      )
      return h(
        NSpace,
        { size: 4 },
        {
          default: () => actions
        }
      )
    }
  }
])

function rowProps(row: Channel) {
  return {
    style: 'cursor: pointer;',
    onClick: (evt: MouseEvent) => {
      // Don't open drawer when clicking action buttons
      const target = evt.target as HTMLElement
      if (target.closest('button')) return
      openDetail(row)
    }
  }
}

// ── Lifecycle ──
onMounted(() => {
  channelsStore.fetchChannels()
})
</script>

<template>
  <NSpace vertical :size="16">
    <!-- Metrics + filter bar -->
    <NCard>
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="ChatbubblesOutline" :size="20" />
          <span>{{ t('pages.channels.title') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NSpace :size="8">
          <NButton secondary size="small" @click="handleOpenSettings">
            <template #icon><NIcon :component="SettingsOutline" /></template>
            {{ t('pages.channels.manageSettings') }}
          </NButton>
          <NButton
            secondary
            size="small"
            :loading="channelsStore.loading"
            @click="channelsStore.fetchChannels()"
          >
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('pages.channels.refresh') }}
          </NButton>
        </NSpace>
      </template>

      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="10" :y-gap="10">
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px">
            <NText depth="3" style="font-size: var(--font-body-sm)">{{
              t('pages.channels.metrics.total')
            }}</NText>
            <div style="font-size: var(--font-metric); font-weight: 700; margin-top: 6px">
              {{ channelsStore.channels.length }}
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px">
            <NText depth="3" style="font-size: var(--font-body-sm)">{{
              t('pages.channels.metrics.connected')
            }}</NText>
            <div style="font-size: var(--font-metric); font-weight: 700; margin-top: 6px">
              <NText type="success">{{ channelsStore.connectedCount }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px">
            <NText depth="3" style="font-size: var(--font-body-sm)">{{
              t('pages.channels.metrics.errors')
            }}</NText>
            <div style="font-size: var(--font-metric); font-weight: 700; margin-top: 6px">
              <NText type="error">{{ channelsStore.errorCount }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px">
            <NText depth="3" style="font-size: var(--font-body-sm)">{{
              t('pages.channels.metrics.members')
            }}</NText>
            <div style="font-size: var(--font-metric); font-weight: 700; margin-top: 6px">
              <NText type="info">{{ channelsStore.totalMembers }}</NText>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Filter bar -->
      <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap">
        <NInput
          v-model:value="searchQuery"
          clearable
          :placeholder="t('pages.channels.searchPlaceholder')"
          style="flex: 1; min-width: 200px"
        />
        <NSelect
          v-model:value="platformFilter"
          :options="platformOptions"
          :placeholder="t('pages.channels.platformFilter')"
          clearable
          style="width: 160px"
        />
        <NSelect
          v-model:value="statusFilter"
          :options="statusOptions"
          :placeholder="t('pages.channels.statusFilter')"
          clearable
          style="width: 160px"
        />
      </div>
    </NCard>

    <NAlert v-if="isHermesRest" type="info" :closable="false">
      Hermes REST 模式下渠道管理为只读视图；账号绑定、重连和授权仍以 Hermes Agent 端为准。
    </NAlert>

    <NAlert
      v-if="channelIssueSummary"
      :type="channelsStore.error || channelsStore.errorCount ? 'warning' : 'info'"
      :closable="false"
    >
      {{ channelIssueSummary }}
    </NAlert>

    <!-- Channel list -->
    <NCard v-if="!channelsStore.loading && channelsStore.channels.length === 0">
      <div style="text-align: center; padding: 40px">
        <NText depth="3">{{ t('pages.channels.empty') }}</NText>
        <NSpace justify="center" :size="8" style="margin-top: 12px">
          <NButton
            size="small"
            secondary
            :loading="channelsStore.loading"
            @click="channelsStore.fetchChannels()"
          >
            {{ t('pages.channels.refresh') }}
          </NButton>
          <NButton size="small" secondary @click="handleOpenSettings">
            {{ t('routes.settings') }}
          </NButton>
        </NSpace>
      </div>
    </NCard>

    <NCard v-else>
      <div v-if="filteredChannels.length === 0" style="text-align: center; padding: 18px 0">
        <NText depth="3">没有匹配当前筛选条件的渠道</NText>
      </div>
      <NDataTable
        v-else
        :columns="columns"
        :data="filteredChannels"
        :row-key="(row: Channel) => row.id"
        :row-props="rowProps"
        :loading="channelsStore.loading"
        :scroll-x="900"
        size="small"
        :pagination="{ pageSize: 20 }"
      />
    </NCard>

    <!-- Detail drawer -->
    <NDrawer v-model:show="detailDrawerOpen" :width="420" placement="right">
      <NDrawerContent :title="channelsStore.selectedChannel?.id || ''">
        <template v-if="channelsStore.selectedChannel">
          <NSpace vertical :size="12">
            <div>
              <NText depth="3" style="font-size: var(--font-body-sm)">{{
                t('pages.channels.detail.platform')
              }}</NText>
              <div>
                <NTag size="small" :bordered="false" type="info">
                  {{ channelsStore.selectedChannel.platform }}
                </NTag>
              </div>
            </div>
            <div>
              <NText depth="3" style="font-size: var(--font-body-sm)">{{
                t('pages.channels.detail.status')
              }}</NText>
              <div>
                <NTag
                  size="small"
                  :bordered="false"
                  :type="statusType(channelsStore.selectedChannel.status)"
                >
                  {{ statusLabel(channelsStore.selectedChannel.status) }}
                </NTag>
              </div>
            </div>
            <div v-if="channelsStore.selectedChannel.accountName">
              <NText depth="3" style="font-size: var(--font-body-sm)">{{
                t('pages.channels.detail.accountName')
              }}</NText>
              <div>
                <NText>{{ channelsStore.selectedChannel.accountName }}</NText>
              </div>
            </div>
            <div v-if="channelsStore.selectedChannel.accountId">
              <NText depth="3" style="font-size: var(--font-body-sm)">{{
                t('pages.channels.detail.accountId')
              }}</NText>
              <div>
                <NText code style="font-size: var(--font-body-sm)">{{
                  channelsStore.selectedChannel.accountId
                }}</NText>
              </div>
            </div>
            <div v-if="channelsStore.selectedChannel.memberCount != null">
              <NText depth="3" style="font-size: var(--font-body-sm)">{{
                t('pages.channels.detail.memberCount')
              }}</NText>
              <div>
                <NText>{{ channelsStore.selectedChannel.memberCount }}</NText>
              </div>
            </div>
            <div>
              <NText depth="3" style="font-size: var(--font-body-sm)">{{
                t('pages.channels.detail.dmPolicy')
              }}</NText>
              <div>
                <NText>{{ channelsStore.selectedChannel.dmPolicy }}</NText>
              </div>
            </div>
            <div v-if="channelsStore.selectedChannel.groupPolicy">
              <NText depth="3" style="font-size: var(--font-body-sm)">{{
                t('pages.channels.detail.groupPolicy')
              }}</NText>
              <div>
                <NText>{{ channelsStore.selectedChannel.groupPolicy }}</NText>
              </div>
            </div>
            <div
              v-if="
                channelsStore.selectedChannel.groups &&
                channelsStore.selectedChannel.groups.length > 0
              "
            >
              <NText depth="3" style="font-size: var(--font-body-sm)">
                {{
                  t('pages.channels.detail.groups', {
                    count: channelsStore.selectedChannel.groups.length
                  })
                }}
              </NText>
              <div style="margin-top: 4px; max-height: 180px; overflow-y: auto">
                <NTag
                  v-for="group in channelsStore.selectedChannel.groups"
                  :key="group.id"
                  size="small"
                  :bordered="false"
                  style="margin: 2px"
                >
                  {{ group.name }}
                </NTag>
              </div>
            </div>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>

    <!-- Pairing code modal -->
    <NModal
      v-model:show="pairingDialogOpen"
      preset="dialog"
      :title="t('pages.channels.pairingDialog.title')"
      :positive-text="t('pages.channels.pairingDialog.submit')"
      :negative-text="t('pages.channels.pairingDialog.cancel')"
      @positive-click="handleSubmitPairing"
    >
      <NSpace vertical :size="10">
        <NText depth="3" style="font-size: var(--font-body)">
          {{ t('pages.channels.pairingDialog.description', { id: pairingChannel?.id || '' }) }}
        </NText>
        <NInput
          v-model:value="pairingCode"
          :placeholder="t('pages.channels.pairingDialog.codePlaceholder')"
          @keyup.enter="handleSubmitPairing"
        >
          <template #prefix><NIcon :component="KeyOutline" /></template>
        </NInput>
      </NSpace>
    </NModal>
  </NSpace>
</template>
