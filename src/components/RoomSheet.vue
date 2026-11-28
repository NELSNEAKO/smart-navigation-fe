<script setup>
// Bottom sheet with a room's details: photos, description, and how to find it.
import { computed, watch, onBeforeUnmount } from 'vue'
import { photosOf } from '../lib/photos'
import AppIcon from './ui/AppIcon.vue'
import PhotoGallery from './PhotoGallery.vue'

const props = defineProps({
  room: { type: Object, default: null },
  floor: { type: Object, default: null },
  buildingName: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const typeLabel = { classroom: 'Classroom', office: 'Office', restroom: 'Restroom', lab: 'Laboratory' }
const photos = computed(() => photosOf(props.room))

const onKey = (e) => e.key === 'Escape' && emit('close')
watch(
  () => props.room,
  (r) => {
    if (r) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
  { immediate: true },
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition-opacity" leave-active-class="transition-opacity">
      <div v-if="room" class="fixed inset-0 z-40 bg-ink/40" @click="emit('close')" />
    </Transition>
    <Transition enter-from-class="translate-y-full" leave-to-class="translate-y-full" enter-active-class="transition-transform duration-200" leave-active-class="transition-transform duration-200">
      <section
        v-if="room"
        class="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[88dvh] max-w-xl overflow-y-auto rounded-t-3xl bg-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
        role="dialog"
        aria-modal="true"
        :aria-label="room.name"
      >
        <div class="sticky top-0 z-10 flex justify-center bg-surface pt-2 pb-1"><span class="h-1.5 w-10 rounded-full bg-line" /></div>
        <div class="px-5">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-medium tracking-wide text-ink-muted uppercase">{{ typeLabel[room.type] || 'Room' }}</p>
              <h2 class="text-xl font-semibold tracking-tight">{{ room.name }}</h2>
              <p class="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
                <AppIcon name="layers" :size="14" class="text-ink-muted" />{{ floor?.label }}<template v-if="buildingName"> · {{ buildingName }}</template>
              </p>
            </div>
            <button type="button" class="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-soft" aria-label="Close" @click="emit('close')"><AppIcon name="x" :size="18" /></button>
          </div>

          <PhotoGallery v-if="photos.length" :photos="photos" :alt="room.name" height-class="h-52" rounded class="mt-4" />

          <p v-if="room.description" class="mt-4 whitespace-pre-line text-ink">{{ room.description }}</p>

          <div v-if="room.notes" class="mt-4 flex gap-3 rounded-xl bg-primary-50 p-3">
            <AppIcon name="door" :size="20" class="mt-0.5 shrink-0 text-primary-600" />
            <div class="text-sm">
              <p class="font-semibold text-primary-700">How to find it</p>
              <p class="text-ink-soft">{{ room.notes }}</p>
            </div>
          </div>

          <p v-if="!photos.length && !room.description && !room.notes" class="mt-4 rounded-xl bg-canvas p-4 text-sm text-ink-muted">No details for this room yet. Ask the front desk if you can't find it.</p>
          <p class="mt-4 text-xs text-ink-muted">Navigation takes you to the building entrance. Use the floor and the tips above to find the room inside.</p>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>
