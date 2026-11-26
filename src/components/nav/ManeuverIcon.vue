<script setup>
// Big turn arrows for the navigation banner (Lucide-style line art, 24px grid).
import { computed } from 'vue'

const props = defineProps({
  type: { type: String, required: true }, // depart | straight | slight-left | left | uturn-left | ... | arrive
  size: { type: [Number, String], default: 40 },
})

const PATHS = {
  straight: ['M12 20V4', 'm5 11 7-7 7 7'],
  left: ['M9 14 4 9l5-5', 'M4 9h10a6 6 0 0 1 6 6v5'],
  right: ['m15 14 5-5-5-5', 'M20 9H10a6 6 0 0 0-6 6v5'],
  'slight-left': ['M17 21v-7a4 4 0 0 0-1.2-2.8L7 3', 'M7 9V3h6'],
  'slight-right': ['M7 21v-7a4 4 0 0 1 1.2-2.8L17 3', 'M17 9V3h-6'],
  'uturn-left': ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  'uturn-right': ['m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  arrive: ['M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.33 2q2 0 3.07-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.53'],
}
const paths = computed(() => PATHS[props.type === 'depart' ? 'straight' : props.type] ?? PATHS.straight)
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>
