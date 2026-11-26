<script setup>
// Campus map editor: draw the flat campus map visitors see (buildings, roads, crossings, areas)
// on the same drawn map. Uses Leaflet-Geoman (MIT) for drawing, corner editing, moving, rotating.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import L from '../../lib/leafletGlobal' // must come before Geoman
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { admin } from '../../lib/api'
import { toast, confirmAction } from '../../lib/feedback'
import { useMapStore } from '../../stores/map'
import { CATEGORIES } from '../../lib/categories'
import { CAMPUS_COLORS as C, DEFAULT_CROSSING_WIDTH_M, DEFAULT_ROAD_WIDTH_M, centroid, metersPerPixel } from '../../lib/campusStyle'
import MapCanvas from '../../components/MapCanvas.vue'
import AppIcon from '../../components/ui/AppIcon.vue'
import PageHeader from '../../components/ui/PageHeader.vue'
import UiButton from '../../components/ui/UiButton.vue'

const campus = useMapStore()

const TOOLS = [
  { id: 'select', label: 'Select', icon: 'pointer', hint: 'Click a building, road or area to edit it.' },
  { id: 'rect', label: 'Building ▭', icon: 'building', hint: 'Click one corner of the building, then the opposite corner. You can rotate it afterwards.' },
  { id: 'poly', label: 'Building ⬠', icon: 'building', hint: 'Click each corner of the building. Click the first corner again to finish.' },
  { id: 'road', label: 'Road', icon: 'route', hint: 'Click along the road. Double-click (or click the last point again) to finish.' },
  { id: 'crossing', label: 'Crossing', icon: 'route', hint: 'Click where the crossing starts and where it ends, then click the last point again.' },
  { id: 'area', label: 'Area', icon: 'layers', hint: 'Click around the area (field, garden, parking). Click the first point again to finish.' },
]
const tool = ref('select')
const hint = computed(() => TOOLS.find((t) => t.id === tool.value)?.hint)

// What the side panel shows.
const pending = ref(null) // just drawn: { kind: 'building'|'road'|'crossing'|'area', shapeKind, layer, ... }
const selected = ref(null) // existing item: { type: 'building'|'feature', id, layer }
const editMode = ref(null) // 'corners' | 'move' | 'rotate' | null
const busy = ref(false)
const form = ref({})

const unshaped = computed(() => campus.buildings.filter((b) => !b.shape?.points?.length))
const counts = computed(() => ({
  shaped: campus.buildings.length - unshaped.value.length,
  roads: campus.features.filter((f) => f.kind === 'road').length,
  crossings: campus.features.filter((f) => f.kind === 'crossing').length,
  areas: campus.features.filter((f) => f.kind === 'area').length,
}))
const categoryOptions = [{ value: '', label: 'No category' }, ...CATEGORIES.map((c) => ({ value: c.id, label: c.label }))]

// ---------------------------------------------------------------- map + Geoman
let map = null
let layer = null // our editable buildings + features
let pmReady = false

function onReady(m) {
  map = m
  // Geoman hooks into maps created after it loaded; attach by hand just in case.
  if (!map.pm && L.PM) map.pm = new L.PM.Map(map)
  pmReady = true
  map.pm.setGlobalOptions({ snappable: true, snapDistance: 15, allowSelfIntersection: false })
  map.pm.setLang('en')
  map.on('pm:create', onCreated)
  map.on('zoomend', draw)
  draw()
}

const px = (meters, min) => Math.max(min, meters / metersPerPixel(map.getCenter().lat, map.getZoom()))
const ll = (pts) => pts.map((p) => [p.lat, p.lng])
const toPoints = (latlngs) => (Array.isArray(latlngs[0]) ? latlngs[0] : latlngs).map((p) => ({ lat: Math.round(p.lat * 1e7) / 1e7, lng: Math.round(p.lng * 1e7) / 1e7 }))

function styleFor(kind, f, active) {
  if (kind === 'building') {
    return { color: active ? C.buildingActiveStroke : C.buildingStroke, weight: active ? 3 : 1.5, fillColor: active ? C.buildingActive : C.building, fillOpacity: 1 }
  }
  if (kind === 'area') return { color: active ? C.buildingActiveStroke : C.areaStroke, weight: active ? 3 : 1, fillColor: C.area, fillOpacity: 1 }
  const w = px(f?.widthM || (kind === 'road' ? DEFAULT_ROAD_WIDTH_M : DEFAULT_CROSSING_WIDTH_M), kind === 'road' ? 6 : 4)
  if (kind === 'road') return { color: active ? C.buildingActiveStroke : C.road, weight: w, lineCap: 'butt', opacity: 1 }
  return { color: active ? C.buildingActiveStroke : C.crossing, weight: w, dashArray: `${Math.max(3, w * 0.45)} ${Math.max(3, w * 0.45)}`, lineCap: 'butt' }
}

function draw() {
  if (!map) return
  const keep = selected.value?.layer && editMode.value // don't redraw the layer being edited
  layer?.eachLayer((l) => {
    if (l !== keep) layer.removeLayer(l)
  })
  if (!layer) layer = L.layerGroup().addTo(map)
  const isSel = (type, id) => selected.value?.type === type && selected.value?.id === id

  for (const f of campus.features) {
    if (keep && isSel('feature', f.id)) continue
    if (!Array.isArray(f.points)) continue
    const l = f.kind === 'area' ? L.polygon(ll(f.points), styleFor('area', f, isSel('feature', f.id))) : L.polyline(ll(f.points), styleFor(f.kind, f, isSel('feature', f.id)))
    l.pm?.setOptions?.({ allowSelfIntersection: false })
    l.on('click', (e) => onItemClick(e, 'feature', f, l))
    if (f.kind === 'road') l.bindTooltip(f.name || 'Road', { sticky: true })
    layer.addLayer(l)
  }
  for (const b of campus.buildings) {
    if (keep && isSel('building', b.id)) continue
    if (b.shape?.points?.length >= 3) {
      const l = L.polygon(ll(b.shape.points), styleFor('building', null, isSel('building', b.id)))
      l.on('click', (e) => onItemClick(e, 'building', b, l))
      layer.addLayer(l)
      const c = centroid(b.shape.points)
      layer.addLayer(
        L.marker([c.lat, c.lng], {
          interactive: false,
          pmIgnore: true,
          icon: L.divIcon({ className: 'campus-label', iconSize: null, html: `<span class="block -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[12px] font-semibold" style="color:${C.buildingLabel}">${escapeHtml(b.name)}</span>` }),
        }),
      )
    } else {
      // Not drawn yet: show its pin so it can be found and given a shape.
      const l = L.circleMarker([b.lat, b.lng], { radius: 8, color: '#fff', weight: 2, fillColor: isSel('building', b.id) ? C.buildingActiveStroke : '#1d4ed8', fillOpacity: 1, pmIgnore: true })
      l.bindTooltip(`${b.name} (not drawn yet)`, { direction: 'top', offset: [0, -8] })
      l.on('click', (e) => onItemClick(e, 'building', b, null))
      layer.addLayer(l)
    }
  }
}

function escapeHtml(t) {
  const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(t).replace(/[&<>"']/g, (ch) => m[ch])
}

watch(() => [campus.buildings, campus.features], draw)

// ---------------------------------------------------------------- tools
watch(tool, (t) => {
  if (!pmReady) return
  map.pm.disableDraw()
  if (t === 'select') return
  cancelEdit()
  discardPending()
  selected.value = null
  const draftStyle = { color: C.buildingActiveStroke, fillColor: C.buildingActive, fillOpacity: 0.6, weight: 2 }
  if (t === 'rect') map.pm.enableDraw('Rectangle', { pathOptions: draftStyle, templineStyle: draftStyle, hintlineStyle: draftStyle })
  else if (t === 'poly' || t === 'area') map.pm.enableDraw('Polygon', { pathOptions: draftStyle, templineStyle: draftStyle, hintlineStyle: draftStyle, finishOn: null })
  else map.pm.enableDraw('Line', { pathOptions: { color: C.buildingActiveStroke, weight: 6 }, templineStyle: { color: C.buildingActiveStroke }, hintlineStyle: { color: C.buildingActiveStroke, dashArray: '4 4' }, finishOn: 'dblclick' })
})

function onCreated(e) {
  const t = tool.value
  const drawnLayer = e.layer
  map.pm.disableDraw()
  const isBuilding = t === 'rect' || t === 'poly'
  pending.value = {
    kind: isBuilding ? 'building' : t,
    shapeKind: t === 'rect' ? 'rect' : 'poly',
    layer: drawnLayer,
    forBuilding: drawFor.value, // drawing a shape for a specific existing building
  }
  form.value = isBuilding
    ? { mode: drawFor.value ? 'existing' : 'new', name: '', category: '', buildingId: drawFor.value || unshaped.value[0]?.id || '' }
    : { name: '', widthM: t === 'road' ? DEFAULT_ROAD_WIDTH_M : t === 'crossing' ? DEFAULT_CROSSING_WIDTH_M : null }
  drawFor.value = null
  tool.value = 'select'
}

function discardPending() {
  pending.value?.layer?.remove()
  pending.value = null
}

async function savePending() {
  const p = pending.value
  if (!p) return
  const points = toPoints(p.layer.getLatLngs())
  busy.value = true
  try {
    if (p.kind === 'building') {
      const c = centroid(points)
      const shape = { kind: p.shapeKind, points }
      if (form.value.mode === 'existing') {
        if (!form.value.buildingId) throw new Error('Choose which building this shape is for.')
        await admin.update('buildings', form.value.buildingId, { shape, lat: c.lat, lng: c.lng })
        toast('Shape saved for the building')
      } else {
        if (!form.value.name.trim()) throw new Error('Give the new building a name.')
        await admin.create('buildings', { name: form.value.name.trim(), category: form.value.category || null, shape, lat: c.lat, lng: c.lng })
        toast(`${form.value.name.trim()} added. Add its entrance and rooms in Buildings.`)
      }
    } else {
      const data = { kind: p.kind, name: form.value.name.trim() || null, points }
      if (p.kind !== 'area') data.widthM = Number(form.value.widthM) || undefined
      await admin.create('features', data)
      toast(`${p.kind[0].toUpperCase() + p.kind.slice(1)} added`)
    }
    p.layer.remove()
    pending.value = null
    await campus.load(true)
  } catch (e) {
    toast.error(e.message)
  } finally {
    busy.value = false
  }
}

// Draw a shape for an existing building that has none yet.
const drawFor = ref(null)
function drawShapeFor(buildingId, kind = 'rect') {
  selected.value = null
  drawFor.value = buildingId
  tool.value = kind
}

// ---------------------------------------------------------------- select + edit
function onItemClick(e, type, item, l) {
  L.DomEvent.stopPropagation(e)
  if (tool.value !== 'select' || pending.value) return
  if (selected.value?.id === item.id) return
  cancelEdit()
  selected.value = { type, id: item.id, layer: l }
  form.value = type === 'building' ? { name: item.name } : { name: item.name || '', widthM: item.widthM ?? null }
  draw()
}

const selectedItem = computed(() => {
  const s = selected.value
  if (!s) return null
  return s.type === 'building' ? campus.buildingById.get(s.id) : campus.features.find((f) => f.id === s.id)
})

function findSelectedLayer() {
  // The layer was redrawn when selected: find the fresh one by geometry.
  const item = selectedItem.value
  const pts = selected.value.type === 'building' ? item?.shape?.points : item?.points
  if (!pts) return null
  let found = null
  layer.eachLayer((l) => {
    if (found || !l.getLatLngs) return
    const a = toPoints(l.getLatLngs())
    if (a.length === pts.length && a.every((p, i) => Math.abs(p.lat - pts[i].lat) < 1e-7 && Math.abs(p.lng - pts[i].lng) < 1e-7)) found = l
  })
  return found
}

function startEdit(mode) {
  if (!selected.value) return
  const l = findSelectedLayer()
  if (!l) return
  cancelEdit(false)
  selected.value.layer = l
  editMode.value = mode
  if (mode === 'corners') l.pm.enable({ allowSelfIntersection: false, snappable: true })
  else if (mode === 'move') l.pm.enableLayerDrag()
  else if (mode === 'rotate') l.pm.enableRotate()
}

function cancelEdit(redraw = true) {
  const l = selected.value?.layer
  if (l?.pm) {
    l.pm.disable?.()
    l.pm.disableLayerDrag?.()
    l.pm.disableRotate?.()
  }
  editMode.value = null
  if (redraw) draw() // put the original geometry back
}

async function saveSelected() {
  const s = selected.value
  const item = selectedItem.value
  if (!s || !item) return
  busy.value = true
  try {
    const l = s.layer || findSelectedLayer()
    const points = l ? toPoints(l.getLatLngs()) : null
    if (s.type === 'building') {
      const data = { name: form.value.name.trim() || item.name }
      if (points && editMode.value) {
        const c = centroid(points)
        Object.assign(data, { shape: { kind: item.shape?.kind || 'poly', points }, lat: c.lat, lng: c.lng })
      }
      await admin.update('buildings', s.id, data)
    } else {
      const data = { name: form.value.name.trim() || null }
      if (item.kind !== 'area') data.widthM = Number(form.value.widthM) || undefined
      if (points && editMode.value) data.points = points
      await admin.update('features', s.id, data)
    }
    cancelEdit(false)
    await campus.load(true)
    toast('Saved')
  } catch (e) {
    toast.error(e.message)
  } finally {
    busy.value = false
  }
}

async function removeShape() {
  const item = selectedItem.value
  if (!(await confirmAction({ title: `Remove the shape of ${item.name}?`, message: 'The building stays (with its entrances and rooms); it just shows as a pin again.', confirmLabel: 'Remove shape' }))) return
  try {
    cancelEdit(false)
    await admin.update('buildings', item.id, { shape: null })
    selected.value = null
    await campus.load(true)
    toast('Shape removed')
  } catch (e) {
    toast.error(e.message)
  }
}

async function deleteFeature() {
  const item = selectedItem.value
  if (!(await confirmAction({ title: `Delete this ${item.kind}?`, message: item.name || '' }))) return
  try {
    cancelEdit(false)
    await admin.remove('features', item.id)
    selected.value = null
    await campus.load(true)
    toast('Deleted')
  } catch (e) {
    toast.error(e.message)
  }
}

function closeSelection() {
  cancelEdit(false)
  selected.value = null
  draw()
}

function onMapClick() {
  if (tool.value === 'select' && selected.value && !editMode.value) closeSelection()
}

onBeforeUnmount(() => {
  map?.pm?.disableDraw()
  map?.off('pm:create', onCreated)
})
</script>

<template>
  <div>
    <PageHeader title="Campus map" description="Draw the map visitors see: building shapes, roads, crossings and areas. Walkways come from the Paths page." />

    <p v-if="!campus.campus" class="mb-4 flex items-start gap-2 rounded-xl bg-warning-50 p-3 text-sm text-warning-600">
      <AppIcon name="alert" :size="18" class="mt-0.5" />
      <span>Set the <RouterLink to="/admin/campus" class="font-semibold underline">campus area</RouterLink> first. The drawn map appears inside it.</span>
    </p>

    <div class="grid gap-4 xl:grid-cols-[1fr_340px]">
      <!-- Map + tools -->
      <div class="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
        <div class="flex flex-wrap gap-1 border-b border-line p-2">
          <button
            v-for="t in TOOLS"
            :key="t.id"
            type="button"
            class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium"
            :class="tool === t.id ? 'bg-primary-50 text-primary-700' : 'text-ink-soft hover:bg-canvas'"
            :disabled="!!pending"
            @click="tool = t.id"
          >
            <AppIcon :name="t.icon" :size="16" /> {{ t.label }}
          </button>
        </div>
        <div class="flex min-h-[44px] items-center gap-2 border-b border-line bg-primary-50/60 px-3 py-2 text-sm text-primary-700">
          <AppIcon name="info" :size="16" />
          <span>{{ drawFor ? `Drawing the shape of ${campus.buildingById.get(drawFor)?.name}: ` : '' }}{{ hint }}</span>
          <UiButton v-if="tool !== 'select'" size="sm" variant="quiet" class="ml-auto" @click="(tool = 'select'), (drawFor = null)">Cancel</UiButton>
        </div>
        <div class="h-[60dvh] xl:h-[calc(100dvh-240px)] xl:min-h-[520px]" :class="tool !== 'select' ? 'cursor-crosshair' : ''">
          <MapCanvas :buildings="[]" :lock-to-campus="false" :show-features="false" @ready="onReady" @map-click="onMapClick" />
        </div>
      </div>

      <!-- Side panel -->
      <aside class="space-y-4">
        <!-- Just drawn -->
        <section v-if="pending" class="space-y-4 rounded-xl border-2 border-primary-600/40 bg-surface p-4 shadow-xs">
          <h2 class="text-base font-semibold">{{ pending.kind === 'building' ? 'New building shape' : `New ${pending.kind}` }}</h2>

          <template v-if="pending.kind === 'building'">
            <div class="grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1 ring-1 ring-line ring-inset">
              <button v-for="m in [{ id: 'new', label: 'New building' }, { id: 'existing', label: 'Existing building' }]" :key="m.id" type="button" class="rounded-md py-1.5 text-sm font-medium" :class="form.mode === m.id ? 'bg-surface shadow-xs' : 'text-ink-muted'" @click="form.mode = m.id">
                {{ m.label }}
              </button>
            </div>
            <template v-if="form.mode === 'new'">
              <label class="block">
                <span class="mb-1.5 block text-sm font-medium text-ink-soft">Building name</span>
                <input v-model="form.name" maxlength="120" placeholder="e.g. Building C" class="block h-10 w-full rounded-md border border-line px-3 text-base focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none" />
              </label>
              <label class="block">
                <span class="mb-1.5 block text-sm font-medium text-ink-soft">Category</span>
                <select v-model="form.category" class="block h-10 w-full rounded-md border border-line px-3 text-base">
                  <option v-for="o in categoryOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </label>
            </template>
            <label v-else class="block">
              <span class="mb-1.5 block text-sm font-medium text-ink-soft">This is the shape of</span>
              <select v-model="form.buildingId" class="block h-10 w-full rounded-md border border-line px-3 text-base">
                <option value="" disabled>Choose a building…</option>
                <option v-for="b in campus.buildings" :key="b.id" :value="b.id">{{ b.name }}{{ b.shape?.points?.length ? ' (replace its shape)' : '' }}</option>
              </select>
            </label>
          </template>

          <template v-else>
            <label class="block">
              <span class="mb-1.5 block text-sm font-medium text-ink-soft">Name (optional)</span>
              <input v-model="form.name" maxlength="120" :placeholder="pending.kind === 'area' ? 'e.g. Football field' : 'e.g. V.H. Garces St'" class="block h-10 w-full rounded-md border border-line px-3 text-base focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none" />
            </label>
            <label v-if="pending.kind !== 'area'" class="block">
              <span class="mb-1.5 block text-sm font-medium text-ink-soft">Width (metres)</span>
              <input v-model.number="form.widthM" type="number" min="1" max="40" class="block h-10 w-28 rounded-md border border-line px-3 text-base" />
            </label>
          </template>

          <div class="flex gap-2">
            <UiButton variant="secondary" @click="discardPending">Discard</UiButton>
            <UiButton icon="check" block :loading="busy" @click="savePending">Save</UiButton>
          </div>
        </section>

        <!-- Selected item -->
        <section v-else-if="selected && selectedItem" class="space-y-4 rounded-xl border border-line bg-surface p-4 shadow-xs">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-xs font-medium tracking-wide text-ink-muted uppercase">{{ selected.type === 'building' ? 'Building' : selectedItem.kind }}</p>
              <h2 class="text-base font-semibold">{{ selectedItem.name || 'Unnamed' }}</h2>
            </div>
            <button type="button" class="-m-1 rounded-md p-1 text-ink-muted hover:bg-canvas" aria-label="Close" @click="closeSelection"><AppIcon name="x" :size="18" /></button>
          </div>

          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-ink-soft">Name</span>
            <input v-model="form.name" maxlength="120" class="block h-10 w-full rounded-md border border-line px-3 text-base focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none" />
          </label>
          <label v-if="selected.type === 'feature' && selectedItem.kind !== 'area'" class="block">
            <span class="mb-1.5 block text-sm font-medium text-ink-soft">Width (metres)</span>
            <input v-model.number="form.widthM" type="number" min="1" max="40" class="block h-10 w-28 rounded-md border border-line px-3 text-base" />
          </label>

          <!-- Building without a shape -->
          <div v-if="selected.type === 'building' && !selectedItem.shape?.points?.length" class="space-y-2">
            <p class="text-sm text-ink-muted">This building isn't drawn yet. Draw its shape:</p>
            <div class="flex gap-2">
              <UiButton size="sm" variant="secondary" @click="drawShapeFor(selectedItem.id, 'rect')">Rectangle</UiButton>
              <UiButton size="sm" variant="secondary" @click="drawShapeFor(selectedItem.id, 'poly')">Corners</UiButton>
            </div>
          </div>

          <!-- Shape editing -->
          <div v-else>
            <p class="mb-2 text-sm font-medium text-ink-soft">Shape</p>
            <div class="grid grid-cols-3 gap-1 rounded-lg bg-canvas p-1 ring-1 ring-line ring-inset">
              <button v-for="m in [{ id: 'corners', label: 'Corners' }, { id: 'move', label: 'Move' }, { id: 'rotate', label: 'Rotate' }]" :key="m.id" type="button" class="rounded-md py-1.5 text-sm font-medium" :class="editMode === m.id ? 'bg-surface text-primary-700 shadow-xs' : 'text-ink-muted'" @click="startEdit(m.id)">
                {{ m.label }}
              </button>
            </div>
            <p class="mt-1.5 text-xs text-ink-muted">
              <template v-if="editMode === 'corners'">Drag the corner handles. Drag a middle handle to add a corner.</template>
              <template v-else-if="editMode === 'move'">Drag the shape to its place.</template>
              <template v-else-if="editMode === 'rotate'">Drag a corner handle around to rotate.</template>
              <template v-else>Pick how to change the shape, then Save.</template>
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <UiButton v-if="selected.type === 'building' && selectedItem.shape?.points?.length" variant="quiet" size="sm" icon="trash" class="!text-danger-600" @click="removeShape">Remove shape</UiButton>
            <UiButton v-if="selected.type === 'feature'" variant="quiet" size="sm" icon="trash" class="!text-danger-600" @click="deleteFeature">Delete</UiButton>
            <UiButton v-if="editMode" variant="secondary" size="sm" class="ml-auto" @click="cancelEdit()">Cancel</UiButton>
            <UiButton size="sm" icon="check" :class="editMode ? '' : 'ml-auto'" :loading="busy" @click="saveSelected">Save</UiButton>
          </div>
          <RouterLink v-if="selected.type === 'building'" :to="`/admin/buildings?edit=${selectedItem.id}`" class="block text-sm font-medium text-primary-600">Edit details, entrances and rooms →</RouterLink>
        </section>

        <!-- How-to -->
        <section v-else class="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-xs">
          <h2 class="text-base font-semibold">How to draw the campus</h2>
          <ol class="space-y-2 text-sm text-ink-soft">
            <li><b class="font-medium text-ink">1.</b> Use <b class="font-medium text-ink">Building ▭</b> (click two opposite corners) for each building (rotate it after), or <b class="font-medium text-ink">Building ⬠</b> to click its corners.</li>
            <li><b class="font-medium text-ink">2.</b> Draw the <b class="font-medium text-ink">roads</b> around campus and any <b class="font-medium text-ink">crossings</b>.</li>
            <li><b class="font-medium text-ink">3.</b> Add <b class="font-medium text-ink">areas</b> like the field, gardens or parking.</li>
            <li><b class="font-medium text-ink">4.</b> Walkways come from <RouterLink to="/admin/nodes" class="font-medium text-primary-600">Paths</RouterLink>; they show as white walkways.</li>
          </ol>
          <div class="grid grid-cols-4 divide-x divide-line rounded-lg border border-line text-center">
            <div class="py-2"><p class="font-semibold tabular-nums">{{ counts.shaped }}</p><p class="text-xs text-ink-muted">Buildings</p></div>
            <div class="py-2"><p class="font-semibold tabular-nums">{{ counts.roads }}</p><p class="text-xs text-ink-muted">Roads</p></div>
            <div class="py-2"><p class="font-semibold tabular-nums">{{ counts.crossings }}</p><p class="text-xs text-ink-muted">Crossings</p></div>
            <div class="py-2"><p class="font-semibold tabular-nums">{{ counts.areas }}</p><p class="text-xs text-ink-muted">Areas</p></div>
          </div>
          <div v-if="unshaped.length">
            <p class="mb-1 text-sm font-medium text-ink-soft">Not drawn yet ({{ unshaped.length }})</p>
            <ul class="divide-y divide-line rounded-lg border border-line">
              <li v-for="b in unshaped.slice(0, 8)" :key="b.id" class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span class="truncate">{{ b.name }}</span>
                <button type="button" class="shrink-0 font-medium text-primary-600" @click="drawShapeFor(b.id, 'rect')">Draw</button>
              </li>
            </ul>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
