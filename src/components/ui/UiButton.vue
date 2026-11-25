<script setup>
// Buttons from DESIGN.md: primary | secondary | quiet | danger, sizes md (40px) and sm (36px).
import AppIcon from './AppIcon.vue'

defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'md' },
  icon: { type: String, default: null },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  type: { type: String, default: 'button' },
  block: { type: Boolean, default: false },
})

const variants = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-xs',
  secondary: 'bg-surface text-ink border border-line hover:bg-canvas shadow-xs',
  quiet: 'text-ink-soft hover:bg-canvas hover:text-ink',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 shadow-xs',
}
const sizes = { md: 'h-10 px-4 text-sm', sm: 'h-9 px-3 text-sm' }
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:pointer-events-none disabled:opacity-50"
    :class="[variants[variant], sizes[size], block && 'w-full']"
  >
    <AppIcon v-if="loading" name="loader" :size="18" class="animate-spin" />
    <AppIcon v-else-if="icon" :name="icon" :size="18" />
    <slot />
  </button>
</template>
