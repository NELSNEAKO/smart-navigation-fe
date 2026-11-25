<script setup>
// One-line status of where routes start from: QR point, GPS, or nothing yet.
import { computed } from 'vue'
import { useMapStore } from '../stores/map'

const map = useMapStore()

const status = computed(() => {
  if (map.start?.source === 'qr') return { tone: 'green', text: `Starting from ${map.start.label} (QR code)` }
  if (map.start?.source === 'gps') {
    const acc = map.gps?.accuracy ? ` · ±${Math.round(map.gps.accuracy)} m` : ''
    return { tone: 'blue', text: `Using your GPS location${acc}` }
  }
  if (map.offCampus) return { tone: 'amber', text: 'You seem to be off campus. Scan a campus QR code to start.' }
  if (map.gpsError) return { tone: 'amber', text: `${map.gpsError} Scan a campus QR code instead.` }
  return { tone: 'slate', text: 'Finding your location…' }
})

const tones = {
  green: 'bg-green-50 text-green-800 ring-green-200',
  blue: 'bg-blue-50 text-blue-800 ring-blue-200',
  amber: 'bg-amber-50 text-amber-900 ring-amber-200',
  slate: 'bg-white text-slate-600 ring-slate-200',
}
</script>

<template>
  <div class="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm ring-1" :class="tones[status.tone]">
    <span class="truncate">{{ status.text }}</span>
    <button
      v-if="map.fromCode"
      type="button"
      class="ml-auto shrink-0 underline"
      @click="map.setFromCode(null)"
    >
      Use GPS
    </button>
  </div>
</template>
