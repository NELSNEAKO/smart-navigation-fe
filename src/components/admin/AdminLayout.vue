<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const links = [
  { to: '/admin/buildings', label: 'Buildings' },
  { to: '/admin/nodes', label: 'Paths' },
  { to: '/admin/events', label: 'Events' },
  { to: '/admin/reports', label: 'Reports' },
]

function logout() {
  auth.logout()
  router.push({ name: 'admin-login' })
}
</script>

<template>
  <div class="min-h-dvh bg-slate-50">
    <header class="sticky top-0 z-[1100] bg-blue-800 text-white shadow">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <RouterLink to="/" class="font-semibold">CampusNav Admin</RouterLink>
        <div class="flex items-center gap-3 text-sm">
          <span class="hidden text-blue-200 sm:inline">{{ auth.email }}</span>
          <button type="button" class="rounded-lg bg-blue-900/50 px-3 py-1.5" @click="logout">Log out</button>
        </div>
      </div>
      <nav class="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-2">
        <RouterLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="shrink-0 rounded-lg px-3 py-1.5 text-sm text-blue-100"
          active-class="bg-white text-blue-800 font-semibold"
        >
          {{ l.label }}
        </RouterLink>
      </nav>
    </header>
    <div class="mx-auto max-w-5xl p-4">
      <RouterView />
    </div>
  </div>
</template>
