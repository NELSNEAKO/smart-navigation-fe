<script setup>
import { computed, onMounted, watch } from 'vue'
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

// Points visitors can pick as a start when there is no GPS or QR code.
const namedPoints = computed(() => map.nodes.filter((n) => n.code).sort((a, b) => (a.label || a.code).localeCompare(b.label || b.code)))

const arrivedQuery = computed(() => (route.query.room ? { room: route.query.room } : {}))
function arrive() {
  router.replace({ name: 'arrived', params: { buildingId: buildingId.value }, query: arrivedQuery.value })
}

// Walking with GPS: switch to the arrival screen once close to the entrance.
watch(
  () => map.gps,
  (pos) => {
    if (!pos || !ok.value || map.start?.source !== 'gps') return
    if (distanceBetween(pos, result.value.entrance) <= ARRIVE_M) arrive()
  },
)
</script>

<template>
  <main class="flex h-dvh flex-col">
    <div class="relative h-[45dvh] shrink-0">
      <MapCanvas
        :buildings="map.buildings"
        :extra-points="map.nodes"
        :user-pos="map.gps"
        :start-point="map.start?.node"
        :route="ok ? result.points : []"
        :highlight-id="buildingId"
      />
      <button
        type="button"
        class="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-[1000] flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl shadow-md"
        aria-label="Back"
        @click="router.back()"
      >
        ←
      </button>
    </div>

    <section class="-mt-4 flex-1 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] relative z-[1000]">
      <p v-if="map.status !== 'ready'" class="text-sm text-slate-500">Loading campus data…</p>

      <template v-else-if="!building">
        <p class="font-medium">Building not found.</p>
        <RouterLink to="/" class="mt-2 inline-block font-semibold text-blue-700">Back to map</RouterLink>
      </template>

      <template v-else>
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Directions to</p>
        <h1 class="text-xl font-semibold">{{ building.name }}</h1>
        <p v-if="roomInfo" class="text-sm text-slate-600">
          {{ roomInfo.room.name }} is on the <span class="font-medium">{{ roomInfo.floor.label }}</span>
        </p>

        <div class="mt-3"><StartStatus /></div>

        <!-- No start yet: let the visitor pick a named point -->
        <div v-if="result?.error === 'no-start'" class="mt-4">
          <p class="text-sm text-slate-600">Turn on location, scan a campus QR code, or pick where you are:</p>
          <select
            class="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3"
            @change="map.setFromCode($event.target.value || null)"
          >
            <option value="">Choose a starting point…</option>
            <option v-for="n in namedPoints" :key="n.id" :value="n.code">{{ n.label || n.code }}</option>
          </select>
        </div>

        <p v-else-if="result?.error" class="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{{ result.error }}</p>

        <template v-else-if="ok">
          <div class="mt-4 flex items-baseline gap-3">
            <span class="text-2xl font-bold">{{ walkingMinutes(result.distance) }} min</span>
            <span class="text-slate-500">{{ formatDistance(result.distance) }} walk</span>
          </div>
          <div class="mt-4">
            <RouteSteps :steps="result.steps" />
          </div>
          <button type="button" class="mt-6 w-full rounded-xl bg-blue-700 py-3 font-semibold text-white active:bg-blue-800" @click="arrive">
            I've arrived
          </button>
        </template>
      </template>
    </section>
  </main>
</template>
