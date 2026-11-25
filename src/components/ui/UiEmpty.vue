<script setup>
import AppIcon from './AppIcon.vue'
defineProps({
  icon: { type: String, default: 'info' },
  title: { type: String, required: true },
  text: { type: String, default: '' },
})
</script>

<template>
  <div class="flex flex-col items-center px-6 py-12 text-center">
    <span class="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
      <AppIcon :name="icon" :size="24" />
    </span>
    <h3 class="mt-4 text-base font-semibold text-ink">{{ title }}</h3>
    <p v-if="text" class="mt-1 max-w-sm text-sm text-ink-muted">{{ text }}</p>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
</template>
