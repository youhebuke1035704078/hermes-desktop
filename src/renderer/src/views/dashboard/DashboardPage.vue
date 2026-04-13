<script setup lang="ts">
import { NCard, NText } from 'naive-ui'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <NCard :title="t('pages.dashboard.title')">
    <NText>Dashboard placeholder</NText>
  </NCard>
</template>
