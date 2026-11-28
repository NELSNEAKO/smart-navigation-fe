<script setup>
// "Use your location?" sheet, opened by map.askLocation() (e.g. the Start navigation button).
// Explains why first, then shows the phone's permission pop-up, and handles every outcome:
// blocked, phone location off (keeps checking by itself), weak signal, or outside the campus.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMapStore } from '../stores/map'
import AppIcon from './ui/AppIcon.vue'

const map = useMapStore()
const open = computed(() => !!map.locationAsk)
const step = ref('intro') // intro | locating | denied | off | timeout | offcampus

const ua = navigator.userAgent
const device = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop'

let retryTimer = null
const stopRetry = () => {
  clearInterval(retryTimer)
  retryTimer = null
}

function finish(result) {
  stopRetry()
  map.locationAsk?.resolve(result)
}

async function allow({ quiet = false } = {}) {
  if (!quiet) step.value = 'locating'
  const ok = await map.requestFix(quiet ? 6000 : 15000)
  if (!open.value) return
  if (ok) {
    if (map.gpsOffCampus) {
      stopRetry()
      step.value = 'offcampus'
    } else finish('gps')
    return
  }
  const code = map.gpsErrorCode
  const next = code === 1 ? 'denied' : code === 2 ? 'off' : 'timeout'
  if (!quiet || next !== step.value) step.value = next
  // Location off or blocked: keep checking quietly, continue as soon as it works.
  if ((next === 'off' || next === 'denied') && !retryTimer) retryTimer = setInterval(() => allow({ quiet: true }), 4000)
}

// Coming back from the phone's settings: try again right away.
function onVisible() {
  if (document.visibilityState === 'visible' && open.value && ['off', 'denied', 'timeout'].includes(step.value)) allow({ quiet: step.value !== 'timeout' })
}
document.addEventListener('visibilitychange', onVisible)
onBeforeUnmount(() => {
  stopRetry()
  document.removeEventListener('visibilitychange', onVisible)
})

watch(open, (isOpen) => {
  stopRetry()
  if (!isOpen) return
  if (map.locationPermission === 'granted') allow() // already allowed: no need to explain, just find them
  else if (map.locationPermission === 'denied') step.value = 'denied'
  else step.value = 'intro'
})
// Allowed in the browser's settings while the sheet is open.
watch(
  () => map.locationPermission,
  (p) => {
    if (open.value && p === 'granted' && step.value === 'denied') allow()
  },
)

const kmAway = computed(() => {
  const d = map.gps && map.buildings.length ? Math.min(...map.buildings.map((b) => Math.hypot((b.lat - map.gps.lat) * 110540, (b.lng - map.gps.lng) * 111320 * Math.cos((b.lat * Math.PI) / 180)))) : 0
  return d >= 1000 ? `${(d / 1000).toFixed(d < 10000 ? 1 : 0)} km` : `${Math.round(d)} m`
})

const DENIED = {
  ios: [
    'Open <b>Settings</b> → <b>Privacy &amp; Security</b> → <b>Location Services</b> and make sure it is <b>On</b>.',
    'In the same list, tap <b>Safari Websites</b> (or your browser) and choose <b>While Using the App</b>.',
    'Come back here. We’ll continue by ourselves.',
  ],
  android: [
    'Tap the icon on the left of the web address (<b>🔒</b> or <b>⚙</b>).',
    'Tap <b>Permissions</b> → <b>Location</b> → <b>Allow</b>.',
    'Come back here. We’ll continue by ourselves.',
  ],
  desktop: ['Click the icon on the left of the web address.', 'Set <b>Location</b> to <b>Allow</b>.', 'We’ll continue by ourselves.'],
}
const OFF = {
  ios: ['Open <b>Settings</b> → <b>Privacy &amp; Security</b> → <b>Location Services</b>.', 'Turn <b>Location Services</b> on.', 'Come back here. We’ll continue by ourselves.'],
  android: ['Swipe down from the top of your screen.', 'Tap <b>Location</b> (📍) to turn it on.', 'Come back here. We’ll continue by ourselves.'],
  desktop: ['Turn on location in your computer’s privacy settings.', 'We’ll continue by ourselves.'],
}
</script>

<template>
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition-opacity" leave-active-class="transition-opacity">
      <div v-if="open" class="fixed inset-0 z-[1500] bg-ink/45" @click="finish('cancel')" />
    </Transition>
    <Transition enter-from-class="translate-y-full" leave-to-class="translate-y-full" enter-active-class="transition-transform duration-200" leave-active-class="transition-transform duration-200">
      <section
        v-if="open"
        class="fixed inset-x-0 bottom-0 z-[1500] mx-auto max-h-[92dvh] max-w-xl overflow-y-auto rounded-t-3xl bg-surface px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] font-sans text-ink shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="loc-title"
      >
        <div class="flex justify-center pb-3"><span class="h-1.5 w-10 rounded-full bg-line" /></div>
        <button type="button" class="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-canvas text-ink-soft" aria-label="Close" @click="finish('cancel')">
          <AppIcon name="x" :size="18" />
        </button>

        <!-- Why we ask -->
        <template v-if="step === 'intro'">
          <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600"><AppIcon name="locate" :size="28" /></span>
          <h2 id="loc-title" class="mt-4 text-xl font-semibold tracking-tight">Use your location?</h2>
          <p class="mt-1 text-ink-soft">To guide you step by step, we need to know where you are on campus.</p>
          <ul class="mt-4 space-y-2.5 text-sm">
            <li class="flex gap-2.5"><AppIcon name="check" :size="18" class="shrink-0 text-success-600" /> Shows you on the campus map</li>
            <li class="flex gap-2.5"><AppIcon name="check" :size="18" class="shrink-0 text-success-600" /> Tells you when to turn and when you've arrived</li>
            <li class="flex gap-2.5"><AppIcon name="check" :size="18" class="shrink-0 text-success-600" /> Stays on your phone. We never save it.</li>
          </ul>
          <button type="button" class="mt-6 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-lg font-semibold text-white shadow-md active:bg-primary-700" @click="allow()">
            <AppIcon name="locate" :size="20" /> Allow location
          </button>
          <p class="mt-2 text-center text-xs text-ink-muted">Your phone will ask next. Tap <b class="font-semibold">Allow</b>.</p>
        </template>

        <!-- Finding them -->
        <template v-else-if="step === 'locating'">
          <div class="flex flex-col items-center py-6 text-center">
            <span class="relative flex h-16 w-16 items-center justify-center">
              <span class="absolute inset-0 animate-ping rounded-full bg-primary-100" />
              <span class="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-white"><AppIcon name="locate" :size="24" /></span>
            </span>
            <h2 id="loc-title" class="mt-5 text-xl font-semibold tracking-tight">Finding you…</h2>
            <p class="mt-1 text-sm text-ink-soft">This takes a few seconds. It's faster outdoors.</p>
          </div>
        </template>

        <!-- Blocked for this site -->
        <template v-else-if="step === 'denied'">
          <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-50 text-warning-600"><AppIcon name="alert" :size="28" /></span>
          <h2 id="loc-title" class="mt-4 text-xl font-semibold tracking-tight">Location is blocked</h2>
          <p class="mt-1 text-ink-soft">Your browser isn't sharing your location with this site. Here's how to allow it:</p>
          <ol class="mt-4 space-y-3 text-sm">
            <li v-for="(s, i) in DENIED[device]" :key="i" class="flex gap-3">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">{{ i + 1 }}</span>
              <span class="pt-0.5" v-html="s" />
            </li>
          </ol>
          <p class="mt-4 flex items-center gap-2 text-xs text-ink-muted"><AppIcon name="loader" :size="14" class="animate-spin" /> Checking again every few seconds…</p>
          <button type="button" class="mt-4 h-12 w-full rounded-xl bg-primary-600 font-semibold text-white active:bg-primary-700" @click="allow()">Try again</button>
        </template>

        <!-- Phone location switched off -->
        <template v-else-if="step === 'off'">
          <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-50 text-warning-600"><AppIcon name="pin" :size="28" /></span>
          <h2 id="loc-title" class="mt-4 text-xl font-semibold tracking-tight">Turn on your location</h2>
          <p class="mt-1 text-ink-soft">Your phone's location (GPS) is off, so we can't see where you are.</p>
          <ol class="mt-4 space-y-3 text-sm">
            <li v-for="(s, i) in OFF[device]" :key="i" class="flex gap-3">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">{{ i + 1 }}</span>
              <span class="pt-0.5" v-html="s" />
            </li>
          </ol>
          <p class="mt-4 flex items-center gap-2 text-xs text-ink-muted"><AppIcon name="loader" :size="14" class="animate-spin" /> Waiting for your location to turn on…</p>
          <button type="button" class="mt-4 h-12 w-full rounded-xl bg-primary-600 font-semibold text-white active:bg-primary-700" @click="allow()">I turned it on</button>
        </template>

        <!-- No signal yet -->
        <template v-else-if="step === 'timeout'">
          <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-50 text-warning-600"><AppIcon name="locate" :size="28" /></span>
          <h2 id="loc-title" class="mt-4 text-xl font-semibold tracking-tight">No GPS signal yet</h2>
          <p class="mt-1 text-ink-soft">Your phone is still looking for you. Step outside or near a window, then try again.</p>
          <button type="button" class="mt-5 h-12 w-full rounded-xl bg-primary-600 font-semibold text-white active:bg-primary-700" @click="allow()">Try again</button>
        </template>

        <!-- Far from campus -->
        <template v-else-if="step === 'offcampus'">
          <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600"><AppIcon name="map" :size="28" /></span>
          <h2 id="loc-title" class="mt-4 text-xl font-semibold tracking-tight">You're not on campus yet</h2>
          <p class="mt-1 text-ink-soft">You're about {{ kmAway }} from campus. Step-by-step directions start once you're there. For now you can look at the route by choosing a start point on the map.</p>
        </template>

        <!-- Always available -->
        <button
          v-if="step !== 'locating'"
          type="button"
          class="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-primary-600 ring-1 ring-line active:bg-canvas"
          :class="step === 'offcampus' ? 'mt-5 bg-primary-600 !text-white ring-0' : ''"
          @click="finish('pick')"
        >
          <AppIcon name="pin" :size="18" /> Choose my start on the map
        </button>
        <button v-if="step === 'locating'" type="button" class="h-11 w-full text-sm font-medium text-ink-muted" @click="finish('cancel')">Cancel</button>
      </section>
    </Transition>
  </Teleport>
</template>
