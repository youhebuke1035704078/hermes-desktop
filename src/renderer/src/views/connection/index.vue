<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NCard,
  NButton,
  NInput,
  NForm,
  NFormItem,
  NTag,
  NAlert,
  NSpace,
  NModal,
  NPopconfirm,
  NIcon,
  NTooltip,
  NEmpty,
  NSpin,
  useMessage
} from 'naive-ui'
import {
  AddOutline,
  RefreshOutline,
  TrashOutline,
  DesktopOutline,
  LogoWindows,
  LogoApple,
  LogoTux,
  CheckmarkCircleOutline,
  FlashOutline,
  CreateOutline
} from '@vicons/ionicons5'
import { v4 as uuid } from 'uuid'
import { useI18n } from 'vue-i18n'
import { useConnectionStore, ConnectionError } from '@/stores/connection'

const router = useRouter()
const message = useMessage()
const connectionStore = useConnectionStore()
const { t } = useI18n()

const showAddModal = ref(false)
const editingServerId = ref<string | null>(null) // null = adding, string = editing
const autoConnecting = ref(true)
const connecting = ref(false)
const connectingServerId = ref<string | null>(null)
const connectingLocal = ref(false)
const serverHealth = ref<Record<string, 'online' | 'offline' | 'checking'>>({})
const encryptionAvailable = ref(true) // assume safe until checked

// Server probe state
const probing = ref(false)
let probeAbortController: AbortController | null = null
const probeResult = ref<null | {
  reachable: boolean
  authEnabled: boolean
  isHermesRest?: boolean
  gateway?: string
}>(null)

const form = ref({
  id: '',
  name: '',
  url: '',
  username: '',
  password: ''
})

const normalizedUrl = computed(() => {
  let url = form.value.url.trim()
  if (!url) return ''
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url
  }
  return url.replace(/\/$/, '')
})

const isHttpWarning = computed(() => {
  const url = normalizedUrl.value.toLowerCase()
  return url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')
})

// Auto-probe when URL looks complete
let probeTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => form.value.url,
  () => {
    probeResult.value = null
    if (probeTimer) clearTimeout(probeTimer)
    if (normalizedUrl.value && normalizedUrl.value.includes(':')) {
      probeTimer = setTimeout(() => probeServer(), 800)
    }
  }
)

async function probeServer() {
  const url = normalizedUrl.value
  if (!url) return

  // Abort any in-flight probe to avoid race conditions
  probeAbortController?.abort()
  probeAbortController = new AbortController()
  const { signal } = probeAbortController

  probing.value = true
  probeResult.value = null

  // Auto-abort after 6s if server doesn't respond
  const timeoutId = setTimeout(() => probeAbortController?.abort(), 6000)

  try {
    // First, try /health to detect Hermes REST API server.
    // Hermes Agent returns { status: 'ok' } — no auth needed.
    let isHermesRest = false
    try {
      const healthResp = await fetch(`${url}/health`, { signal })
      if (healthResp.ok) {
        const data = await healthResp.json()
        if (data?.status === 'ok') isHermesRest = true
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
    if (signal.aborted) return

    if (isHermesRest) {
      // Health is public, but API might require auth (API_SERVER_KEY).
      // Probe /v1/models without token to check.
      let needsAuth = false
      try {
        const modelsResp = await fetch(`${url}/v1/models`, { signal })
        if (modelsResp.status === 401 || modelsResp.status === 403) needsAuth = true
      } catch {
        /* network error — assume no auth needed */
      }
      if (signal.aborted) return
      probeResult.value = { reachable: true, authEnabled: needsAuth, isHermesRest: true }
    } else {
      // Gateway is primarily a WebSocket server — plain HTTP may return non-200.
      // Any HTTP response (even 400/426) means the server process is alive.
      let reachable = false
      try {
        await fetch(`${url}/`, { signal })
        reachable = true
      } catch (fetchErr) {
        if ((fetchErr as Error).name === 'AbortError') return
        reachable = false
      }
      if (signal.aborted) return

      if (!reachable) {
        probeResult.value = { reachable: false, authEnabled: false }
        return
      }

      // ACP Gateway uses token-based WS auth.
      probeResult.value = { reachable: true, authEnabled: true }
    }

    // Auto-fill name if empty
    if (!form.value.name) {
      try {
        const u = new URL(url)
        form.value.name =
          u.hostname === 'localhost' || u.hostname === '127.0.0.1'
            ? t('pages.connection.localServer')
            : u.hostname
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    probeResult.value = { reachable: false, authEnabled: false }
  } finally {
    clearTimeout(timeoutId)
    if (!signal.aborted) {
      probing.value = false
    }
  }
}

onMounted(async () => {
  // If navigated here manually (e.g. "切换服务器"), skip auto-connect
  const route = useRoute()
  const isManual = route.query.manual === '1'

  if (!isManual) {
    // Auto-connect: try localhost:8642 first, then last saved server
    const ok = await connectionStore.autoConnect()
    if (ok) {
      router.replace({ name: 'Chat' })
      return
    }
  } else {
    // Manual switch — disconnect current server first
    try {
      await connectionStore.disconnect()
    } catch {
      /* best-effort */
    }
  }

  // Show manual connection UI
  autoConnecting.value = false
  await connectionStore.loadServers()
  checkAllServers()
  if (window.api?.isEncryptionAvailable) {
    encryptionAvailable.value = await window.api.isEncryptionAvailable()
  }
})

onUnmounted(() => {
  if (probeTimer) {
    clearTimeout(probeTimer)
    probeTimer = null
  }
  probeAbortController?.abort()
  probeAbortController = null
})

async function checkServerHealth(server: { id: string; url: string }) {
  serverHealth.value[server.id] = 'checking'
  const base = server.url.replace(/\/$/, '')
  try {
    await fetch(`${base}/`, { signal: AbortSignal.timeout(5000) })
    serverHealth.value[server.id] = 'online'
  } catch {
    serverHealth.value[server.id] = 'offline'
  }
}

function checkAllServers() {
  for (const server of connectionStore.servers) {
    checkServerHealth(server)
  }
}

function healthTagType(id: string): 'success' | 'error' | 'warning' | 'default' {
  const s = serverHealth.value[id]
  if (s === 'online') return 'success'
  if (s === 'offline') return 'error'
  if (s === 'checking') return 'warning'
  return 'default'
}

function healthLabel(id: string): string {
  const s = serverHealth.value[id]
  if (s === 'online') return t('pages.connection.healthOnline')
  if (s === 'offline') return t('pages.connection.healthOffline')
  if (s === 'checking') return t('pages.connection.healthChecking')
  return t('pages.connection.healthUnknown')
}

function openAddModal() {
  editingServerId.value = null
  form.value = { id: uuid(), name: '', url: '', username: '', password: '' }
  probeResult.value = null
  showAddModal.value = true
}

async function openEditModal(serverId: string) {
  const server = connectionStore.servers.find((s) => s.id === serverId)
  if (!server) return

  editingServerId.value = serverId

  const decryptedPw = window.api ? await window.api.decryptPassword(serverId) : ''
  const isNoAuth = server.username === '_noauth_' && decryptedPw === '_noauth_'

  form.value = {
    id: server.id,
    name: server.name,
    url: server.url.replace(/^https?:\/\//, ''),
    username: isNoAuth ? '' : server.username,
    password: isNoAuth ? '' : decryptedPw || ''
  }

  probeResult.value = null
  showAddModal.value = true
  if (probeTimer) clearTimeout(probeTimer)
  probeTimer = setTimeout(() => probeServer(), 200)
}

const canSave = computed(() => {
  // Address is always required
  if (!normalizedUrl.value) return false
  // If server confirmed no-auth, no token needed
  if (probeResult.value?.reachable && !probeResult.value.authEnabled) {
    return true
  }
  // Otherwise token is required (username is optional)
  return !!form.value.password
})

async function handleSave() {
  if (!normalizedUrl.value) {
    message.warning(t('pages.connection.validationNameUrl'))
    return
  }

  const isConfirmedNoAuth = probeResult.value?.reachable && !probeResult.value.authEnabled
  if (!isConfirmedNoAuth && !form.value.password) {
    message.warning(t('pages.connection.validationCredentials'))
    return
  }

  // Auto-fill name from hostname if left empty
  if (!form.value.name) {
    try {
      const u = new URL(normalizedUrl.value)
      form.value.name =
        u.hostname === 'localhost' || u.hostname === '127.0.0.1'
          ? t('pages.connection.localServer')
          : u.hostname
    } catch {
      form.value.name = normalizedUrl.value
    }
  }

  // Auto-fill username if left empty (display-only field)
  if (!form.value.username && !isConfirmedNoAuth) {
    form.value.username = 'admin'
  }

  try {
    await connectionStore.addServer({
      ...form.value,
      url: normalizedUrl.value,
      username: isConfirmedNoAuth ? '_noauth_' : form.value.username,
      password: isConfirmedNoAuth ? '_noauth_' : form.value.password
    })
    showAddModal.value = false
    message.success(
      editingServerId.value
        ? t('pages.connection.updateSuccess')
        : t('pages.connection.saveSuccess')
    )
    checkAllServers()
  } catch (e: unknown) {
    message.error(
      t('pages.connection.saveFailed') +
        ': ' +
        ((e as Error)?.message || t('pages.connection.unknownError'))
    )
  }
}

async function handleConnect(serverId: string) {
  connecting.value = true
  connectingServerId.value = serverId
  try {
    await connectionStore.connect(serverId)
    router.push({ name: 'Chat' })
  } catch (e) {
    if (e instanceof ConnectionError) {
      switch (e.type) {
        case 'network':
          message.error(e.message)
          break
        case 'auth':
          message.error(t('pages.connection.authFailed') + ': ' + e.message)
          break
        case 'timeout':
          message.error(e.message)
          break
        case 'server':
          message.error(t('pages.connection.serverError') + ': ' + e.message)
          break
        default:
          message.error(t('pages.connection.connectFailed') + ': ' + e.message)
      }
    } else {
      const server = connectionStore.servers.find((s) => s.id === serverId)
      const isNoAuth = server?.username === '_noauth_'
      message.error(
        isNoAuth
          ? t('pages.connection.connectFailedNoAuth')
          : t('pages.connection.connectFailedAuth')
      )
    }
  } finally {
    connecting.value = false
    connectingServerId.value = null
  }
}

async function handleDelete(serverId: string) {
  try {
    await connectionStore.deleteServer(serverId)
    message.success(t('pages.connection.deleted'))
  } catch (e) {
    console.error('Failed to delete server:', e)
    message.error(
      t('pages.connection.deleteFailed') + ': ' + (e instanceof Error ? e.message : String(e))
    )
  }
}

async function connectLocalHermes() {
  connectingLocal.value = true
  try {
    await connectionStore.connectLocal()
    router.push({ name: 'Chat' })
  } catch {
    message.error(t('pages.connection.localConnectFailed'))
  } finally {
    connectingLocal.value = false
  }
}
</script>

<template>
  <div class="connection-page">
    <!-- Auto-connect loading state -->
    <div v-if="autoConnecting" class="auto-connect-overlay">
      <img src="@/assets/hermes-girl-avatar.png" alt="Hermes" class="auto-connect-logo" />
      <NSpin size="medium" style="margin: 20px 0" />
      <p class="auto-connect-text">{{ t('pages.connection.autoConnecting') }}</p>
    </div>

    <div v-else class="connection-container">
      <!-- Logo + Title -->
      <div class="connection-header">
        <img src="@/assets/hermes-girl-avatar.png" alt="Hermes" class="connection-logo" />
        <h1 class="connection-title">Hermes Desktop</h1>
        <p class="connection-subtitle">{{ t('pages.connection.subtitle') }}</p>
      </div>

      <!-- Encryption warning -->
      <NAlert
        v-if="!encryptionAvailable"
        type="warning"
        :bordered="false"
        style="margin-bottom: 16px; border-radius: var(--card-radius-xl, 16px); font-size: 13px"
      >
        {{ t('pages.connection.encryptionWarning') }}
      </NAlert>

      <!-- Quick connect to local Hermes -->
      <NCard class="server-card" style="margin-bottom: 16px">
        <div class="local-hermes-row">
          <div class="local-hermes-info">
            <NSpace align="center" :size="8">
              <NIcon :component="FlashOutline" size="22" color="#63e2b7" />
              <div>
                <div style="font-size: 15px; font-weight: 600">
                  {{ t('pages.connection.localHermes') }}
                </div>
                <div style="font-size: 12px; opacity: 0.6">localhost:8642</div>
              </div>
            </NSpace>
          </div>
          <NButton
            type="primary"
            size="small"
            :loading="connectingLocal"
            @click="connectLocalHermes"
          >
            {{ t('pages.connection.connectLocal') }}
          </NButton>
        </div>
      </NCard>

      <!-- Server List -->
      <NCard class="server-card">
        <template #header>
          <NSpace align="center" justify="space-between" style="width: 100%">
            <span style="font-size: 16px; font-weight: 600">{{
              t('pages.connection.serverList')
            }}</span>
            <NSpace :size="8">
              <NTooltip>
                <template #trigger>
                  <NButton size="small" quaternary circle @click="checkAllServers">
                    <template #icon><NIcon :component="RefreshOutline" /></template>
                  </NButton>
                </template>
                {{ t('pages.connection.refreshStatus') }}
              </NTooltip>
              <NButton type="primary" size="small" @click="openAddModal">
                <template #icon><NIcon :component="AddOutline" /></template>
                {{ t('pages.connection.addServer') }}
              </NButton>
            </NSpace>
          </NSpace>
        </template>

        <div v-if="connectionStore.servers.length === 0" style="padding: 20px 0">
          <NEmpty :description="t('pages.connection.emptyHint')">
            <template #extra>
              <NButton size="small" @click="openAddModal">{{
                t('pages.connection.addFirst')
              }}</NButton>
            </template>
          </NEmpty>
        </div>

        <div v-else class="server-list">
          <div v-for="server in connectionStore.servers" :key="server.id" class="server-item">
            <div class="server-info">
              <div class="server-name-row">
                <NIcon
                  :component="DesktopOutline"
                  size="18"
                  style="opacity: 0.6; margin-right: 6px"
                />
                <span class="server-name">{{ server.name }}</span>
                <NTag
                  :type="healthTagType(server.id)"
                  size="small"
                  round
                  :bordered="false"
                  style="margin-left: 8px"
                >
                  {{ healthLabel(server.id) }}
                </NTag>
                <NTag
                  v-if="connectionStore.currentServer?.id === server.id"
                  size="small"
                  type="success"
                  round
                  :bordered="false"
                  style="margin-left: 4px"
                >
                  {{ t('pages.connection.connected') }}
                </NTag>
              </div>
              <div class="server-meta">
                <span class="server-url">{{ server.url }}</span>
                <NTag
                  v-if="server.username && server.username !== '_noauth_'"
                  size="tiny"
                  :bordered="false"
                  style="margin-left: 8px"
                  >{{ server.username }}</NTag
                >
                <NTag
                  v-else
                  size="tiny"
                  :bordered="false"
                  type="success"
                  style="margin-left: 8px"
                  >{{ t('pages.connection.noAuth') }}</NTag
                >
              </div>
            </div>
            <NSpace :size="8" align="center" class="server-actions">
              <NButton
                type="primary"
                size="small"
                :loading="connecting && connectingServerId === server.id"
                :disabled="connecting && connectingServerId !== server.id"
                @click="handleConnect(server.id)"
              >
                {{
                  connectionStore.currentServer?.id === server.id
                    ? t('pages.connection.reconnect')
                    : t('pages.connection.connect')
                }}
              </NButton>
              <NTooltip>
                <template #trigger>
                  <NButton size="small" quaternary @click="openEditModal(server.id)">
                    <template #icon><NIcon :component="CreateOutline" /></template>
                  </NButton>
                </template>
                {{ t('pages.connection.edit') }}
              </NTooltip>
              <NPopconfirm @positive-click="() => void handleDelete(server.id)">
                <template #trigger>
                  <NButton size="small" quaternary>
                    <template #icon><NIcon :component="TrashOutline" /></template>
                  </NButton>
                </template>
                {{ t('pages.connection.deleteConfirm') }}
              </NPopconfirm>
            </NSpace>
          </div>
        </div>
      </NCard>

      <!-- Platform Help -->
      <div class="platform-hints">
        <p class="hint-title">{{ t('pages.connection.supportedPlatforms') }}</p>
        <NSpace :size="16" justify="center">
          <NSpace align="center" :size="4">
            <NIcon :component="LogoApple" size="18" />
            <span>macOS</span>
          </NSpace>
          <NSpace align="center" :size="4">
            <NIcon :component="LogoWindows" size="18" />
            <span>Windows</span>
          </NSpace>
          <NSpace align="center" :size="4">
            <NIcon :component="LogoTux" size="18" />
            <span>Linux</span>
          </NSpace>
        </NSpace>
        <p class="hint-desc">{{ t('pages.connection.platformHint') }}</p>
      </div>
    </div>

    <!-- Add Server Modal -->
    <NModal
      v-model:show="showAddModal"
      preset="card"
      :title="
        editingServerId ? t('pages.connection.modalTitleEdit') : t('pages.connection.modalTitleAdd')
      "
      style="width: 520px"
      :bordered="false"
    >
      <NForm label-placement="top">
        <!-- ═══ Required: Address ═══ -->
        <NFormItem>
          <template #label>
            <NSpace :size="6" align="center">
              <span>{{ t('pages.connection.labelAddress') }}</span>
              <NTag size="tiny" type="warning" :bordered="false">{{
                t('pages.connection.labelAddressRequired')
              }}</NTag>
            </NSpace>
          </template>
          <NInput v-model:value="form.url" :placeholder="t('pages.connection.placeholderAddress')">
            <template #suffix>
              <NSpin v-if="probing" :size="14" />
              <NIcon
                v-else-if="probeResult?.reachable"
                :component="CheckmarkCircleOutline"
                color="#18a058"
              />
            </template>
          </NInput>
        </NFormItem>

        <!-- Probe feedback -->
        <div v-if="probeResult && !probing" style="margin-bottom: 16px">
          <NAlert
            v-if="probeResult.isHermesRest && !probeResult.authEnabled"
            type="success"
            :bordered="false"
            style="font-size: 13px"
          >
            <template #icon><NIcon :component="FlashOutline" /></template>
            {{ t('pages.connection.probeHermesRest') }}
          </NAlert>
          <NAlert
            v-else-if="probeResult.isHermesRest && probeResult.authEnabled"
            type="info"
            :bordered="false"
            style="font-size: 13px"
          >
            <template #icon><NIcon :component="FlashOutline" /></template>
            {{ t('pages.connection.probeHermesRestAuth') }}
          </NAlert>
          <NAlert
            v-else-if="probeResult.reachable && !probeResult.authEnabled"
            type="success"
            :bordered="false"
            style="font-size: 13px"
          >
            <template #icon><NIcon :component="FlashOutline" /></template>
            {{ t('pages.connection.probeNoAuth') }}
          </NAlert>
          <NAlert
            v-else-if="probeResult.reachable && probeResult.authEnabled"
            type="info"
            :bordered="false"
            style="font-size: 13px"
          >
            {{ t('pages.connection.probeAuth') }}
          </NAlert>
          <NAlert v-else type="error" :bordered="false" style="font-size: 13px">
            {{ t('pages.connection.probeUnreachable') }}
          </NAlert>
        </div>

        <NAlert
          v-if="isHttpWarning && !probeResult"
          type="warning"
          :bordered="false"
          style="margin-bottom: 16px; font-size: 12px"
        >
          {{ t('pages.connection.httpWarning') }}
        </NAlert>

        <!-- ═══ Required: Gateway Token (only if auth enabled or unknown) ═══ -->
        <template v-if="!probeResult || probeResult.authEnabled">
          <NFormItem>
            <template #label>
              <NSpace :size="6" align="center">
                <span>{{ t('pages.connection.labelToken') }}</span>
                <NTag size="tiny" type="warning" :bordered="false">{{
                  t('pages.connection.labelTokenRequired')
                }}</NTag>
              </NSpace>
            </template>
            <NInput
              v-model:value="form.password"
              type="password"
              show-password-on="click"
              :placeholder="t('pages.connection.placeholderToken')"
            />
          </NFormItem>
          <NAlert :bordered="false" type="info" style="margin-bottom: 16px; font-size: 12px">
            {{ t('pages.connection.tokenHint') }}
          </NAlert>
        </template>

        <!-- ═══ Optional: Name ═══ -->
        <NFormItem>
          <template #label>
            <NSpace :size="6" align="center">
              <span>{{ t('pages.connection.labelName') }}</span>
              <NTag size="tiny" :bordered="false">{{
                t('pages.connection.labelNameOptional')
              }}</NTag>
            </NSpace>
          </template>
          <NInput v-model:value="form.name" :placeholder="t('pages.connection.placeholderName')" />
        </NFormItem>

        <!-- ═══ Optional: Username ═══ -->
        <template v-if="!probeResult || probeResult.authEnabled">
          <NFormItem>
            <template #label>
              <NSpace :size="6" align="center">
                <span>{{ t('pages.connection.labelUsername') }}</span>
                <NTag size="tiny" :bordered="false">{{
                  t('pages.connection.labelUsernameOptional')
                }}</NTag>
              </NSpace>
            </template>
            <NInput
              v-model:value="form.username"
              :placeholder="t('pages.connection.placeholderUsername')"
            />
          </NFormItem>
        </template>

        <!-- Manual probe button -->
        <NFormItem v-if="!probeResult && normalizedUrl" :show-label="false">
          <NButton size="small" :loading="probing" style="width: 100%" @click="probeServer">
            <template #icon><NIcon :component="FlashOutline" /></template>
            {{ t('pages.connection.probeButton') }}
          </NButton>
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showAddModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :disabled="!canSave" @click="handleSave">{{
            editingServerId ? t('pages.connection.save') : t('pages.connection.add')
          }}</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.connection-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: var(--bg-secondary, #f5f7fa);
  -webkit-app-region: drag;
}

.connection-page * {
  -webkit-app-region: no-drag;
}

.auto-connect-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  -webkit-app-region: drag;
}

.auto-connect-logo {
  width: 88px;
  height: 88px;
  border-radius: 22px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.16),
    0 18px 42px rgba(0, 0, 0, 0.24);
}

.auto-connect-text {
  font-size: 14px;
  color: var(--text-secondary, #64748b);
  margin: 0;
}

.connection-header {
  -webkit-app-region: drag;
  text-align: center;
  margin-bottom: 32px;
}

.connection-container {
  width: 520px;
  padding: 40px 0;
}

.connection-logo {
  width: 96px;
  height: 96px;
  margin-bottom: 18px;
  border-radius: 24px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.16),
    0 20px 48px rgba(0, 0, 0, 0.24);
}

.connection-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #1a1a2e);
  margin: 0 0 4px 0;
}

.connection-subtitle {
  font-size: 14px;
  color: var(--text-secondary, #64748b);
  margin: 0;
}

.server-card {
  border-radius: var(--card-radius-xl, 16px);
  border-color: var(--border-color, #e2e8f0);
  background: var(--bg-card, #fff);
  box-shadow: var(--shadow-sm);
}

.server-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.server-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 8px;
  border-radius: 8px;
  transition: background 0.15s;
}

.server-item:hover {
  background: var(--bg-secondary, #f5f7fa);
}

.server-info {
  flex: 1;
  min-width: 0;
}

.server-name-row {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.server-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.server-meta {
  display: flex;
  align-items: center;
  padding-left: 24px;
}

.server-url {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
}

.server-actions {
  flex-shrink: 0;
}

.platform-hints {
  text-align: center;
  margin-top: 24px;
  padding: 16px;
  opacity: 0.7;
}

.hint-title {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
}

.hint-desc {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 8px 0 0 0;
  line-height: 1.5;
}

.local-hermes-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.local-hermes-info {
  flex: 1;
  min-width: 0;
}
</style>
