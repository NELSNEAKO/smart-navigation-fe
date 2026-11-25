<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await auth.login(email.value, password.value)
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/admin') ? route.query.next : '/admin'
    router.replace(next)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
    <form class="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow ring-1 ring-slate-200" @submit.prevent="submit">
      <div>
        <h1 class="text-xl font-semibold">Admin login</h1>
        <p class="text-sm text-slate-500">Visitors don't need an account.</p>
      </div>
      <label class="block">
        <span class="text-sm font-medium">Email</span>
        <input v-model="email" type="email" required autocomplete="username" class="mt-1 w-full rounded-xl border border-slate-300 p-3" />
      </label>
      <label class="block">
        <span class="text-sm font-medium">Password</span>
        <input v-model="password" type="password" required autocomplete="current-password" class="mt-1 w-full rounded-xl border border-slate-300 p-3" />
      </label>
      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
      <button type="submit" :disabled="busy" class="w-full rounded-xl bg-blue-700 py-3 font-semibold text-white disabled:opacity-60">
        {{ busy ? 'Logging in…' : 'Log in' }}
      </button>
      <RouterLink to="/" class="block text-center text-sm text-blue-700">Back to the map</RouterLink>
    </form>
  </main>
</template>
