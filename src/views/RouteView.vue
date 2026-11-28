<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMapStore } from '../stores/map'
import { formatDistance, walkingMinutes } from '../lib/geo'
import { askCompassPermission } from '../composables/useHeading'
import MapCanvas from '../components/MapCanvas.vue'
import RouteSteps from '../components/RouteSteps.vue'
import StartStatus from '../components/StartStatus.vue'
// Loaded only when navigation starts (MapLibre is large).
const LiveNavigation = defineAsyncComponent(() => import('../components/nav/LiveNavigation.vue'))

const map = useMapStore()
const route = useRoute()
const router = useRouter()

onMounted(() => map.initLocation())

const buildingId = computed(() => route.params.buildingId)
const building = computed(() => map.buildingById.get(buildingId.value))
const roomInfo = computed(() => (route.query.room ? map.findRoom(route.query.room) : null))
const result = computed(() => (map.status === 'ready' ? map.routeTo(buildingId.value) : null))
const ok = computed(() => result.value && !result.value.error)

// Named points (QR codes) visitors can pick as a start.
const namedPoints = computed(() => map.nodes.filter((n) => n.code).sort((a, b) => (a.label || a.code).localeCompare(b.label || b.code)))

// ---- Choosing a start by tapping the map ----
const picking = ref(route.query.pick === '1') // from the location sheet: "Choose my start on the map"
const needsStart = computed(() => result.value?.error === 'no-start')
function onMapClick(p) {
  if (picking.value || needsStart.value) {
    map.setManualStart(p)
    picking.value = false
  }
}

// ---- Live navigation (full screen, components/nav/LiveNavigation.vue) ----
const navigating = ref(false)
const liveGps = computed(() => (map.gps && !map.offCampus ? map.gps : null))

async function startNavigation() {
  askCompassPermission() // iPhone: must be asked inside this tap
  // No location yet (or it's off): ask with an explanation instead of waiting silently.
  const how = await map.askLocation()
  if (how === 'cancel') return
  if (how === 'pick') return (picking.value = true)
  await nextTick()
  if (!ok.value) return
  if (liveGps.value && map.start?.source !== 'gps') map.useLiveGps() // follow the phone, not the old start
  navigating.value = true
}
async function useMyLocation() {
  const how = await map.askLocation({ allowChosenStart: false })
  if (how === 'pick') picking.value = true
  else if (how === 'gps') map.useLiveGps()
}
function stopNavigation() {
  navigating.value = false
}

const arrivedQuery = computed(() => (route.query.room ? { room: route.query.room } : {}))
function arrive() {
  navigating.value = false
  router.replace({ name: 'arrived', params: { buildingId: buildingId.value }, query: arrivedQuery.value })
}

// "Start navigation" on the destination page opens this page with ?go=1 (location already sorted there).
let autoStarted = false
watch(
  () => map.status === 'ready',
  (ready) => {
    if (ready && route.query.go === '1' && !autoStarted && !navigating.value) {
      autoStarted = true
      startNavigation()
    }
  },
  { immediate: true },
)
</script>

<template>
  <main class="flex h-dvh flex-col">
    <div class="relative h-[45dvh] shrink-0">
      <MapCanvas
        :buildings="map.buildings"
        :extra-points="map.nodes"
        :user-pos="map.gps"
        :start-point="map.start && map.start.source !== 'gps' ? map.start.point : null"
        :route="ok ? result.points : []"
        :highlight-id="buildingId"
        @map-click="onMapClick"
      />
      <button
        type="button"
        class="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-[1000] flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl shadow-md"
        aria-label="Back"
        @click="router.back()"
      >
        ←
      </button>

      <div
        v-if="picking || needsStart"
        class="pointer-events-none absolute inset-x-3 bottom-6 z-[1000] rounded-xl bg-slate-900/85 p-2 text-center text-sm text-white"
      >
        Tap the map where you are now
      </div>
    </div>

    <section class="relative z-[1000] -mt-4 flex-1 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      <p v-if="map.status !== 'ready'" class="text-sm text-slate-500">Loading campus data…</p>

      <template v-else-if="!building">
        <p class="font-medium">Building not found.</p>
        <RouterLink to="/" class="mt-2 inline-block font-semibold text-blue-700">Back to home</RouterLink>
      </template>

      <!-- ===== Preview ===== -->
      <template v-else>
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Directions to</p>
        <h1 class="text-xl font-semibold">{{ building.name }}</h1>
        <p v-if="roomInfo" class="text-sm text-slate-600">
          {{ roomInfo.room.name }} is on the <span class="font-medium">{{ roomInfo.floor.label }}</span>
        </p>

        <div class="mt-3 flex items-center gap-2">
          <div class="min-w-0 flex-1"><StartStatus /></div>
          <button v-if="!needsStart" type="button" class="shrink-0 text-xs font-semibold text-blue-700" @click="picking = !picking">
            {{ picking ? 'Cancel' : 'Change start' }}
          </button>
        </div>

        <!-- No start yet -->
        <div v-if="needsStart" class="mt-4 space-y-2">
          <button type="button" class="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 font-semibold text-white active:bg-blue-800" @click="useMyLocation">Use my location</button>
          <p class="text-center text-sm text-slate-600">or tap the map where you are now</p>
          <select
            v-if="namedPoints.length"
            class="w-full rounded-xl border border-slate-300 bg-white p-3"
            @change="map.setFromCode($event.target.value || null)"
          >
            <option value="">Or choose a starting point…</option>
            <option v-for="n in namedPoints" :key="n.id" :value="n.code">{{ n.label || n.code }}</option>
          </select>
        </div>

        <p v-else-if="result?.error" class="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{{ result.error }}</p>

        <template v-else-if="ok">
          <div class="mt-4 flex items-baseline gap-3">
            <span class="text-2xl font-bold">{{ walkingMinutes(result.distance) }} min</span>
            <span class="text-slate-500">{{ formatDistance(result.distance) }} walk</span>
          </div>
          <p v-if="result.direct" class="mt-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-900">
            Showing a direct line. {{ result.reason }}
          </p>
          <div class="mt-4">
            <RouteSteps :steps="result.steps" />
          </div>
          <button type="button" class="mt-6 w-full rounded-xl bg-blue-700 py-3.5 text-lg font-semibold text-white active:bg-blue-800" @click="startNavigation">
            Start navigation
          </button>
        </template>
      </template>
    </section>

    <LiveNavigation v-if="navigating && ok" :building-id="buildingId" @end="stopNavigation" @arrived="arrive" />
  </main>
</template>
