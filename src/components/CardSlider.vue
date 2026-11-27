<script setup>
// Horizontal card slider: swipe on phones, drag with the mouse, arrow buttons and dots.
// Cards go in the default slot; each card should have `snap-start shrink-0`.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './ui/AppIcon.vue'

const props = defineProps({ count: { type: Number, required: true } })

const track = ref(null)
const canPrev = ref(false)
const canNext = ref(false)
const active = ref(0)
const stops = ref(1) // how many slide positions there are (not cards)

function step() {
  const el = track.value
  const first = el?.children[0]
  if (!first) return 0
  const gap = parseFloat(getComputedStyle(el).columnGap) || 0
  return first.getBoundingClientRect().width + gap
}

function update() {
  const el = track.value
  if (!el) return
  canPrev.value = el.scrollLeft > 4
  canNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
  const s = step()
  stops.value = s ? Math.min(props.count, Math.ceil((el.scrollWidth - el.clientWidth) / s - 0.05) + 1) : 1
  active.value = !canNext.value ? stops.value - 1 : s ? Math.min(stops.value - 1, Math.round(el.scrollLeft / s)) : 0
}

// Re-check once scrolling settles (snap can move it after the last scroll event).
let settle = null
function onScroll() {
  update()
  clearTimeout(settle)
  settle = setTimeout(update, 120)
}

function go(dir) {
  const el = track.value
  const s = step()
  if (!el || !s) return
  const perView = Math.max(1, Math.floor(el.clientWidth / s))
  el.scrollBy({ left: dir * perView * s, behavior: 'smooth' })
}

function goTo(i) {
  track.value?.scrollTo({ left: i * step(), behavior: 'smooth' })
}

// Mouse drag (touch already swipes natively).
let drag = null
function onPointerDown(e) {
  if (e.pointerType !== 'mouse' || e.button !== 0) return
  drag = { x: e.clientX, left: track.value.scrollLeft, moved: false }
}
function onPointerMove(e) {
  if (!drag) return
  const dx = e.clientX - drag.x
  if (!drag.moved && Math.abs(dx) > 5) {
    drag.moved = true
    track.value.style.scrollSnapType = 'none' // snapping fights the drag
  }
  if (drag.moved) track.value.scrollLeft = drag.left - dx
}
function onPointerUp() {
  if (!drag) return
  const moved = drag.moved
  drag = null
  if (!moved) return
  const el = track.value
  const s = step()
  const target = s ? Math.round(el.scrollLeft / s) * s : el.scrollLeft
  el.scrollTo({ left: target, behavior: 'smooth' })
  setTimeout(() => el && (el.style.scrollSnapType = ''), 400)
  // Swallow the click that ends a drag so a card doesn't open.
  el.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true })
}

let ro = null
onMounted(() => {
  update()
  ro = new ResizeObserver(update)
  ro.observe(track.value)
  window.addEventListener('pointerup', onPointerUp)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  clearTimeout(settle)
  window.removeEventListener('pointerup', onPointerUp)
})
watch(() => props.count, () => nextTick(update))
</script>

<template>
  <div>
    <div class="relative">
      <div
        ref="track"
        class="-mx-4 flex cursor-grab snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 select-none active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        @scroll.passive="onScroll"
        @scrollend="update"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @dragstart.prevent
      >
        <slot />
      </div>
      <button
        v-show="canPrev"
        type="button"
        aria-label="Previous"
        class="absolute top-1/2 -left-3 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink shadow-md ring-1 ring-line hover:bg-canvas sm:flex"
        @click="go(-1)"
      >
        <AppIcon name="chevron-left" :size="18" />
      </button>
      <button
        v-show="canNext"
        type="button"
        aria-label="Next"
        class="absolute top-1/2 -right-3 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink shadow-md ring-1 ring-line hover:bg-canvas sm:flex"
        @click="go(1)"
      >
        <AppIcon name="chevron-right" :size="18" />
      </button>
    </div>
    <div v-if="stops > 1" class="mt-2 flex justify-center gap-1.5">
      <button
        v-for="i in stops"
        :key="i"
        type="button"
        :aria-label="`Go to slide ${i}`"
        class="h-1.5 rounded-full transition-all"
        :class="active === i - 1 ? 'w-5 bg-primary-600' : 'w-1.5 bg-line'"
        @click="goTo(i - 1)"
      />
    </div>
  </div>
</template>
