<script setup lang="ts">
import { NEmpty } from 'naive-ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  description?: string
}>()

const { t } = useI18n()
</script>

<template>
  <div class="empty-state-shell">
    <NEmpty :description="description || t('common.empty')">
      <template v-if="$slots.extra" #extra>
        <slot name="extra" />
      </template>
    </NEmpty>
  </div>
</template>

<style scoped>
.empty-state-shell {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 160px;
  padding: 28px 0;
  color: var(--text-secondary);
}
</style>
