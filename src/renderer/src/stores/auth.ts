import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { apiFetch, setAuthToken, clearAuthToken } from '../api/http-client'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value)

  async function login(username: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const data = await apiFetch<{ ok: boolean; token?: string; error?: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ username, password })
        }
      )

      if (data.ok && data.token) {
        token.value = data.token
        setAuthToken(data.token)
        loading.value = false
        return true
      } else {
        error.value = data.error || '登录失败'
        loading.value = false
        return false
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '网络错误'
      loading.value = false
      return false
    }
  }

  async function checkAuth(): Promise<boolean> {
    if (!token.value) return false

    try {
      const res = await apiFetch<{ ok: boolean }>('/api/auth/check')
      return res.ok
    } catch {
      token.value = null
      clearAuthToken()
      return false
    }
  }

  async function logout() {
    try {
      if (token.value) {
        await apiFetch('/api/auth/logout', { method: 'POST' })
      }
    } catch {
      // ignore
    }
    token.value = null
    clearAuthToken()
  }

  return {
    token,
    loading,
    error,
    isAuthenticated,
    login,
    checkAuth,
    logout
  }
})
