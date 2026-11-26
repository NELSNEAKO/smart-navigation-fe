<script setup>
// Full-screen turn-by-turn navigation, like a phone maps app on foot:
// tilted map that turns with you, blue arrow + facing cone, maneuver banner,
// bottom bar (time · distance · arrival time), compass / recenter / voice buttons,
// rerouting, "just ahead", precise arrival, and a simulated walk for demos.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMapStore, arrivalRadius, ARRIVE_ARM_M, ARRIVE_CONFIRM_READINGS, ARRIVE_MAX_ACCURACY_M } from '../../stores/map'
import { distanceBetween, formatDistance, walkingMinutes } from '../../lib/geo'
import { buildManeuvers, pointAlong, snapToRoute } from '../../lib/maneuvers'
import { useHeading } from '../../composables/useHeading'
import { areaBounds } from '../../lib/campusArea'
import { campusMapStyle } from '../../lib/campusMapStyle'
import ManeuverIcon from './ManeuverIcon.vue'
import AppIcon from '../ui/AppIcon.vue'

const props = defineProps({
  buildingId: { type: String, required: true },
})
const emit = defineEmits(['end', 'arrived'])

const store = useMapStore()
const building = computed(() => store.buildingById.get(props.buildingId))

// ---------------------------------------------------------------- settings
const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}
const hour = new Date().getHours()
const theme = hour >= 18 || hour < 6 ? 'dark' : 'light' // automatic: dark at night
const drawnMap = !!store.campus // use the admin's drawn campus map instead of street tiles
const OFF_ROUTE_M = 20 // further than this from the route (with good GPS) → reroute
const JUST_AHEAD_M = 15
const PITCH = 55
const ZOOM = 18.6

const voiceOn = ref(readPref('campusnav.voice') === 'on') // off until the visitor turns it on
function readPref(k) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function toggleVoice() {
  voiceOn.value = !voiceOn.value
  try {
    localStorage.setItem('campusnav.voice', voiceOn.value ? 'on' : 'off')
  } catch {
    /* fine */
  }
  if (voiceOn.value) speak(primary.value ? spokenFor(primary.value, distToPrimary.value) : 'Voice guidance on')
  else window.speechSynthesis?.cancel()
}

// ---------------------------------------------------------------- route (frozen; replaced on reroute)
const route = shallowRef(null)
const maneuvers = computed(() =>
  route.value ? buildManeuvers(route.value.points, { destination: building.value?.name, targetLabel: route.value.target?.label }) : [],
)
const rerouting = ref(false)
function computeRoute(fromPos) {
  const r = fromPos ? store.routeFrom(fromPos, props.buildingId) : store.routeTo(props.buildingId)
  if (!r.error) {
    route.value = r
    announced.clear()
  }
  return r
}

// ---------------------------------------------------------------- position
const simPos = ref(null) // { lat, lng, bearing }
const liveGps = computed(() => (store.gps && !store.offCampus ? store.gps : null))
const pos = computed(() => simPos.value ?? liveGps.value)
const posAccuracy = computed(() => (simPos.value ? 0 : (pos.value?.accuracy ?? null)))
const gpsWeak = computed(() => posAccuracy.value != null && posAccuracy.value > ARRIVE_MAX_ACCURACY_M)

const snap = computed(() => (route.value && pos.value ? snapToRoute(route.value.points, pos.value) : null))
const total = computed(() => snap.value?.total ?? route.value?.distance ?? 0)
const along = computed(() => snap.value?.along ?? 0)
const remaining = computed(() => Math.max(0, total.value - along.value))
const nowTick = ref(Date.now())
const clockTimer = setInterval(() => (nowTick.value = Date.now()), 30000)
const eta = computed(() => {
  const t = new Date(nowTick.value + walkingMinutes(remaining.value) * 60000)
  return t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
})

// Next maneuver ahead of us, and the one after it.
const nextIdx = computed(() => {
  const list = maneuvers.value
  const i = list.findIndex((m, k) => k > 0 && m.along > along.value + 2)
  return i === -1 ? list.length - 1 : i
})
const primary = computed(() => maneuvers.value[nextIdx.value] ?? null)
const secondary = computed(() => {
  const next = maneuvers.value[nextIdx.value + 1]
  return next && primary.value && next.along - primary.value.along <= 60 ? next : null
})
const distToPrimary = computed(() => (primary.value ? Math.max(0, primary.value.along - along.value) : null))
const justAhead = computed(() => remaining.value <= JUST_AHEAD_M && pos.value)
const departHint = computed(() => (along.value < 8 && maneuvers.value[0]?.text) || null)

// ---------------------------------------------------------------- heading
const compass = useHeading()
const followHeading = ref(true) // map turns with you; tap compass for north-up
const heading = computed(() => {
  if (simPos.value) return simPos.value.bearing
  const g = liveGps.value
  if (g?.heading != null && (g.speed ?? 0) > 0.7) return g.heading // walking: direction of travel
  if (compass.heading.value != null) return compass.heading.value // standing: compass
  return snap.value?.segmentBearing ?? 0 // no sensors: face along the route
})
const calibrate = computed(() => !simPos.value && compass.accuracy.value != null && compass.accuracy.value > 25)

// ---------------------------------------------------------------- arrival (precise rule)
const startPos = ref(null)
const armed = ref(false)
const alreadyHere = ref(false)
let insideCount = 0
function resetArrival() {
  startPos.value = null
  armed.value = false
  alreadyHere.value = false
  insideCount = 0
}

let hasArrived = false
function arrive() {
  if (hasArrived) return // a second reading can land before the screen closes
  hasArrived = true
  speak(`You have arrived at ${building.value?.name ?? 'your destination'}`)
  stopSim(true)
  emit('arrived')
}

let offCount = 0
watch(pos, (p) => {
  if (!p || !route.value) return
  const acc = posAccuracy.value ?? 0
  if (acc > ARRIVE_MAX_ACCURACY_M) {
    insideCount = 0
    return
  }
  // Off route → reroute (live GPS only, 2 readings in a row).
  if (!simPos.value && snap.value) {
    offCount = snap.value.offset > OFF_ROUTE_M ? offCount + 1 : 0
    if (offCount >= 2) {
      offCount = 0
      rerouting.value = true
      speak('Rerouting')
      computeRoute(p)
      setTimeout(() => (rerouting.value = false), 1800)
    }
  }
  const d = distanceBetween(p, route.value.target)
  const radius = arrivalRadius(acc)
  if (!startPos.value) {
    startPos.value = { lat: p.lat, lng: p.lng }
    if (d <= radius) alreadyHere.value = true
    return
  }
  if (!armed.value && (distanceBetween(p, startPos.value) >= ARRIVE_ARM_M || d > radius + ARRIVE_ARM_M)) {
    armed.value = true
    alreadyHere.value = false
  }
  if (!armed.value) return
  insideCount = d <= radius ? insideCount + 1 : 0
  if (insideCount >= ARRIVE_CONFIRM_READINGS) arrive()
})

// ---------------------------------------------------------------- voice
const announced = new Set()
function speak(text) {
  if (!voiceOn.value || !text || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 1
  window.speechSynthesis.speak(u)
}
function spokenFor(m, dist) {
  if (!m) return ''
  if (m.type === 'arrive') return dist > 15 ? `In ${Math.round(dist / 5) * 5} meters, ${m.text.toLowerCase()}` : m.text
  return dist > 15 ? `In ${Math.round(dist / 5) * 5} meters, ${m.text.toLowerCase()}` : m.text
}
watch([nextIdx, distToPrimary], ([i, dist]) => {
  const m = primary.value
  if (!m || dist == null) return
  if (dist <= 40 && dist > 15 && !announced.has(`${i}:far`)) {
    announced.add(`${i}:far`)
    speak(spokenFor(m, dist))
  } else if (dist <= 12 && m.type !== 'arrive' && !announced.has(`${i}:near`)) {
    announced.add(`${i}:near`)
    speak(m.text)
  }
})

// ---------------------------------------------------------------- simulated walk
let simTimer = null
const simulating = ref(false)
function startSim() {
  if (!route.value) return
  resetArrival()
  let m = 0
  const pts = route.value.points
  simPos.value = pointAlong(pts, 0)
  simulating.value = true
  simTimer = setInterval(() => {
    m += 3 // ~6 m/s at 2 ticks/s: about 4x walking speed
    simPos.value = pointAlong(pts, Math.min(m, total.value))
    if (m >= total.value + 6) stopSim(true)
  }, 500)
}
function stopSim(keepPos = false) {
  clearInterval(simTimer)
  simTimer = null
  simulating.value = false
  if (!keepPos) simPos.value = null
}

// ---------------------------------------------------------------- map
const mapEl = ref(null)
let map = null
let userMarker = null
let destMarker = null
const following = ref(true)
const mapBearing = ref(0)
let lastCam = 0
let camTimer = null

function userEl() {
  const el = document.createElement('div')
  el.className = 'pointer-events-none'
  el.innerHTML = `
    <svg width="120" height="120" viewBox="0 0 120 120" style="overflow:visible">
      <defs><radialGradient id="cone" cx="60" cy="60" r="58" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#3b82f6" stop-opacity="0.45"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient></defs>
      <path d="M60 60 L32 4 A58 58 0 0 1 88 4 Z" fill="url(#cone)"/>
      <circle cx="60" cy="60" r="17" fill="white"/>
      <circle cx="60" cy="60" r="13" fill="#1d4ed8"/>
      <path d="M60 49 L68 67 L60 62.5 L52 67 Z" fill="white"/>
    </svg>`
  return el
}

function destEl() {
  const el = document.createElement('div')
  el.innerHTML = `<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 43s15-14.6 15-26A15 15 0 0 0 2 17c0 11.4 15 26 15 26z" fill="#dc2626" stroke="white" stroke-width="2.5"/><circle cx="17" cy="17" r="5.5" fill="white"/></svg>`
  return el
}

function lineFeature(coords) {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.length > 1 ? coords : [] } }
}

function addRouteLayers() {
  if (!map || map.getSource('route-ahead')) return
  // No cover over the map: with a campus area the screen uses the drawn campus map
  // (campusMapStyle), which has nothing outside the campus to hide.
  map.addSource('route-done', { type: 'geojson', data: lineFeature([]) })
  map.addSource('route-ahead', { type: 'geojson', data: lineFeature([]) })
  const lineLayout = { 'line-cap': 'round', 'line-join': 'round' }
  map.addLayer({ id: 'route-done', type: 'line', source: 'route-done', layout: lineLayout, paint: { 'line-color': theme === 'dark' ? '#64748b' : '#94a3b8', 'line-width': 7 } })
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route-ahead', layout: lineLayout, paint: { 'line-color': theme === 'dark' ? '#0c4a6e' : '#ffffff', 'line-width': 13 } })
  map.addLayer({ id: 'route-ahead', type: 'line', source: 'route-ahead', layout: lineLayout, paint: { 'line-color': theme === 'dark' ? '#22d3ee' : '#1d4ed8', 'line-width': 8 } })
  updateRouteLayers()
}

function updateRouteLayers() {
  if (!map?.getSource('route-ahead') || !route.value) return
  const pts = route.value.points.map((p) => [p.lng, p.lat])
  const s = snap.value
  if (!s) {
    map.getSource('route-ahead').setData(lineFeature(pts))
    map.getSource('route-done').setData(lineFeature([]))
    return
  }
  const here = [s.point.lng, s.point.lat]
  map.getSource('route-ahead').setData(lineFeature([here, ...pts.slice(s.segment + 1)]))
  map.getSource('route-done').setData(lineFeature([...pts.slice(0, s.segment + 1), here]))
}

function updateCamera(force = false) {
  if (!map) return
  const p = snap.value && snap.value.offset < 12 ? snap.value.point : pos.value // stick to the walkway when close
  if (p) userMarker?.setLngLat([p.lng, p.lat]).setRotation(heading.value)
  if (!following.value || !p) return
  const now = performance.now()
  if (!force && now - lastCam < 200) {
    // The compass fires very often: skip, but make sure the latest heading is applied.
    clearTimeout(camTimer)
    camTimer = setTimeout(() => updateCamera(), 200 - (now - lastCam))
    return
  }
  clearTimeout(camTimer)
  lastCam = now
  const bearing = followHeading.value ? heading.value : 0
  map.easeTo({
    center: [p.lng, p.lat],
    bearing,
    pitch: followHeading.value ? PITCH : 0,
    zoom: Math.max(map.getZoom(), ZOOM - 0.4),
    padding: { top: Math.round(mapEl.value.clientHeight * 0.35), bottom: 90, left: 0, right: 0 },
    duration: force ? 0 : 600,
    easing: (t) => t,
  })
}

function recenter() {
  following.value = true
  updateCamera(true)
}
function toggleCompass() {
  followHeading.value = !followHeading.value
  following.value = true
  updateCamera(true)
}

onMounted(() => {
  computeRoute(null)
  const start = route.value?.points[0] ?? building.value
  // The drawn campus map once a campus area is set; the free street map before that.
  map = new maplibregl.Map({
    container: mapEl.value,
    style: drawnMap
      ? campusMapStyle(
          { campus: store.campus, buildings: store.buildings, features: store.features, edges: store.edges, nodeById: store.nodeById },
          { dark: theme === 'dark', activeBuildingId: props.buildingId },
        )
      : STYLES[theme],
    center: [start.lng, start.lat],
    zoom: ZOOM,
    pitch: PITCH,
    maxPitch: 70,
    attributionControl: { compact: true },
  })
  if (import.meta.env.DEV) window.__navMap = map // dev-only, for debugging
  if (store.campus) {
    // Keep the camera on campus (with slack so the edge can still be centred when tilted).
    const b = areaBounds(store.campus, 0.6)
    map.setMaxBounds([
      [b.west, b.south],
      [b.east, b.north],
    ])
  }
  map.on('error', (e) => console.warn('[nav map]', e?.error?.message || e))
  map.on('dragstart', () => (following.value = false))
  for (const evt of ['zoomstart', 'rotatestart', 'pitchstart']) {
    map.on(evt, (e) => {
      if (e.originalEvent) following.value = false // only the visitor's own gestures, not our easeTo
    })
  }
  map.on('rotate', () => (mapBearing.value = map.getBearing()))
  // Add the route as soon as the style is parsed (don't wait for the first tiles).
  map.on('style.load', addRouteLayers)
  if (map.isStyleLoaded()) addRouteLayers()
  userMarker = new maplibregl.Marker({ element: userEl(), rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([start.lng, start.lat]).addTo(map)
  const t = route.value?.target ?? building.value
  destMarker = new maplibregl.Marker({ element: destEl(), anchor: 'bottom' }).setLngLat([t.lng, t.lat]).addTo(map)

  compass.start() // works directly on Android; on iPhone uses the permission asked on "Start navigation"
  requestWakeLock()
  document.addEventListener('visibilitychange', onVisibility)
  if (voiceOn.value) speak(`${maneuvers.value[0]?.text ?? ''}. ${primary.value ? spokenFor(primary.value, distToPrimary.value ?? 0) : ''}`)
  updateCamera(true)
})

watch([pos, heading, followHeading], () => updateCamera())
watch([snap, route], () => {
  updateRouteLayers()
  const t = route.value?.target
  if (t) destMarker?.setLngLat([t.lng, t.lat])
})

// Keep the screen on while navigating. Browsers drop the lock when the page is hidden
// (switching apps), so ask again when the visitor comes back.
let wakeLock = null
function onVisibility() {
  if (document.visibilityState === 'visible') requestWakeLock()
}
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen')
  } catch {
    /* fine */
  }
}

function end() {
  stopSim()
  window.speechSynthesis?.cancel()
  emit('end')
}

onBeforeUnmount(() => {
  stopSim()
  if (!hasArrived) window.speechSynthesis?.cancel() // let "You have arrived" finish
  clearTimeout(camTimer)
  clearInterval(clockTimer)
  document.removeEventListener('visibilitychange', onVisibility)
  wakeLock?.release?.().catch(() => {})
  map?.remove()
})

// Dev-only test hook: window.__navDebug.gps(lat, lng, accuracy, heading?, speed?)
if (import.meta.env.DEV) {
  window.__navDebug = { gps: (lat, lng, accuracy = 5, heading = null, speed = null) => (store.gps = { lat, lng, accuracy, heading, speed }) }
}
</script>

<template>
  <div class="fixed inset-0 z-[3000] flex flex-col font-sans" :class="theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-white text-ink'">
    <!-- Map (MapLibre sets position:relative on its container, so it fills a positioned wrapper) -->
    <div class="absolute inset-0">
      <div ref="mapEl" class="h-full w-full" />
    </div>

    <!-- Maneuver banner -->
    <div class="pointer-events-none absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 space-y-2">
      <div v-if="rerouting" class="rounded-2xl bg-amber-500 px-4 py-3 text-lg font-semibold text-white shadow-xl">Rerouting…</div>
      <div v-else-if="primary" class="overflow-hidden rounded-2xl text-white shadow-xl" :class="justAhead || primary.type === 'arrive' ? 'bg-green-700' : 'bg-emerald-800'">
        <div class="flex items-center gap-3 px-4 py-3">
          <ManeuverIcon :type="justAhead ? 'arrive' : primary.type" :size="44" class="shrink-0" />
          <div class="min-w-0">
            <p v-if="!justAhead" class="text-3xl leading-none font-bold tabular-nums">{{ formatDistance(Math.round(distToPrimary / 5) * 5 || distToPrimary) }}</p>
            <p class="mt-1 text-lg leading-snug font-semibold">
              <template v-if="justAhead">{{ building?.name }} is just ahead</template>
              <template v-else>{{ primary.text }}</template>
            </p>
          </div>
        </div>
        <div v-if="secondary && !justAhead" class="flex items-center gap-2 bg-black/20 px-4 py-1.5 text-sm">
          Then <ManeuverIcon :type="secondary.type" :size="18" /> {{ secondary.text }}
        </div>
        <div v-else-if="departHint && primary.type !== 'arrive' && !justAhead" class="bg-black/20 px-4 py-1.5 text-sm">{{ departHint }}</div>
      </div>

      <!-- Status chips -->
      <div class="flex flex-wrap gap-2">
        <span v-if="route?.direct" class="pointer-events-auto rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 shadow">Direct line: {{ route.reason || 'walkway not mapped' }}</span>
        <span v-if="gpsWeak" class="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 shadow">Weak GPS (±{{ Math.round(posAccuracy) }} m), arrival paused</span>
        <span v-if="calibrate" class="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink shadow">Compass unsure: wave your phone in a figure-8</span>
        <button
          v-if="compass.status.value === 'needs-permission'"
          type="button"
          class="pointer-events-auto rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white shadow"
          @click="compass.start()"
        >
          Enable compass
        </button>
        <span v-if="!pos" class="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink shadow">Waiting for GPS… or tap Simulate</span>
      </div>
    </div>

    <!-- Map buttons -->
    <div class="absolute right-3 bottom-36 z-10 flex flex-col gap-3">
      <button type="button" class="flex h-12 w-12 items-center justify-center rounded-full shadow-lg" :class="theme === 'dark' ? 'bg-slate-800' : 'bg-white'" :aria-label="followHeading ? 'Show north up' : 'Turn map with me'" @click="toggleCompass">
        <svg width="26" height="26" viewBox="0 0 24 24" :style="{ transform: `rotate(${-mapBearing}deg)` }" aria-hidden="true">
          <path d="M12 2 16 12H8Z" fill="#dc2626" />
          <path d="M12 22 8 12h8Z" :fill="theme === 'dark' ? '#e2e8f0' : '#334155'" />
        </svg>
      </button>
      <button type="button" class="flex h-12 w-12 items-center justify-center rounded-full shadow-lg" :class="[theme === 'dark' ? 'bg-slate-800' : 'bg-white', voiceOn ? 'text-primary-600' : '']" :aria-label="voiceOn ? 'Mute voice' : 'Turn on voice'" @click="toggleVoice">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z" />
          <template v-if="voiceOn"><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.4 18.4a9 9 0 0 0 0-12.7" /></template>
          <template v-else><path d="m22 9-6 6" /><path d="m16 9 6 6" /></template>
        </svg>
      </button>
    </div>
    <button
      v-if="!following"
      type="button"
      class="absolute bottom-36 left-3 z-10 flex h-12 items-center gap-2 rounded-full px-4 font-semibold shadow-lg"
      :class="theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-white text-primary-700'"
      @click="recenter"
    >
      <AppIcon name="navigation" :size="18" /> Re-center
    </button>

    <!-- Bottom bar -->
    <div class="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl px-4 pt-3 pb-[max(0.9rem,env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(0,0,0,0.25)]" :class="theme === 'dark' ? 'bg-black text-white' : 'bg-white text-ink'">
      <div v-if="alreadyHere" class="mb-3 flex items-center justify-between gap-3 rounded-xl bg-green-600/15 p-3">
        <p class="text-sm">You're already at <b>{{ building?.name }}</b>.</p>
        <button type="button" class="shrink-0 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white" @click="arrive">I'm here</button>
      </div>
      <div class="flex items-center gap-3">
        <button type="button" class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1" :class="theme === 'dark' ? 'ring-white/30' : 'ring-line'" aria-label="End navigation" @click="end">
          <AppIcon name="x" :size="24" />
        </button>
        <div class="min-w-0 flex-1 text-center">
          <p class="text-2xl leading-tight font-bold text-amber-500 tabular-nums">{{ walkingMinutes(remaining) }} min</p>
          <p class="text-sm opacity-75 tabular-nums">{{ formatDistance(Math.round(remaining)) || '0 m' }} · {{ eta }}</p>
        </div>
        <button type="button" class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-600 text-white" aria-label="I've arrived" title="I've arrived" @click="arrive">
          <AppIcon name="check" :size="24" />
        </button>
      </div>
      <button type="button" class="mt-2 w-full rounded-lg py-1.5 text-xs font-medium opacity-70" @click="simulating ? stopSim() : startSim()">
        {{ simulating ? 'Stop simulation' : 'Simulate walk (demo)' }}
      </button>
    </div>
  </div>
</template>
