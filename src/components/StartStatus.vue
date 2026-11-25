<script setup>
// One-line status of where routes start from: QR point, a tapped point, GPS, or nothing yet.
import { computed } from 'vue'
import { useMapStore } from '../stores/map'

const map = useMapStore()

const status = computed(() => {
  const s = map.start
  if (s?.source === 'qr') return { tone: 'green', text: `Starting from ${s.label} (QR code)` }
  if (s?.source === 'manual') return { tone: 'green', text: 'Starting from the point you chose on the map' }
  if (s?.source === 'gps') {
    const acc = map.gps?.accuracy ? ` · ±${Math.round(map.gps.accuracy)} m` : ''
    if (map.offCampus) return { tone: 'amber', text: `You seem to be off campus${acc}. Tap the map to choose a start.` }
    return { tone: 'blue', text: `Using your GPS location${acc}` }
  }
  if (map.gpsError) return { tone: 'amber', text: `${map.gpsError} Scan a QR code or tap the map to choose a start.` }
  return { tone: 'slate', text: 'Finding your location…' }
})

const canUseGps = computed(() => map.fromCode || map.manualStart)

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
    <button v-if="canUseGps" type="button" class="ml-auto shrink-0 underline" @click="map.useLiveGps()">Use GPS</button>
  </div>
</template>
