<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMapStore } from '../../stores/map'
import { campusHealth } from '../../lib/campusHealth'
import AppIcon from '../../components/ui/AppIcon.vue'
import PageHeader from '../../components/ui/PageHeader.vue'
import UiButton from '../../components/ui/UiButton.vue'

const campus = useMapStore()
const router = useRouter()

const health = computed(() => campusHealth(campus))
const qrPoints = computed(() => campus.nodes.filter((n) => n.code))
const entrances = computed(() => campus.nodes.filter((n) => n.buildingId))

const stats = computed(() => [
  { label: 'Buildings', value: campus.buildings.length, icon: 'building', to: '/admin/buildings' },
  { label: 'Entrances', value: entrances.value.length, icon: 'door', to: '/admin/nodes' },
  { label: 'Paths', value: campus.edges.length, icon: 'route', to: '/admin/nodes' },
  { label: 'QR points', value: qrPoints.value.length, icon: 'qr', to: '/admin/nodes' },
])

// Setup guide: the order that makes navigation work.
const steps = computed(() => [
  {
    title: 'Add the buildings',
    text: 'Name each building and drop its pin on the map.',
    done: campus.buildings.length > 0,
    to: '/admin/buildings',
    action: 'Add building',
  },
  {
    title: 'Mark building entrances',
    text: 'Place a point at each door and link it to its building.',
    done: campus.buildings.length > 0 && campus.buildings.every((b) => health.value.perBuilding.get(b.id)?.entrances > 0),
    to: '/admin/nodes',
    action: 'Open paths map',
  },
  {
    title: 'Draw the walkways',
    text: 'Connect gates, corners and entrances with paths people can walk.',
    done: campus.edges.length > 0,
    to: '/admin/nodes',
    action: 'Draw paths',
  },
  {
    title: 'Create QR start points',
    text: 'Give key points (gates, lobbies) a QR name and print their codes.',
    done: qrPoints.value.length > 0,
    to: '/admin/nodes',
    action: 'Add QR point',
  },
  {
    title: 'Add floors and rooms',
    text: 'So visitors can search for a room and see which floor it is on.',
    done: campus.buildings.some((b) => health.value.perBuilding.get(b.id)?.rooms > 0),
    to: '/admin/buildings',
    action: 'Add rooms',
  },
])
const doneCount = computed(() => steps.value.filter((s) => s.done).length)

function openIssue(issue) {
  if (issue.buildingId && issue.fix === 'Move pin') router.push({ path: '/admin/buildings', query: { edit: issue.buildingId } })
  else if (issue.buildingId && issue.fix === 'Add entrance') router.push({ path: '/admin/buildings', query: { edit: issue.buildingId, tab: 'entrances' } })
  else router.push('/admin/nodes')
}
</script>

<template>
  <div>
    <PageHeader title="Overview" description="Everything visitors need to find their way, and what still needs your attention.">
      <template #actions>
        <a href="/" target="_blank">
          <UiButton variant="secondary" icon="external">Visitor app</UiButton>
        </a>
      </template>
    </PageHeader>

    <!-- Stats -->
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <RouterLink
        v-for="s in stats"
        :key="s.label"
        :to="s.to"
        class="rounded-xl border border-line bg-surface p-4 shadow-xs transition-colors hover:border-primary-100 hover:bg-primary-50/40 lg:p-5"
      >
        <div class="flex items-center justify-between gap-2 text-ink-muted">
          <span class="truncate text-sm font-medium">{{ s.label }}</span>
          <AppIcon :name="s.icon" :size="18" />
        </div>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-ink">{{ s.value }}</p>
      </RouterLink>
    </div>

    <div class="mt-6 grid gap-6 xl:grid-cols-5">
      <!-- Setup guide -->
      <section class="rounded-xl border border-line bg-surface shadow-xs xl:col-span-3">
        <header class="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 class="text-base font-semibold">Campus setup</h2>
            <p class="text-sm text-ink-muted">{{ doneCount }} of {{ steps.length }} steps done</p>
          </div>
          <div class="h-2 w-28 overflow-hidden rounded-full bg-canvas ring-1 ring-line ring-inset">
            <div class="h-full rounded-full bg-success-600 transition-all" :style="{ width: `${(doneCount / steps.length) * 100}%` }" />
          </div>
        </header>
        <ol class="divide-y divide-line">
          <li v-for="(s, i) in steps" :key="s.title" class="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4 sm:flex-nowrap">
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              :class="s.done ? 'bg-success-600 text-white' : 'bg-canvas text-ink-soft ring-1 ring-line ring-inset'"
            >
              <AppIcon v-if="s.done" name="check" :size="16" />
              <template v-else>{{ i + 1 }}</template>
            </span>
            <div class="min-w-0 flex-1">
              <p class="font-medium" :class="s.done ? 'text-ink-muted line-through decoration-line' : 'text-ink'">{{ s.title }}</p>
              <p class="text-sm text-ink-muted">{{ s.text }}</p>
            </div>
            <RouterLink v-if="!s.done" :to="s.to" class="ml-11 shrink-0 sm:ml-0">
              <UiButton size="sm" variant="secondary">{{ s.action }}</UiButton>
            </RouterLink>
          </li>
        </ol>
      </section>

      <!-- Needs attention -->
      <section class="rounded-xl border border-line bg-surface shadow-xs xl:col-span-2">
        <header class="border-b border-line px-5 py-4">
          <h2 class="text-base font-semibold">Needs attention</h2>
          <p class="text-sm text-ink-muted">Problems visitors would run into</p>
        </header>
        <div v-if="campus.status === 'loading'" class="px-5 py-8 text-sm text-ink-muted">Checking campus data…</div>
        <div v-else-if="!health.issues.length" class="flex flex-col items-center px-5 py-10 text-center">
          <span class="flex h-10 w-10 items-center justify-center rounded-full bg-success-50 text-success-600"><AppIcon name="check" /></span>
          <p class="mt-3 font-medium">All clear</p>
          <p class="text-sm text-ink-muted">Every building is reachable.</p>
        </div>
        <ul v-else class="divide-y divide-line">
          <li v-for="(issue, i) in health.issues" :key="i">
            <button type="button" class="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-canvas" @click="openIssue(issue)">
              <AppIcon :name="issue.level === 'warning' ? 'alert' : 'info'" :size="18" class="mt-0.5" :class="issue.level === 'warning' ? 'text-warning-600' : 'text-ink-muted'" />
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium text-ink">{{ issue.title }}</span>
                <span class="block text-sm text-ink-muted">{{ issue.text }}</span>
                <span class="mt-1 inline-flex items-center gap-0.5 text-sm font-medium text-primary-600">
                  {{ issue.fix }} <AppIcon name="chevron-right" :size="16" />
                </span>
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
