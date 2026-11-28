<script setup>
// Destination card: what the building is, how far, what's inside, and a big Start button.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMapStore } from '../stores/map'
import { categoryById } from '../lib/categories'
import { formatDistance, walkingMinutes } from '../lib/geo'
import AppIcon from '../components/ui/AppIcon.vue'
import StartStatus from '../components/StartStatus.vue'
import { askCompassPermission } from '../composables/useHeading'
import PhotoGallery from '../components/PhotoGallery.vue'
import RoomSheet from '../components/RoomSheet.vue'
import { photosOf } from '../lib/photos'

const map = useMapStore()
const route = useRoute()
const router = useRouter()
onMounted(() => map.initLocation())

const building = computed(() => map.buildingById.get(route.params.buildingId))
const category = computed(() => categoryById[building.value?.category])
const roomId = computed(() => route.query.room || null)
const roomInfo = computed(() => (roomId.value ? map.findRoom(roomId.value) : null))
const trip = computed(() => {
  if (!building.value || map.status !== 'ready') return null
  const r = map.routeTo(building.value.id)
  return r.error ? null : r
})
const roomCount = computed(() => (building.value?.floors ?? []).reduce((n, f) => n + (f.rooms?.length ?? 0), 0))
const typeLabel = { classroom: 'Classroom', office: 'Office', restroom: 'Restroom', lab: 'Laboratory' }
const photos = computed(() => photosOf(building.value))

// Room details sheet
const openRoom = ref(null) // { room, floor }
const showRoom = (room, floor) => (openRoom.value = { room, floor })
const hasDetails = (room) => !!(room.photoIds?.length || room.description || room.notes)

// Ask for the location first (with an explanation), so navigation never sits waiting for GPS.
async function start() {
  askCompassPermission() // iPhone: must be asked inside the tap
  const how = await map.askLocation()
  if (how === 'cancel') return
  const room = roomId.value ? { room: roomId.value } : {}
  router.push({ name: 'route', params: { buildingId: building.value.id }, query: how === 'pick' ? { pick: '1', ...room } : { go: '1', ...room } })
}
function preview() {
  router.push({ name: 'route', params: { buildingId: building.value.id }, query: roomId.value ? { room: roomId.value } : {} })
}
function back() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}
</script>

<template>
  <main class="min-h-dvh bg-canvas font-sans text-ink">
    <div v-if="map.status !== 'ready'" class="flex min-h-dvh items-center justify-center text-sm text-ink-muted">
      <AppIcon name="loader" :size="18" class="mr-2 animate-spin text-primary-600" /> Loading…
    </div>

    <div v-else-if="!building" class="mx-auto max-w-xl p-6 text-center">
      <p class="font-medium">This place could not be found.</p>
      <RouterLink to="/" class="mt-3 inline-block font-semibold text-primary-600">Back to search</RouterLink>
    </div>

    <template v-else>
      <!-- Hero -->
      <div class="relative">
        <PhotoGallery v-if="photos.length" :photos="photos" :alt="building.name" height-class="h-64" />
        <div v-else class="flex h-44 w-full items-center justify-center bg-primary-700 text-white/90">
          <AppIcon :name="category?.icon || 'building'" :size="56" />
        </div>
        <button
          type="button"
          class="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface/95 text-ink shadow-md"
          aria-label="Back"
          @click="back"
        >
          <AppIcon name="chevron-left" />
        </button>
      </div>

      <div class="relative mx-auto -mt-6 max-w-xl px-4 pb-36">
        <section class="rounded-2xl bg-surface p-5 shadow-lg ring-1 ring-line">
          <span v-if="category" class="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
            <AppIcon :name="category.icon" :size="14" />{{ category.label }}
          </span>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight">{{ building.name }}</h1>
          <p v-if="building.description" class="mt-1 whitespace-pre-line text-ink-soft">{{ building.description }}</p>

          <!-- Room you searched for -->
          <div v-if="roomInfo" class="mt-4 flex gap-3 rounded-xl bg-warning-50 p-3 ring-1 ring-warning-600/20">
            <AppIcon name="door" :size="20" class="mt-0.5 text-warning-600" />
            <p class="text-sm">
              <b class="font-semibold">{{ roomInfo.room.name }}</b> is on the <b class="font-semibold">{{ roomInfo.floor.label }}</b>.
              <span v-if="roomInfo.room.notes" class="text-ink-soft">{{ roomInfo.room.notes }}</span>
              <button v-if="hasDetails(roomInfo.room)" type="button" class="mt-1 flex items-center gap-1 font-semibold text-primary-600" @click="showRoom(roomInfo.room, roomInfo.floor)">
                <AppIcon :name="roomInfo.room.photoIds?.length ? 'image' : 'info'" :size="16" /> See room details
              </button>
            </p>
          </div>

          <!-- Trip summary -->
          <div class="mt-4 grid grid-cols-3 divide-x divide-line rounded-xl bg-canvas py-3 text-center ring-1 ring-line">
            <div>
              <p class="text-lg font-semibold tabular-nums">{{ trip ? `${walkingMinutes(trip.distance)} min` : '–' }}</p>
              <p class="text-xs text-ink-muted">walk</p>
            </div>
            <div>
              <p class="text-lg font-semibold tabular-nums">{{ trip ? formatDistance(trip.distance) : '–' }}</p>
              <p class="text-xs text-ink-muted">distance</p>
            </div>
            <div>
              <p class="text-lg font-semibold tabular-nums">{{ building.floors?.length || 0 }}</p>
              <p class="text-xs text-ink-muted">floor{{ building.floors?.length === 1 ? '' : 's' }}</p>
            </div>
          </div>
          <div class="mt-3"><StartStatus /></div>
        </section>

        <!-- Inside -->
        <section v-if="building.floors?.length" class="mt-4 rounded-2xl bg-surface ring-1 ring-line">
          <h2 class="border-b border-line px-5 py-3 text-base font-semibold">Inside · {{ roomCount }} room{{ roomCount === 1 ? '' : 's' }}</h2>
          <details v-for="floor in building.floors" :key="floor.id" class="group border-b border-line last:border-b-0" :open="roomInfo?.floor.id === floor.id || building.floors.length === 1">
            <summary class="flex cursor-pointer list-none items-center justify-between px-5 py-3">
              <span class="flex items-center gap-2 font-medium"><AppIcon name="layers" :size="16" class="text-ink-muted" />{{ floor.label }}</span>
              <span class="flex items-center gap-2 text-sm text-ink-muted">{{ floor.rooms?.length || 0 }} <AppIcon name="chevron-right" :size="16" class="transition-transform group-open:rotate-90" /></span>
            </summary>
            <PhotoGallery v-if="floor.photoIds?.length" :photos="photosOf(floor)" :alt="`${floor.label}, ${building.name}`" height-class="h-44" rounded class="mx-5 mb-2" />
            <ul class="pb-2">
              <li v-for="room in floor.rooms" :key="room.id">
                <button type="button" class="flex w-full items-center gap-3 px-5 py-2 text-left text-sm active:bg-canvas" :class="room.id === roomId ? 'bg-warning-50 font-semibold' : ''" @click="showRoom(room, floor)">
                  <img v-if="room.photoIds?.length" :src="photosOf(room)[0]" alt="" class="h-9 w-9 shrink-0 rounded-md object-cover" loading="lazy" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate">{{ room.name }}</span>
                    <span v-if="room.description" class="block truncate text-xs font-normal text-ink-muted">{{ room.description }}</span>
                  </span>
                  <span class="shrink-0 text-ink-muted">{{ typeLabel[room.type] }}</span>
                  <AppIcon name="chevron-right" :size="16" class="shrink-0 text-ink-muted" />
                </button>
              </li>
              <li v-if="!floor.rooms?.length" class="px-5 py-2 text-sm text-ink-muted">No rooms listed.</li>
            </ul>
          </details>
        </section>

        <p class="mt-4 px-1 text-xs text-ink-muted">Directions take you to the building entrance. Tap a room to see its photos and details.</p>
      </div>

      <RoomSheet :room="openRoom?.room" :floor="openRoom?.floor" :building-name="building.name" @close="openRoom = null" />

      <!-- Sticky actions -->
      <div class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div class="mx-auto flex max-w-xl gap-2">
          <button type="button" class="flex h-13 items-center justify-center gap-2 rounded-xl px-4 font-semibold text-primary-600 ring-1 ring-line active:bg-canvas" @click="preview">
            <AppIcon name="route" :size="20" /> Route
          </button>
          <button type="button" class="flex h-13 flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 text-lg font-semibold text-white shadow-md active:bg-primary-700" @click="start">
            <AppIcon name="navigation" :size="20" /> Start navigation
          </button>
        </div>
      </div>
    </template>
  </main>
</template>
