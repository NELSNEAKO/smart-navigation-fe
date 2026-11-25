<script setup>
// Pick a point: "Use my current location" (GPS), then drag the pin or tap the map to fine-tune.
import { ref, watch } from 'vue'
import L from 'leaflet'
import { useMapStore } from '../../stores/map'
import MapCanvas from '../MapCanvas.vue'

const model = defineModel({ type: Object, default: null }) // { lat, lng }
const campus = useMapStore()

const locating = ref(false)
const gpsMsg = ref('')
let map
let marker

function placeMarker() {
  if (!map) return
  if (!model.value) {
    marker?.remove()
    marker = null
    return
  }
  const ll = [model.value.lat, model.value.lng]
  if (!marker) {
    marker = L.marker(ll, { draggable: true }).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLatLng()
      model.value = { lat: round(p.lat), lng: round(p.lng) }
    })
  } else {
    marker.setLatLng(ll)
  }
}

const round = (n) => Math.round(n * 1e7) / 1e7

function onReady(m) {
  map = m
  placeMarker()
  if (model.value) map.setView([model.value.lat, model.value.lng], 19)
}

function useMyLocation() {
  if (!('geolocation' in navigator)) {
    gpsMsg.value = 'Location is not available on this device.'
    return
  }
  locating.value = true
  gpsMsg.value = ''
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      model.value = { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) }
      gpsMsg.value = `Accuracy about ±${Math.round(pos.coords.accuracy)} m. Drag the pin to fine-tune.`
      map?.setView([model.value.lat, model.value.lng], 19)
    },
    () => {
      locating.value = false
      gpsMsg.value = 'Could not get your location. Tap the map instead.'
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  )
}

watch(model, placeMarker, { deep: true })
</script>

<template>
  <div class="space-y-2">
    <div class="h-56 overflow-hidden rounded-xl ring-1 ring-slate-200">
      <MapCanvas
        :buildings="campus.buildings"
        :extra-points="campus.nodes"
        :lock-to-campus="false"
        @ready="onReady"
        @map-click="model = { lat: round($event.lat), lng: round($event.lng) }"
      />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-60" :disabled="locating" @click="useMyLocation">
        {{ locating ? 'Locating…' : 'Use my current location' }}
      </button>
      <span v-if="model" class="text-xs text-slate-500">{{ model.lat }}, {{ model.lng }}</span>
    </div>
    <p v-if="gpsMsg" class="text-xs text-slate-600">{{ gpsMsg }}</p>
  </div>
</template>
