<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard, NButton, NTag, NSpace, NModal, NForm, NFormItem,
  NInput, NPopconfirm, NEmpty, NSpin, useMessage
} from 'naive-ui'
import { useAgentStore } from '../../stores/agent'

const { t } = useI18n()
const message = useMessage()
const agentStore = useAgentStore()

const showAddModal = ref(false)
const newAgent = ref({ id: '', name: '', workspace: '' })

onMounted(async () => {
  await agentStore.initialize()
})

async function handleAdd() {
  if (!newAgent.value.id) return
  try {
    await agentStore.addAgent({
      id: newAgent.value.id,
      name: newAgent.value.name || newAgent.value.id,
      workspace: newAgent.value.workspace || undefined
    })
    showAddModal.value = false
    newAgent.value = { id: '', name: '', workspace: '' }
    message.success('Agent 创建成功')
  } catch (e: any) {
    message.error(e?.message || '创建失败')
  }
}

async function handleDelete(agentId: string) {
  try {
    await agentStore.deleteAgent(agentId)
    message.success('Agent 已删除')
  } catch (e: any) {
    message.error(e?.message || '删除失败')
  }
}
</script>

<template>
  <div>
    <NCard>
      <template #header>
        <NSpace justify="space-between" align="center">
          <span>{{ t('nav.agents') }} ({{ agentStore.agents.length }})</span>
          <NButton type="primary" size="small" @click="showAddModal = true">
            添加 Agent
          </NButton>
        </NSpace>
      </template>

      <NSpin :show="agentStore.loading">
        <NEmpty v-if="agentStore.agents.length === 0" :description="t('common.noData')" />
        <div v-else class="agent-grid">
          <NCard v-for="agent in agentStore.agents" :key="agent.id" size="small" hoverable>
            <template #header>
              <NSpace align="center">
                <span>{{ agent.name || agent.id }}</span>
                <NTag v-if="agent.id === 'main'" type="info" size="small">主</NTag>
              </NSpace>
            </template>
            <template #header-extra>
              <NPopconfirm
                v-if="agent.id !== 'main'"
                @positive-click="handleDelete(agent.id)"
              >
                <template #trigger>
                  <NButton size="tiny" type="error" quaternary>删除</NButton>
                </template>
                确定删除此 Agent？
              </NPopconfirm>
            </template>
            <div class="agent-stats">
              <span>ID: {{ agent.id }}</span>
              <span>会话: {{ agentStore.getAgentStats(agent.id).sessions }}</span>
              <span>模型: {{ agent.model || 'default' }}</span>
            </div>
          </NCard>
        </div>
      </NSpin>
    </NCard>

    <NModal v-model:show="showAddModal" preset="card" title="添加 Agent" style="width: 480px">
      <NForm label-placement="left" label-width="100">
        <NFormItem label="Agent ID" required>
          <NInput v-model:value="newAgent.id" placeholder="my-agent" />
        </NFormItem>
        <NFormItem label="名称">
          <NInput v-model:value="newAgent.name" placeholder="可选" />
        </NFormItem>
        <NFormItem label="工作区路径">
          <NInput v-model:value="newAgent.workspace" placeholder="~/.openclaw/workspace-xxx" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showAddModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" @click="handleAdd">{{ t('common.confirm') }}</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.agent-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #666;
}
</style>
