<script setup>
import { formatDistance } from '../lib/geo'

defineProps({
  steps: { type: Array, required: true }, // [{ text, distance }]
})
</script>

<template>
  <ol class="relative ml-3 border-l-2 border-blue-200">
    <li v-for="(step, i) in steps" :key="i" class="relative pb-4 pl-5 last:pb-0">
      <span
        class="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white"
        :class="i === 0 ? 'bg-green-600' : i === steps.length - 1 ? 'bg-red-600' : 'bg-blue-600'"
      />
      <p class="font-medium">{{ step.text }}</p>
      <p v-if="step.distance" class="text-sm text-slate-500">{{ formatDistance(step.distance) }}</p>
    </li>
  </ol>
</template>
