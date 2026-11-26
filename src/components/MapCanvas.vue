<script setup>
// Leaflet map locked to the campus. Draws buildings, the visitor's position and a route.
// Admin screens add their own layers through the `ready` event (they get the Leaflet map).
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import { FALLBACK_CENTER, FALLBACK_ZOOM, BOUNDS_PADDING_DEG, TILE_URL, TILE_ATTRIBUTION } from '../lib/campus'
import { distanceBetween } from '../lib/geo'
import { areaBounds, circleRing } from '../lib/campusArea'
import { CAMPUS_COLORS as C, WALKWAY_WIDTH_M, DEFAULT_ROAD_WIDTH_M, DEFAULT_CROSSING_WIDTH_M, centroid, metersPerPixel } from '../lib/campusStyle'
import { useMapStore } from '../stores/map'

const props = defineProps({
  buildings: { type: Array, default: () => [] },
  // Extra points (e.g. walkway nodes) that should be inside the locked area.
  extraPoints: { type: Array, default: () => [] },
  userPos: { type: Object, default: null }, // { lat, lng, accuracy }
  startPoint: { type: Object, default: null }, // QR start { lat, lng }
  route: { type: Array, default: () => [] }, // [{ lat, lng }]
  highlightId: { type: String, default: null },
  lockToCampus: { type: Boolean, default: true },
  // Navigation mode: keep the map centred on userPos as it moves.
  follow: { type: Boolean, default: false },
  // Campus area to show ({ lat, lng, radiusM }). Defaults to the one the admin saved;
  // the Campus area admin screen passes its unsaved draft for a live preview. null = none.
  campusArea: { type: Object, default: undefined },
  // 'auto': the drawn campus map once a campus area is set (street map before that).
  // 'street': always OpenStreetMap (e.g. the Campus area screen, to find the campus).
  // 'guide': the drawn campus on top of the street map, as a tracing guide (Admin → Map).
  basemap: { type: String, default: 'auto' },
  // Draw walkway paths as white walkways (the admin Paths editor draws its own lines instead).
  showWalkways: { type: Boolean, default: true },
  // Draw roads, crossings and areas (the admin Campus map editor draws editable ones itself).
  showFeatures: { type: Boolean, default: true },
})
const emit = defineEmits(['ready', 'building-click', 'map-click'])

const el = ref(null)
let map
const layers = { buildings: null, user: null, start: null, route: null, mask: null, campus: null }
let tiles = null

const store = useMapStore()
const area = computed(() => (props.campusArea !== undefined ? props.campusArea : store.campus))
const drawn = computed(() => props.basemap !== 'street' && !!area.value)
const guide = computed(() => props.basemap === 'guide')

// Points farther than this from the middle of the data (e.g. a building saved in the
// wrong city by mistake) are left out, so one bad pin can't zoom the map out to sea.
const OUTLIER_M = 2000
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const toLeafletBounds = (b) => L.latLngBounds([b.south, b.west], [b.north, b.east])

function campusBounds() {
  // The admin's campus area wins: show exactly that circle.
  if (area.value) return toLeafletBounds(areaBounds(area.value, 0.05))
  let pts = [...props.buildings, ...props.extraPoints].filter((p) => p && Number.isFinite(p.lat))
  if (!pts.length) return null
  const mid = { lat: median(pts.map((p) => p.lat)), lng: median(pts.map((p) => p.lng)) }
  const near = pts.filter((p) => distanceBetween(p, mid) <= OUTLIER_M)
  if (near.length) pts = near
  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  const pad = BOUNDS_PADDING_DEG
  return L.latLngBounds([Math.min(...lats) - pad, Math.min(...lngs) - pad], [Math.max(...lats) + pad, Math.max(...lngs) + pad])
}

let lockedOnce = false
function applyBounds() {
  const bounds = campusBounds()
  if (!bounds) return
  // A map with no size yet (styles still loading, hidden tab) would "fit" at max zoom.
  // Wait: the ResizeObserver calls applyBounds again once the box has a real size.
  const size = map.getSize()
  if (!lockedOnce && (size.x < 50 || size.y < 50)) return
  if (!lockedOnce) {
    // Move to the campus FIRST, then lock. Locking while the view is still elsewhere (or
    // unsized) makes Leaflet drag it to the nearest edge of the allowed area, off-centre.
    map.setMaxBounds(null)
    // Compute the campus zoom directly; getZoom() is stale while an animation runs.
    const campusZoom = map.getBoundsZoom(bounds, false, L.point(16, 16))
    if (props.lockToCampus) map.setMinZoom(Math.max(campusZoom - 1, 14)) // one level out, no further
    map.setView(bounds.getCenter(), campusZoom, { animate: false })
    lockedOnce = true
  }
  if (props.lockToCampus) {
    // With a campus area, allow a little slack around the circle so its edge can be centred.
    map.setMaxBounds(area.value ? toLeafletBounds(areaBounds(area.value, 0.35)) : bounds)
    map.options.maxBoundsViscosity = 1
  }
}

// Street map with a campus area (only the Admin → Campus screen): no cover over the map, just
// a thin outline so the admin can see the circle they are setting. The drawn map needs neither.
function drawMask() {
  layers.mask?.remove()
  layers.mask = null
  if (!area.value || drawn.value) return
  const ring = circleRing(area.value).map((p) => [p.lat, p.lng])
  layers.mask = L.polyline(ring, { pane: 'campusMask', color: '#1d4ed8', weight: 2, opacity: 0.7, dashArray: '6 6', interactive: false }).addTo(map)
}

// Street tiles only when not showing the drawn campus map (or as the admin's tracing guide).
// The drawn map has no circle: the whole background is campus ground.
function applyBasemap() {
  if (!map) return
  if (drawn.value && !guide.value) {
    tiles?.remove()
    el.value.style.background = C.land
  } else {
    if (tiles && !map.hasLayer(tiles)) tiles.addTo(map)
    el.value.style.background = ''
  }
}

// Width in pixels for something that is "meters" wide on the ground, at the current zoom.
const px = (meters, min = 2) => Math.max(min, meters / metersPerPixel(map.getCenter().lat, map.getZoom()))

// The drawn campus: land, areas, roads, crossings and walkways (buildings: drawBuildings).
function drawCampus() {
  layers.campus?.remove()
  layers.campus = null
  if (!map || !drawn.value) return
  const g = L.layerGroup()
  const base = { pane: 'campusBase', interactive: false }
  const ll = (pts) => pts.map((p) => [p.lat, p.lng])


  for (const ft of props.showFeatures ? store.features : []) {
    if (!Array.isArray(ft.points) || ft.points.length < 2) continue
    if (ft.kind === 'area') {
      L.polygon(ll(ft.points), { ...base, color: C.areaStroke, weight: 1, fillColor: C.area, fillOpacity: 1 }).addTo(g)
    } else if (ft.kind === 'road') {
      const w = px(ft.widthM || DEFAULT_ROAD_WIDTH_M, 6)
      L.polyline(ll(ft.points), { ...base, color: C.road, weight: w, lineCap: 'butt', lineJoin: 'round' }).addTo(g)
      L.polyline(ll(ft.points), { ...base, color: C.roadCenter, weight: Math.max(1.5, w / 12), dashArray: w * 0.9 + ' ' + w * 0.7, lineCap: 'butt' }).addTo(g)
    }
  }
  if (props.showWalkways) {
    const w = px(WALKWAY_WIDTH_M, 4)
    for (const e of store.edges) {
      const a = store.nodeById.get(e.fromId)
      const b = store.nodeById.get(e.toId)
      if (a && b) {
        L.polyline(
          [
            [a.lat, a.lng],
            [b.lat, b.lng],
          ],
          { ...base, color: C.walkway, weight: w, lineCap: 'round', lineJoin: 'round' },
        ).addTo(g)
      }
    }
  }
  for (const ft of props.showFeatures ? store.features : []) {
    if (ft.kind !== 'crossing' || !Array.isArray(ft.points) || ft.points.length < 2) continue
    const w = px(ft.widthM || DEFAULT_CROSSING_WIDTH_M, 4)
    const dash = Math.max(3, w * 0.45)
    L.polyline(ll(ft.points), { ...base, color: C.crossing, weight: w, dashArray: dash + ' ' + dash, lineCap: 'butt' }).addTo(g)
  }
  layers.campus = g.addTo(map)
}

const hasShape = (b) => Array.isArray(b.shape?.points) && b.shape.points.length >= 3

function escapeHtml(t) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(t).replace(/[&<>"']/g, (ch) => map[ch])
}

function drawBuildings() {
  layers.buildings?.remove()
  layers.buildings = L.layerGroup(
    props.buildings.flatMap((b) => {
      const active = b.id === props.highlightId
      if (drawn.value && hasShape(b)) {
        const click = (e) => {
          L.DomEvent.stopPropagation(e) // don't also fire map-click
          emit('building-click', b)
        }
        const c = centroid(b.shape.points)
        return [
          L.polygon(
            b.shape.points.map((p) => [p.lat, p.lng]),
            {
              color: active ? C.buildingActiveStroke : C.buildingStroke,
              weight: active ? 3 : 1.5,
              fillColor: active ? C.buildingActive : C.building,
              fillOpacity: 1,
              lineJoin: 'round',
            },
          ).on('click', click),
          L.marker([c.lat, c.lng], {
            pane: 'campusLabels',
            interactive: false,
            icon: L.divIcon({
              className: 'campus-label',
              iconSize: null,
              html: '<span class="block -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[12px] font-semibold" style="color:' + C.buildingLabel + '">' + escapeHtml(b.name) + '</span>',
            }),
          }),
        ]
      }
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
  // Quarter-step zoom so the campus can fill the screen exactly (whole steps leave it small).
  map = L.map(el.value, { zoomControl: false, maxZoom: 20, zoomSnap: 0.25, zoomDelta: 0.5 }).setView(FALLBACK_CENTER, FALLBACK_ZOOM)
  tiles = L.tileLayer(TILE_URL, { maxZoom: 20, maxNativeZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  map.createPane('campusMask').style.zIndex = 350 // campus outline on the street map (Admin → Campus)
  map.createPane('campusBase').style.zIndex = 250 // drawn land, roads, walkways: under buildings and routes
  map.createPane('campusLabels').style.zIndex = 450 // building names above routes
  map.getPane('campusLabels').style.pointerEvents = 'none'
  map.on('zoomend', drawCampus) // ground widths in metres -> pixels change with zoom
  map.on('click', (e) => emit('map-click', { lat: e.latlng.lat, lng: e.latlng.lng }))

  applyBasemap()
  applyBounds()
  drawMask()
  drawCampus()
  drawBuildings()
  drawUser()
  drawStart()
  drawRoute()
  emit('ready', map)

  // Redraw correctly when the box changes size (drawers, tabs, collapsing panels).
  resizeObserver = new ResizeObserver(() => {
    if (!map) return
    map.invalidateSize({ animate: false, pan: false })
    if (!lockedOnce) applyBounds() // first real size: fit the campus now
  })
  resizeObserver.observe(el.value)
})

let resizeObserver
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  map?.remove()
})

watch(() => [props.buildings, props.extraPoints], () => {
  applyBounds()
  drawBuildings()
})
watch(() => props.highlightId, drawBuildings)
watch([drawn, guide], () => {
  applyBasemap()
  drawMask()
  drawCampus()
  drawBuildings()
})
watch(() => [store.features, store.edges, store.nodes], drawCampus)
watch(
  area,
  () => {
    drawMask()
    drawCampus()
    // The saved campus area (not a live admin preview) re-centres and re-locks the map.
    if (props.campusArea === undefined) {
      lockedOnce = false
      applyBounds()
    }
  },
  { deep: true },
)
watch(
  () => props.userPos,
  (p) => {
    drawUser()
    if (props.follow && p) map.panTo([p.lat, p.lng], { animate: true })
  },
)
watch(
  () => props.follow,
  (on) => {
    if (on && props.userPos) map.setView([props.userPos.lat, props.userPos.lng], Math.max(map.getZoom(), 19))
  },
)
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
