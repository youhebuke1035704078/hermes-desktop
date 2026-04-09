<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useOfficeStore } from '@/stores/office'
import { useAgentStore } from '@/stores/agent'
import { useSessionStore } from '@/stores/session'
import AgentChatPanel from '@/components/office/AgentChatPanel.vue'
import AgentsPage from '@/views/agents/AgentsPage.vue'
import {
  AddOutline,
  ChatbubblesOutline,
  RefreshOutline,
  ListOutline,
} from '@vicons/ionicons5'
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NIcon,
  NText,
  NTag,
  NAlert,
  NSpin,
  NDrawer,
  NDrawerContent,
  useMessage,
  type FormInst,
} from 'naive-ui'
import { PixelEngine, type CharacterData } from './pixel/PixelEngine'

const { t } = useI18n()
const message = useMessage()
const officeStore = useOfficeStore()
const agentStore = useAgentStore()
const sessionStore = useSessionStore()

/* ── Engine ─────────────────────────────────────────── */

const canvasRef = ref<HTMLDivElement>()
let engine: PixelEngine | null = null
const engineReady = ref(false)

/* ── State ──────────────────────────────────────────── */

const loading = ref(false)
const error = ref('')

// Chat panel
const showChatPanel = ref(false)

// Session picker popup
const showSessionPicker = ref(false)
const sessionPickerAgentId = ref<string | null>(null)
// Create agent modal
const showCreateModal = ref(false)
const createForm = ref({ agentId: '', name: '', workspace: '' })
const createFormRef = ref<FormInst>()
const creating = ref(false)

// Manage drawer
const showManageDrawer = ref(false)

/* ── Computed ───────────────────────────────────────── */

const agents = computed(() => officeStore.officeAgents)
const workingCount = computed(() => agents.value.filter(a => a.status === 'working').length)
const totalTokens = computed(() => agents.value.reduce((sum, a) => sum + a.totalTokens, 0))

const pickerSessions = computed(() => {
  if (!sessionPickerAgentId.value) return []
  return sessionStore.sessions
    .filter(s => s.agentId === sessionPickerAgentId.value)
    .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
})

/* ── Data loading ───────────────────────────────────── */

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    await Promise.all([
      agentStore.fetchAgents(),
      sessionStore.fetchSessions(),
    ])
  } catch (e: any) {
    error.value = e?.message || t('myworld.loadFailed')
  } finally {
    loading.value = false
  }
}

/* ── Engine ↔ Store sync ────────────────────────────── */

function syncCharacters() {
  if (!engine) return
  const current = new Set<string>()

  for (const agent of agents.value) {
    current.add(agent.id)

    const colorHex = parseInt((agent.color || '#4a90d9').replace('#', ''), 16)
    const charData: CharacterData = {
      id: agent.id,
      name: agent.name,
      emoji: agent.emoji || '',
      color: colorHex,
      status: agent.status === 'working' || agent.status === 'communicating'
        ? 'working'
        : 'idle',
    }
    engine.setCharacter(charData)
  }

  // Remove agents no longer present
  // We can't iterate engine's internal map, so we track IDs
}

/* ── Engine events ──────────────────────────────────── */

async function handleEngineEvent(evt: any) {
  switch (evt.type) {
    case 'click-character':
      officeStore.selectedAgentId = evt.id
      sessionPickerAgentId.value = evt.id
      // Refresh sessions before showing picker
      await sessionStore.fetchSessions()
      showSessionPicker.value = true
      break

    case 'click-floor':
      showSessionPicker.value = false
      break
  }
}

function selectSession(key: string) {
  showSessionPicker.value = false
  officeStore.selectedSessionKey = key
  showChatPanel.value = true
}

/* ── Create agent ───────────────────────────────────── */

function openCreateModal() {
  createForm.value = { agentId: '', name: '', workspace: '' }
  showCreateModal.value = true
}

async function handleCreateAgent() {
  try {
    await createFormRef.value?.validate()
  } catch { return }

  creating.value = true
  try {
    await agentStore.addAgent({
      id: createForm.value.agentId,
      name: createForm.value.name || createForm.value.agentId,
      workspace: createForm.value.workspace || undefined,
    })
    message.success(t('myworld.employeeCreated'))
    showCreateModal.value = false
    await loadData()
  } catch (e: any) {
    message.error(e?.message || t('myworld.loadFailed'))
  } finally {
    creating.value = false
  }
}

/* ── Zoom controls ──────────────────────────────────── */

function zoomIn() { engine?.setScale((engine?.getScale() ?? 3) + 0.5) }
function zoomOut() { engine?.setScale((engine?.getScale() ?? 3) - 0.5) }
function resetView() { engine?.resetCamera() }

/* ── Wander timer ───────────────────────────────────── */

let wanderTimer: ReturnType<typeof setInterval> | null = null

function startWandering() {
  wanderTimer = setInterval(() => {
    if (!engine) return
    for (const agent of agents.value) {
      if (agent.status === 'idle' && Math.random() < 0.15) {
        engine.wanderCharacter(agent.id)
      }
    }
  }, 4000)
}

/* ── Lifecycle ──────────────────────────────────────── */

onMounted(async () => {
  await loadData()

  if (canvasRef.value) {
    engine = new PixelEngine()
    try {
      await engine.init(canvasRef.value)
      engineReady.value = true
      engine.on(handleEngineEvent)
      syncCharacters()
      startWandering()
    } catch (e: any) {
      error.value = 'Engine init failed: ' + (e?.message || 'unknown')
    }
  }
})

onUnmounted(() => {
  if (wanderTimer) clearInterval(wanderTimer)
  engine?.destroy()
  engine = null
})

// Watch agent changes → sync to engine
watch(agents, () => {
  syncCharacters()
}, { deep: true })
</script>

<template>
  <div class="myworld-root">
    <!-- Toolbar -->
    <div class="myworld-toolbar">
      <div class="toolbar-left">
        <NText strong style="font-size: 14px;">
          {{ t('myworld.myEmployees') }}
        </NText>
      </div>
      <div class="toolbar-center">
        <NTag :bordered="false" round size="small" type="warning">
          <template #icon><NIcon :component="ChatbubblesOutline" :size="12" /></template>
          {{ workingCount }} {{ t('myworld.working') }}
        </NTag>
        <NTag :bordered="false" round size="small" type="info">
          {{ agents.length }} {{ t('myworld.totalEmployees') }}
        </NTag>
        <NTag :bordered="false" round size="small">
          {{ (totalTokens / 1000).toFixed(1) }}k tokens
        </NTag>
      </div>
      <div class="toolbar-right">
        <NButton size="tiny" quaternary @click="openCreateModal">
          <template #icon><NIcon :component="AddOutline" /></template>
          {{ t('myworld.addEmployee') }}
        </NButton>
        <NButton size="tiny" quaternary @click="showManageDrawer = true">
          <template #icon><NIcon :component="ListOutline" /></template>
          {{ t('myworld.manage') }}
        </NButton>
        <NButton size="tiny" quaternary @click="loadData">
          <template #icon><NIcon :component="RefreshOutline" /></template>
        </NButton>
      </div>
    </div>

    <!-- Main canvas area -->
    <div class="myworld-canvas-wrap">
      <NAlert v-if="error" type="error" :bordered="false" class="myworld-error">
        {{ error }}
      </NAlert>

      <NSpin :show="loading && !engineReady" class="myworld-spin">
        <div ref="canvasRef" class="myworld-canvas" />
      </NSpin>

      <!-- Zoom controls -->
      <div class="zoom-controls">
        <NButton size="tiny" quaternary @click="zoomIn">+</NButton>
        <NButton size="tiny" quaternary @click="zoomOut">−</NButton>
        <NButton size="tiny" quaternary @click="resetView">⟲</NButton>
      </div>

      <!-- Controls hint -->
      <div class="controls-hint">
        <NText depth="3" style="font-size: 11px;">
          {{ t('myworld.hints.scrollToZoom') }} · {{ t('myworld.hints.dragToPan') }} · {{ t('myworld.hints.clickToMove') }}
        </NText>
      </div>

      <!-- Session picker popup -->
      <NModal
        v-model:show="showSessionPicker"
        preset="card"
        size="small"
        :title="t('myworld.chat.title')"
        style="max-width: 320px;"
        :bordered="false"
      >
        <div v-if="pickerSessions.length === 0">
          <NText depth="3">{{ t('myworld.popup.noSessions') }}</NText>
        </div>
        <div v-else class="session-list">
          <div
            v-for="s in pickerSessions"
            :key="s.key"
            class="session-item"
            @click="selectSession(s.key)"
          >
            <NText strong style="font-size: 13px;">{{ s.label || s.key }}</NText>
            <NText depth="3" style="font-size: 11px;">{{ s.lastActivity }}</NText>
          </div>
        </div>
      </NModal>
    </div>

    <!-- Chat panel drawer -->
    <NDrawer v-model:show="showChatPanel" :width="600" placement="right">
      <NDrawerContent :title="t('myworld.chat.title')" closable>
        <AgentChatPanel />
      </NDrawerContent>
    </NDrawer>

    <!-- Create agent modal -->
    <NModal
      v-model:show="showCreateModal"
      preset="dialog"
      :title="t('myworld.addEmployee')"
      :positive-text="t('common.confirm')"
      :negative-text="t('common.cancel')"
      :positive-button-props="{ loading: creating }"
      @positive-click="handleCreateAgent"
    >
      <NForm ref="createFormRef" :model="createForm" label-placement="left" label-width="80">
        <NFormItem :label="t('myworld.employeeId')" path="agentId" :rule="{ required: true }">
          <NInput v-model:value="createForm.agentId" placeholder="e.g. dev-agent" />
        </NFormItem>
        <NFormItem :label="t('myworld.employeeName')" path="name">
          <NInput v-model:value="createForm.name" />
        </NFormItem>
        <NFormItem :label="t('myworld.workspace')" path="workspace">
          <NInput v-model:value="createForm.workspace" placeholder="/path/to/workspace" />
        </NFormItem>
      </NForm>
    </NModal>

    <!-- Agent management drawer -->
    <NDrawer v-model:show="showManageDrawer" :width="520" placement="right">
      <NDrawerContent :title="t('myworld.manage')" closable>
        <AgentsPage />
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
.myworld-root {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  min-height: 400px;
  position: relative;
}

.myworld-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--card-color);
  flex-shrink: 0;
  gap: 12px;
  border-radius: 8px 8px 0 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.myworld-canvas-wrap {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #0e0e1a;
  border-radius: 0 0 8px 8px;
}

.myworld-canvas {
  width: 100%;
  height: 100%;
}

.myworld-error {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  z-index: 10;
}

.myworld-spin {
  width: 100%;
  height: 100%;
}

.zoom-controls {
  position: absolute;
  bottom: 40px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 6px;
  padding: 4px;
}

.zoom-controls :deep(.n-button) {
  color: #fff;
  font-size: 16px;
  width: 28px;
  height: 28px;
}

.controls-hint {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.45);
  padding: 4px 12px;
  border-radius: 10px;
}

.controls-hint :deep(.n-text) {
  color: rgba(255, 255, 255, 0.6);
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.session-item {
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.session-item:hover {
  background: var(--hover-color);
}

</style>
