<script setup>
import { computed } from 'vue'

const props = defineProps({
  building: { type: Object, required: true },
  distance: { type: Number, default: null }, // metres from the visitor, if known
})
defineEmits(['navigate', 'directions', 'close'])

const roomCount = computed(() => (props.building.floors ?? []).reduce((n, f) => n + (f.rooms?.length ?? 0), 0))
</script>

<template>
  <article class="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200">
    <img v-if="building.photoUrl" :src="building.photoUrl" :alt="building.name" class="h-32 w-full object-cover" loading="lazy" />
    <div class="p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">{{ building.name }}</h2>
          <p class="text-sm text-slate-500">
            {{ building.floors?.length || 0 }} floor(s) · {{ roomCount }} room(s)
            <template v-if="distance != null"> · about {{ Math.round(distance) }} m away</template>
          </p>
        </div>
        <button type="button" class="-m-1 p-1 text-slate-400" aria-label="Close" @click="$emit('close')">✕</button>
      </div>
      <p v-if="building.description" class="mt-2 line-clamp-3 text-sm text-slate-600">{{ building.description }}</p>
      <button
        type="button"
        class="mt-4 w-full rounded-xl bg-blue-700 py-3 font-semibold text-white active:bg-blue-800"
        @click="$emit('navigate', building)"
      >
        Start navigation
      </button>
      <button type="button" class="mt-2 w-full py-2 text-sm font-semibold text-blue-700" @click="$emit('directions', building)">
        See route first
      </button>
    </div>
  </article>
</template>
