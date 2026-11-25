<script setup>
// Walkway map editor. Points (nodes) are places people walk through: gates, corners,
// building entrances. Paths (edges) connect two points; the server computes their length.
//
// Tools: Select · Add point · Draw path · Connect, plus Record walk (GPS), an averaged
// "Add point here", auto-join to nearby points, and Undo.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import { admin } from '../../lib/api'
import { toast, confirmAction } from '../../lib/feedback'
import { useMapStore } from '../../stores/map'
import { distanceBetween, formatDistance } from '../../lib/geo'
import { enforceSpacing, nearestNode, pathLength, simplify, snapToNetwork } from '../../lib/pathTools'
import { sampleGps, watchWalk } from '../../lib/gps'
import MapCanvas from '../../components/MapCanvas.vue'
import AppIcon from '../../components/ui/AppIcon.vue'
import PageHeader from '../../components/ui/PageHeader.vue'
import UiButton from '../../components/ui/UiButton.vue'
import UiField from '../../components/ui/UiField.vue'

const campus = useMapStore()

const JOIN_RADIUS_M = 6 // recorded/averaged points this close to an existing point join it
const SNAP_PX = 14 // clicks this close (in screen pixels) to a point use that point

const mode = ref('select') // select | add | draw | link
const selectedId = ref(null) // node id, or 'new'
const selectedEdgeId = ref(null)
const linkFrom = ref(null)
const form = ref(null)
const formOriginal = ref(null)
const busy = ref(false)
const panel = ref(null)

const modes = [
  { id: 'select', label: 'Select', icon: 'pointer', key: 'V' },
  { id: 'add', label: 'Point', icon: 'plus', key: 'A' },
  { id: 'draw', label: 'Draw', icon: 'draw', key: 'D' },
  { id: 'link', label: 'Connect', icon: 'link', key: 'C' },
]

// ---------------------------------------------------------------- Undo
const history = ref([]) // [{ label, undo: async fn }]
function remember(label, undo) {
  history.value.push({ label, undo })
  if (history.value.length > 30) history.value.shift()
}
async function undoLast() {
  const last = history.value.pop()
  if (!last) return
  try {
    await last.undo()
    await campus.load(true)
    toast(`Undone: ${last.label}`)
  } catch (e) {
    toast.error(`Could not undo: ${e.message}`)
  }
}

// ---------------------------------------------------------------- Derived
const selectedEdge = computed(() => campus.edges.find((e) => e.id === selectedEdgeId.value) ?? null)
const pointName = (id) => {
  const n = campus.nodeById.get(id)
  return n?.label || n?.code || 'point'
}
const edgeEnds = computed(() => (selectedEdge.value ? `${pointName(selectedEdge.value.fromId)} ↔ ${pointName(selectedEdge.value.toId)}` : ''))
const buildingOptions = computed(() => [{ value: '', label: 'Not an entrance' }, ...campus.buildings.map((b) => ({ value: b.id, label: b.name }))])
const degree = computed(() => {
  const d = new Map()
  for (const e of campus.edges) {
    d.set(e.fromId, (d.get(e.fromId) ?? 0) + 1)
    d.set(e.toId, (d.get(e.toId) ?? 0) + 1)
  }
  return d
})

// ---------------------------------------------------------------- Draw path
const draft = ref([]) // [{ id?, lat, lng }]
const draftLength = computed(() => pathLength(draft.value))

function addDraftPoint(p) {
  const last = draft.value[draft.value.length - 1]
  if (last && ((p.id && last.id === p.id) || distanceBetween(last, p) < 1)) return
  draft.value.push(p)
}

async function finishDraft() {
  if (draft.value.length < 2) return toast.error('Click at least two spots to draw a path.')
  busy.value = true
  try {
    const res = await admin.createPath(draft.value.map((p) => (p.id ? { id: p.id } : { lat: p.lat, lng: p.lng })))
    remember('draw path', () => admin.deletePath({ nodeIds: res.nodes.map((n) => n.id), edgeIds: res.edges.map((e) => e.id) }))
    await campus.load(true)
    toast(`Path saved: ${res.edges.length} segment(s), ${formatDistance(draftLength.value)}`)
    draft.value = []
  } catch (e) {
    toast.error(e.message)
  } finally {
    busy.value = false
  }
}

// ---------------------------------------------------------------- Record walk
const rec = ref({ state: 'idle', track: [], last: null, error: '' }) // idle | recording | review
const recPreview = ref([]) // processed points ready to save
let stopWatch = null
let wakeLock = null

const recDistance = computed(() => pathLength(rec.value.track))
const recJoined = computed(() => recPreview.value.filter((p) => p.id).length)

async function startRecording() {
  clearSelection()
  mode.value = 'select'
  rec.value = { state: 'recording', track: [], last: null, error: '' }
  try {
    wakeLock = await navigator.wakeLock?.request('screen')
  } catch {
    /* fine */
  }
  stopWatch = watchWalk({
    onFix: onRecordFix,
    onError: (e) => {
      rec.value.error = e.message
    },
  })
  await nextTick()
  panel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function onRecordFix(f) {
  rec.value.last = f
  if (!f.accepted) return
  const track = rec.value.track
  // Skip jitter while standing still: only add a reading after ~2 m of movement.
  if (!track.length || distanceBetween(track[track.length - 1], f) >= 2) track.push({ lat: f.lat, lng: f.lng })
  if (track.length === 1) map?.setView([f.lat, f.lng], Math.max(map.getZoom(), 19))
  else map?.panTo([f.lat, f.lng])
}

function stopRecording() {
  stopWatch?.()
  stopWatch = null
  wakeLock?.release?.().catch(() => {})
  wakeLock = null
  const track = rec.value.track
  if (track.length < 2) {
    rec.value.state = 'idle'
    return toast.error('Not enough movement was recorded. Walk at least 10 m with GPS on.')
  }
  // Clean the track: keep corners, drop GPS wobble, space points ~5 m apart, join the network.
  const cleaned = enforceSpacing(simplify(track, 3), 5)
  recPreview.value = snapToNetwork(cleaned, campus.nodes, JOIN_RADIUS_M)
  rec.value.state = 'review'
}

async function saveRecording() {
  busy.value = true
  try {
    const res = await admin.createPath(recPreview.value.map((p) => (p.id ? { id: p.id } : { lat: p.lat, lng: p.lng })))
    remember('recorded walk', () => admin.deletePath({ nodeIds: res.nodes.map((n) => n.id), edgeIds: res.edges.map((e) => e.id) }))
    await campus.load(true)
    toast(`Walk saved: ${res.nodes.length} new point(s), ${res.edges.length} path(s). Name the junctions and doors next.`)
    discardRecording()
  } catch (e) {
    toast.error(e.message)
  } finally {
    busy.value = false
  }
}

function discardRecording() {
  stopWatch?.()
  stopWatch = null
  rec.value = { state: 'idle', track: [], last: null, error: '' }
  recPreview.value = []
}

// Dev-only hook so the recorder can be tested without walking: window.__pathsDebug.feed(lat, lng, accuracy)
if (import.meta.env.DEV) {
  window.__pathsDebug = { feed: (lat, lng, accuracy = 5) => onRecordFix({ lat, lng, accuracy, accepted: accuracy <= 25 }) }
}

// ---------------------------------------------------------------- Averaged "Add point here"
const sampling = ref(null) // { count, accuracy } while reading GPS

async function addPointHere() {
  sampling.value = { count: 0, accuracy: null }
  try {
    const p = await sampleGps({ onProgress: (s) => (sampling.value = s) })
    const round = (n) => Math.round(n * 1e7) / 1e7
    const pos = { lat: round(p.lat), lng: round(p.lng) }
    map?.setView([pos.lat, pos.lng], Math.max(map?.getZoom() ?? 19, 19))
    if (form.value) {
      Object.assign(form.value, pos)
      toast(`Moved to your location (±${Math.round(p.accuracy)} m from ${p.count} readings)`)
      return
    }
    const existing = nearestNode(campus.nodes, pos, JOIN_RADIUS_M)
    if (existing) {
      selectNode(existing)
      toast(`You're at an existing point: ${existing.label || existing.code || 'unnamed point'}`)
      return
    }
    mode.value = 'select'
    openNewPoint(pos)
    toast(`Location found: ±${Math.round(p.accuracy)} m from ${p.count} readings. Drag the pin to fine-tune.`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    sampling.value = null
  }
}

// ---------------------------------------------------------------- Hints
const hint = computed(() => {
  if (rec.value.state === 'recording') return 'Recording: walk along the walkway. Stop when you reach the end.'
  if (rec.value.state === 'review') return 'Check the green line, then save or discard the recorded walk.'
  if (mode.value === 'draw') {
    return draft.value.length
      ? `${draft.value.length} point(s), ${formatDistance(draftLength.value)}. Keep clicking along the walkway, then Finish (Enter).`
      : 'Click along a walkway to draw it. Clicking an existing point joins the path to it.'
  }
  if (mode.value === 'link') {
    return linkFrom.value ? `From ${pointName(linkFrom.value)}: click the next point. Esc to stop.` : 'Click two points to connect them with a path.'
  }
  if (mode.value === 'add') return 'Click the map where a gate, corner, junction or entrance is.'
  return 'Click a point to edit it or a line to remove it. Drag the selected point to move it.'
})

// ---------------------------------------------------------------- Leaflet drawing
let map
let layer
const COLORS = { entrance: '#059669', qr: '#7c3aed', point: '#0f172a', selected: '#dc2626', path: '#475569', draft: '#1d4ed8', rec: '#d97706', preview: '#059669' }

function metersPerPixel() {
  if (!map) return 1
  const lat = map.getCenter().lat
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (map.getZoom() + 8)
}

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
        if (mode.value !== 'select' || rec.value.state !== 'idle') return
        selectedEdgeId.value = e.id
        selectedId.value = null
        form.value = null
      })
      .addTo(layer)
  }

  for (const n of campus.nodes) {
    if (n.id === selectedId.value) continue // drawn as a draggable pin below
    const inDraft = draft.value.some((p) => p.id === n.id)
    const color = n.id === linkFrom.value || inDraft ? COLORS.selected : n.buildingId ? COLORS.entrance : n.code ? COLORS.qr : COLORS.point
    const marker = L.circleMarker([n.lat, n.lng], { radius: n.code || n.buildingId ? 8 : 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
    if (n.label || n.code) marker.bindTooltip(n.label || n.code)
    marker.on('click', (ev) => {
      L.DomEvent.stopPropagation(ev)
      onNodeClick(n)
    })
    marker.addTo(layer)
  }

  // Draft path being drawn
  if (draft.value.length) {
    const ll = draft.value.map((p) => [p.lat, p.lng])
    L.polyline(ll, { color: COLORS.draft, weight: 5, dashArray: '8 8' }).addTo(layer)
    draft.value.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 5, color: '#fff', weight: 2, fillColor: COLORS.draft, fillOpacity: 1 }).addTo(layer))
  }

  // Recording: raw track + current position; review: cleaned preview
  if (rec.value.state === 'recording' && rec.value.track.length) {
    L.polyline(rec.value.track.map((p) => [p.lat, p.lng]), { color: COLORS.rec, weight: 5 }).addTo(layer)
  }
  if (rec.value.last) {
    const f = rec.value.last
    L.circle([f.lat, f.lng], { radius: Math.min(f.accuracy, 50), color: COLORS.draft, weight: 1, fillOpacity: 0.12 }).addTo(layer)
    L.circleMarker([f.lat, f.lng], { radius: 7, color: '#fff', weight: 3, fillColor: COLORS.draft, fillOpacity: 1 }).addTo(layer)
  }
  if (rec.value.state === 'review' && recPreview.value.length) {
    L.polyline(recPreview.value.map((p) => [p.lat, p.lng]), { color: COLORS.preview, weight: 5, dashArray: '8 6' }).addTo(layer)
    recPreview.value.forEach((p) =>
      L.circleMarker([p.lat, p.lng], { radius: p.id ? 7 : 4, color: '#fff', weight: 2, fillColor: p.id ? COLORS.point : COLORS.preview, fillOpacity: 1 }).addTo(layer),
    )
  }

  if (form.value) {
    const pin = L.marker([form.value.lat, form.value.lng], { draggable: true, autoPan: true }).addTo(layer)
    pin.on('dragend', () => {
      const p = pin.getLatLng()
      form.value.lat = Math.round(p.lat * 1e7) / 1e7
      form.value.lng = Math.round(p.lng * 1e7) / 1e7
    })
  }
}

function onReady(m) {
  map = m
  draw()
}

watch(() => [campus.nodes, campus.edges, selectedId.value, selectedEdgeId.value, linkFrom.value], draw)
watch(() => form.value && [form.value.lat, form.value.lng], draw)
watch(draft, draw, { deep: true })
watch(() => [rec.value.state, rec.value.track.length, rec.value.last, recPreview.value], draw)
watch(mode, (m, old) => {
  linkFrom.value = null
  selectedEdgeId.value = null
  if (m !== 'select') clearSelection()
  if (old === 'draw' && draft.value.length) draft.value = []
})

// When the editor opens below the map (narrower screens), bring it into view.
watch([selectedId, selectedEdgeId], async ([n, e]) => {
  if (!n && !e) return
  await nextTick()
  const el = panel.value
  if (el && el.getBoundingClientRect().top > window.innerHeight - 120) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

// ---------------------------------------------------------------- Keyboard (desktop)
function onKey(e) {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
  const k = e.key.toLowerCase()
  if ((e.ctrlKey || e.metaKey) && k === 'z') {
    e.preventDefault()
    return undoLast()
  }
  if (rec.value.state !== 'idle') return
  if (k === 'escape') {
    linkFrom.value = null
    draft.value = []
    clearSelection()
  } else if (k === 'enter' && mode.value === 'draw') finishDraft()
  else if (k === 'backspace' && mode.value === 'draw' && draft.value.length) {
    e.preventDefault()
    draft.value.pop()
  } else if (k === 'v') mode.value = 'select'
  else if (k === 'a') mode.value = 'add'
  else if (k === 'd') mode.value = 'draw'
  else if (k === 'c') mode.value = 'link'
  else if ((k === 'delete' || k === 'backspace') && selectedEdgeId.value) deleteEdge()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stopWatch?.()
  wakeLock?.release?.().catch(() => {})
  if (import.meta.env.DEV) delete window.__pathsDebug
})

// ---------------------------------------------------------------- Interactions
function clearSelection() {
  selectedId.value = null
  selectedEdgeId.value = null
  form.value = null
  formOriginal.value = null
}

function selectNode(n) {
  selectedEdgeId.value = null
  selectedId.value = n.id
  form.value = { lat: n.lat, lng: n.lng, code: n.code || '', label: n.label || '', buildingId: n.buildingId || '' }
  formOriginal.value = { ...form.value }
}

function openNewPoint(p) {
  selectedEdgeId.value = null
  selectedId.value = 'new'
  form.value = { lat: p.lat, lng: p.lng, code: '', label: '', buildingId: '' }
  formOriginal.value = null
}

function onMapClick(p) {
  if (rec.value.state !== 'idle') return
  // Auto-join: a click right next to an existing point means that point.
  const near = nearestNode(campus.nodes, p, metersPerPixel() * SNAP_PX)
  if (near && mode.value !== 'select') return onNodeClick(near)

  const pos = { lat: Math.round(p.lat * 1e7) / 1e7, lng: Math.round(p.lng * 1e7) / 1e7 }
  if (mode.value === 'add') openNewPoint(pos)
  else if (mode.value === 'draw') addDraftPoint(pos)
  else if (mode.value === 'select') clearSelection()
  else if (mode.value === 'link') linkFrom.value = null
}

async function onNodeClick(n) {
  if (rec.value.state !== 'idle') return
  if (mode.value === 'draw') return addDraftPoint({ id: n.id, lat: n.lat, lng: n.lng })
  if (mode.value === 'link') {
    if (!linkFrom.value) linkFrom.value = n.id
    else if (linkFrom.value === n.id) linkFrom.value = null
    else {
      try {
        const edge = await admin.create('edges', { fromId: linkFrom.value, toId: n.id })
        remember('connect', () => admin.deletePath({ edgeIds: [edge.id] }))
        await campus.load(true)
        linkFrom.value = n.id // keep chaining from the last point
      } catch (e) {
        toast.error(e.message)
      }
    }
    return
  }
  if (mode.value === 'add') mode.value = 'select'
  selectNode(n)
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
    if (selectedId.value === 'new') {
      const node = await admin.create('nodes', data)
      remember('add point', () => admin.deletePath({ nodeIds: [node.id] }))
      toast('Point added')
    } else {
      const id = selectedId.value
      const before = formOriginal.value
      await admin.update('nodes', id, data)
      if (before) {
        remember('edit point', () =>
          admin.update('nodes', id, { lat: before.lat, lng: before.lng, code: before.code || null, label: before.label || null, buildingId: before.buildingId || null }),
        )
      }
      toast('Point saved')
    }
    await campus.load(true)
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
    message: links ? `The ${links} path(s) connected to it will be removed too. This can't be undone.` : "This can't be undone.",
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
  const edge = selectedEdge.value
  if (!edge) return
  try {
    await admin.remove('edges', edge.id)
    remember('remove path', () => admin.create('edges', { fromId: edge.fromId, toId: edge.toId }))
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
const busyTools = computed(() => rec.value.state !== 'idle')
</script>

<template>
  <div>
    <PageHeader title="Walkway paths" description="Map the walkways visitors can use. Routes and turn directions follow these paths.">
      <template #actions>
        <UiButton variant="secondary" icon="locate" :loading="!!sampling" :disabled="busyTools" @click="addPointHere">
          {{ sampling ? `Reading GPS… ${sampling.count}` : form ? 'Move to my location' : 'Add point here' }}
        </UiButton>
        <UiButton icon="record" :disabled="busyTools" @click="startRecording">Record walk</UiButton>
      </template>
    </PageHeader>

    <div class="grid gap-4 xl:grid-cols-[1fr_340px]">
      <!-- Map -->
      <div class="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
        <div class="flex flex-wrap items-center gap-2 border-b border-line p-2">
          <div class="grid flex-1 grid-cols-4 gap-1 rounded-lg bg-canvas p-1 ring-1 ring-line ring-inset sm:flex-none" role="radiogroup" aria-label="Editing mode">
            <button
              v-for="m in modes"
              :key="m.id"
              type="button"
              role="radio"
              :aria-checked="mode === m.id"
              :disabled="busyTools"
              class="flex flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm"
              :class="mode === m.id ? 'bg-surface text-primary-700 shadow-xs' : 'text-ink-soft hover:text-ink'"
              :title="`${m.label} (${m.key})`"
              @click="mode = m.id"
            >
              <AppIcon :name="m.icon" :size="16" />
              {{ m.label }}
            </button>
          </div>
          <button
            type="button"
            :aria-label="'Undo'"
            class="ml-auto flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-soft hover:bg-canvas hover:text-ink disabled:opacity-40"
            :disabled="!history.length || busyTools"
            :title="history.length ? `Undo ${history[history.length - 1].label} (Ctrl+Z)` : 'Nothing to undo'"
            @click="undoLast"
          >
            <AppIcon name="undo" :size="16" /> <span class="hidden sm:inline">Undo</span>
          </button>
        </div>

        <!-- Hint / draw controls -->
        <!-- Fixed height so the map never shifts under the cursor while drawing -->
        <div class="flex min-h-[60px] flex-wrap items-center gap-2 border-b border-line bg-primary-50/60 px-3 py-2 text-sm text-primary-700">
          <AppIcon name="info" :size="16" />
          <span class="min-w-0 flex-1">{{ hint }}</span>
          <template v-if="mode === 'draw' && draft.length && !busyTools">
            <UiButton size="sm" variant="quiet" @click="draft.pop()">Remove last</UiButton>
            <UiButton size="sm" variant="secondary" @click="draft = []">Cancel</UiButton>
            <UiButton size="sm" icon="check" :disabled="draft.length < 2" :loading="busy" @click="finishDraft">Finish</UiButton>
          </template>
        </div>

        <div class="relative h-[55dvh] xl:h-[calc(100dvh-260px)] xl:min-h-[480px]" :class="mode === 'add' || mode === 'draw' ? 'cursor-crosshair' : ''">
          <MapCanvas :buildings="campus.buildings" :extra-points="campus.nodes" :lock-to-campus="false" @ready="onReady" @map-click="onMapClick" />
          <!-- Recording badge -->
          <div v-if="rec.state === 'recording'" class="pointer-events-none absolute top-3 left-3 z-[1000] flex items-center gap-2 rounded-full bg-ink/90 px-3 py-1.5 text-sm font-medium text-white shadow-lg">
            <span class="h-2.5 w-2.5 animate-pulse rounded-full bg-danger-600" />
            Recording · {{ formatDistance(recDistance) || '0 m' }}
          </div>
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
        <!-- Record walk -->
        <section v-if="rec.state !== 'idle'" class="rounded-xl border-2 bg-surface shadow-xs md:col-span-2 xl:col-span-1" :class="rec.state === 'recording' ? 'border-danger-600/40' : 'border-success-600/40'">
          <header class="flex items-center gap-2 border-b border-line px-4 py-3">
            <span v-if="rec.state === 'recording'" class="h-2.5 w-2.5 animate-pulse rounded-full bg-danger-600" />
            <AppIcon v-else name="check" :size="18" class="text-success-600" />
            <h2 class="text-base font-semibold">{{ rec.state === 'recording' ? 'Recording your walk' : 'Review recorded walk' }}</h2>
          </header>

          <div v-if="rec.state === 'recording'" class="space-y-4 px-4 py-4">
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="rounded-lg bg-canvas py-2">
                <p class="text-lg font-semibold tabular-nums">{{ formatDistance(recDistance) || '0 m' }}</p>
                <p class="text-xs text-ink-muted">walked</p>
              </div>
              <div class="rounded-lg bg-canvas py-2">
                <p class="text-lg font-semibold tabular-nums">{{ rec.track.length }}</p>
                <p class="text-xs text-ink-muted">readings</p>
              </div>
              <div class="rounded-lg bg-canvas py-2">
                <p class="text-lg font-semibold tabular-nums" :class="rec.last && !rec.last.accepted ? 'text-warning-600' : ''">
                  {{ rec.last ? `±${Math.round(rec.last.accuracy)} m` : '…' }}
                </p>
                <p class="text-xs text-ink-muted">GPS</p>
              </div>
            </div>
            <p v-if="rec.error" class="flex gap-2 rounded-lg bg-danger-50 p-2.5 text-sm text-danger-600"><AppIcon name="alert" :size="16" class="mt-0.5" />{{ rec.error }}</p>
            <p v-else-if="!rec.last" class="text-sm text-ink-muted">Waiting for GPS… Allow location access and step outside if needed.</p>
            <p v-else-if="!rec.last.accepted" class="text-sm text-warning-600">GPS is weak (±{{ Math.round(rec.last.accuracy) }} m). Readings are paused until it improves.</p>
            <ul class="space-y-1.5 text-sm text-ink-soft">
              <li class="flex gap-2"><AppIcon name="check" :size="16" class="mt-0.5 text-success-600" />Walk along the middle of the walkway at a normal pace.</li>
              <li class="flex gap-2"><AppIcon name="check" :size="16" class="mt-0.5 text-success-600" />Start and stop at a junction or door. The ends join nearby points automatically.</li>
              <li class="flex gap-2"><AppIcon name="check" :size="16" class="mt-0.5 text-success-600" />Keep this screen open while you walk.</li>
            </ul>
            <div class="flex gap-2">
              <UiButton variant="secondary" @click="discardRecording">Cancel</UiButton>
              <UiButton variant="danger" icon="stop" block @click="stopRecording">Stop recording</UiButton>
            </div>
          </div>

          <div v-else class="space-y-4 px-4 py-4">
            <p class="text-sm text-ink-soft">
              <b class="font-semibold text-ink">{{ formatDistance(pathLength(recPreview)) }}</b> walkway with
              <b class="font-semibold text-ink">{{ recPreview.length - recJoined }}</b> new point(s)<template v-if="recJoined">, joined to <b class="font-semibold text-ink">{{ recJoined }}</b> existing point(s)</template>.
            </p>
            <p class="text-sm text-ink-muted">GPS wobble was smoothed out; corners were kept. After saving, name the junctions and mark doors as entrances.</p>
            <div class="flex gap-2">
              <UiButton variant="secondary" icon="trash" @click="discardRecording">Discard</UiButton>
              <UiButton icon="check" block :loading="busy" @click="saveRecording">Save walkway</UiButton>
            </div>
          </div>
        </section>

        <!-- Point editor -->
        <form v-else-if="form" class="rounded-xl border border-line bg-surface shadow-xs" @submit.prevent="saveNode">
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
            <UiField v-model="form.label" label="Name" maxlength="120" placeholder="e.g. Main Gate, Canteen corner" hint="Used in directions, e.g. “Turn left at Canteen corner”." />
            <UiField v-model="form.buildingId" as="select" label="Entrance of" :options="buildingOptions" hint="Routes to that building end at this point." />
            <UiField v-model="form.code" label="QR code name" maxlength="40" placeholder="e.g. gate1" hint="Optional. Lowercase letters, numbers and dashes." />
            <div v-if="qrLink" class="rounded-lg border border-line bg-canvas p-3">
              <p class="flex items-center gap-1.5 text-xs font-medium text-ink-soft"><AppIcon name="qr" :size="14" /> QR link for this point</p>
              <p class="mt-1 font-mono text-xs break-all text-ink">{{ qrLink }}</p>
              <button type="button" class="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700" @click="copyQrLink">Copy link</button>
            </div>
            <p v-if="selectedId !== 'new'" class="text-sm text-ink-muted">{{ degree.get(selectedId) ?? 0 }} path(s) connected. Drag the pin on the map to move it.</p>
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
          <h2 class="text-base font-semibold">Fastest way to map the campus</h2>
          <ol class="mt-3 space-y-3 text-sm text-ink-soft">
            <li class="flex gap-3">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">1</span>
              <span>On your phone, tap <b class="font-medium text-ink">Record walk</b> and walk each walkway from junction to junction.</span>
            </li>
            <li class="flex gap-3">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">2</span>
              <span>At your desk, use <b class="font-medium text-ink">Draw</b> to add or fix short walkways on the map.</span>
            </li>
            <li class="flex gap-3">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">3</span>
              <span>Click junctions to <b class="font-medium text-ink">name</b> them, set <b class="font-medium text-ink">Entrance of</b> on doors and a <b class="font-medium text-ink">QR code name</b> on gates.</span>
            </li>
          </ol>
          <p class="mt-4 hidden text-xs text-ink-muted lg:block">Shortcuts: V select · A point · D draw · C connect · Enter finish · Esc cancel · Ctrl+Z undo</p>
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
