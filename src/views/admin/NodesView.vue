<script setup>
// Walkway map editor. Points (nodes) are places people walk through: gates, corners,
// building entrances. Paths (edges) connect two points; their length is computed by the server.
import { computed, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import { admin } from '../../lib/api'
import { useMapStore } from '../../stores/map'
import { formatDistance } from '../../lib/geo'
import MapCanvas from '../../components/MapCanvas.vue'

const campus = useMapStore()
onMounted(() => campus.load(true))

const mode = ref('select') // select | add | link
const selectedId = ref(null) // node id, or 'new'
const selectedEdgeId = ref(null)
const linkFrom = ref(null)
const form = ref(null)
const error = ref('')
const busy = ref(false)
const locating = ref(false)

const modes = [
  { id: 'select', label: 'Select', hint: 'Tap a point to edit it, or a line to remove it.' },
  { id: 'add', label: 'Add point', hint: 'Tap the map where the new point goes.' },
  { id: 'link', label: 'Connect', hint: 'Tap two points to add a walkable path between them.' },
]
const hint = computed(() => {
  if (mode.value === 'link' && linkFrom.value) return 'Now tap the second point.'
  return modes.find((m) => m.id === mode.value).hint
})
const selectedEdge = computed(() => campus.edges.find((e) => e.id === selectedEdgeId.value) ?? null)

// ---- Leaflet layers ----
let map
let layer
const round = (n) => Math.round(n * 1e7) / 1e7

function draw() {
  if (!map) return
  layer?.remove()
  layer = L.layerGroup().addTo(map)

  for (const e of campus.edges) {
    const a = campus.nodeById.get(e.fromId)
    const b = campus.nodeById.get(e.toId)
    if (!a || !b) continue
    const active = e.id === selectedEdgeId.value
    L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: active ? '#dc2626' : '#475569', weight: active ? 6 : 4 })
      .bindTooltip(formatDistance(e.distanceM))
      .on('click', (ev) => {
        L.DomEvent.stopPropagation(ev)
        if (mode.value !== 'select') return
        selectedEdgeId.value = e.id
        selectedId.value = null
      })
      .addTo(layer)
  }

  for (const n of campus.nodes) {
    if (n.id === selectedId.value) continue // drawn as a draggable pin below
    const isEntrance = !!n.buildingId
    const marker = L.circleMarker([n.lat, n.lng], {
      radius: n.code ? 8 : 6,
      color: '#fff',
      weight: 2,
      fillColor: n.id === linkFrom.value ? '#dc2626' : isEntrance ? '#16a34a' : n.code ? '#9333ea' : '#0f172a',
      fillOpacity: 1,
    })
    if (n.label || n.code) marker.bindTooltip(n.label || n.code)
    marker.on('click', (ev) => {
      L.DomEvent.stopPropagation(ev)
      onNodeClick(n)
    })
    marker.addTo(layer)
  }

  if (form.value) {
    const pin = L.marker([form.value.lat, form.value.lng], { draggable: true }).addTo(layer)
    pin.on('dragend', () => {
      const p = pin.getLatLng()
      form.value.lat = round(p.lat)
      form.value.lng = round(p.lng)
    })
  }
}

function onReady(m) {
  map = m
  draw()
}

watch(() => [campus.nodes, campus.edges, selectedId.value, selectedEdgeId.value, linkFrom.value], draw)
watch(() => form.value && [form.value.lat, form.value.lng], draw)
watch(mode, () => {
  linkFrom.value = null
  selectedEdgeId.value = null
})

// ---- Interactions ----
function onMapClick(p) {
  error.value = ''
  if (mode.value === 'add') {
    selectedEdgeId.value = null
    selectedId.value = 'new'
    form.value = { lat: round(p.lat), lng: round(p.lng), code: '', label: '', buildingId: '' }
  } else if (mode.value === 'select') {
    selectedId.value = null
    selectedEdgeId.value = null
    form.value = null
  }
}

async function onNodeClick(n) {
  error.value = ''
  if (mode.value === 'link') {
    if (!linkFrom.value) {
      linkFrom.value = n.id
    } else if (linkFrom.value === n.id) {
      linkFrom.value = null
    } else {
      try {
        await admin.create('edges', { fromId: linkFrom.value, toId: n.id })
        await campus.load(true)
        linkFrom.value = n.id // keep chaining from the last point
      } catch (e) {
        error.value = e.message
      }
    }
    return
  }
  selectedEdgeId.value = null
  selectedId.value = n.id
  form.value = { lat: n.lat, lng: n.lng, code: n.code || '', label: n.label || '', buildingId: n.buildingId || '' }
}

function useMyLocation() {
  locating.value = true
  error.value = ''
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      const p = { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) }
      if (form.value) Object.assign(form.value, p)
      else {
        selectedId.value = 'new'
        form.value = { ...p, code: '', label: '', buildingId: '' }
      }
      map?.setView([p.lat, p.lng], 19)
    },
    () => {
      locating.value = false
      error.value = 'Could not get your location.'
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  )
}

async function saveNode() {
  busy.value = true
  error.value = ''
  const data = {
    lat: form.value.lat,
    lng: form.value.lng,
    code: form.value.code.trim().toLowerCase() || null,
    label: form.value.label || null,
    buildingId: form.value.buildingId || null,
  }
  try {
    if (selectedId.value === 'new') await admin.create('nodes', data)
    else await admin.update('nodes', selectedId.value, data)
    await campus.load(true)
    selectedId.value = null
    form.value = null
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function deleteNode() {
  if (!confirm('Delete this point and every path connected to it?')) return
  try {
    await admin.remove('nodes', selectedId.value)
    await campus.load(true)
    selectedId.value = null
    form.value = null
  } catch (e) {
    error.value = e.message
  }
}

async function deleteEdge() {
  try {
    await admin.remove('edges', selectedEdgeId.value)
    await campus.load(true)
    selectedEdgeId.value = null
  } catch (e) {
    error.value = e.message
  }
}

const qrLink = computed(() => (form.value?.code ? `${location.origin}/?from=${form.value.code.trim().toLowerCase()}` : ''))
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-xl font-semibold">Walkway paths</h1>
      <p class="text-xs text-slate-500">{{ campus.nodes.length }} points · {{ campus.edges.length }} paths</p>
    </div>

    <div class="flex gap-1 rounded-xl bg-slate-200 p-1">
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        class="flex-1 rounded-lg py-2 text-sm font-medium"
        :class="mode === m.id ? 'bg-white shadow' : 'text-slate-600'"
        @click="mode = m.id"
      >
        {{ m.label }}
      </button>
    </div>
    <p class="text-sm text-slate-600">{{ hint }}</p>
    <p v-if="error" class="rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error }}</p>

    <div class="h-[55dvh] overflow-hidden rounded-2xl ring-1 ring-slate-200">
      <MapCanvas :buildings="campus.buildings" :extra-points="campus.nodes" :lock-to-campus="false" @ready="onReady" @map-click="onMapClick" />
    </div>

    <div class="flex flex-wrap gap-3 text-xs text-slate-600">
      <span class="flex items-center gap-1"><span class="h-3 w-3 rounded-full bg-slate-900" /> Walkway point</span>
      <span class="flex items-center gap-1"><span class="h-3 w-3 rounded-full bg-green-600" /> Building entrance</span>
      <span class="flex items-center gap-1"><span class="h-3 w-3 rounded-full bg-purple-600" /> QR start point</span>
      <span class="flex items-center gap-1"><span class="h-3 w-3 rounded-full bg-blue-700" /> Building</span>
    </div>

    <button type="button" class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-60" :disabled="locating" @click="useMyLocation">
      {{ locating ? 'Locating…' : form ? 'Move this point to my location' : 'Add a point at my location' }}
    </button>

    <!-- Selected path -->
    <section v-if="selectedEdge" class="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <p class="text-sm">
        Path of <span class="font-semibold">{{ formatDistance(selectedEdge.distanceM) }}</span>
      </p>
      <button type="button" class="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white" @click="deleteEdge">Delete path</button>
    </section>

    <!-- Point editor -->
    <form v-if="form" class="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200" @submit.prevent="saveNode">
      <h2 class="font-semibold">{{ selectedId === 'new' ? 'New point' : 'Edit point' }}</h2>
      <p class="text-xs text-slate-500">{{ form.lat }}, {{ form.lng }} · drag the pin to move it</p>
      <label class="block">
        <span class="text-sm font-medium">Label (shown in directions)</span>
        <input v-model="form.label" maxlength="120" placeholder="e.g. Main Gate, Canteen corner" class="mt-1 w-full rounded-lg border border-slate-300 p-2" />
      </label>
      <label class="block">
        <span class="text-sm font-medium">QR code name (optional)</span>
        <input v-model="form.code" maxlength="40" placeholder="e.g. gate1" class="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        <span v-if="qrLink" class="mt-1 block break-all text-xs text-slate-500">QR link: {{ qrLink }}</span>
      </label>
      <label class="block">
        <span class="text-sm font-medium">Entrance of building (optional)</span>
        <select v-model="form.buildingId" class="mt-1 w-full rounded-lg border border-slate-300 p-2">
          <option value="">Not an entrance</option>
          <option v-for="b in campus.buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </label>
      <div class="flex flex-wrap gap-2">
        <button type="submit" :disabled="busy" class="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-60">Save point</button>
        <button v-if="selectedId !== 'new'" type="button" class="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white" @click="deleteNode">Delete</button>
        <button type="button" class="px-3 py-2 text-slate-500" @click="(selectedId = null), (form = null)">Cancel</button>
      </div>
    </form>
  </div>
</template>
