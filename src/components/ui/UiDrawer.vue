<script setup>
// Side panel for forms: 480px on the right on desktop, full screen on phones.
import { onBeforeUnmount, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  wide: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

function onKey(e) {
  if (e.key === 'Escape' && props.open) emit('close')
}
watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
  { immediate: true },
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition-opacity duration-200" leave-active-class="transition-opacity duration-150">
      <div v-if="open" class="fixed inset-0 z-[2000] bg-ink/30" @click="emit('close')" />
    </Transition>
    <Transition
      enter-from-class="translate-x-full"
      leave-to-class="translate-x-full"
      enter-active-class="transition-transform duration-200 ease-out"
      leave-active-class="transition-transform duration-150 ease-in"
    >
      <aside
        v-if="open"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        class="fixed inset-y-0 right-0 z-[2001] flex w-full flex-col bg-surface shadow-xl"
        :class="wide ? 'sm:max-w-2xl' : 'sm:max-w-[480px]'"
      >
        <header class="flex items-start justify-between gap-4 border-b border-line px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div class="min-w-0">
            <h2 class="truncate text-lg font-semibold text-ink">{{ title }}</h2>
            <p v-if="subtitle" class="text-sm text-ink-muted">{{ subtitle }}</p>
          </div>
          <button type="button" class="-m-2 rounded-lg p-2 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Close" @click="emit('close')">
            <AppIcon name="x" />
          </button>
        </header>
        <div class="flex-1 overflow-y-auto px-5 py-5">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <slot name="footer" />
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>
