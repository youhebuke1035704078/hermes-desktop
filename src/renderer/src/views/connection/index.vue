<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NInput,
  NForm,
  NFormItem,
  NList,
  NListItem,
  NThing,
  NTag,
  NAlert,
  NSpace,
  NModal,
  NPopconfirm,
  useMessage
} from 'naive-ui'
import { v4 as uuid } from 'uuid'
import { useConnectionStore } from '../../stores/connection'

const { t } = useI18n()
const router = useRouter()
const message = useMessage()
const connectionStore = useConnectionStore()

const showAddModal = ref(false)
const connecting = ref(false)

const form = ref({
  id: '',
  name: '',
  url: 'https://',
  username: '',
  password: ''
})

const isHttpWarning = computed(() => {
  const url = form.value.url.toLowerCase()
  return url.startsWith('http://') && !url.startsWith('https://')
})

onMounted(() => {
  connectionStore.loadServers()
})

function openAddModal() {
  form.value = { id: uuid(), name: '', url: 'https://', username: '', password: '' }
  showAddModal.value = true
}

async function handleSave() {
  if (!form.value.name || !form.value.url || !form.value.username || !form.value.password) return
  await connectionStore.addServer(form.value)
  showAddModal.value = false
}

async function handleConnect(serverId: string) {
  connecting.value = true
  try {
    await connectionStore.connect(serverId)
    router.push('/dashboard')
  } catch {
    message.error(t('connection.connectFailed'))
  } finally {
    connecting.value = false
  }
}

async function handleDelete(serverId: string) {
  await connectionStore.deleteServer(serverId)
}
</script>

<template>
  <div class="connection-page">
    <div class="connection-container">
      <h1 class="app-title">{{ t('connection.title') }}</h1>

      <NCard :title="t('connection.recentServers')">
        <template #header-extra>
          <NButton type="primary" size="small" @click="openAddModal">
            {{ t('connection.addServer') }}
          </NButton>
        </template>

        <div v-if="connectionStore.servers.length === 0" class="no-servers">
          {{ t('connection.noServers') }}
        </div>

        <NList v-else hoverable clickable>
          <NListItem v-for="server in connectionStore.servers" :key="server.id">
            <NThing :title="server.name" :description="server.url">
              <template #header-extra>
                <NSpace>
                  <NButton
                    type="primary"
                    size="small"
                    :loading="connecting"
                    @click="handleConnect(server.id)"
                  >
                    {{ t('connection.connect') }}
                  </NButton>
                  <NPopconfirm @positive-click="handleDelete(server.id)">
                    <template #trigger>
                      <NButton size="small" type="error" quaternary>
                        {{ t('connection.delete') }}
                      </NButton>
                    </template>
                    {{ t('connection.confirmDelete') }}
                  </NPopconfirm>
                </NSpace>
              </template>
            </NThing>
            <template #suffix>
              <NTag size="small" type="info">{{ server.username }}</NTag>
            </template>
          </NListItem>
        </NList>
      </NCard>

      <NModal
        v-model:show="showAddModal"
        preset="card"
        :title="t('connection.addServer')"
        style="width: 480px"
      >
        <NForm label-placement="left" label-width="100">
          <NFormItem :label="t('connection.serverName')">
            <NInput v-model:value="form.name" placeholder="My Server" />
          </NFormItem>
          <NFormItem :label="t('connection.serverUrl')">
            <NInput v-model:value="form.url" placeholder="https://your-server.com:3000" />
          </NFormItem>
          <NAlert v-if="isHttpWarning" type="warning" style="margin-bottom: 12px">
            {{ t('connection.httpsWarning') }}
          </NAlert>
          <NFormItem :label="t('connection.username')">
            <NInput v-model:value="form.username" />
          </NFormItem>
          <NFormItem :label="t('connection.password')">
            <NInput v-model:value="form.password" type="password" show-password-on="click" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showAddModal = false">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" @click="handleSave">{{ t('common.save') }}</NButton>
          </NSpace>
        </template>
      </NModal>
    </div>
  </div>
</template>

<style scoped>
.connection-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #f5f5f5;
}

.connection-container {
  width: 560px;
  padding: 40px 0;
}

.app-title {
  text-align: center;
  font-size: 24px;
  margin-bottom: 24px;
  color: #333;
}

.no-servers {
  text-align: center;
  color: #999;
  padding: 24px 0;
}
</style>
