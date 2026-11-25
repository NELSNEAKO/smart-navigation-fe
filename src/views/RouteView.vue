<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMapStore, ARRIVE_M } from '../stores/map'
import { distanceBetween, formatDistance, walkingMinutes } from '../lib/geo'
import MapCanvas from '../components/MapCanvas.vue'
import RouteSteps from '../components/RouteSteps.vue'
import StartStatus from '../components/StartStatus.vue'

const map = useMapStore()
const route = useRoute()
const router = useRouter()

onMounted(() => map.startGps())

const buildingId = computed(() => route.params.buildingId)
const building = computed(() => map.buildingById.get(buildingId.value))
const roomInfo = computed(() => (route.query.room ? map.findRoom(route.query.room) : null))
const result = computed(() => (map.status === 'ready' ? map.routeTo(buildingId.value) : null))
const ok = computed(() => result.value && !result.value.error)

// Named points (QR codes) visitors can pick as a start.
const namedPoints = computed(() => map.nodes.filter((n) => n.code).sort((a, b) => (a.label || a.code).localeCompare(b.label || b.code)))

// ---- Choosing a start by tapping the map ----
const picking = ref(false)
const needsStart = computed(() => result.value?.error === 'no-start')
function onMapClick(p) {
  if (navigating.value) return
  if (picking.value || needsStart.value) {
    map.setManualStart(p)
    picking.value = false
  }
}

// ---- Navigation mode ----
const navigating = ref(false)
const simPos = ref(null)
let simTimer = null
let wakeLock = null

// Live GPS counts only when it is near campus; otherwise (testing at home) use the simulation.
const liveGps = computed(() => (map.gps && !map.offCampus ? map.gps : null))
const currentPos = computed(() => simPos.value ?? (navigating.value ? liveGps.value : null))

async function startNavigation() {
  if (!ok.value) return
  if (liveGps.value && map.start?.source !== 'gps') map.useLiveGps() // follow the phone, not the old start
  navigating.value = true
  try {
    wakeLock = await navigator.wakeLock?.request('screen') // keep the screen on while walking
  } catch {
    /* not supported or denied: fine */
  }
}

function stopNavigation() {
  navigating.value = false
  stopSim()
  wakeLock?.release?.().catch(() => {})
  wakeLock = null
}

// Remaining distance along the route line from a position.
function remainingAlong(points, pos) {
  let k = 0
  let best = Infinity
  points.forEach((p, i) => {
    const d = distanceBetween(p, pos)
    if (d < best) {
      best = d
      k = i
    }
  })
  // If we're past vertex k (closer to the next one's segment), measure to k+1.
  const nextIdx = k < points.length - 1 && distanceBetween(pos, points[k + 1]) < distanceBetween(points[k], points[k + 1]) ? k + 1 : k
  let rest = distanceBetween(pos, points[nextIdx])
  for (let i = nextIdx; i < points.length - 1; i++) rest += distanceBetween(points[i], points[i + 1])
  return rest
}

const remaining = computed(() => {
  if (!ok.value) return null
  if (!currentPos.value) return result.value.distance
  return remainingAlong(result.value.points, currentPos.value)
})

// The next instruction: first step whose position along the route is still ahead.
const nextStep = computed(() => {
  if (!ok.value) return null
  const steps = result.value.steps
  const travelled = result.value.distance - (remaining.value ?? result.value.distance)
  let along = 0
  for (let i = 1; i < steps.length; i++) {
    along += steps[i].distance || 0
    if (along > travelled + 5) return { ...steps[i], inMeters: along - travelled }
  }
  return steps[steps.length - 1]
})

// ---- Simulated walk (testing and demos without being on campus) ----
function startSim() {
  if (!ok.value) return
  const pts = result.value.points
  let seg = 0
  let t = 0
  simPos.value = { ...pts[0] }
  const stepM = 6 // metres per tick (~4x walking speed at 2 ticks/s)
  simTimer = setInterval(() => {
    if (seg >= pts.length - 1) return stopSim(true)
    const a = pts[seg]
    const b = pts[seg + 1]
    const len = Math.max(distanceBetween(a, b), 0.01)
    t += stepM / len
    while (t >= 1 && seg < pts.length - 1) {
      t -= 1
      seg++
    }
    if (seg >= pts.length - 1) {
      simPos.value = { ...pts[pts.length - 1] }
      return
    }
    const p = pts[seg]
    const q = pts[seg + 1]
    simPos.value = { lat: p.lat + (q.lat - p.lat) * t, lng: p.lng + (q.lng - p.lng) * t }
  }, 500)
}
function stopSim(keepPos = false) {
  clearInterval(simTimer)
  simTimer = null
  if (!keepPos) simPos.value = null
}

// ---- Arrival ----
const arrivedQuery = computed(() => (route.query.room ? { room: route.query.room } : {}))
function arrive() {
  stopNavigation()
  router.replace({ name: 'arrived', params: { buildingId: buildingId.value }, query: arrivedQuery.value })
}
watch(currentPos, (pos) => {
  if (pos && navigating.value && ok.value && distanceBetween(pos, result.value.target) <= ARRIVE_M) arrive()
})

// "Start navigation" on the building card opens this page with ?go=1.
watch(
  ok,
  (isOk) => {
    if (isOk && route.query.go === '1' && !navigating.value) startNavigation()
  },
  { immediate: true },
)

onBeforeUnmount(stopNavigation)
</script>

<template>
  <main class="flex h-dvh flex-col">
    <div class="relative shrink-0 transition-all" :class="navigating ? 'h-[62dvh]' : 'h-[45dvh]'">
      <MapCanvas
        :buildings="map.buildings"
        :extra-points="map.nodes"
        :user-pos="currentPos ?? map.gps"
        :start-point="map.start && map.start.source !== 'gps' ? map.start.point : null"
        :route="ok ? result.points : []"
        :highlight-id="buildingId"
        :follow="navigating && !!currentPos"
        @map-click="onMapClick"
      />
      <button
        v-if="!navigating"
        type="button"
        class="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-[1000] flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl shadow-md"
        aria-label="Back"
        @click="router.back()"
      >
        ←
      </button>

      <!-- Navigation banner -->
      <div v-if="navigating && ok" class="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[1000] rounded-2xl bg-blue-700 p-4 text-white shadow-lg">
        <p class="text-xs font-semibold uppercase tracking-wide text-blue-200">Next</p>
        <p class="text-lg font-semibold leading-tight">{{ nextStep?.text }}</p>
        <p v-if="nextStep?.inMeters" class="text-sm text-blue-100">in {{ formatDistance(nextStep.inMeters) }}</p>
      </div>

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

      <!-- ===== Navigating ===== -->
      <template v-else-if="navigating && ok">
        <div class="flex items-baseline justify-between">
          <div>
            <p class="text-2xl font-bold">{{ formatDistance(remaining) }}</p>
            <p class="text-sm text-slate-500">about {{ walkingMinutes(remaining) }} min to {{ building.name }}</p>
          </div>
          <button type="button" class="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-700" @click="stopNavigation">End</button>
        </div>

        <p v-if="result.direct" class="mt-3 rounded-xl bg-amber-50 p-2 text-xs text-amber-900">
          Direct line: {{ result.reason }} Watch for buildings and walls on the way.
        </p>
        <p v-if="!liveGps && !simPos" class="mt-3 rounded-xl bg-slate-50 p-2 text-xs text-slate-600">
          Live tracking needs GPS on campus. Testing from elsewhere? Use Simulate walk.
        </p>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-xl border border-slate-300 py-3 text-sm font-semibold"
            @click="simPos ? stopSim() : startSim()"
          >
            {{ simPos ? 'Stop simulation' : 'Simulate walk' }}
          </button>
          <button type="button" class="rounded-xl bg-green-600 py-3 text-sm font-semibold text-white" @click="arrive">I've arrived</button>
        </div>
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
          <p class="text-sm text-slate-600">Turn on location, scan a campus QR code, or tap the map where you are.</p>
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
  </main>
</template>
