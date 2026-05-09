<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch, provide, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NButton, NCard, NCollapse, NCollapseItem, NDataTable, NDrawer, NDrawerContent,
  NGrid, NGridItem, NIcon, NInput, NPopconfirm, NSelect, NSpace, NSwitch,
  NTag, NText, useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { ExtensionPuzzleOutline, RefreshOutline, AddOutline, TrashOutline, LinkOutline, PlayOutline, CopyOutline } from '@vicons/ionicons5'
import { useSkillStore } from '@/stores/skill'
import { useCronStore } from '@/stores/cron'
import { writeTextToClipboard } from '@/utils/clipboard'
import type { CronJob, SkillMeta } from '@/api/types'

type SkillProcessStatusType = 'success' | 'warning' | 'error' | 'info' | 'default'
interface SkillProcessRow {
  key: string
  label: string
  detail: string
  type: SkillProcessStatusType
  status: string
}

const { t } = useI18n()
const message = useMessage()
const skillStore = useSkillStore()
const cronStore = useCronStore()
const router = useRouter()

// ── Filters ──
const searchQuery = ref('')
const categoryFilter = ref<string | null>(null)
const statusFilter = ref<string | null>(null)
const sourceFilter = ref<'user_created' | 'other' | null>(null)

const categoryOptions = computed(() => [
  { label: t('pages.skills.categoryAll'), value: null as any },
  ...skillStore.categories.map((c) => ({ label: c, value: c })),
])

const statusOptions = computed(() => [
  { label: t('pages.skills.statusAll'), value: null as any },
  { label: t('pages.skills.statusEnabled'), value: 'enabled' },
  { label: t('pages.skills.statusDisabled'), value: 'disabled' },
])

const skillSourceOptions = computed(() => [
  { label: t('pages.skills.sourceAll'), value: null as any },
  { label: t('pages.skills.sources.userCreated'), value: 'user_created' },
  { label: t('pages.skills.sourceOther'), value: 'other' },
])

const sourceType = computed(() => (skillStore.source === 'server' ? 'success' : 'warning'))
const sourceLabel = computed(() =>
  skillStore.source === 'server'
    ? t('pages.skills.source.server')
    : t('pages.skills.source.local'),
)
const userCreatedSkills = computed(() => skillStore.userCreatedSkills)
const priceWatchSkill = computed(() =>
  skillStore.skills.find(skill =>
    skill.name === 'jd-tongrentang-price-watch' ||
    skill.skillKey === 'jd-tongrentang-price-watch',
  ),
)
const priceWatchSkillStatus = computed(() => {
  const skill = priceWatchSkill.value
  if (!skill) return { label: '未同步', type: 'warning' as const }
  if (skillStore.isDisabled(skill.name)) return { label: '已停用', type: 'warning' as const }
  return { label: '已启用', type: 'success' as const }
})
const priceMonitorJobs = computed(() =>
  cronStore.jobs.filter(job => /jd-tongrentang-price-watch|tongrentang|cron-health|verification-gate/i.test(job.name)),
)
const priceFailedJobs = computed(() => priceMonitorJobs.value.filter(job => job.enabled && job.state?.lastStatus === 'error'))

function priceJobStatus(job: CronJob): { label: string; type: 'success' | 'warning' | 'error' | 'info' | 'default' } {
  if (!job.enabled) return { label: '已停用', type: 'default' }
  if (job.state?.runningAtMs) return { label: '运行中', type: 'info' }
  if (job.state?.lastStatus === 'ok') return { label: 'OK', type: 'success' }
  if (job.state?.lastStatus === 'error') return { label: '失败', type: 'error' }
  if (job.state?.lastStatus === 'skipped') return { label: '跳过', type: 'warning' }
  return { label: '等待', type: 'default' }
}

function findPriceJob(pattern: RegExp): CronJob | undefined {
  return priceMonitorJobs.value.find(job => pattern.test(job.name))
}

const priceBackfillJob = computed(() => findPriceJob(/backfill|补录|17:00|17：00/i))
const skillProcessRows = computed<SkillProcessRow[]>(() => {
  const gate = findPriceJob(/verification-gate|gate|07:20|07：20/i)
  const daily = findPriceJob(/jd-tongrentang-price-watch(?!.*backfill)/i)
  const watchdog = findPriceJob(/watchdog|11:00|11：00/i)
  const backfill = priceBackfillJob.value
  const alarm = findPriceJob(/evening|alarm|告警|17:30|17：30/i)
  const backup = findPriceJob(/backup|备份/i)
  const combinedIssue = (...jobs: Array<CronJob | undefined>) =>
    jobs.find(job => job?.enabled && job.state?.lastStatus === 'error')
  const combinedOk = (...jobs: Array<CronJob | undefined>) =>
    jobs.some(job => job?.enabled && job.state?.lastStatus === 'ok')

  return [
    {
      key: 'gate',
      label: '验证门控',
      detail: '检测是否需要人工解锁，不自动绕过验证。',
      type: gate ? priceJobStatus(gate).type : 'warning',
      status: gate ? priceJobStatus(gate).label : '未配置',
    },
    {
      key: 'collect',
      label: '采集与入库',
      detail: '采集 SKU 价格，落 SQLite，生成报告。',
      type: daily ? priceJobStatus(daily).type : 'warning',
      status: daily ? priceJobStatus(daily).label : '未配置',
    },
    {
      key: 'recover',
      label: '巡检与补录',
      detail: '缺数据才补录；已齐全直接确认退出。',
      type: combinedIssue(watchdog, backfill) ? 'error' : combinedOk(watchdog, backfill) ? 'success' : 'warning',
      status: combinedIssue(watchdog, backfill) ? '观察' : combinedOk(watchdog, backfill) ? 'OK' : '待确认',
    },
    {
      key: 'ops',
      label: '告警与备份',
      detail: '缺口通知飞书，夜间备份 SQLite。',
      type: combinedIssue(alarm, backup) ? 'error' : combinedOk(alarm, backup) ? 'success' : 'warning',
      status: combinedIssue(alarm, backup) ? '需处理' : combinedOk(alarm, backup) ? 'OK' : '待确认',
    },
  ]
})

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
  if (sourceFilter.value === 'user_created') {
    list = list.filter((s) => s.source === 'user_created')
  } else if (sourceFilter.value === 'other') {
    list = list.filter((s) => s.source !== 'user_created')
  }
  return list
})

function skillSourceLabel(source: SkillMeta['source']): string {
  if (source === 'user_created') return t('pages.skills.sources.userCreated')
  if (source === 'workspace') return t('pages.skills.sources.workspace')
  if (source === 'managed') return t('pages.skills.sources.managed')
  if (source === 'extra') return t('pages.skills.sources.extra')
  return t('pages.skills.sources.bundled')
}

function skillSourceTagType(source: SkillMeta['source']): 'info' | 'success' | 'default' {
  if (source === 'user_created') return 'info'
  if (source === 'managed' || source === 'workspace') return 'success'
  return 'default'
}

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
  if (cronStore.jobs.length === 0) cronStore.fetchJobs()
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

function goPriceWorkflow() {
  router.push({ name: 'Cron', query: { focus: 'price-monitor' } })
}

async function runPriceJob(job?: CronJob) {
  if (!job) {
    message.warning('未找到对应任务')
    return
  }
  const ok = await cronStore.runJob(job.id)
  if (ok) {
    message.success(`已触发 ${job.name}`)
    await cronStore.fetchJobs()
  } else {
    message.error(`触发失败：${cronStore.lastError}`)
  }
}

async function copyPriceSkillPath() {
  const path = priceWatchSkill.value?.dirPath
  if (!path) {
    message.warning('暂无可复制路径')
    return
  }
  try {
    await writeTextToClipboard(path)
    message.success(t('common.copied'))
  } catch {
    message.error(t('common.copyFailed'))
  }
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
    title: t('pages.skills.columns.source'),
    key: 'source',
    width: 110,
    render(row) {
      return h(
        NTag,
        { size: 'small', type: skillSourceTagType(row.source), bordered: false, round: true },
        { default: () => skillSourceLabel(row.source) },
      )
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
    <div class="skill-hero">
      <NCard class="skill-hero-card">
        <template #header>
          <NSpace align="center" :size="8">
            <NTag type="info" round :bordered="false">自建 Skill</NTag>
            <span>jd-tongrentang-price-watch</span>
          </NSpace>
        </template>
        <template #header-extra>
          <NTag size="small" :type="priceWatchSkillStatus.type" round :bordered="false">
            {{ priceWatchSkillStatus.label }}
          </NTag>
        </template>

        <NText depth="3" class="skill-hero-note">
          自建 Skill 按“小应用”呈现：标准流程、手动补跑、关联 Cron 和文件位置集中在这里。
        </NText>
        <div class="skill-metric-grid">
          <div class="skill-mini">
            <div class="skill-mini-label">今日入库</div>
            <div class="skill-mini-value">
              {{ priceFailedJobs.length ? '需处理' : '闭环正常' }}
            </div>
          </div>
          <div class="skill-mini">
            <div class="skill-mini-label">关联任务</div>
            <div class="skill-mini-value">{{ priceMonitorJobs.length }}</div>
          </div>
          <div class="skill-mini">
            <div class="skill-mini-label">最近失败</div>
            <div class="skill-mini-value">{{ priceFailedJobs.length ? `${priceFailedJobs.length} 个` : '无' }}</div>
          </div>
          <div class="skill-mini">
            <div class="skill-mini-label">路径</div>
            <div class="skill-mini-value">{{ priceWatchSkill?.dirPath ? '可复制' : '未同步' }}</div>
          </div>
        </div>
      </NCard>

      <NCard class="skill-actions-card">
        <template #header>快捷动作</template>
        <NSpace vertical :size="10">
          <NButton block secondary @click="runPriceJob(priceBackfillJob)">
            <template #icon><NIcon :component="PlayOutline" /></template>
            补跑 17:00
          </NButton>
          <NButton block secondary @click="goPriceWorkflow">打开任务闭环</NButton>
          <NButton block secondary :disabled="!priceWatchSkill?.dirPath" @click="copyPriceSkillPath">
            <template #icon><NIcon :component="CopyOutline" /></template>
            复制 Skill 路径
          </NButton>
          <NButton block secondary @click="router.push({ name: 'Settings' })">导出诊断包</NButton>
        </NSpace>
      </NCard>
    </div>

    <NCard class="skill-lifecycle-card">
      <template #header>Skill 生命周期</template>
      <div class="skill-process-list">
        <div
          v-for="(row, index) in skillProcessRows"
          :key="row.key"
          class="skill-process-row"
        >
          <div class="skill-step-index">{{ index + 1 }}</div>
          <div class="skill-process-main">
            <NText strong>{{ row.label }}</NText>
            <NText depth="3" class="skill-process-detail">{{ row.detail }}</NText>
          </div>
          <NTag size="small" :type="row.type" round :bordered="false">
            {{ row.status }}
          </NTag>
        </div>
      </div>
    </NCard>

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

      <NGrid cols="1 s:2 m:5" responsive="screen" :x-gap="10" :y-gap="10">
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
        <NGridItem>
          <NCard embedded :bordered="false" size="small" style="border-radius: 10px;">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.metrics.userCreated') }}</NText>
            <div style="font-size: 22px; font-weight: 700; margin-top: 6px;">
              <NText type="info">{{ skillStore.userCreatedCount }}</NText>
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
        <NSelect
          v-model:value="sourceFilter"
          :options="skillSourceOptions"
          :placeholder="t('pages.skills.sourceFilter')"
          clearable
          style="width: 150px;"
        />
      </div>
      <NText v-if="skillStore.sourceError" type="warning" style="font-size: 12px; margin-top: 8px; display: block;">
        {{ t('pages.skills.source.fallback', { error: skillStore.sourceError }) }}
      </NText>
    </NCard>

    <NCard v-if="userCreatedSkills.length > 0">
      <template #header>
        <NSpace align="center" :size="8">
          <NTag type="info" round>{{ t('pages.skills.sources.userCreated') }}</NTag>
          <span>{{ t('pages.skills.userCreated.title') }}</span>
        </NSpace>
      </template>
      <NSpace :size="8" style="flex-wrap: wrap;">
        <NButton
          v-for="skill in userCreatedSkills"
          :key="skill.name"
          secondary
          size="small"
          @click="selectSkill(skill.name)"
        >
          {{ skill.name }}
        </NButton>
      </NSpace>
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

.skill-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.7fr);
  gap: 16px;
  align-items: stretch;
}

.skill-hero-card,
.skill-actions-card,
.skill-lifecycle-card {
  border-radius: 14px;
}

.skill-hero-note {
  display: block;
  margin-bottom: 14px;
  font-size: 13px;
}

.skill-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.skill-mini {
  min-height: 72px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--n-border-color);
  background: var(--n-color-embedded);
  min-width: 0;
}

.skill-mini-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.skill-mini-value {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-process-list {
  display: grid;
  gap: 10px;
}

.skill-process-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  background: var(--n-color-embedded);
}

.skill-step-index {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #63e2b7;
  background: rgba(99, 226, 183, 0.14);
  font-weight: 800;
}

.skill-process-main {
  flex: 1;
  min-width: 0;
}

.skill-process-detail {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

@media (max-width: 1100px) {
  .skill-hero {
    grid-template-columns: 1fr;
  }

  .skill-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .skill-metric-grid {
    grid-template-columns: 1fr;
  }
}
</style>
