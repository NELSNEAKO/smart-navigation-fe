<script setup>
// Campus area: the circle (centre + radius) every map is limited to.
import { computed, ref, watch } from 'vue'
import L from 'leaflet'
import { admin } from '../../lib/api'
import { toast } from '../../lib/feedback'
import { sampleGps } from '../../lib/gps'
import { insideArea, parseLatLng } from '../../lib/campusArea'
import { useMapStore } from '../../stores/map'
import MapCanvas from '../../components/MapCanvas.vue'
import AppIcon from '../../components/ui/AppIcon.vue'
import PageHeader from '../../components/ui/PageHeader.vue'
import UiButton from '../../components/ui/UiButton.vue'

const campus = useMapStore()

const round7 = (v) => Math.round(v * 1e7) / 1e7
const form = ref(blankForm())
function blankForm() {
  const c = campus.campus
  return c
    ? { name: c.name || '', lat: c.lat, lng: c.lng, radiusM: Math.round(c.radiusM), coords: `${c.lat}, ${c.lng}` }
    : { name: '', lat: null, lng: null, radiusM: 250, coords: '' }
}
// Fill the form once the campus data arrives (the page can open before it loads).
watch(
  () => campus.campus,
  (c, old) => {
    if (c && !old && form.value.lat == null) form.value = blankForm()
  },
)

const coordsError = ref('')
const saving = ref(false)
const sampling = ref(null)

const draft = computed(() => (form.value.lat != null ? { lat: form.value.lat, lng: form.value.lng, radiusM: Number(form.value.radiusM) || 0 } : null))
const dirty = computed(() => {
  const c = campus.campus
  if (!draft.value) return false
  if (!c) return true
  return c.lat !== draft.value.lat || c.lng !== draft.value.lng || Math.round(c.radiusM) !== draft.value.radiusM || (c.name || '') !== form.value.name.trim()
})

// Buildings and walkway points outside the circle would be hidden from visitors.
const outside = computed(() => {
  if (!draft.value) return { buildings: [], points: 0 }
  return {
    buildings: campus.buildings.filter((b) => !insideArea(draft.value, b)),
    points: campus.nodes.filter((n) => !insideArea(draft.value, n)).length,
  }
})

function setCentre(p, { pan = true } = {}) {
  form.value.lat = round7(p.lat)
  form.value.lng = round7(p.lng)
  form.value.coords = `${form.value.lat}, ${form.value.lng}`
  coordsError.value = ''
  if (pan) map?.setView([form.value.lat, form.value.lng], Math.max(map.getZoom(), 16), { animate: false })
}

function applyCoords() {
  const p = parseLatLng(form.value.coords)
  if (!p) {
    coordsError.value = 'Paste coordinates like 10.2430, 123.8483 (right-click the campus in Google Maps to copy them).'
    return
  }
  setCentre(p)
}

async function useMyLocation() {
  sampling.value = { count: 0 }
  try {
    const p = await sampleGps({ onProgress: (s) => (sampling.value = s) })
    setCentre(p)
    toast(`Centre set to your location (±${Math.round(p.accuracy)} m)`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    sampling.value = null
  }
}

async function save() {
  if (!draft.value) return toast.error('Set the centre first.')
  saving.value = true
  try {
    await admin.saveCampus({ name: form.value.name.trim() || null, lat: draft.value.lat, lng: draft.value.lng, radiusM: draft.value.radiusM })
    await campus.load(true)
    toast('Campus area saved. Every map now shows only this area.')
  } catch (e) {
    toast.error(e.message)
  } finally {
    saving.value = false
  }
}

// ---- map: draggable centre pin ----
let map
let pin = null
function onReady(m) {
  map = m
  drawPin()
  if (draft.value) map.setView([draft.value.lat, draft.value.lng], 17, { animate: false })
}
function drawPin() {
  if (!map) return
  if (!draft.value) {
    pin?.remove()
    pin = null
    return
  }
  if (!pin) {
    pin = L.marker([draft.value.lat, draft.value.lng], { draggable: true, autoPan: true }).addTo(map)
    pin.on('dragend', () => setCentre(pin.getLatLng(), { pan: false }))
  } else pin.setLatLng([draft.value.lat, draft.value.lng])
}
watch(() => draft.value && [draft.value.lat, draft.value.lng], drawPin)
</script>

<template>
  <div>
    <PageHeader title="Campus area" description="Visitors only see the map inside this circle. Set its centre on the campus and a radius that covers every building and gate." />

    <div class="grid gap-4 xl:grid-cols-[1fr_360px]">
      <!-- Live preview -->
      <div class="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
        <div class="flex items-start gap-2 border-b border-line bg-primary-50/60 px-3 py-2 text-sm text-primary-700">
          <AppIcon name="info" :size="16" class="mt-0.5" />
          <span>Live preview: this is what visitors will see. Tap the map or drag the pin to move the centre.</span>
        </div>
        <div class="h-[55dvh] xl:h-[calc(100dvh-220px)] xl:min-h-[480px]">
          <MapCanvas
            :buildings="campus.buildings"
            :extra-points="campus.nodes"
            :lock-to-campus="false"
            :campus-area="draft"
            @ready="onReady"
            @map-click="setCentre($event, { pan: false })"
          />
        </div>
      </div>

      <!-- Settings -->
      <form class="space-y-5 rounded-xl border border-line bg-surface p-4 shadow-xs" @submit.prevent="save">
        <label class="block">
          <span class="mb-1.5 block text-sm font-medium text-ink-soft">Campus name (optional)</span>
          <input
            v-model="form.name"
            maxlength="120"
            placeholder="e.g. Talisay City College"
            class="block h-10 w-full rounded-md border border-line px-3 text-base focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none"
          />
        </label>

        <div>
          <span class="mb-1.5 block text-sm font-medium text-ink-soft">Centre coordinates</span>
          <div class="flex gap-2">
            <input
              v-model="form.coords"
              placeholder="10.2430, 123.8483"
              inputmode="decimal"
              class="block h-10 min-w-0 flex-1 rounded-md border border-line px-3 font-mono text-sm focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none"
              @keydown.enter.prevent="applyCoords"
              @paste="$nextTick(applyCoords)"
            />
            <UiButton variant="secondary" @click="applyCoords">Go</UiButton>
          </div>
          <p v-if="coordsError" class="mt-1.5 text-sm text-danger-600">{{ coordsError }}</p>
          <p v-else class="mt-1.5 text-sm text-ink-muted">In Google Maps, right-click the middle of the campus and click the coordinates to copy them, then paste here.</p>
          <UiButton class="mt-2" variant="secondary" size="sm" icon="locate" :loading="!!sampling" @click="useMyLocation">
            {{ sampling ? `Reading GPS… ${sampling.count}` : "I'm at the centre: use my location" }}
          </UiButton>
        </div>

        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <span class="text-sm font-medium text-ink-soft">Radius</span>
            <span class="flex items-center gap-1 text-sm">
              <input
                v-model.number="form.radiusM"
                type="number"
                min="50"
                max="1500"
                step="10"
                class="h-8 w-20 rounded-md border border-line px-2 text-right tabular-nums focus:border-primary-600 focus:outline-none"
              />
              m
            </span>
          </div>
          <input v-model.number="form.radiusM" type="range" min="50" max="1500" step="10" class="w-full accent-primary-600" aria-label="Radius in metres" />
          <p class="mt-1 text-sm text-ink-muted">Make it a little bigger than the campus so gates and the road outside stay visible.</p>
        </div>

        <!-- Things that would be hidden -->
        <div v-if="draft && (outside.buildings.length || outside.points)" class="rounded-lg bg-warning-50 p-3 text-sm text-warning-600">
          <p class="flex items-center gap-1.5 font-medium"><AppIcon name="alert" :size="16" /> Outside this area (visitors won't see them):</p>
          <ul class="mt-1 list-disc pl-5">
            <li v-for="b in outside.buildings.slice(0, 5)" :key="b.id">{{ b.name }}</li>
            <li v-if="outside.buildings.length > 5">and {{ outside.buildings.length - 5 }} more buildings</li>
            <li v-if="outside.points">{{ outside.points }} walkway point(s)</li>
          </ul>
        </div>
        <p v-else-if="draft" class="flex items-center gap-1.5 text-sm text-success-600"><AppIcon name="check" :size="16" /> All buildings and walkway points are inside.</p>

        <div class="flex items-center gap-2 border-t border-line pt-4">
          <span class="text-sm text-ink-muted">{{ campus.campus ? (dirty ? 'Unsaved changes' : 'Saved') : 'Not set yet' }}</span>
          <UiButton type="submit" class="ml-auto" icon="check" :loading="saving" :disabled="!draft || !dirty">Save campus area</UiButton>
        </div>
      </form>
    </div>
  </div>
</template>
