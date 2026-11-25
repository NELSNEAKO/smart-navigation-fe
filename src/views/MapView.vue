<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMapStore } from '../stores/map'
import { distanceBetween } from '../lib/geo'
import MapCanvas from '../components/MapCanvas.vue'
import SearchBar from '../components/SearchBar.vue'
import BuildingCard from '../components/BuildingCard.vue'
import StartStatus from '../components/StartStatus.vue'

const map = useMapStore()
const router = useRouter()
const selected = ref(null)

onMounted(() => map.startGps())

const here = computed(() => map.start?.node ?? map.gps)
const selectedDistance = computed(() => (selected.value && here.value ? distanceBetween(here.value, selected.value) : null))
const nextEvent = computed(() => map.events[0] ?? null)

function goDirections(b) {
  router.push({ name: 'route', params: { buildingId: b.id } })
}

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
</script>

<template>
  <main class="relative h-dvh w-full overflow-hidden">
    <MapCanvas
      :buildings="map.buildings"
      :extra-points="map.nodes"
      :user-pos="map.gps"
      :start-point="map.start?.source === 'qr' ? map.start.node : null"
      :highlight-id="selected?.id"
      @building-click="selected = $event"
      @map-click="selected = null"
    />

    <!-- Top: search + start status -->
    <div class="pointer-events-none absolute inset-x-0 top-0 z-[1000] space-y-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div class="pointer-events-auto">
        <SearchBar readonly @activate="router.push({ name: 'search' })" />
      </div>
      <div class="pointer-events-auto">
        <StartStatus />
      </div>
    </div>

    <!-- Bottom sheet -->
    <div class="absolute inset-x-0 bottom-0 z-[1000] space-y-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div v-if="map.status === 'loading'" class="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-lg">
        Loading the campus map… The server may take up to a minute to wake up the first time.
      </div>
      <div v-else-if="map.status === 'error'" class="rounded-2xl bg-white p-4 text-sm shadow-lg">
        <p class="font-medium text-red-700">Could not load the campus map.</p>
        <p class="text-slate-600">{{ map.error }}</p>
        <button type="button" class="mt-2 font-semibold text-blue-700" @click="map.load(true)">Try again</button>
      </div>

      <BuildingCard
        v-if="selected"
        :building="selected"
        :distance="selectedDistance"
        @directions="goDirections"
        @close="selected = null"
      />
      <template v-else>
        <button
          v-if="map.nearestBuilding && map.nearestBuilding.distance < 40"
          type="button"
          class="w-full rounded-2xl bg-white p-3 text-left text-sm shadow-lg"
          @click="selected = map.nearestBuilding.item"
        >
          You are near <span class="font-semibold">{{ map.nearestBuilding.item.name }}</span>
        </button>
        <div v-if="nextEvent" class="rounded-2xl bg-blue-700 p-4 text-white shadow-lg">
          <p class="text-xs font-semibold uppercase tracking-wide text-blue-200">Campus event</p>
          <p class="font-semibold">{{ nextEvent.title }}</p>
          <p class="text-sm text-blue-100">{{ formatWhen(nextEvent.startsAt) }}</p>
          <p class="mt-1 line-clamp-2 text-sm text-blue-50">{{ nextEvent.body }}</p>
        </div>
      </template>
    </div>
  </main>
</template>
