<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div class="placeholder-page">
    <h2>{{ t('nav.models') }}</h2>
    <p style="color: #999">{{ t('common.noData') }}</p>
  </div>
</template>
