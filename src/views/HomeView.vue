<script setup>
// Visitor landing screen: "Where do you want to go?" with search, categories,
// popular places and events. The map is one tap away, not the first thing people see.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMapStore } from '../stores/map'
import { getPopular, logSearch } from '../lib/api'
import { CATEGORIES, categoryById } from '../lib/categories'
import { distanceBetween, formatDistance } from '../lib/geo'
import AppIcon from '../components/ui/AppIcon.vue'
import StartStatus from '../components/StartStatus.vue'
import CardSlider from '../components/CardSlider.vue'
import { coverOf } from '../lib/photos'

const map = useMapStore()
const router = useRouter()

const query = ref('')
const activeCategory = ref(null)
const popular = ref([])

onMounted(async () => {
  map.startGps()
  popular.value = await getPopular()
})

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
})

const results = computed(() => map.search(query.value))
const typeLabel = { classroom: 'Classroom', office: 'Office', restroom: 'Restroom', lab: 'Laboratory' }

// Only show categories that have at least one building.
const usedCategories = computed(() =>
  CATEGORIES.map((c) => ({ ...c, count: map.buildings.filter((b) => b.category === c.id).length })).filter((c) => c.count > 0),
)
const categoryBuildings = computed(() => (activeCategory.value ? map.buildings.filter((b) => b.category === activeCategory.value.id) : []))

// Popular = most searched first, then other buildings so the slider has something to slide.
const popularBuildings = computed(() => {
  const fromLogs = popular.value.map((p) => map.buildingById.get(p.buildingId)).filter(Boolean)
  const rest = map.buildings.filter((b) => !fromLogs.includes(b))
  return [...fromLogs, ...rest].slice(0, 8)
})

const events = computed(() => map.events.slice(0, 3))

function distanceTo(b) {
  const p = map.start?.point
  if (!p || map.offCampus) return null
  return formatDistance(Math.round(distanceBetween(p, b) / 10) * 10)
}

function openBuilding(buildingId, roomId = null) {
  logSearch({ query: query.value.trim() || null, fromCode: map.fromCode, buildingId })
  router.push({ name: 'place', params: { buildingId }, query: roomId ? { room: roomId } : {} })
}

function chooseResult(item) {
  openBuilding(item.buildingId, item.kind === 'room' ? item.id : null)
}

function eventWhen(ev) {
  const d = new Date(ev.startsAt)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today, ${time}`
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`
}
</script>

<template>
  <main class="min-h-dvh bg-canvas font-sans text-ink">
    <!-- Header band -->
    <section class="relative overflow-hidden bg-primary-700 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-24 text-white">
      <!-- Soft campus-map texture, decorative only -->
      <svg class="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden="true">
        <defs>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="white" stroke-width="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <div class="relative mx-auto flex max-w-xl items-center justify-between">
        <div class="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" class="h-9 w-9 rounded-lg ring-1 ring-white/25" />
          <span class="text-sm font-semibold">Campus Navigator</span>
        </div>
        <RouterLink to="/map" class="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium hover:bg-white/25">
          <AppIcon name="map" :size="16" /> Map
        </RouterLink>
      </div>

      <div class="relative mx-auto mt-8 max-w-xl">
        <p class="text-sm font-medium text-primary-100">{{ greeting }}, welcome to campus</p>
        <h1 class="mt-1 text-3xl leading-tight font-semibold tracking-tight">Where do you want to go?</h1>
      </div>
    </section>

    <div class="relative mx-auto -mt-16 max-w-xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <!-- Search card -->
      <div class="rounded-2xl bg-surface p-3 shadow-xl ring-1 ring-line">
        <label class="flex h-14 items-center gap-3 rounded-xl bg-canvas px-4 ring-1 ring-line focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary-600">
          <AppIcon name="search" :size="22" class="text-ink-muted" />
          <input
            v-model="query"
            type="text"
            role="searchbox"
            inputmode="search"
            enterkeyhint="search"
            autocomplete="off"
            placeholder="Building, office or room"
            aria-label="Search the campus"
            class="w-full bg-transparent text-lg outline-none placeholder:text-ink-muted"
            @keydown.enter="results[0] && chooseResult(results[0])"
          />
          <button v-if="query" type="button" class="rounded-full p-1 text-ink-muted hover:bg-line/60" aria-label="Clear search" @click="query = ''">
            <AppIcon name="x" :size="18" />
          </button>
        </label>
        <div class="mt-3"><StartStatus /></div>
      </div>

      <!-- Loading / error -->
      <div v-if="map.status === 'loading'" class="mt-6 rounded-2xl bg-surface p-5 text-sm text-ink-soft ring-1 ring-line">
        <p class="flex items-center gap-2 font-medium text-ink"><AppIcon name="loader" :size="18" class="animate-spin text-primary-600" /> Loading the campus…</p>
        <p class="mt-1">The server may take up to a minute to wake up the first time.</p>
      </div>
      <div v-else-if="map.status === 'error'" class="mt-6 rounded-2xl bg-surface p-5 text-sm ring-1 ring-line">
        <p class="font-medium text-danger-600">Could not load the campus.</p>
        <p class="text-ink-soft">{{ map.error }}</p>
        <button type="button" class="mt-2 font-semibold text-primary-600" @click="map.load(true)">Try again</button>
      </div>

      <!-- ===== Search results ===== -->
      <section v-else-if="query.trim()" class="mt-6">
        <h2 class="mb-2 px-1 text-sm font-medium text-ink-muted">{{ results.length }} result{{ results.length === 1 ? '' : 's' }}</h2>
        <div v-if="!results.length" class="rounded-2xl bg-surface p-6 text-center ring-1 ring-line">
          <p class="font-medium">Nothing matches “{{ query }}”</p>
          <p class="mt-1 text-sm text-ink-muted">Try a building name, an office like “registrar”, or a room number.</p>
        </div>
        <ul v-else class="divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          <li v-for="item in results" :key="item.kind + item.id">
            <button type="button" class="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-canvas" @click="chooseResult(item)">
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                :class="item.kind === 'building' ? 'bg-primary-50 text-primary-600' : 'bg-canvas text-ink-soft ring-1 ring-line'"
              >
                <AppIcon :name="item.kind === 'building' ? categoryById[item.category]?.icon || 'building' : 'door'" :size="20" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ item.title }}</span>
                <span class="block truncate text-sm text-ink-muted">
                  <template v-if="item.kind === 'room'">{{ typeLabel[item.type] }} · </template>{{ item.subtitle || categoryById[item.category]?.label || 'Building' }}
                </span>
              </span>
              <AppIcon name="chevron-right" :size="18" class="text-ink-muted" />
            </button>
          </li>
        </ul>
      </section>

      <!-- ===== One category ===== -->
      <section v-else-if="activeCategory" class="mt-6">
        <button type="button" class="mb-3 flex items-center gap-1 px-1 text-sm font-medium text-primary-600" @click="activeCategory = null">
          <AppIcon name="chevron-left" :size="16" /> All categories
        </button>
        <h2 class="mb-3 flex items-center gap-2 px-1 text-xl font-semibold">
          <AppIcon :name="activeCategory.icon" :size="22" class="text-primary-600" />{{ activeCategory.plural }}
        </h2>
        <ul class="divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          <li v-for="b in categoryBuildings" :key="b.id">
            <button type="button" class="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-canvas" @click="openBuilding(b.id)">
              <img v-if="coverOf(b)" :src="coverOf(b)" alt="" class="h-12 w-12 shrink-0 rounded-xl object-cover" />
              <span v-else class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><AppIcon :name="activeCategory.icon" :size="22" /></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ b.name }}</span>
                <span v-if="b.description" class="block truncate text-sm text-ink-muted">{{ b.description }}</span>
              </span>
              <span v-if="distanceTo(b)" class="shrink-0 text-sm text-ink-muted tabular-nums">{{ distanceTo(b) }}</span>
            </button>
          </li>
        </ul>
      </section>

      <!-- ===== Home ===== -->
      <template v-else-if="map.status === 'ready'">
        <!-- Categories -->
        <section v-if="usedCategories.length" class="mt-7">
          <h2 class="mb-3 px-1 text-base font-semibold">Browse by category</h2>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="c in usedCategories"
              :key="c.id"
              type="button"
              class="flex flex-col items-center gap-2 rounded-2xl bg-surface px-1 py-3 text-center ring-1 ring-line transition-colors hover:ring-primary-100 active:bg-primary-50"
              @click="activeCategory = c"
            >
              <span class="flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-primary-600"><AppIcon :name="c.icon" :size="22" /></span>
              <span class="text-xs leading-tight font-medium text-ink-soft">{{ c.label }}</span>
            </button>
          </div>
        </section>

        <!-- Popular -->
        <section v-if="popularBuildings.length" class="mt-7">
          <h2 class="mb-3 flex items-center gap-2 px-1 text-base font-semibold">
            {{ popular.length ? 'Popular places' : 'Places on campus' }}
          </h2>
          <CardSlider :count="popularBuildings.length">
            <button
              v-for="b in popularBuildings"
              :key="b.id"
              type="button"
              class="w-40 shrink-0 snap-start overflow-hidden rounded-2xl bg-surface text-left ring-1 ring-line active:bg-canvas"
              @click="openBuilding(b.id)"
            >
              <img v-if="coverOf(b)" :src="coverOf(b)" alt="" class="h-24 w-full object-cover" />
              <span v-else class="flex h-24 w-full items-center justify-center bg-primary-50 text-primary-600">
                <AppIcon :name="categoryById[b.category]?.icon || 'building'" :size="30" />
              </span>
              <span class="block p-3">
                <span class="block truncate text-sm font-semibold">{{ b.name }}</span>
                <span class="block truncate text-xs text-ink-muted">
                  {{ categoryById[b.category]?.label || 'Building' }}<template v-if="distanceTo(b)"> · {{ distanceTo(b) }}</template>
                </span>
              </span>
            </button>
          </CardSlider>
        </section>

        <!-- Events -->
        <section v-if="events.length" class="mt-7">
          <h2 class="mb-3 px-1 text-base font-semibold">Happening on campus</h2>
          <ul class="space-y-2">
            <li v-for="ev in events" :key="ev.id" class="flex gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
              <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning-50 text-warning-600"><AppIcon name="calendar" :size="20" /></span>
              <span class="min-w-0">
                <span class="block font-medium">{{ ev.title }}</span>
                <span class="block text-sm text-ink-muted">{{ eventWhen(ev) }}</span>
                <span class="mt-1 line-clamp-2 block text-sm text-ink-soft">{{ ev.body }}</span>
              </span>
            </li>
          </ul>
        </section>

        <!-- Map shortcut -->
        <RouterLink to="/map" class="mt-7 flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line active:bg-canvas">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-white"><AppIcon name="map" :size="20" /></span>
          <span class="flex-1">
            <span class="block font-medium">View the campus map</span>
            <span class="block text-sm text-ink-muted">See every building at a glance</span>
          </span>
          <AppIcon name="chevron-right" :size="18" class="text-ink-muted" />
        </RouterLink>

        <p class="mt-8 text-center text-xs text-ink-muted">Locations are shown at building level. Ask the front desk if you can't find a room.</p>
      </template>
    </div>
  </main>
</template>
