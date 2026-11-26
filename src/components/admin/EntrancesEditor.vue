<script setup>
// Entrance (door) points of one building. A door point is a walkway node with buildingId set;
// routes to the building end at the closest one. New doors are joined to the nearest walkway
// point so they are reachable without visiting the Paths page.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import { admin } from '../../lib/api'
import { toast, confirmAction } from '../../lib/feedback'
import { sampleGps } from '../../lib/gps'
import { distanceBetween, formatDistance } from '../../lib/geo'
import { useMapStore } from '../../stores/map'
import MapCanvas from '../MapCanvas.vue'
import AppIcon from '../ui/AppIcon.vue'
import UiButton from '../ui/UiButton.vue'
import UiBadge from '../ui/UiBadge.vue'

const props = defineProps({
  building: { type: Object, required: true },
})

const campus = useMapStore()
const CONNECT_MAX_M = 60 // only suggest joining walkway points this close

const draft = ref(null) // { id?: string, lat?, lng?, label, connect }
const placing = computed(() => !!draft.value)
const busy = ref(false)
const sampling = ref(null)

const entrances = computed(() => campus.nodes.filter((n) => n.buildingId === props.building.id))
const neighbours = computed(() => {
  const m = new Map()
  for (const e of campus.edges) {
    if (!m.has(e.fromId)) m.set(e.fromId, new Set())
    if (!m.has(e.toId)) m.set(e.toId, new Set())
    m.get(e.fromId).add(e.toId)
    m.get(e.toId).add(e.fromId)
  }
  return m
})
const linksOf = (id) => neighbours.value.get(id)?.size ?? 0

/** Closest walkway point to `p` (prefers points already on a path), excluding `exceptId`. */
function nearestWalkway(p, exceptId = null) {
  if (!p?.lat) return null
  let best = null
  for (const n of campus.nodes) {
    if (n.id === exceptId) continue
    if (n.buildingId === props.building.id && !linksOf(n.id)) continue // another loose door of this building
    const d = distanceBetween(n, p)
    const score = d + (linksOf(n.id) ? 0 : 15) // a point already on a walkway wins ties
    if (!best || score < best.score) best = { node: n, distance: d, score }
  }
  return best && best.distance <= CONNECT_MAX_M ? best : null
}

const draftNearest = computed(() => (draft.value?.lat ? nearestWalkway(draft.value, draft.value.id) : null))
const draftAlreadyLinked = computed(() => {
  const d = draft.value
  return !!(d?.id && draftNearest.value && neighbours.value.get(d.id)?.has(draftNearest.value.node.id))
})

// ---------------------------------------------------------------- actions
function startNew() {
  draft.value = { label: '', connect: true }
}

function startEdit(n) {
  draft.value = { id: n.id, lat: n.lat, lng: n.lng, label: n.label || '', connect: linksOf(n.id) === 0 }
  map?.setView([n.lat, n.lng], Math.max(map.getZoom(), 19), { animate: false })
}

function cancel() {
  draft.value = null
}

const round = (v) => Math.round(v * 1e7) / 1e7

function onMapClick(p) {
  if (!draft.value) return
  draft.value.lat = round(p.lat)
  draft.value.lng = round(p.lng)
}

async function useMyLocation() {
  if (!draft.value) startNew()
  sampling.value = { count: 0 }
  try {
    const p = await sampleGps({ onProgress: (s) => (sampling.value = s) })
    draft.value.lat = round(p.lat)
    draft.value.lng = round(p.lng)
    map?.setView([p.lat, p.lng], 19, { animate: false })
    toast(`Placed at your location (±${Math.round(p.accuracy)} m). Drag the pin just outside the door if needed.`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    sampling.value = null
  }
}

async function save() {
  const d = draft.value
  if (!d?.lat) return toast.error('Tap the map just outside the door first.')
  busy.value = true
  try {
    const data = { lat: d.lat, lng: d.lng, label: d.label.trim() || null, buildingId: props.building.id }
    const node = d.id ? await admin.update('nodes', d.id, data) : await admin.create('nodes', data)
    let joined = false
    const near = nearestWalkway(node, node.id)
    if (d.connect && near && !neighbours.value.get(node.id)?.has(near.node.id)) {
      await admin.create('edges', { fromId: node.id, toId: near.node.id })
      joined = true
    }
    await campus.load(true)
    toast(`${d.id ? 'Entrance saved' : 'Entrance added'}${joined ? ` and joined to the walkway (${formatDistance(near.distance)})` : ''}`)
    draft.value = null
  } catch (e) {
    toast.error(e.message)
  } finally {
    busy.value = false
  }
}

async function connect(n) {
  const near = nearestWalkway(n, n.id)
  if (!near) return toast.error(`No walkway point within ${CONNECT_MAX_M} m. Draw the walkway on the Paths page first.`)
  try {
    await admin.create('edges', { fromId: n.id, toId: near.node.id })
    await campus.load(true)
    toast(`Joined to the walkway (${formatDistance(near.distance)})`)
  } catch (e) {
    toast.error(e.message)
  }
}

async function remove(n) {
  const ok = await confirmAction({
    title: `Remove ${n.label || 'this entrance'}?`,
    message: linksOf(n.id) ? 'The point and its connecting path(s) will be deleted.' : 'The point will be deleted.',
    confirmLabel: 'Remove',
  })
  if (!ok) return
  try {
    await admin.remove('nodes', n.id)
    if (draft.value?.id === n.id) draft.value = null
    await campus.load(true)
    toast('Entrance removed')
  } catch (e) {
    toast.error(e.message)
  }
}

// ---------------------------------------------------------------- map
let map
let layer

function draw() {
  if (!map) return
  layer?.remove()
  layer = L.layerGroup().addTo(map)

  // Walkways around the building
  for (const e of campus.edges) {
    const a = campus.nodeById.get(e.fromId)
    const b = campus.nodeById.get(e.toId)
    if (a && b) L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: '#475569', weight: 4, opacity: 0.8, interactive: false }).addTo(layer)
  }
  for (const n of campus.nodes) {
    if (n.id === draft.value?.id) continue
    const isDoor = n.buildingId === props.building.id
    const m = L.circleMarker([n.lat, n.lng], {
      radius: isDoor ? 8 : 5,
      color: '#fff',
      weight: 2,
      fillColor: isDoor ? '#059669' : n.buildingId ? '#94a3b8' : '#0f172a',
      fillOpacity: 1,
    })
    if (isDoor) {
      m.bindTooltip(n.label || 'Entrance', { permanent: true, direction: 'top', offset: [0, -8] })
      m.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev)
        startEdit(n)
      })
    }
    m.addTo(layer)
  }

  // Draft door + the walkway point it will join
  const d = draft.value
  if (d?.lat) {
    const near = draftNearest.value
    if (d.connect && near) {
      L.polyline([[d.lat, d.lng], [near.node.lat, near.node.lng]], { color: '#059669', weight: 4, dashArray: '6 6', interactive: false }).addTo(layer)
    }
    const pin = L.marker([d.lat, d.lng], { draggable: true, autoPan: true }).addTo(layer)
    pin.on('dragend', () => {
      const p = pin.getLatLng()
      d.lat = round(p.lat)
      d.lng = round(p.lng)
    })
  }
}

function onReady(m) {
  map = m
  map.setView([props.building.lat, props.building.lng], 19, { animate: false })
  draw()
}

watch(() => [campus.nodes, campus.edges, draft.value?.lat, draft.value?.lng, draft.value?.connect, draft.value?.id], draw)
watch(() => props.building.id, () => (draft.value = null))
onBeforeUnmount(() => layer?.remove())
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-ink-soft">
      Directions to <b class="font-medium text-ink">{{ building.name }}</b> end at its closest entrance. Put each door point
      <b class="font-medium text-ink">just outside the door, on the walkway</b>, not inside the building.
    </p>

    <!-- Map -->
    <div class="relative h-72 overflow-hidden rounded-xl border border-line" :class="placing ? 'cursor-crosshair' : ''">
      <MapCanvas :buildings="[building]" :lock-to-campus="false" @ready="onReady" @map-click="onMapClick" />
      <div v-if="placing && !draft.lat" class="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] rounded-lg bg-ink/85 px-3 py-2 text-center text-sm text-white">
        Tap just outside the door
      </div>
    </div>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
      <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-primary-600 ring-2 ring-white" />Building pin</span>
      <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-success-600 ring-2 ring-white" />Entrance</span>
      <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-ink ring-2 ring-white" />Walkway point</span>
    </div>

    <!-- Draft editor -->
    <section v-if="draft" class="space-y-3 rounded-xl border-2 border-success-600/40 bg-success-50/40 p-4">
      <h4 class="font-semibold text-ink">{{ draft.id ? 'Edit entrance' : 'New entrance' }}</h4>
      <p v-if="draft.lat" class="flex items-center gap-1.5 font-mono text-xs text-ink-muted">
        <AppIcon name="pin" :size="14" />{{ draft.lat.toFixed(6) }}, {{ draft.lng.toFixed(6) }} · drag the pin to fine-tune
      </p>
      <p v-else class="text-sm text-ink-soft">Tap the map just outside the door, or use your phone's GPS while standing there.</p>

      <UiButton variant="secondary" size="sm" icon="locate" :loading="!!sampling" @click="useMyLocation">
        {{ sampling ? `Reading GPS… ${sampling.count}` : "I'm at the door: use my location" }}
      </UiButton>

      <label class="block">
        <span class="mb-1.5 block text-sm font-medium text-ink-soft">Door name (optional)</span>
        <input
          v-model="draft.label"
          maxlength="120"
          placeholder="e.g. Main door, Side entrance"
          class="block h-10 w-full rounded-md border border-line bg-surface px-3 text-base focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none"
        />
      </label>

      <label v-if="draft.lat" class="flex items-start gap-2.5 text-sm">
        <input v-model="draft.connect" type="checkbox" class="mt-0.5 h-4 w-4 accent-success-600" :disabled="!draftNearest || draftAlreadyLinked" />
        <span>
          <template v-if="draftAlreadyLinked">Already joined to the walkway.</template>
          <template v-else-if="draftNearest">
            Join to the nearest walkway point
            <span class="text-ink-muted">({{ draftNearest.node.label || 'unnamed point' }}, {{ formatDistance(draftNearest.distance) }} away)</span>
          </template>
          <template v-else>
            <span class="text-warning-600">No walkway point within {{ CONNECT_MAX_M }} m.</span>
            Draw the walkway on the Paths page, then join this door to it.
          </template>
        </span>
      </label>

      <div class="flex gap-2">
        <UiButton variant="secondary" size="sm" @click="cancel">Cancel</UiButton>
        <UiButton size="sm" icon="check" :loading="busy" :disabled="!draft.lat" @click="save">{{ draft.id ? 'Save entrance' : 'Add entrance' }}</UiButton>
      </div>
    </section>

    <!-- List -->
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h4 class="text-sm font-semibold text-ink">Entrances ({{ entrances.length }})</h4>
        <UiButton v-if="!draft" size="sm" icon="plus" @click="startNew">Add entrance</UiButton>
      </div>
      <p v-if="!entrances.length" class="rounded-lg border border-dashed border-line px-4 py-5 text-center text-sm text-ink-muted">
        No entrance yet. Routes will end at the walkway point nearest the building, not at its door.
      </p>
      <ul v-else class="divide-y divide-line overflow-hidden rounded-xl border border-line">
        <li v-for="n in entrances" :key="n.id" class="flex items-center gap-3 px-3 py-2.5">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success-50 text-success-600"><AppIcon name="door" :size="16" /></span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ink">{{ n.label || 'Entrance' }}</p>
            <UiBadge v-if="linksOf(n.id)" tone="success">On the walkway</UiBadge>
            <UiBadge v-else tone="warning">Not connected</UiBadge>
          </div>
          <UiButton v-if="!linksOf(n.id)" size="sm" variant="secondary" icon="link" @click="connect(n)">Join</UiButton>
          <button type="button" class="rounded-md p-1.5 text-ink-muted hover:bg-canvas hover:text-ink" :aria-label="`Edit ${n.label || 'entrance'}`" @click="startEdit(n)">
            <AppIcon name="pencil" :size="16" />
          </button>
          <button type="button" class="rounded-md p-1.5 text-ink-muted hover:bg-canvas hover:text-danger-600" :aria-label="`Remove ${n.label || 'entrance'}`" @click="remove(n)">
            <AppIcon name="trash" :size="16" />
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
