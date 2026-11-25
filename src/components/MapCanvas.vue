<script setup>
// Leaflet map locked to the campus. Draws buildings, the visitor's position and a route.
// Admin screens add their own layers through the `ready` event (they get the Leaflet map).
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import { FALLBACK_CENTER, FALLBACK_ZOOM, BOUNDS_PADDING_DEG, TILE_URL, TILE_ATTRIBUTION } from '../lib/campus'

const props = defineProps({
  buildings: { type: Array, default: () => [] },
  // Extra points (e.g. walkway nodes) that should be inside the locked area.
  extraPoints: { type: Array, default: () => [] },
  userPos: { type: Object, default: null }, // { lat, lng, accuracy }
  startPoint: { type: Object, default: null }, // QR start { lat, lng }
  route: { type: Array, default: () => [] }, // [{ lat, lng }]
  highlightId: { type: String, default: null },
  lockToCampus: { type: Boolean, default: true },
})
const emit = defineEmits(['ready', 'building-click', 'map-click'])

const el = ref(null)
let map
const layers = { buildings: null, user: null, start: null, route: null }

function campusBounds() {
  const pts = [...props.buildings, ...props.extraPoints].filter((p) => p && Number.isFinite(p.lat))
  if (!pts.length) return null
  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  const pad = BOUNDS_PADDING_DEG
  return L.latLngBounds([Math.min(...lats) - pad, Math.min(...lngs) - pad], [Math.max(...lats) + pad, Math.max(...lngs) + pad])
}

let lockedOnce = false
function applyBounds() {
  const bounds = campusBounds()
  if (!bounds) return
  if (props.lockToCampus) {
    map.setMaxBounds(bounds)
    map.options.maxBoundsViscosity = 1
  }
  if (!lockedOnce) {
    // Compute the campus zoom directly; getZoom() is stale while an animation runs.
    const campusZoom = map.getBoundsZoom(bounds, false, L.point(16, 16))
    if (props.lockToCampus) map.setMinZoom(Math.max(campusZoom - 1, 14)) // one level out, no further
    map.fitBounds(bounds, { padding: [16, 16], animate: false })
    lockedOnce = true
  }
}

function drawBuildings() {
  layers.buildings?.remove()
  layers.buildings = L.layerGroup(
    props.buildings.map((b) => {
      const active = b.id === props.highlightId
      return L.circleMarker([b.lat, b.lng], {
        radius: active ? 11 : 8,
        color: '#fff',
        weight: 2,
        fillColor: active ? '#dc2626' : '#1d4ed8',
        fillOpacity: 1,
      })
        .bindTooltip(b.name, { permanent: true, direction: 'top', offset: [0, -8], className: 'text-xs' })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e) // don't also fire map-click
          emit('building-click', b)
        })
    }),
  ).addTo(map)
}

function drawUser() {
  layers.user?.remove()
  layers.user = null
  const p = props.userPos
  if (!p) return
  layers.user = L.layerGroup([
    L.circle([p.lat, p.lng], { radius: Math.min(p.accuracy || 0, 100), color: '#2563eb', weight: 1, fillOpacity: 0.12 }),
    L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }),
  ]).addTo(map)
}

function drawStart() {
  layers.start?.remove()
  layers.start = null
  const p = props.startPoint
  if (!p) return
  layers.start = L.circleMarker([p.lat, p.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#16a34a', fillOpacity: 1 })
    .bindTooltip('Start', { direction: 'top', offset: [0, -8] })
    .addTo(map)
}

let fittedRouteKey = null
function drawRoute() {
  layers.route?.remove()
  layers.route = null
  if (props.route.length < 2) return
  const latlngs = props.route.map((p) => [p.lat, p.lng])
  layers.route = L.layerGroup([
    L.polyline(latlngs, { color: '#fff', weight: 9, opacity: 0.9 }),
    L.polyline(latlngs, { color: '#2563eb', weight: 5 }),
  ]).addTo(map)
  // Zoom to the route once per destination, not on every GPS update.
  const end = latlngs[latlngs.length - 1].join(',')
  if (end !== fittedRouteKey) {
    map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 19 })
    fittedRouteKey = end
  }
}

onMounted(() => {
  map = L.map(el.value, { zoomControl: false, maxZoom: 20 }).setView(FALLBACK_CENTER, FALLBACK_ZOOM)
  L.tileLayer(TILE_URL, { maxZoom: 20, maxNativeZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  map.on('click', (e) => emit('map-click', { lat: e.latlng.lat, lng: e.latlng.lng }))

  applyBounds()
  drawBuildings()
  drawUser()
  drawStart()
  drawRoute()
  emit('ready', map)
})

onBeforeUnmount(() => map?.remove())

watch(() => [props.buildings, props.extraPoints], () => {
  applyBounds()
  drawBuildings()
})
watch(() => props.highlightId, drawBuildings)
watch(() => props.userPos, drawUser)
watch(() => props.startPoint, drawStart)
watch(() => props.route, drawRoute)

defineExpose({
  flyTo: (lat, lng, zoom = 19) => map?.flyTo([lat, lng], zoom),
  getMap: () => map,
})
</script>

<template>
  <div ref="el" class="h-full w-full bg-slate-100" />
</template>
