<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch, provide, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton, NCard, NCollapse, NCollapseItem, NDataTable, NDrawer, NDrawerContent,
  NGrid, NGridItem, NIcon, NInput, NPopconfirm, NSelect, NSpace, NSwitch,
  NTag, NText, useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { ExtensionPuzzleOutline, RefreshOutline, AddOutline, TrashOutline, LinkOutline } from '@vicons/ionicons5'
import { useSkillStore } from '@/stores/skill'
import type { SkillMeta } from '@/api/types'

const { t } = useI18n()
const message = useMessage()
const skillStore = useSkillStore()

// ── Filters ──
const searchQuery = ref('')
const categoryFilter = ref<string | null>(null)
const statusFilter = ref<string | null>(null)

const categoryOptions = computed(() => [
  { label: t('pages.skills.categoryAll'), value: null as any },
  ...skillStore.categories.map((c) => ({ label: c, value: c })),
])

const statusOptions = computed(() => [
  { label: t('pages.skills.statusAll'), value: null as any },
  { label: t('pages.skills.statusEnabled'), value: 'enabled' },
  { label: t('pages.skills.statusDisabled'), value: 'disabled' },
])

const sourceType = computed(() => (skillStore.source === 'server' ? 'success' : 'warning'))
const sourceLabel = computed(() =>
  skillStore.source === 'server'
    ? t('pages.skills.source.server')
    : t('pages.skills.source.local'),
)

const filteredSkills = computed(() => {
  let list = skillStore.skills
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.tags || []).some((tag) => tag.toLowerCase().includes(q)),
    )
  }
  if (categoryFilter.value) {
    list = list.filter((s) => s.category === categoryFilter.value)
  }
  if (statusFilter.value === 'enabled') {
    list = list.filter((s) => !skillStore.isDisabled(s.name))
  } else if (statusFilter.value === 'disabled') {
    list = list.filter((s) => skillStore.isDisabled(s.name))
  }
  return list
})

// ── Responsive ──
const windowWidth = ref(window.innerWidth)
const isNarrow = computed(() => windowWidth.value < 900)
const drawerVisible = ref(false)

function onResize() {
  windowWidth.value = window.innerWidth
}
onMounted(() => {
  window.addEventListener('resize', onResize)
  if (skillStore.skills.length === 0) skillStore.fetchSkills()
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  if (configDebounceTimer) {
    clearTimeout(configDebounceTimer)
    configDebounceTimer = null
  }
})

// ── Selection ──
function selectSkill(name: string) {
  skillStore.selectedSkillName = name
  if (isNarrow.value) drawerVisible.value = true
}

// ── Toggle ──
async function handleToggle(name: string) {
  const ok = await skillStore.toggleSkill(name)
  if (ok) {
    const isNowDisabled = skillStore.isDisabled(name)
    message.success(
      isNowDisabled
        ? t('pages.skills.toggle.disabled', { name })
        : t('pages.skills.toggle.enabled', { name }),
    )
  } else {
    message.error(t('pages.skills.toggle.failed'))
  }
}

// ── Config var editing ──
const configEditValues = ref<Record<string, string>>({})
let configDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => skillStore.selectedSkillName,
  () => {
    // Cancel pending debounce on selection change
    if (configDebounceTimer) {
      clearTimeout(configDebounceTimer)
      configDebounceTimer = null
    }
    // Pre-fill config values for selected skill
    configEditValues.value = {}
    const skill = skillStore.selectedSkill
    if (skill?.configVars) {
      for (const cv of skill.configVars) {
        const stored = getNestedValue(skillStore.configValues, cv.key)
        configEditValues.value[cv.key] = stored != null ? String(stored) : ''
      }
    }
  },
)

function getNestedValue(obj: any, dotPath: string): any {
  const keys = dotPath.split('.')
  let current = obj
  for (const k of keys) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[k]
  }
  return current
}

async function handleConfigSave(key: string) {
  if (configDebounceTimer) clearTimeout(configDebounceTimer)
  const value = configEditValues.value[key] || ''
  const ok = await skillStore.setConfigValue(key, value)
  if (ok) {
    message.success(t('pages.skills.detail.configSaved'))
  } else {
    message.error(t('pages.skills.detail.configFailed'))
  }
}

function handleConfigInput(key: string) {
  if (configDebounceTimer) clearTimeout(configDebounceTimer)
  configDebounceTimer = setTimeout(() => handleConfigSave(key), 500)
}

// Provide config editing context to SkillDetail child component
provide('configEditValues', configEditValues)
provide('handleConfigInput', handleConfigInput)
provide('handleConfigSave', handleConfigSave)

// ── External dirs ──
const newDirPath = ref('')

async function handleAddDir() {
  const path = newDirPath.value.trim()
  if (!path) return
  const ok = await skillStore.addExternalDir(path)
  if (ok) {
    message.success(t('pages.skills.externalDirs.added'))
    newDirPath.value = ''
  } else {
    message.error(t('pages.skills.externalDirs.failed'))
  }
}

async function handleRemoveDir(path: string) {
  const ok = await skillStore.removeExternalDir(path)
  if (ok) {
    message.success(t('pages.skills.externalDirs.removed'))
  } else {
    message.error(t('pages.skills.externalDirs.failed'))
  }
}

// ── Table columns ──
const columns = computed<DataTableColumns<SkillMeta>>(() => [
  {
    title: t('pages.skills.columns.name'),
    key: 'name',
    minWidth: 280,
    ellipsis: { tooltip: true },
    render(row) {
      return h('div', [
        h(NText, { strong: true, style: 'display:block' }, { default: () => row.name }),
        h(NText, { depth: 3, style: 'font-size:12px' }, { default: () => row.description || '' }),
      ])
    },
  },
  {
    title: t('pages.skills.columns.category'),
    key: 'category',
    width: 120,
    render(row) {
      return h(NTag, { size: 'small', bordered: false, round: true }, { default: () => row.category })
    },
  },
  {
    title: t('pages.skills.columns.platform'),
    key: 'platforms',
    width: 100,
    render(row) {
      if (!row.platforms.length) {
        return h(NText, { depth: 3, style: 'font-size:12px' }, { default: () => t('pages.skills.detail.platformAll') })
      }
      return h(NSpace, { size: 4 }, {
        default: () => row.platforms.map((p) =>
          h(NTag, { size: 'tiny', type: 'success', bordered: false, round: true }, { default: () => p }),
        ),
      })
    },
  },
  {
    title: t('pages.skills.columns.status'),
    key: 'status',
    width: 80,
    render(row) {
      return h(NSwitch, {
        value: !skillStore.isDisabled(row.name),
        'onUpdate:value': () => handleToggle(row.name),
        size: 'small',
      })
    },
  },
])

function rowClassName(row: SkillMeta): string {
  return row.name === skillStore.selectedSkillName ? 'skills-row-selected' : ''
}

function rowProps(row: SkillMeta) {
  return {
    style: 'cursor: pointer',
    onClick: () => selectSkill(row.name),
  }
}
</script>

<template>
  <NSpace vertical :size="16">
    <!-- Zone 1: Metrics + Filters -->
    <NCard>
      <template #header>
        <NSpace align="center" :size="8">
          <NIcon :component="ExtensionPuzzleOutline" :size="20" />
          <span>{{ t('pages.skills.title') }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NSpace align="center" :size="8">
          <NTag size="small" :type="sourceType" round>
            {{ sourceLabel }}
          </NTag>
          <NButton secondary size="small" @click="skillStore.fetchSkills()" :loading="skillStore.loading">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('pages.skills.refresh') }}
          </NButton>
        </NSpace>
      </template>

      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="10" :y-gap="10">
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.metrics.total') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">{{ skillStore.skills.length }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.metrics.enabled') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              <NText type="success">{{ skillStore.enabledCount }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.metrics.disabled') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              <NText type="error">{{ skillStore.disabledCount }}</NText>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.metrics.configVars') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              <NText type="info">{{ skillStore.configVarCount }}</NText>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Filter bar -->
      <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
        <NInput
          v-model:value="searchQuery"
          clearable
          :placeholder="t('pages.skills.search')"
          style="flex: 1; min-width: 200px;"
        />
        <NSelect
          v-model:value="categoryFilter"
          :options="categoryOptions"
          :placeholder="t('pages.skills.categoryFilter')"
          clearable
          style="width: 160px;"
        />
        <NSelect
          v-model:value="statusFilter"
          :options="statusOptions"
          :placeholder="t('pages.skills.statusFilter')"
          clearable
          style="width: 140px;"
        />
      </div>
      <NText v-if="skillStore.sourceError" type="warning" style="font-size: 12px; margin-top: 8px; display: block;">
        {{ t('pages.skills.source.fallback', { error: skillStore.sourceError }) }}
      </NText>
    </NCard>

    <!-- Empty state -->
    <NCard v-if="!skillStore.loading && skillStore.skills.length === 0">
      <div style="text-align: center; padding: 40px;">
        <NText depth="3">{{ t('pages.skills.empty') }}</NText>
      </div>
    </NCard>

    <!-- Zone 2+3: Table + Detail -->
    <div v-else style="display: flex; gap: 12px; align-items: flex-start;">
      <!-- Left: Table -->
      <NCard :style="{ flex: isNarrow ? '1' : '0 0 60%', minWidth: 0 }">
        <NDataTable
          :columns="columns"
          :data="filteredSkills"
          :row-key="(row: SkillMeta) => row.name"
          :row-class-name="rowClassName"
          :row-props="rowProps"
          :loading="skillStore.loading"
          :scroll-x="600"
          size="small"
          :pagination="{ pageSize: 20 }"
        />
      </NCard>

      <!-- Right: Detail Panel (wide screen) -->
      <NCard v-if="!isNarrow" style="flex: 0 0 38%; min-width: 280px; position: sticky; top: 12px;">
        <div v-if="!skillStore.selectedSkill" style="text-align: center; padding: 40px;">
          <NText depth="3">{{ t('pages.skills.detail.empty') }}</NText>
        </div>
        <SkillDetail v-else />
      </NCard>
    </div>

    <!-- Drawer for narrow screens -->
    <NDrawer v-model:show="drawerVisible" :width="360" placement="right">
      <NDrawerContent :title="skillStore.selectedSkill?.name || ''">
        <SkillDetail v-if="skillStore.selectedSkill" />
      </NDrawerContent>
    </NDrawer>

    <!-- External Directories -->
    <NCard>
      <NCollapse>
        <NCollapseItem :title="t('pages.skills.externalDirs.title')" name="external-dirs">
          <div v-if="skillStore.externalDirs.length === 0" style="text-align: center; padding: 16px;">
            <NText depth="3">{{ t('pages.skills.externalDirs.empty') }}</NText>
          </div>
          <div v-else style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
            <div
              v-for="dir in skillStore.externalDirs"
              :key="dir"
              style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--n-color-embedded); border-radius: 6px;"
            >
              <NText code style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;">{{ dir }}</NText>
              <NPopconfirm @positive-click="handleRemoveDir(dir)">
                <template #trigger>
                  <NButton size="tiny" type="error" quaternary>
                    <template #icon><NIcon :component="TrashOutline" /></template>
                  </NButton>
                </template>
                {{ t('pages.skills.externalDirs.confirmRemove') }}
              </NPopconfirm>
            </div>
          </div>
          <NSpace>
            <NInput
              v-model:value="newDirPath"
              :placeholder="t('pages.skills.externalDirs.placeholder')"
              style="width: 300px;"
              @keyup.enter="handleAddDir"
            />
            <NButton type="primary" @click="handleAddDir" :disabled="!newDirPath.trim()">
              <template #icon><NIcon :component="AddOutline" /></template>
              {{ t('pages.skills.externalDirs.add') }}
            </NButton>
          </NSpace>
        </NCollapseItem>
      </NCollapse>
    </NCard>
  </NSpace>
</template>

<!-- Inline SkillDetail component using provide/inject instead of $parent -->
<script lang="ts">
import { defineComponent, inject } from 'vue'

const SkillDetail = defineComponent({
  name: 'SkillDetail',
  setup() {
    const skillStore = useSkillStore()
    const { t } = useI18n()
    const message = useMessage()
    const configEditValues = inject<Ref<Record<string, string>>>('configEditValues')!
    const handleConfigInput = inject<(key: string) => void>('handleConfigInput')!
    return { skillStore, t, message, configEditValues, handleConfigInput }
  },
  computed: {
    skill() {
      return this.skillStore.selectedSkill
    },
  },
  render() {
    const skill = this.skill
    if (!skill) return null
    const { t, skillStore, configEditValues, handleConfigInput } = this

    return h(NSpace, { vertical: true, size: 16 }, {
      default: () => [
        // Header
        h('div', [
          h(NText, { strong: true, style: 'font-size: 18px; display: block;' }, { default: () => skill.name }),
          h(NText, { depth: 3, style: 'font-size: 13px; margin-top: 4px; display: block;' }, { default: () => skill.description }),
        ]),

        // Meta info
        h(NSpace, { size: 8, style: 'flex-wrap: wrap;' }, {
          default: () => [
            skill.version ? h(NTag, { size: 'small', bordered: false }, { default: () => `v${skill.version}` }) : null,
            skill.author ? h(NTag, { size: 'small', bordered: false }, { default: () => skill.author }) : null,
            skill.license ? h(NTag, { size: 'small', bordered: false }, { default: () => skill.license }) : null,
          ].filter(Boolean),
        }),

        // Platforms
        h(NSpace, { size: 4 }, {
          default: () =>
            skill.platforms.length
              ? skill.platforms.map((p: string) =>
                  h(NTag, { size: 'small', type: 'success', bordered: false, round: true }, { default: () => p }),
                )
              : [h(NTag, { size: 'small', bordered: false, round: true }, { default: () => t('pages.skills.detail.platformAll') })],
        }),

        // Tags
        skill.tags?.length
          ? h('div', [
              h(NText, { depth: 3, style: 'font-size: 12px; display: block; margin-bottom: 4px;' }, { default: () => t('pages.skills.detail.tags') }),
              h(NSpace, { size: 4 }, {
                default: () => skill.tags!.map((tag: string) => h(NTag, { size: 'tiny', bordered: false }, { default: () => tag })),
              }),
            ])
          : null,

        // Toggle
        h(
          'div',
          {
            style:
              'display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-top: 1px solid var(--n-border-color); border-bottom: 1px solid var(--n-border-color);',
          },
          [
            h(NText, {}, {
              default: () =>
                skillStore.isDisabled(skill.name) ? t('pages.skills.detail.disabled') : t('pages.skills.detail.enabled'),
            }),
            h(NSwitch, {
              value: !skillStore.isDisabled(skill.name),
              'onUpdate:value': async () => {
                const ok = await skillStore.toggleSkill(skill.name)
                if (ok) {
                  const msg = skillStore.isDisabled(skill.name)
                    ? t('pages.skills.toggle.disabled', { name: skill.name })
                    : t('pages.skills.toggle.enabled', { name: skill.name })
                  this.message.success(msg)
                } else {
                  this.message.error(t('pages.skills.toggle.failed'))
                }
              },
            }),
          ],
        ),

        // Prerequisites
        h('div', [
          h(NText, { strong: true, style: 'font-size: 13px; display: block; margin-bottom: 6px;' }, {
            default: () => t('pages.skills.detail.prerequisites'),
          }),
          skill.prerequisites?.commands?.length || skill.prerequisites?.env_vars?.length
            ? h(NSpace, { vertical: true, size: 4 }, {
                default: () => [
                  ...(skill.prerequisites?.commands || []).map((cmd: string) =>
                    h(NText, { code: true, style: 'font-size: 12px;' }, { default: () => cmd }),
                  ),
                  ...(skill.prerequisites?.env_vars || []).map((env: string) =>
                    h(NText, { code: true, style: 'font-size: 12px;' }, { default: () => `$${env}` }),
                  ),
                ],
              })
            : h(NText, { depth: 3, style: 'font-size: 12px;' }, { default: () => t('pages.skills.detail.noPrerequisites') }),
        ]),

        // Config Variables
        h('div', [
          h(NText, { strong: true, style: 'font-size: 13px; display: block; margin-bottom: 6px;' }, {
            default: () => t('pages.skills.detail.configVars'),
          }),
          skill.configVars?.length
            ? h(NSpace, { vertical: true, size: 8 }, {
                default: () =>
                  skill.configVars!.map((cv: any) =>
                    h('div', { key: cv.key }, [
                      h(NText, { code: true, style: 'font-size: 12px; display: block;' }, { default: () => cv.key }),
                      cv.description
                        ? h(NText, { depth: 3, style: 'font-size: 11px; display: block; margin: 2px 0;' }, { default: () => cv.description })
                        : null,
                      h(NInput, {
                        size: 'small',
                        value: configEditValues[cv.key] ?? '',
                        placeholder:
                          cv.default != null ? `${t('pages.skills.detail.configDefault', { value: cv.default })}` : '',
                        onBlur: () => handleConfigInput(cv.key),
                        onKeyup: (e: KeyboardEvent) => {
                          if (e.key === 'Enter') handleConfigInput(cv.key)
                        },
                        'onUpdate:value': (val: string) => {
                          configEditValues[cv.key] = val
                        },
                      }),
                    ]),
                  ),
              })
            : h(NText, { depth: 3, style: 'font-size: 12px;' }, { default: () => t('pages.skills.detail.noConfigVars') }),
        ]),

        // Related Skills
        skill.relatedSkills?.length
          ? h('div', [
              h(NText, { strong: true, style: 'font-size: 13px; display: block; margin-bottom: 6px;' }, {
                default: () => t('pages.skills.detail.relatedSkills'),
              }),
              h(NSpace, { size: 4 }, {
                default: () => skill.relatedSkills!.map((rs: string) => h(NTag, { size: 'small', bordered: false }, { default: () => rs })),
              }),
            ])
          : null,

        // Homepage
        skill.homepage
          ? h('div', { style: 'display: flex; align-items: center; gap: 4px;' }, [
              h(NIcon, { component: LinkOutline, size: 14 }),
              h(NText, { depth: 3, style: 'font-size: 12px;' }, { default: () => skill.homepage }),
            ])
          : null,
      ].filter(Boolean),
    })
  },
})
</script>

<style scoped>
:deep(.skills-row-selected td) {
  background-color: var(--n-color-hover) !important;
}
</style>
