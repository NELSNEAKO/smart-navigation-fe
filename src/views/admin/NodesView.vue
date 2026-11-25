<script setup>
// Walkway map editor. Points (nodes) are places people walk through: gates, corners,
// building entrances. Paths (edges) connect two points; the server computes their length.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import { admin } from '../../lib/api'
import { toast, confirmAction } from '../../lib/feedback'
import { useMapStore } from '../../stores/map'
import { formatDistance } from '../../lib/geo'
import MapCanvas from '../../components/MapCanvas.vue'
import AppIcon from '../../components/ui/AppIcon.vue'
import PageHeader from '../../components/ui/PageHeader.vue'
import UiButton from '../../components/ui/UiButton.vue'
import UiField from '../../components/ui/UiField.vue'

const campus = useMapStore()

const mode = ref('select') // select | add | link
const selectedId = ref(null) // node id, or 'new'
const selectedEdgeId = ref(null)
const linkFrom = ref(null)
const form = ref(null)
const busy = ref(false)
const locating = ref(false)
const panel = ref(null)

// When the editor opens below the map (narrower screens), bring it into view.
watch([selectedId, selectedEdgeId], async ([n, e]) => {
  if (!n && !e) return
  await nextTick()
  const el = panel.value
  if (el && el.getBoundingClientRect().top > window.innerHeight - 120) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

const modes = [
  { id: 'select', label: 'Select', icon: 'pointer', key: 'V', hint: 'Click a point to edit it, or a line to remove it. Drag the selected point to move it.' },
  { id: 'add', label: 'Add point', icon: 'plus', key: 'A', hint: 'Click the map where a gate, corner, junction or entrance is.' },
  { id: 'link', label: 'Connect', icon: 'link', key: 'C', hint: 'Click two points to add a walkable path. Keep clicking to continue the path.' },
]
const hint = computed(() => {
  if (mode.value === 'link' && linkFrom.value) {
    const n = campus.nodeById.get(linkFrom.value)
    return `From ${n?.label || n?.code || 'this point'}: click the next point. Press Esc to stop.`
  }
  return modes.find((m) => m.id === mode.value).hint
})
const selectedEdge = computed(() => campus.edges.find((e) => e.id === selectedEdgeId.value) ?? null)
const edgeEnds = computed(() => {
  if (!selectedEdge.value) return ''
  const name = (id) => {
    const n = campus.nodeById.get(id)
    return n?.label || n?.code || 'point'
  }
  return `${name(selectedEdge.value.fromId)} ↔ ${name(selectedEdge.value.toId)}`
})
const buildingOptions = computed(() => [{ value: '', label: 'Not an entrance' }, ...campus.buildings.map((b) => ({ value: b.id, label: b.name }))])
const degree = computed(() => {
  const d = new Map()
  for (const e of campus.edges) {
    d.set(e.fromId, (d.get(e.fromId) ?? 0) + 1)
    d.set(e.toId, (d.get(e.toId) ?? 0) + 1)
  }
  return d
})

// ---- Leaflet layers ----
let map
let layer
const round = (n) => Math.round(n * 1e7) / 1e7
const COLORS = { building: '#1d4ed8', entrance: '#059669', qr: '#7c3aed', point: '#0f172a', selected: '#dc2626', path: '#475569' }

function draw() {
  if (!map) return
  layer?.remove()
  layer = L.layerGroup().addTo(map)

  for (const e of campus.edges) {
    const a = campus.nodeById.get(e.fromId)
    const b = campus.nodeById.get(e.toId)
    if (!a || !b) continue
    const active = e.id === selectedEdgeId.value
    L.polyline(
      [
        [a.lat, a.lng],
        [b.lat, b.lng],
      ],
      { color: active ? COLORS.selected : COLORS.path, weight: active ? 7 : 5, opacity: 0.9 },
    )
      .bindTooltip(formatDistance(e.distanceM), { sticky: true })
      .on('click', (ev) => {
        L.DomEvent.stopPropagation(ev)
        if (mode.value !== 'select') return
        selectedEdgeId.value = e.id
        selectedId.value = null
        form.value = null
      })
      .addTo(layer)
  }

  for (const n of campus.nodes) {
    if (n.id === selectedId.value) continue // drawn as a draggable pin below
    const color = n.id === linkFrom.value ? COLORS.selected : n.buildingId ? COLORS.entrance : n.code ? COLORS.qr : COLORS.point
    const marker = L.circleMarker([n.lat, n.lng], { radius: n.code || n.buildingId ? 8 : 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
    if (n.label || n.code) marker.bindTooltip(n.label || n.code)
    marker.on('click', (ev) => {
      L.DomEvent.stopPropagation(ev)
      onNodeClick(n)
    })
    marker.addTo(layer)
  }

  if (form.value) {
    const pin = L.marker([form.value.lat, form.value.lng], { draggable: true, autoPan: true }).addTo(layer)
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
  if (mode.value !== 'select') clearSelection()
})

// ---- Keyboard shortcuts (desktop) ----
function onKey(e) {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
  const k = e.key.toLowerCase()
  if (k === 'escape') {
    linkFrom.value = null
    clearSelection()
  } else if (k === 'v') mode.value = 'select'
  else if (k === 'a') mode.value = 'add'
  else if (k === 'c') mode.value = 'link'
  else if ((k === 'delete' || k === 'backspace') && selectedEdgeId.value) deleteEdge()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// ---- Interactions ----
function clearSelection() {
  selectedId.value = null
  selectedEdgeId.value = null
  form.value = null
}

function onMapClick(p) {
  if (mode.value === 'add') {
    selectedEdgeId.value = null
    selectedId.value = 'new'
    form.value = { lat: round(p.lat), lng: round(p.lng), code: '', label: '', buildingId: '' }
  } else if (mode.value === 'select') {
    clearSelection()
  } else if (mode.value === 'link') {
    linkFrom.value = null
  }
}

async function onNodeClick(n) {
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
        toast.error(e.message)
      }
    }
    return
  }
  if (mode.value === 'add') mode.value = 'select'
  selectedEdgeId.value = null
  selectedId.value = n.id
  form.value = { lat: n.lat, lng: n.lng, code: n.code || '', label: n.label || '', buildingId: n.buildingId || '' }
}

function useMyLocation() {
  if (!('geolocation' in navigator)) return toast.error('Location is not available on this device.')
  locating.value = true
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
      toast(`Location found (±${Math.round(pos.coords.accuracy)} m). Drag the pin to fine-tune.`)
    },
    () => {
      locating.value = false
      toast.error('Could not get your location. Allow location access and try again.')
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  )
}

async function saveNode() {
  busy.value = true
  const data = {
    lat: form.value.lat,
    lng: form.value.lng,
    code: form.value.code.trim().toLowerCase() || null,
    label: form.value.label.trim() || null,
    buildingId: form.value.buildingId || null,
  }
  try {
    const isNew = selectedId.value === 'new'
    if (isNew) await admin.create('nodes', data)
    else await admin.update('nodes', selectedId.value, data)
    await campus.load(true)
    toast(isNew ? 'Point added' : 'Point saved')
    clearSelection()
  } catch (e) {
    toast.error(e.message)
  } finally {
    busy.value = false
  }
}

async function deleteNode() {
  const links = degree.value.get(selectedId.value) ?? 0
  const ok = await confirmAction({
    title: 'Delete this point?',
    message: links ? `The ${links} path(s) connected to it will be removed too.` : "This can't be undone.",
  })
  if (!ok) return
  try {
    await admin.remove('nodes', selectedId.value)
    await campus.load(true)
    toast('Point deleted')
    clearSelection()
  } catch (e) {
    toast.error(e.message)
  }
}

async function deleteEdge() {
  try {
    await admin.remove('edges', selectedEdgeId.value)
    await campus.load(true)
    selectedEdgeId.value = null
    toast('Path removed')
  } catch (e) {
    toast.error(e.message)
  }
}

const qrLink = computed(() => (form.value?.code?.trim() ? `${location.origin}/?from=${form.value.code.trim().toLowerCase()}` : ''))
async function copyQrLink() {
  try {
    await navigator.clipboard.writeText(qrLink.value)
    toast('QR link copied')
  } catch {
    toast.error('Could not copy. Select the link and copy it manually.')
  }
}

const legend = [
  { color: 'bg-ink', label: 'Walkway point' },
  { color: 'bg-success-600', label: 'Entrance' },
  { color: 'bg-qr', label: 'QR start point' },
  { color: 'bg-primary-600', label: 'Building' },
]
</script>

<template>
  <div>
    <PageHeader title="Walkway paths" description="Draw the walkways visitors can use. Routes follow these paths, so connect every entrance to the network.">
      <template #actions>
        <UiButton variant="secondary" icon="locate" :loading="locating" @click="useMyLocation">
          {{ form ? 'Move to my location' : 'Add point here' }}
        </UiButton>
      </template>
    </PageHeader>

    <div class="grid gap-4 xl:grid-cols-[1fr_340px]">
      <!-- Map -->
      <div class="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
        <div class="flex flex-wrap items-center gap-2 border-b border-line p-2">
          <div class="grid flex-1 grid-cols-3 gap-1 rounded-lg bg-canvas p-1 ring-1 ring-line ring-inset sm:flex-none" role="radiogroup" aria-label="Editing mode">
            <button
              v-for="m in modes"
              :key="m.id"
              type="button"
              role="radio"
              :aria-checked="mode === m.id"
              class="flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
              :class="mode === m.id ? 'bg-surface text-primary-700 shadow-xs' : 'text-ink-soft hover:text-ink'"
              :title="`${m.label} (${m.key})`"
              @click="mode = m.id"
            >
              <AppIcon :name="m.icon" :size="16" />
              {{ m.label }}
            </button>
          </div>
          <span class="ml-auto hidden text-xs text-ink-muted tabular-nums sm:inline">{{ campus.nodes.length }} points · {{ campus.edges.length }} paths</span>
        </div>
        <div class="flex items-start gap-2 border-b border-line bg-primary-50/60 px-3 py-2 text-sm text-primary-700">
          <AppIcon name="info" :size="16" class="mt-0.5" />
          <span>{{ hint }}</span>
        </div>
        <div class="h-[55dvh] xl:h-[calc(100dvh-260px)] xl:min-h-[480px]" :class="mode === 'add' ? 'cursor-crosshair' : ''">
          <MapCanvas :buildings="campus.buildings" :extra-points="campus.nodes" :lock-to-campus="false" @ready="onReady" @map-click="onMapClick" />
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-xs text-ink-soft">
          <span v-for="l in legend" :key="l.label" class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full ring-2 ring-white" :class="l.color" />{{ l.label }}
          </span>
          <span class="flex items-center gap-1.5"><span class="h-1 w-4 rounded bg-ink-soft" />Path</span>
        </div>
      </div>

      <!-- Side panel -->
      <aside ref="panel" class="grid scroll-mt-20 content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
        <!-- Point editor -->
        <form v-if="form" class="rounded-xl border border-line bg-surface shadow-xs" @submit.prevent="saveNode">
          <header class="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 class="text-base font-semibold">{{ selectedId === 'new' ? 'New point' : 'Edit point' }}</h2>
            <button type="button" class="-m-1 rounded-md p-1 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Close" @click="clearSelection">
              <AppIcon name="x" :size="18" />
            </button>
          </header>
          <div class="space-y-4 px-4 py-4">
            <p class="flex items-center gap-1.5 font-mono text-xs text-ink-muted">
              <AppIcon name="pin" :size="14" />{{ form.lat.toFixed(6) }}, {{ form.lng.toFixed(6) }}
            </p>
            <UiField v-model="form.label" label="Name" maxlength="120" placeholder="e.g. Main Gate, Canteen corner" hint="Shown in directions, e.g. “Walk to Main Gate”." />
            <UiField v-model="form.buildingId" as="select" label="Entrance of" :options="buildingOptions" hint="Routes to that building end at this point." />
            <UiField v-model="form.code" label="QR code name" maxlength="40" placeholder="e.g. gate1" hint="Optional. Lowercase letters, numbers and dashes." />
            <div v-if="qrLink" class="rounded-lg border border-line bg-canvas p-3">
              <p class="flex items-center gap-1.5 text-xs font-medium text-ink-soft"><AppIcon name="qr" :size="14" /> QR link for this point</p>
              <p class="mt-1 font-mono text-xs break-all text-ink">{{ qrLink }}</p>
              <button type="button" class="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700" @click="copyQrLink">Copy link</button>
            </div>
            <p v-if="selectedId !== 'new'" class="text-sm text-ink-muted">
              {{ degree.get(selectedId) ?? 0 }} path(s) connected. Drag the red pin on the map to move it.
            </p>
          </div>
          <footer class="flex items-center gap-2 border-t border-line px-4 py-3">
            <UiButton v-if="selectedId !== 'new'" variant="quiet" size="sm" icon="trash" class="!text-danger-600" @click="deleteNode">Delete</UiButton>
            <UiButton variant="secondary" size="sm" class="ml-auto" @click="clearSelection">Cancel</UiButton>
            <UiButton type="submit" size="sm" :loading="busy">Save point</UiButton>
          </footer>
        </form>

        <!-- Selected path -->
        <section v-else-if="selectedEdge" class="rounded-xl border border-line bg-surface p-4 shadow-xs">
          <p class="text-xs font-medium tracking-wide text-ink-muted uppercase">Selected path</p>
          <p class="mt-1 font-medium text-ink">{{ edgeEnds }}</p>
          <p class="text-sm text-ink-muted">{{ formatDistance(selectedEdge.distanceM) }} walk</p>
          <div class="mt-4 flex gap-2">
            <UiButton variant="secondary" size="sm" @click="selectedEdgeId = null">Close</UiButton>
            <UiButton variant="danger" size="sm" icon="trash" @click="deleteEdge">Remove path</UiButton>
          </div>
        </section>

        <!-- How-to (nothing selected) -->
        <section v-else class="rounded-xl border border-line bg-surface p-4 shadow-xs">
          <h2 class="text-base font-semibold">How to map a walkway</h2>
          <ol class="mt-3 space-y-3 text-sm text-ink-soft">
            <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">1</span><span><b class="font-medium text-ink">Add point</b> at gates, corners, junctions and every building door.</span></li>
            <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">2</span><span>Set <b class="font-medium text-ink">Entrance of</b> on door points, and a <b class="font-medium text-ink">QR code name</b> on gates.</span></li>
            <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">3</span><span><b class="font-medium text-ink">Connect</b> points along the walkways people actually use.</span></li>
          </ol>
          <p class="mt-4 hidden text-xs text-ink-muted lg:block">Shortcuts: V select · A add · C connect · Esc cancel · Delete removes the selected path</p>
        </section>

        <!-- Quick stats -->
        <section class="grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface text-center shadow-xs">
          <div class="px-2 py-3">
            <p class="text-xl font-semibold tabular-nums">{{ campus.nodes.length }}</p>
            <p class="text-xs text-ink-muted">Points</p>
          </div>
          <div class="px-2 py-3">
            <p class="text-xl font-semibold tabular-nums">{{ campus.nodes.filter((n) => n.buildingId).length }}</p>
            <p class="text-xs text-ink-muted">Entrances</p>
          </div>
          <div class="px-2 py-3">
            <p class="text-xl font-semibold tabular-nums">{{ campus.edges.length }}</p>
            <p class="text-xs text-ink-muted">Paths</p>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
