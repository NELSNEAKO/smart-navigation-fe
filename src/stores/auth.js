import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '../lib/api'

const KEY = 'campusnav.auth'

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

/** Expiry (ms) from the JWT payload, or 0 if unreadable. */
function expiryOf(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp * 1000
  } catch {
    return 0
  }
}

export const useAuthStore = defineStore('auth', () => {
  const saved = readSaved()
  const token = ref(saved.token && expiryOf(saved.token) > Date.now() ? saved.token : null)
  const email = ref(token.value ? saved.email : null)
  api.setToken(token.value)

  const isLoggedIn = computed(() => !!token.value && expiryOf(token.value) > Date.now())

  function persist() {
    try {
      if (token.value) localStorage.setItem(KEY, JSON.stringify({ token: token.value, email: email.value }))
      else localStorage.removeItem(KEY)
    } catch {
      /* storage blocked: stay logged in for this tab only */
    }
    api.setToken(token.value)
  }

  async function login(e, password) {
    const res = await api.login(e, password)
    token.value = res.token
    email.value = res.email
    persist()
  }

  function logout() {
    token.value = null
    email.value = null
    persist()
  }

  return { token, email, isLoggedIn, login, logout }
})
