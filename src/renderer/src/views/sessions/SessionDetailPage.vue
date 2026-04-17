<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NSpin,
  NSpace,
  NButton,
  NTag,
  NText,
  NIcon,
  NInput,
  NScrollbar,
  NPopconfirm,
  useMessage,
} from 'naive-ui'
import {
  ArrowBackOutline,
  CheckmarkOutline,
  CloseOutline,
  CreateOutline,
  DownloadOutline,
  RefreshOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { useHermesChatStore } from '@/stores/hermes-chat'
import { useConnectionStore } from '@/stores/connection'
import { formatDate, formatRelativeTime, parseSessionKey, downloadJSON } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const message = useMessage()
const { t } = useI18n()

const sessionKey = computed(() => decodeURIComponent(route.params.key as string))
const parsed = computed(() => parseSessionKey(sessionKey.value))
const session = computed(() => sessionStore.currentSession)

// Inline label editing
const editingLabel = ref(false)
const editLabelValue = ref('')

function startEditLabel() {
  editLabelValue.value = session.value?.label || ''
  editingLabel.value = true
}

async function saveLabel() {
  const newLabel = editLabelValue.value.trim()
  try {
    await sessionStore.patchSessionLabel(sessionKey.value, newLabel)
    message.success(t('pages.sessions.detail.labelSaved'))
    sessionStore.fetchSession(sessionKey.value)
  } catch {
    message.error(t('pages.sessions.detail.labelFailed'))
  } finally {
    editingLabel.value = false
  }
}

function cancelEditLabel() {
  editingLabel.value = false
}

function formatTokenK(value: number | undefined): string {
  if (value === undefined || value === null) return '-'
  const k = Math.max(0, value) / 1000
  const digits = k >= 100 ? 0 : k >= 10 ? 1 : 2
  return k.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1') + 'K'
}

onMounted(() => {
  sessionStore.fetchSession(sessionKey.value)
})

onUnmounted(() => {
  sessionStore.currentSession = null
})

async function handleReset() {
  try {
    await sessionStore.resetSession(sessionKey.value)
    message.success(t('pages.sessions.detail.resetSuccess'))
    sessionStore.fetchSession(sessionKey.value)
  } catch {
    message.error(t('pages.sessions.detail.resetFailed'))
  }
}

async function handleDelete() {
  try {
    await sessionStore.deleteSession(sessionKey.value)
    message.success(t('pages.sessions.detail.deleteSuccess'))
    router.push({ name: 'Sessions' })
  } catch {
    message.error(t('pages.sessions.detail.deleteFailed'))
  }
}

async function handleExport() {
  try {
    const data = await sessionStore.exportSession(sessionKey.value)
    downloadJSON(data, `session-${sessionKey.value.replace(/:/g, '-')}.json`)
    message.success(t('pages.sessions.detail.exportSuccess'))
  } catch {
    message.error(t('pages.sessions.detail.exportFailed'))
  }
}

function roleColor(role: string): string {
  switch (role) {
    case 'user': return '#2080f0'
    case 'assistant': return '#18a058'
    case 'tool': return '#f0a020'
    case 'system': return '#909399'
    default: return '#666'
  }
}

function roleLabel(role: string): string {
  switch (role) {
    case 'user': return t('pages.sessions.roles.user')
    case 'assistant': return t('pages.sessions.roles.assistant')
    case 'tool': return t('pages.sessions.roles.tool')
    case 'system': return t('pages.sessions.roles.system')
    default: return role
  }
}

// --- Hermes REST data path ---
const connectionStore = useConnectionStore()
const isHermesRest = computed(() => connectionStore.serverType === 'hermes-rest')
const hermesChatStore = useHermesChatStore()

const hermesConversation = computed(() => {
  if (!isHermesRest.value) return null
  const key = route.params.key as string
  return hermesChatStore.conversations.find(c => c.id === key) || null
})

const editingTitle = ref(false)
const titleDraft = ref('')

function startEditTitle() {
  titleDraft.value = hermesConversation.value?.title || ''
  editingTitle.value = true
}
function saveTitle() {
  if (hermesConversation.value && titleDraft.value.trim()) {
    hermesChatStore.renameConversation(hermesConversation.value.id, titleDraft.value.trim())
  }
  editingTitle.value = false
}

function handleHermesOpenChat() {
  if (!hermesConversation.value) return
  hermesChatStore.switchTo(hermesConversation.value.id)
  router.push({ name: 'Chat' })
}
function handleHermesExport() {
  if (!hermesConversation.value) return
  const json = JSON.stringify(hermesConversation.value, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `conversation-${hermesConversation.value.id}.json`
  a.click()
  URL.revokeObjectURL(url)
}
function handleHermesDeleteDetail() {
  if (!hermesConversation.value) return
  hermesChatStore.deleteConversation(hermesConversation.value.id)
  router.push({ name: 'Sessions' })
}
</script>

<template>
  <!-- ACP WebSocket RPC data path -->
  <template v-if="!isHermesRest">
    <NSpace vertical :size="16">
      <!-- Header -->
      <NSpace align="center">
        <NButton quaternary circle @click="router.push({ name: 'Sessions' })">
          <template #icon>
            <NIcon :component="ArrowBackOutline" />
          </template>
        </NButton>
        <NText strong style="font-size: 18px;">{{ t('pages.sessions.detail.title') }}</NText>
        <NTag size="small" type="info" round :bordered="false">{{ parsed.agent }}</NTag>
        <NTag size="small" round :bordered="false">{{ parsed.channel }}</NTag>
        <NText depth="3">{{ parsed.peer }}</NText>
      </NSpace>

      <NSpin :show="sessionStore.loading">
        <!-- Metadata card -->
        <NCard v-if="session" class="app-card" size="small">
          <NDescriptions label-placement="left" :column="2" bordered size="small">
            <NDescriptionsItem :label="t('pages.sessions.detail.meta.agent')">
              {{ session.agentId || parsed.agent }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('pages.sessions.detail.meta.channel')">
              {{ session.channel || parsed.channel }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('pages.sessions.detail.meta.peer')">
              {{ session.peer || parsed.peer || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('pages.sessions.detail.meta.model')">
              <NText code v-if="session.model">{{ session.model }}</NText>
              <NText depth="3" v-else>-</NText>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('pages.sessions.detail.meta.label')">
              <NSpace v-if="!editingLabel" align="center" :size="4">
                <NText>{{ session.label || '-' }}</NText>
                <NButton text size="tiny" @click="startEditLabel">
                  <template #icon><NIcon :component="CreateOutline" size="14" /></template>
                </NButton>
              </NSpace>
              <NSpace v-else align="center" :size="4">
                <NInput v-model:value="editLabelValue" size="small" style="width: 200px;" @keyup.enter="saveLabel" />
                <NButton text size="tiny" type="success" @click="saveLabel">
                  <template #icon><NIcon :component="CheckmarkOutline" /></template>
                </NButton>
                <NButton text size="tiny" @click="cancelEditLabel">
                  <template #icon><NIcon :component="CloseOutline" /></template>
                </NButton>
              </NSpace>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('pages.sessions.detail.meta.messages')">
              {{ session.messageCount ?? session.transcript?.length ?? 0 }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('pages.sessions.detail.meta.tokens')">
              <NSpace v-if="session.tokenUsage" :size="8">
                <NText depth="3" style="font-size: 12px;">
                  In: {{ formatTokenK(session.tokenUsage.totalInput) }}
                </NText>
                <NText depth="3" style="font-size: 12px;">
                  Out: {{ formatTokenK(session.tokenUsage.totalOutput) }}
                </NText>
              </NSpace>
              <NText v-else depth="3">-</NText>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('pages.sessions.detail.meta.lastActivity')">
              {{ session.lastActivity ? formatRelativeTime(session.lastActivity) : '-' }}
            </NDescriptionsItem>
          </NDescriptions>
        </NCard>

        <!-- Transcript card -->
        <NCard class="app-card" style="margin-top: 12px;">
          <template #header>
            <NSpace align="center">
              <NText>{{ t('pages.sessions.detail.transcript') }}</NText>
              <NTag v-if="session" size="small" :bordered="false" round>
                {{ t('common.messagesCount', { count: session.transcript?.length || 0 }) }}
              </NTag>
            </NSpace>
          </template>
          <template #header-extra>
            <NSpace :size="8" class="app-toolbar">
              <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" @click="sessionStore.fetchSession(sessionKey)">
                <template #icon><NIcon :component="RefreshOutline" /></template>
                {{ t('common.refresh') }}
              </NButton>
              <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" @click="handleExport">
                <template #icon><NIcon :component="DownloadOutline" /></template>
                {{ t('common.export') }}
              </NButton>
              <NPopconfirm @positive-click="handleReset">
                <template #trigger>
                  <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh">
                    <template #icon><NIcon :component="RefreshOutline" /></template>
                    {{ t('common.reset') }}
                  </NButton>
                </template>
                {{ t('pages.sessions.detail.confirmReset') }}
              </NPopconfirm>
              <NPopconfirm @positive-click="handleDelete">
                <template #trigger>
                  <NButton size="small" type="error" class="app-toolbar-btn">
                    <template #icon><NIcon :component="TrashOutline" /></template>
                    {{ t('common.delete') }}
                  </NButton>
                </template>
                {{ t('pages.sessions.detail.confirmDelete') }}
              </NPopconfirm>
            </NSpace>
          </template>

          <NScrollbar style="max-height: calc(100vh - 360px);">
            <div
              v-if="session?.transcript?.length"
              style="display: flex; flex-direction: column; gap: 12px; padding: 4px 0;"
            >
              <div
                v-for="(msg, index) in session.transcript"
                :key="`${msg.role}:${msg.timestamp ?? ''}:${index}:${msg.content?.length ?? 0}`"
                style="display: flex; gap: 12px; padding: 12px; border-radius: 8px;"
                :style="{ backgroundColor: msg.role === 'assistant' ? 'var(--bg-secondary)' : 'transparent' }"
              >
                <NTag
                  size="small"
                  :bordered="false"
                  round
                  :color="{ color: roleColor(msg.role) + '18', textColor: roleColor(msg.role) }"
                  style="flex-shrink: 0; height: 22px;"
                >
                  {{ roleLabel(msg.role) }}
                </NTag>
                <div style="flex: 1; min-width: 0;">
                  <div style="white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 1.6;">
                    {{ msg.content }}
                  </div>
                  <NText
                    v-if="msg.timestamp"
                    depth="3"
                    style="font-size: 11px; margin-top: 4px; display: block;"
                  >
                    {{ formatDate(msg.timestamp) }}
                  </NText>
                </div>
              </div>
            </div>
            <div v-else style="text-align: center; padding: 60px 0; color: var(--text-secondary);">
              {{ t('common.noMessages') }}
            </div>
          </NScrollbar>
        </NCard>
      </NSpin>
    </NSpace>
  </template>

  <!-- Hermes REST data path -->
  <template v-else>
    <!-- Not found -->
    <NSpace v-if="!hermesConversation" vertical :size="16">
      <NCard class="app-card">
        <NSpace vertical align="center" justify="center" style="padding: 40px 0;">
          <NText depth="3">{{ t('pages.sessions.hermesRest.notFound') }}</NText>
          <NButton @click="router.push({ name: 'Sessions' })">
            <template #icon><NIcon :component="ArrowBackOutline" /></template>
            {{ t('common.back') }}
          </NButton>
        </NSpace>
      </NCard>
    </NSpace>

    <NSpace v-else vertical :size="16">
      <!-- Header card -->
      <NCard class="app-card" size="small">
        <NSpace align="center" justify="space-between" style="width: 100%;">
          <NSpace align="center">
            <NButton quaternary circle @click="router.push({ name: 'Sessions' })">
              <template #icon>
                <NIcon :component="ArrowBackOutline" />
              </template>
            </NButton>
            <template v-if="!editingTitle">
              <NText strong style="font-size: 18px; cursor: pointer;" @click="startEditTitle">
                {{ hermesConversation.title || t('pages.sessions.hermesRest.untitled') }}
              </NText>
              <NButton text size="tiny" @click="startEditTitle">
                <template #icon><NIcon :component="CreateOutline" size="14" /></template>
              </NButton>
            </template>
            <template v-else>
              <NInput
                v-model:value="titleDraft"
                size="small"
                style="width: 300px;"
                @keyup.enter="saveTitle"
                @blur="saveTitle"
              />
            </template>
          </NSpace>
          <NSpace :size="8">
            <NButton size="small" @click="handleHermesOpenChat">
              {{ t('pages.sessions.hermesRest.openInChat') }}
            </NButton>
            <NButton size="small" @click="handleHermesExport">
              <template #icon><NIcon :component="DownloadOutline" /></template>
              {{ t('pages.sessions.hermesRest.exportJson') }}
            </NButton>
            <NPopconfirm @positive-click="handleHermesDeleteDetail">
              <template #trigger>
                <NButton size="small" type="error">
                  <template #icon><NIcon :component="TrashOutline" /></template>
                  {{ t('common.delete') }}
                </NButton>
              </template>
              {{ t('pages.sessions.detail.confirmDelete') }}
            </NPopconfirm>
          </NSpace>
        </NSpace>
      </NCard>

      <!-- Metadata -->
      <NCard class="app-card" size="small">
        <NDescriptions label-placement="left" :column="2" bordered size="small">
          <NDescriptionsItem :label="t('pages.sessions.list.columns.messageCount')">
            {{ hermesConversation.messages?.length || 0 }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('pages.sessions.list.columns.model')">
            <NText code>{{ connectionStore.hermesRealModel || hermesConversation.model || '-' }}</NText>
          </NDescriptionsItem>
          <NDescriptionsItem label="Created">
            {{ hermesConversation.createdAt ? formatDate(hermesConversation.createdAt) : '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="Updated">
            {{ hermesConversation.updatedAt ? formatDate(hermesConversation.updatedAt) : '-' }}
          </NDescriptionsItem>
        </NDescriptions>
      </NCard>

      <!-- Transcript -->
      <NCard class="app-card">
        <template #header>
          <NText>{{ t('pages.sessions.detail.transcript') }}</NText>
        </template>
        <NScrollbar style="max-height: calc(100vh - 420px);">
          <div
            v-if="hermesConversation.messages?.length"
            style="display: flex; flex-direction: column; gap: 12px; padding: 4px 0;"
          >
            <div
              v-for="(msg, index) in hermesConversation.messages"
              :key="`${msg.role}:${msg.timestamp ?? ''}:${index}:${msg.content?.length ?? 0}`"
              style="display: flex; gap: 12px; padding: 12px; border-radius: 8px;"
              :style="{ backgroundColor: msg.role === 'assistant' ? 'var(--bg-secondary)' : 'transparent' }"
            >
              <NTag
                size="small"
                :bordered="false"
                round
                :type="msg.role === 'user' ? 'info' : msg.role === 'assistant' ? 'success' : 'default'"
                style="flex-shrink: 0; height: 22px;"
              >
                {{ msg.role }}
              </NTag>
              <div style="flex: 1; min-width: 0;">
                <NText
                  v-if="msg.timestamp"
                  depth="3"
                  style="font-size: 11px; margin-bottom: 4px; display: block;"
                >
                  {{ formatDate(msg.timestamp) }}
                </NText>
                <div style="white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 1.6;">
                  {{ msg.content }}
                </div>
              </div>
            </div>
          </div>
          <div v-else style="text-align: center; padding: 60px 0; color: var(--text-secondary);">
            {{ t('common.noMessages') }}
          </div>
        </NScrollbar>
      </NCard>
    </NSpace>
  </template>
</template>
