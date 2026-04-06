import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'

export const i18n = createI18n({
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  legacy: false,
  messages: { 'zh-CN': zhCN }
})
