<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NEmpty,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputGroup,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import {
  AddOutline,
  PlayOutline,
  RefreshOutline,
  SaveOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faPaperPlane,
} from '@fortawesome/free-solid-svg-icons'
import { useI18n } from 'vue-i18n'
import { useChannelManagementStore } from '@/stores/channel-management'
import {
  collectSecretFieldKeys,
  resolveChannelTemplate,
} from '@/utils/channel-config'
import { maskSecretValue } from '@/utils/secret-mask'

const FEISHU_META = {
  key: 'feishu' as const,
  pluginPackages: ['@openclaw-china/feishu-china', '@openclaw/feishu'],
  pluginIds: ['feishu', 'feishu-china'],
  guideUrl: 'https://github.com/openclaw/openclaw/blob/main/docs/zh-CN/channels/feishu.md',
}

type GroupPermission = 'main' | 'cron' | 'skill'

interface GroupEntry {
  id: string
  name: string
  permissions: GroupPermission[]
}

const ALL_PERMISSIONS: GroupPermission[] = ['main', 'cron', 'skill']

const channelStore = useChannelManagementStore()
const message = useMessage()
const { t } = useI18n()

const installLoading = ref(false)
const newGroupId = ref('')
const newGroupName = ref('')

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function shouldKeepStringValue(raw: string): string | undefined {
  const normalized = raw.trim()
  return normalized ? normalized : undefined
}

// ---------- feishu channel ----------

const feishuChannelKey = computed(() => {
  const draftKey = Object.keys(channelStore.channelsDraft).find(
    (key) => resolveChannelTemplate(key)?.key === 'feishu',
  )
  if (draftKey) return draftKey
  const runtimeKey = Object.keys(channelStore.runtimeByChannel).find(
    (key) => resolveChannelTemplate(key)?.key === 'feishu',
  )
  if (runtimeKey) return runtimeKey
  return 'feishu'
})

const feishuConfig = computed(() => asRecord(channelStore.channelsDraft[feishuChannelKey.value]))

const installStatusKnown = computed(
  () => channelStore.pluginRpcSupported || channelStore.runtimeChannels.length > 0,
)

const pluginInstalled = computed(() =>
  channelStore.isPluginInstalled(FEISHU_META.pluginPackages, {
    channelKey: feishuChannelKey.value,
    pluginIds: FEISHU_META.pluginIds,
  }),
)

const configured = computed(() => !!channelStore.channelsDraft[feishuChannelKey.value])

const visibleSecretKeys = computed(() => {
  if (!configured.value) return []
  const template = resolveChannelTemplate('feishu')
  return collectSecretFieldKeys(feishuConfig.value, template?.channelSecretFields || [])
})

// ---------- basic config ----------

const channelEnabled = computed(() => {
  const v = feishuConfig.value.enabled
  return typeof v === 'boolean' ? v : true
})

function updateChannelEnabled(value: boolean): void {
  channelStore.setChannelField(feishuChannelKey.value, 'enabled', value)
}

const channelAppId = computed(() => readString(feishuConfig.value.appId))

function updateChannelAppId(value: string): void {
  channelStore.setChannelField(feishuChannelKey.value, 'appId', shouldKeepStringValue(value))
}

// ---------- credentials ----------

function channelSecretValue(field: string): string {
  return maskSecretValue(feishuConfig.value[field])
}

function readSecretInput(field: string): string {
  return channelStore.getSecretUpdate({ channelKey: feishuChannelKey.value, field })
}

function updateSecretInput(field: string, value: string): void {
  channelStore.setSecretUpdate({ channelKey: feishuChannelKey.value, field }, value)
}

function hasSecretUpdate(field: string): boolean {
  return channelStore.hasSecretUpdate({ channelKey: feishuChannelKey.value, field })
}

// ---------- group permissions ----------

const groupEntries = computed<GroupEntry[]>(() => {
  const config = feishuConfig.value
  const groups = config.groups as Record<string, { name?: string; permissions?: string[] }> | undefined

  if (groups && typeof groups === 'object' && Object.keys(groups).length > 0) {
    return Object.entries(groups).map(([id, g]) => ({
      id,
      name: (g && typeof g === 'object' ? g.name : '') || '',
      permissions: (g && typeof g === 'object' && Array.isArray(g.permissions)
        ? g.permissions
        : []) as GroupPermission[],
    }))
  }

  // backward compat: derive from groupAllowFrom
  const allowFrom = config.groupAllowFrom
  if (Array.isArray(allowFrom) && allowFrom.length > 0) {
    return (allowFrom as string[]).map((id) => ({
      id: String(id),
      name: '',
      permissions: [...ALL_PERMISSIONS],
    }))
  }

  return []
})

function updateGroupsConfig(entries: GroupEntry[]) {
  const channelKey = feishuChannelKey.value

  const groups: Record<string, { name?: string; permissions: string[] }> = {}
  for (const entry of entries) {
    groups[entry.id] = {
      ...(entry.name ? { name: entry.name } : {}),
      permissions: [...entry.permissions],
    }
  }

  const allowFrom = entries.filter((e) => e.permissions.includes('main')).map((e) => e.id)

  channelStore.setChannelField(
    channelKey,
    'groups',
    Object.keys(groups).length > 0 ? groups : undefined,
  )
  channelStore.setChannelField(
    channelKey,
    'groupAllowFrom',
    allowFrom.length > 0 ? allowFrom : undefined,
  )
}

function addGroup() {
  const id = newGroupId.value.trim()
  if (!id) {
    message.warning(t('pages.channels.groups.idRequired'))
    return
  }
  if (groupEntries.value.some((e) => e.id === id)) {
    message.warning(t('pages.channels.groups.duplicate'))
    return
  }

  updateGroupsConfig([
    ...groupEntries.value,
    { id, name: newGroupName.value.trim(), permissions: [...ALL_PERMISSIONS] },
  ])
  newGroupId.value = ''
  newGroupName.value = ''
}

function removeGroup(groupId: string) {
  updateGroupsConfig(groupEntries.value.filter((e) => e.id !== groupId))
}

function toggleGroupPermission(groupId: string, perm: GroupPermission) {
  updateGroupsConfig(
    groupEntries.value.map((e) => {
      if (e.id !== groupId) return e
      const has = e.permissions.includes(perm)
      return {
        ...e,
        permissions: has ? e.permissions.filter((p) => p !== perm) : [...e.permissions, perm],
      }
    }),
  )
}

// ---------- plugin install ----------

function buildPluginInstallCommands(): string[] {
  return FEISHU_META.pluginPackages.map((pkg) => `openclaw plugins install ${pkg}`)
}

async function installFeishu(): Promise<void> {
  const label = t('pages.channels.channels.feishu.label')
  installLoading.value = true
  try {
    let installedPluginName = ''
    if (!pluginInstalled.value) {
      installedPluginName = await channelStore.installChannelPlugin(FEISHU_META.pluginPackages)
    }
    channelStore.ensureDraftChannel(feishuChannelKey.value)
    channelStore.setChannelField(feishuChannelKey.value, 'enabled', true)

    message.success(
      installedPluginName
        ? t('pages.channels.installSuccessWithPlugin', { channel: label, plugin: installedPluginName })
        : t('pages.channels.installSuccess', { channel: label }),
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : t('pages.channels.installFailed')
    if (/unknown method/i.test(msg) || /method not found/i.test(msg)) {
      message.error(t('pages.channels.remoteInstallUnsupported', { channel: label }))
    } else {
      message.error(t('pages.channels.remoteInstallFailed', { channel: label, error: msg }))
    }
  } finally {
    installLoading.value = false
  }
}

// ---------- actions ----------

async function handleRefresh(): Promise<void> {
  try {
    await channelStore.refreshAll()
  } catch {
    message.error(t('pages.channels.refreshFailed'))
  }
}

async function handleSave(applyAfterSave = false): Promise<void> {
  try {
    const patches = await channelStore.saveChannels({ apply: applyAfterSave })
    if (patches.length === 0) {
      message.info(t('pages.channels.noChanges'))
      return
    }
    message.success(applyAfterSave ? t('pages.channels.savedAndApplied') : t('pages.channels.saved'))
  } catch {
    message.error(applyAfterSave ? t('pages.channels.saveAndApplyFailed') : t('common.saveFailed'))
  }
}

onMounted(() => {
  handleRefresh()
})
</script>

<template>
  <NSpace vertical :size="16">
    <NCard :title="t('pages.channels.title')" class="channel-root-card">
      <template #header-extra>
        <NSpace :size="10" class="toolbar-actions">
          <NButton size="small" class="toolbar-btn toolbar-btn--refresh" @click="handleRefresh">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('common.refresh') }}
          </NButton>
          <NButton
            size="small"
            type="primary"
            class="toolbar-btn toolbar-btn--save"
            :loading="channelStore.saving"
            :disabled="channelStore.applying"
            @click="handleSave(false)"
          >
            <template #icon><NIcon :component="SaveOutline" /></template>
            {{ t('common.save') }}
          </NButton>
          <NButton
            size="small"
            type="warning"
            class="toolbar-btn toolbar-btn--apply"
            :loading="channelStore.saving || channelStore.applying"
            @click="handleSave(true)"
          >
            <template #icon><NIcon :component="PlayOutline" /></template>
            {{ t('common.saveAndApply') }}
          </NButton>
        </NSpace>
      </template>

      <NSpace vertical :size="12">
        <NAlert v-if="channelStore.lastError" type="error" :bordered="false">
          {{ channelStore.lastError }}
        </NAlert>

        <NSpin :show="channelStore.loading || channelStore.applying">
          <NSpace vertical :size="10">
            <!-- Feishu Status Bar -->
            <div class="feishu-status-bar">
              <NSpace align="center" :size="8" :wrap="true">
                <span class="channel-brand channel-brand--feishu">
                  <FontAwesomeIcon :icon="faPaperPlane" />
                </span>
                <NText strong>{{ t('pages.channels.channels.feishu.label') }}</NText>
                <NText depth="3" class="channel-key-text">{{ feishuChannelKey }}</NText>
                <NTag
                  :type="installStatusKnown ? (pluginInstalled ? 'success' : 'default') : (pluginInstalled ? 'success' : 'warning')"
                  size="small"
                  :bordered="false"
                >
                  {{
                    installStatusKnown
                      ? (pluginInstalled ? t('pages.channels.pluginStatus.installed') : t('pages.channels.pluginStatus.notInstalled'))
                      : (pluginInstalled ? t('pages.channels.pluginStatus.assumedInstalled') : t('pages.channels.pluginStatus.unknown'))
                  }}
                </NTag>
                <NTag
                  :type="configured ? 'success' : 'default'"
                  size="small"
                  :bordered="false"
                >
                  {{ configured ? t('pages.channels.configured') : t('pages.channels.notConfigured') }}
                </NTag>
              </NSpace>
            </div>

            <!-- Install -->
            <NCard
              v-if="!pluginInstalled || !configured"
              size="small"
              embedded
              :title="t('pages.channels.installCardTitle')"
            >
              <NSpace justify="space-between" align="center" class="channel-install-row">
                <NText depth="3">
                  {{
                    !pluginInstalled
                      ? (installStatusKnown
                          ? t('pages.channels.installHint.known', { channel: t('pages.channels.channels.feishu.label') })
                          : t('pages.channels.installHint.unknown', { channel: t('pages.channels.channels.feishu.label') }))
                      : t('pages.channels.installHint.installed', { channel: t('pages.channels.channels.feishu.label') })
                  }}
                </NText>
                <NButton type="primary" :loading="installLoading" @click="installFeishu">
                  <template #icon><NIcon :component="AddOutline" /></template>
                  {{
                    pluginInstalled
                      ? t('pages.channels.installActions.generateConfig')
                      : (installStatusKnown
                          ? t('pages.channels.installActions.installAndConfig')
                          : t('pages.channels.installActions.tryInstallAndConfig'))
                  }}
                </NButton>
              </NSpace>

              <NAlert v-if="!installStatusKnown" type="warning" :bordered="false" style="margin-top: 10px;">
                {{ t('pages.channels.remoteInstallFallback') }}
                <div v-for="command in buildPluginInstallCommands()" :key="command" style="margin-top: 6px;">
                  <code>{{ command }}</code>
                </div>
              </NAlert>
            </NCard>

            <!-- Basic Config -->
            <NCard v-if="configured" size="small" :title="t('pages.channels.basicConfigTitle')" embedded>
              <NForm label-placement="left" label-width="140" class="channel-config-form">
                <NFormItem :label="t('pages.channels.labels.enabled')">
                  <NSwitch :value="channelEnabled" @update:value="updateChannelEnabled" />
                </NFormItem>
                <NFormItem :label="t('pages.channels.labels.appId')">
                  <NInput :value="channelAppId" placeholder="App ID" @update:value="updateChannelAppId" />
                </NFormItem>
              </NForm>
            </NCard>

            <!-- Credentials -->
            <NCard v-if="configured" size="small" :title="t('pages.channels.credentialsTitle')" embedded>
              <NAlert type="info" :bordered="false" style="margin-bottom: 12px;">
                {{ t('pages.channels.credentialsHint') }}
              </NAlert>

              <NSpace v-if="visibleSecretKeys.length === 0" justify="center" style="padding: 8px 0;">
                <NText depth="3">{{ t('pages.channels.noSecretFields') }}</NText>
              </NSpace>

              <NForm v-else label-placement="left" label-width="160" class="channel-secret-form">
                <NFormItem v-for="field in visibleSecretKeys" :key="`secret-${field}`" :label="field">
                  <NInputGroup>
                    <NInput :value="channelSecretValue(field)" disabled style="width: 180px;" />
                    <NInput
                      type="password"
                      show-password-on="click"
                      :value="readSecretInput(field)"
                      :placeholder="t('pages.channels.placeholders.secret')"
                      @update:value="(v) => updateSecretInput(field, v)"
                    />
                    <NTag
                      v-if="hasSecretUpdate(field)"
                      type="warning"
                      :bordered="false"
                      style="align-self: center;"
                    >
                      {{ t('pages.channels.pendingUpdate') }}
                    </NTag>
                  </NInputGroup>
                </NFormItem>
              </NForm>
            </NCard>

            <!-- Group Chat Permissions -->
            <NCard v-if="configured" size="small" :title="t('pages.channels.groups.title')" embedded>
              <NAlert type="info" :bordered="false" style="margin-bottom: 12px;">
                {{ t('pages.channels.groups.hint') }}
              </NAlert>

              <div class="group-add-row">
                <NInput
                  v-model:value="newGroupId"
                  :placeholder="t('pages.channels.groups.addPlaceholderId')"
                  class="group-add-input"
                  @keydown.enter="addGroup"
                />
                <NInput
                  v-model:value="newGroupName"
                  :placeholder="t('pages.channels.groups.addPlaceholderName')"
                  class="group-add-input"
                  @keydown.enter="addGroup"
                />
                <NButton type="primary" @click="addGroup">
                  <template #icon><NIcon :component="AddOutline" /></template>
                  {{ t('pages.channels.groups.add') }}
                </NButton>
              </div>

              <div v-if="groupEntries.length === 0" class="group-empty">
                <NEmpty :description="t('pages.channels.groups.empty')" />
              </div>

              <template v-else>
                <div class="group-table">
                  <div class="group-row group-row--header">
                    <div class="group-cell group-cell--info">
                      <NText depth="3">{{ t('pages.channels.groups.columnId') }}</NText>
                    </div>
                    <div class="group-cell group-cell--perm" v-for="perm in ALL_PERMISSIONS" :key="`h-${perm}`">
                      <NText depth="3">{{ t(`pages.channels.groups.perm.${perm}`) }}</NText>
                    </div>
                    <div class="group-cell group-cell--action" />
                  </div>

                  <div v-for="group in groupEntries" :key="group.id" class="group-row">
                    <div class="group-cell group-cell--info">
                      <NText strong class="group-name">{{ group.name || group.id }}</NText>
                      <NText v-if="group.name" depth="3" class="group-id-sub">{{ group.id }}</NText>
                    </div>
                    <div class="group-cell group-cell--perm" v-for="perm in ALL_PERMISSIONS" :key="`${group.id}-${perm}`">
                      <NCheckbox
                        :checked="group.permissions.includes(perm)"
                        @update:checked="toggleGroupPermission(group.id, perm)"
                      />
                    </div>
                    <div class="group-cell group-cell--action">
                      <NButton text type="error" size="small" @click="removeGroup(group.id)">
                        <template #icon><NIcon :component="TrashOutline" /></template>
                      </NButton>
                    </div>
                  </div>
                </div>
              </template>
            </NCard>
          </NSpace>
        </NSpin>
      </NSpace>
    </NCard>
  </NSpace>
</template>

<style scoped>
.channel-root-card {
  --channel-card-border: var(--border-color);
  --channel-card-bg: var(--bg-card);
  --channel-soft-bg: var(--bg-secondary);
  --channel-text: var(--text-primary);
  --channel-text-muted: var(--text-secondary);
  --channel-link: #2563eb;
  --channel-link-hover: #1d4ed8;
  --channel-thanks-bg:
    radial-gradient(circle at 88% -30%, rgba(24, 160, 88, 0.2), transparent 42%),
    linear-gradient(125deg, rgba(32, 128, 240, 0.12), rgba(24, 160, 88, 0.08)),
    var(--channel-soft-bg);
  --channel-thanks-border: rgba(32, 128, 240, 0.24);
  --channel-pill-bg: rgba(32, 128, 240, 0.08);
  --channel-pill-bg-hover: rgba(32, 128, 240, 0.15);
  --channel-pill-border: rgba(32, 128, 240, 0.3);
  --toolbar-refresh-bg: var(--bg-primary);
  --toolbar-refresh-border: var(--border-color);
  --toolbar-refresh-text: var(--text-primary);
  --toolbar-refresh-bg-hover: var(--bg-secondary);
  --toolbar-refresh-shadow: 0 6px 14px rgba(15, 23, 42, 0.1);
  --toolbar-refresh-shadow-hover: 0 10px 18px rgba(15, 23, 42, 0.14);
  --toolbar-save-shadow: 0 8px 18px rgba(5, 150, 105, 0.26);
  --toolbar-save-shadow-hover: 0 12px 22px rgba(5, 150, 105, 0.32);
  --toolbar-apply-shadow: 0 8px 18px rgba(245, 158, 11, 0.26);
  --toolbar-apply-shadow-hover: 0 12px 22px rgba(245, 158, 11, 0.32);
  border-radius: 18px;
  border: 1px solid var(--channel-card-border);
  background: var(--channel-card-bg);
  box-shadow: var(--shadow-sm);
}

:global([data-theme='dark'] .channel-root-card) {
  --channel-link: #93c5fd;
  --channel-link-hover: #bfdbfe;
  --channel-thanks-border: rgba(147, 197, 253, 0.35);
  --channel-pill-bg: rgba(59, 130, 246, 0.18);
  --channel-pill-bg-hover: rgba(59, 130, 246, 0.26);
  --channel-pill-border: rgba(147, 197, 253, 0.32);
  --toolbar-refresh-shadow: 0 6px 14px rgba(0, 0, 0, 0.3);
  --toolbar-refresh-shadow-hover: 0 10px 18px rgba(0, 0, 0, 0.4);
  --toolbar-save-shadow: 0 8px 16px rgba(5, 150, 105, 0.22);
  --toolbar-save-shadow-hover: 0 10px 20px rgba(5, 150, 105, 0.28);
  --toolbar-apply-shadow: 0 8px 16px rgba(245, 158, 11, 0.22);
  --toolbar-apply-shadow-hover: 0 10px 20px rgba(245, 158, 11, 0.28);
}

.toolbar-actions {
  align-items: center;
}

:deep(.channel-root-card > .n-card-header) {
  padding-bottom: 10px;
}

:deep(.channel-root-card > .n-card__content) {
  padding-top: 12px;
}

.toolbar-actions :deep(.toolbar-btn.n-button) {
  min-width: 132px;
  height: 40px;
  border-radius: 12px;
  padding: 0 18px;
  font-weight: 700;
  letter-spacing: 0.2px;
  transition: transform 0.14s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.toolbar-actions :deep(.toolbar-btn .n-icon) {
  font-size: 16px;
}

.toolbar-actions :deep(.toolbar-btn:not(.n-button--disabled):hover) {
  transform: translateY(-1px);
}

.toolbar-actions :deep(.toolbar-btn:not(.n-button--disabled):active) {
  transform: translateY(0);
}

.toolbar-actions :deep(.toolbar-btn--refresh.n-button) {
  background: var(--toolbar-refresh-bg) !important;
  border: 1px solid var(--toolbar-refresh-border) !important;
  color: var(--toolbar-refresh-text) !important;
  box-shadow: var(--toolbar-refresh-shadow);
}

.toolbar-actions :deep(.toolbar-btn--refresh.n-button:not(.n-button--disabled):hover) {
  border-color: var(--toolbar-refresh-border) !important;
  background: var(--toolbar-refresh-bg-hover) !important;
  box-shadow: var(--toolbar-refresh-shadow-hover);
}

.toolbar-actions :deep(.toolbar-btn--save.n-button) {
  background: linear-gradient(135deg, #16a34a 0%, #059669 100%) !important;
  border: none !important;
  color: #ffffff !important;
  box-shadow: var(--toolbar-save-shadow);
}

.toolbar-actions :deep(.toolbar-btn--save.n-button:not(.n-button--disabled):hover) {
  filter: brightness(1.04);
  box-shadow: var(--toolbar-save-shadow-hover);
}

.toolbar-actions :deep(.toolbar-btn--apply.n-button) {
  background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%) !important;
  border: none !important;
  color: #ffffff !important;
  box-shadow: var(--toolbar-apply-shadow);
}

.toolbar-actions :deep(.toolbar-btn--apply.n-button:not(.n-button--disabled):hover) {
  filter: brightness(1.04);
  box-shadow: var(--toolbar-apply-shadow-hover);
}

.toolbar-actions :deep(.toolbar-btn.n-button.n-button--disabled) {
  opacity: 0.7;
  box-shadow: none !important;
}

.feishu-status-bar {
  border: 1px solid var(--channel-card-border);
  border-radius: 12px;
  padding: 10px 14px;
  background: var(--channel-card-bg);
}

.channel-brand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  color: #fff;
  font-size: 12px;
  box-shadow: 0 6px 12px rgba(15, 23, 42, 0.22);
}

.channel-brand--feishu {
  background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
}

.channel-key-text {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.channel-install-row {
  row-gap: 10px;
}

:deep(.channel-install-row .n-button) {
  flex-shrink: 0;
}

:deep(.n-card.n-card--embedded) {
  background: var(--channel-soft-bg);
  color: var(--channel-text);
  border-color: var(--channel-card-border);
}

:deep(.n-alert-body code),
:deep(code) {
  border-radius: 6px;
  border: 1px solid var(--channel-card-border);
  background: var(--bg-primary);
  color: var(--channel-text);
  padding: 2px 6px;
}

:deep(.channel-config-form .n-form-item),
:deep(.channel-secret-form .n-form-item) {
  margin-bottom: 10px;
}

:deep(.channel-config-form .n-form-item:last-child),
:deep(.channel-secret-form .n-form-item:last-child) {
  margin-bottom: 0;
}

/* ---------- group permissions ---------- */

.group-add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.group-add-input {
  flex: 1;
  min-width: 0;
}

.group-empty {
  padding: 20px 0;
}

.group-table {
  border: 1px solid var(--channel-card-border);
  border-radius: 10px;
  overflow: hidden;
}

.group-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  gap: 8px;
  transition: background-color 0.12s ease;
}

.group-row:not(.group-row--header):hover {
  background: rgba(32, 128, 240, 0.04);
}

.group-row--header {
  background: var(--channel-soft-bg);
  border-bottom: 1px solid var(--channel-card-border);
  padding: 6px 12px;
}

.group-row:not(:last-child):not(.group-row--header) {
  border-bottom: 1px solid rgba(128, 128, 128, 0.08);
}

.group-cell--info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-cell--perm {
  width: 64px;
  text-align: center;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-cell--action {
  width: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-id-sub {
  font-size: 12px;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .toolbar-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .toolbar-actions :deep(.toolbar-btn.n-button) {
    min-width: 118px;
  }
}

@media (max-width: 640px) {
  .group-add-row {
    flex-direction: column;
  }

  :deep(.channel-secret-form .n-input-group) {
    flex-wrap: wrap;
    gap: 8px;
  }

  :deep(.channel-secret-form .n-input-group > .n-input) {
    width: 100% !important;
  }

  .toolbar-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
