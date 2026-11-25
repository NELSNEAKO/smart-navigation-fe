<script setup>
// Pick a point: "Use my current location" (GPS), then drag the pin or tap the map to fine-tune.
import { computed, ref, watch } from 'vue'
import L from 'leaflet'
import { useMapStore } from '../../stores/map'
import MapCanvas from '../MapCanvas.vue'
import AppIcon from '../ui/AppIcon.vue'
import UiButton from '../ui/UiButton.vue'

const model = defineModel({ type: Object, default: null }) // { lat, lng }
const props = defineProps({
  // The building being edited: hidden from the map so its label doesn't cover the pin.
  excludeId: { type: String, default: null },
})
const campus = useMapStore()
const otherBuildings = computed(() => campus.buildings.filter((b) => b.id !== props.excludeId))

const locating = ref(false)
const gpsMsg = ref({ text: '', tone: 'muted' })
let map
let marker

const round = (n) => Math.round(n * 1e7) / 1e7

function placeMarker() {
  if (!map) return
  if (!model.value) {
    marker?.remove()
    marker = null
    return
  }
  const ll = [model.value.lat, model.value.lng]
  if (!marker) {
    marker = L.marker(ll, { draggable: true, autoPan: true }).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLatLng()
      model.value = { lat: round(p.lat), lng: round(p.lng) }
    })
  } else {
    marker.setLatLng(ll)
  }
}

function onReady(m) {
  map = m
  placeMarker()
  // No animation: the drawer is still sliding in, and an animated zoom during a resize
  // leaves Leaflet's vector layer stretched.
  if (model.value) map.setView([model.value.lat, model.value.lng], 19, { animate: false })
}

function useMyLocation() {
  if (!('geolocation' in navigator)) {
    gpsMsg.value = { text: 'Location is not available on this device. Tap the map instead.', tone: 'error' }
    return
  }
  locating.value = true
  gpsMsg.value = { text: '', tone: 'muted' }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      model.value = { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) }
      gpsMsg.value = { text: `Found you (±${Math.round(pos.coords.accuracy)} m). Drag the pin onto the building to fine-tune.`, tone: 'success' }
      map?.setView([model.value.lat, model.value.lng], 19)
    },
    () => {
      locating.value = false
      gpsMsg.value = { text: 'Could not get your location. Allow location access, or tap the map instead.', tone: 'error' }
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  )
}

watch(model, placeMarker, { deep: true })
</script>

<template>
  <div class="space-y-3">
    <div class="relative h-64 overflow-hidden rounded-xl border border-line">
      <MapCanvas
        :buildings="otherBuildings"
        :extra-points="campus.nodes"
        :lock-to-campus="false"
        @ready="onReady"
        @map-click="model = { lat: round($event.lat), lng: round($event.lng) }"
      />
      <div v-if="!model" class="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] rounded-lg bg-ink/85 px-3 py-2 text-center text-sm text-white">
        Tap the map where the building is
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <UiButton variant="secondary" size="sm" icon="locate" :loading="locating" @click="useMyLocation">
        {{ locating ? 'Locating…' : 'Use my current location' }}
      </UiButton>
      <span v-if="model" class="inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted">
        <AppIcon name="pin" :size="14" />{{ model.lat.toFixed(6) }}, {{ model.lng.toFixed(6) }}
      </span>
    </div>
    <p v-if="gpsMsg.text" class="text-sm" :class="{ 'text-success-600': gpsMsg.tone === 'success', 'text-danger-600': gpsMsg.tone === 'error' }">
      {{ gpsMsg.text }}
    </p>
  </div>
</template>
