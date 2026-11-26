<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useMapStore } from '../../stores/map'
import AppIcon from '../ui/AppIcon.vue'
import UiFeedbackHost from '../ui/UiFeedbackHost.vue'

const auth = useAuthStore()
const campus = useMapStore()
const router = useRouter()

onMounted(() => campus.load(true))

const links = [
  { to: '/admin/overview', label: 'Overview', icon: 'dashboard' },
  { to: '/admin/campus', label: 'Campus', icon: 'map' },
  { to: '/admin/buildings', label: 'Buildings', icon: 'building' },
  { to: '/admin/nodes', label: 'Paths', icon: 'route' },
  { to: '/admin/events', label: 'Events', icon: 'calendar' },
  { to: '/admin/reports', label: 'Reports', icon: 'chart' },
]
const initial = computed(() => (auth.email || 'A').charAt(0).toUpperCase())

function logout() {
  auth.logout()
  router.push({ name: 'admin-login' })
}
</script>

<template>
  <div class="min-h-dvh bg-canvas font-sans text-ink">
    <!-- Desktop sidebar -->
    <aside class="fixed inset-y-0 left-0 z-[1100] hidden w-64 flex-col border-r border-line bg-surface lg:flex">
      <RouterLink to="/admin/overview" class="flex items-center gap-3 px-5 py-5">
        <img src="/icon.svg" alt="" class="h-9 w-9 rounded-lg" />
        <span class="leading-tight">
          <span class="block text-sm font-semibold text-ink">Campus Navigator</span>
          <span class="block text-xs text-ink-muted">Admin console</span>
        </span>
      </RouterLink>

      <nav class="flex-1 space-y-1 px-3" aria-label="Admin">
        <RouterLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
          active-class="!bg-primary-50 !text-primary-700"
        >
          <AppIcon :name="l.icon" />
          {{ l.label }}
        </RouterLink>
      </nav>

      <div class="space-y-1 border-t border-line p-3">
        <a href="/" target="_blank" class="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-canvas hover:text-ink">
          <AppIcon name="external" />
          Open visitor app
        </a>
        <div class="flex items-center gap-3 rounded-lg px-3 py-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">{{ initial }}</span>
          <span class="min-w-0 flex-1 truncate text-sm text-ink-soft" :title="auth.email">{{ auth.email }}</span>
          <button type="button" class="rounded-md p-1.5 text-ink-muted hover:bg-canvas hover:text-danger-600" aria-label="Log out" title="Log out" @click="logout">
            <AppIcon name="logout" :size="18" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Phone top bar -->
    <header class="sticky top-0 z-[1100] flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
      <div class="flex items-center gap-2.5">
        <img src="/icon.svg" alt="" class="h-8 w-8 rounded-lg" />
        <span class="leading-tight">
          <span class="block text-sm font-semibold">Campus Navigator</span>
          <span class="block text-xs text-ink-muted">Admin console</span>
        </span>
      </div>
      <button type="button" class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-soft hover:bg-canvas" @click="logout">
        <AppIcon name="logout" :size="18" />
        Log out
      </button>
    </header>

    <!-- Page -->
    <main class="pb-24 lg:pb-10 lg:pl-64">
      <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <RouterView />
      </div>
    </main>

    <!-- Phone bottom tabs -->
    <nav class="fixed inset-x-0 bottom-0 z-[1100] grid grid-cols-6 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Admin">
      <RouterLink
        v-for="l in links"
        :key="l.to"
        :to="l.to"
        class="flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium text-ink-muted"
        active-class="!text-primary-600"
      >
        <AppIcon :name="l.icon" :size="22" />
        {{ l.label }}
      </RouterLink>
    </nav>

    <UiFeedbackHost />
  </div>
</template>
