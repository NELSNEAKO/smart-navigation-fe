<script setup>
defineProps({ tone: { type: String, default: 'neutral' } })
const tones = {
  neutral: 'bg-canvas text-ink-soft ring-line',
  primary: 'bg-primary-50 text-primary-700 ring-primary-100',
  success: 'bg-success-50 text-success-600 ring-success-600/20',
  warning: 'bg-warning-50 text-warning-600 ring-warning-600/20',
  danger: 'bg-danger-50 text-danger-600 ring-danger-600/20',
}
</script>

<template>
  <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset" :class="tones[tone]">
    <slot />
  </span>
</template>
