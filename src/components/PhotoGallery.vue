<script setup>
// Swipeable photos with dots and a counter; tap a photo to see it full screen.
import { ref, watch, onBeforeUnmount } from 'vue'
import AppIcon from './ui/AppIcon.vue'

const props = defineProps({
  photos: { type: Array, required: true }, // image addresses
  alt: { type: String, default: '' },
  heightClass: { type: String, default: 'h-56' },
  rounded: { type: Boolean, default: false },
})

const track = ref(null)
const index = ref(0)
const full = ref(false)
const fullTrack = ref(null)

const onScroll = (el) => {
  if (el?.clientWidth) index.value = Math.round(el.scrollLeft / el.clientWidth)
}
const goTo = (el, i) => el?.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })

function openFull(i) {
  full.value = true
  index.value = i
  requestAnimationFrame(() => fullTrack.value && (fullTrack.value.scrollLeft = i * fullTrack.value.clientWidth))
}
function closeFull() {
  full.value = false
  requestAnimationFrame(() => track.value && (track.value.scrollLeft = index.value * track.value.clientWidth))
}
function onKey(e) {
  if (!full.value) return
  if (e.key === 'Escape') closeFull()
  if (e.key === 'ArrowRight') goTo(fullTrack.value, Math.min(props.photos.length - 1, index.value + 1))
  if (e.key === 'ArrowLeft') goTo(fullTrack.value, Math.max(0, index.value - 1))
}
watch(full, (on) => {
  document.body.style.overflow = on ? 'hidden' : ''
  if (on) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})
watch(() => props.photos, () => (index.value = 0))
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="relative overflow-hidden" :class="[heightClass, rounded ? 'rounded-xl' : '']">
    <div ref="track" class="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" @scroll.passive="onScroll(track)">
      <button v-for="(src, i) in photos" :key="src" type="button" class="h-full w-full shrink-0 snap-center" :aria-label="`Open photo ${i + 1} of ${photos.length}`" @click="openFull(i)">
        <img :src="src" :alt="i === 0 ? alt : ''" class="h-full w-full object-cover" :loading="i === 0 ? 'eager' : 'lazy'" />
      </button>
    </div>
    <template v-if="photos.length > 1">
      <span class="pointer-events-none absolute top-3 right-3 flex items-center gap-1 rounded-full bg-ink/70 px-2 py-0.5 text-xs font-medium text-white tabular-nums">
        <AppIcon name="image" :size="12" /> {{ index + 1 }}/{{ photos.length }}
      </span>
      <div class="absolute inset-x-0 flex justify-center gap-1.5" :class="rounded ? 'bottom-3' : 'bottom-8'">
        <button
          v-for="(src, i) in photos"
          :key="src"
          type="button"
          :aria-label="`Show photo ${i + 1}`"
          class="h-1.5 rounded-full shadow transition-all"
          :class="index === i ? 'w-5 bg-white' : 'w-1.5 bg-white/60'"
          @click="goTo(track, i)"
        />
      </div>
    </template>

  <!-- Full screen -->
  <Teleport to="body">
    <div v-if="full" class="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" :aria-label="alt || 'Photos'">
      <div class="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-white">
        <span class="text-sm tabular-nums">{{ index + 1 }} / {{ photos.length }}</span>
        <button type="button" class="flex h-10 w-10 items-center justify-center rounded-full bg-white/15" aria-label="Close photos" @click="closeFull"><AppIcon name="x" /></button>
      </div>
      <div ref="fullTrack" class="flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" @scroll.passive="onScroll(fullTrack)">
        <div v-for="src in photos" :key="src" class="flex h-full w-full shrink-0 snap-center items-center justify-center">
          <img :src="src" alt="" class="max-h-full max-w-full object-contain" />
        </div>
      </div>
      <div class="flex items-center justify-center gap-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" class="hidden h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30 sm:flex" :disabled="index === 0" aria-label="Previous photo" @click="goTo(fullTrack, index - 1)"><AppIcon name="chevron-left" /></button>
        <p v-if="alt" class="text-center text-sm text-white/80">{{ alt }}</p>
        <button type="button" class="hidden h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30 sm:flex" :disabled="index === photos.length - 1" aria-label="Next photo" @click="goTo(fullTrack, index + 1)"><AppIcon name="chevron-right" /></button>
      </div>
    </div>
  </Teleport>
  </div>
</template>
