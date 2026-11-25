<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import AppIcon from '../../components/ui/AppIcon.vue'
import UiButton from '../../components/ui/UiButton.vue'
import UiField from '../../components/ui/UiField.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await auth.login(email.value, password.value)
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/admin') ? route.query.next : '/admin/overview'
    router.replace(next)
  } catch (e) {
    error.value = e.status === 401 ? 'That email and password don’t match an admin account.' : e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="flex min-h-dvh bg-canvas font-sans text-ink">
    <!-- Brand panel (desktop) -->
    <section class="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-primary-700 p-10 text-white lg:flex">
      <div class="flex items-center gap-3">
        <img src="/icon.svg" alt="" class="h-10 w-10 rounded-lg ring-1 ring-white/20" />
        <span class="font-semibold">Campus Navigator</span>
      </div>
      <div class="max-w-md">
        <h1 class="text-3xl leading-tight font-semibold">Keep the campus map accurate, so every visitor finds their way.</h1>
        <ul class="mt-8 space-y-4 text-primary-100">
          <li class="flex gap-3"><AppIcon name="building" class="mt-0.5 text-white" />Place buildings and list their floors and rooms</li>
          <li class="flex gap-3"><AppIcon name="route" class="mt-0.5 text-white" />Draw walkways for shortest-route directions</li>
          <li class="flex gap-3"><AppIcon name="qr" class="mt-0.5 text-white" />Set QR start points and see what visitors search</li>
        </ul>
      </div>
      <p class="text-sm text-primary-100/80">Admin access only. Visitors use the map without an account.</p>
    </section>

    <!-- Form -->
    <section class="flex flex-1 items-center justify-center px-4 py-10">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <img src="/icon.svg" alt="" class="h-10 w-10 rounded-lg" />
          <span class="font-semibold">Campus Navigator</span>
        </div>
        <h2 class="text-2xl font-semibold tracking-tight">Sign in to the admin console</h2>
        <p class="mt-1 text-sm text-ink-muted">Use the admin account created for your campus.</p>

        <form class="mt-8 space-y-5" @submit.prevent="submit">
          <UiField v-model="email" type="email" label="Email" required autocomplete="username" placeholder="you@school.edu" />
          <UiField v-model="password" :type="showPassword ? 'text' : 'password'" label="Password" required autocomplete="current-password">
            <template #default="{ id, controlClass }">
              <div class="relative">
                <input :id="id" v-model="password" :type="showPassword ? 'text' : 'password'" required autocomplete="current-password" :class="[controlClass, 'h-10 pr-16']" />
                <button type="button" class="absolute inset-y-0 right-0 px-3 text-sm font-medium text-ink-muted hover:text-ink" @click="showPassword = !showPassword">
                  {{ showPassword ? 'Hide' : 'Show' }}
                </button>
              </div>
            </template>
          </UiField>

          <p v-if="error" class="flex items-start gap-2 rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600" role="alert">
            <AppIcon name="alert" :size="18" class="mt-px" />{{ error }}
          </p>

          <UiButton type="submit" block :loading="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</UiButton>
        </form>

        <RouterLink to="/" class="mt-8 flex items-center justify-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
          <AppIcon name="chevron-left" :size="16" /> Back to the campus map
        </RouterLink>
      </div>
    </section>
  </main>
</template>
