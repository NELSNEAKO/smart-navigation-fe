<script setup>
// Photos of a building or room: upload from the phone/computer (camera or gallery), remove,
// and pick the cover (the first photo). v-model is the list of photo ids; save it with the form.
import { ref } from 'vue'
import { admin, photoSrc } from '../../lib/api'
import { shrinkImage } from '../../lib/photos'
import { toast } from '../../lib/feedback'
import AppIcon from '../ui/AppIcon.vue'

const ids = defineModel({ type: Array, default: () => [] })
const props = defineProps({ max: { type: Number, default: 10 }, label: { type: String, default: 'Photos' } })

const input = ref(null)
const uploading = ref(0)

async function onPick(e) {
  const files = [...(e.target.files || [])]
  e.target.value = '' // pick the same file again later if needed
  const room = props.max - ids.value.length
  if (files.length > room) toast.error(room ? `Only ${room} more photo${room === 1 ? '' : 's'} can be added` : `At most ${props.max} photos`)
  for (const file of files.slice(0, Math.max(0, room))) {
    uploading.value++
    try {
      const { id } = await admin.uploadPhoto(await shrinkImage(file))
      ids.value = [...ids.value, id]
    } catch (err) {
      toast.error(err.message)
    } finally {
      uploading.value--
    }
  }
}

const remove = (id) => (ids.value = ids.value.filter((x) => x !== id))
const makeCover = (id) => (ids.value = [id, ...ids.value.filter((x) => x !== id)])
</script>

<template>
  <div>
    <p class="mb-1.5 text-sm font-medium text-ink-soft">{{ label }}</p>
    <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
      <div v-for="(id, i) in ids" :key="id" class="group relative aspect-square overflow-hidden rounded-lg bg-canvas ring-1 ring-line">
        <img :src="photoSrc(id)" alt="" class="h-full w-full object-cover" loading="lazy" />
        <span v-if="i === 0" class="absolute bottom-1 left-1 rounded bg-ink/75 px-1.5 py-0.5 text-[11px] font-medium text-white">Cover</span>
        <button
          v-else
          type="button"
          class="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-surface/90 px-1.5 py-0.5 text-[11px] font-medium text-ink shadow-xs"
          :aria-label="`Make photo ${i + 1} the cover`"
          @click="makeCover(id)"
        >
          <AppIcon name="star" :size="12" /> Cover
        </button>
        <button
          type="button"
          class="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-danger-600 shadow-xs"
          :aria-label="`Remove photo ${i + 1}`"
          @click="remove(id)"
        >
          <AppIcon name="x" :size="16" />
        </button>
      </div>

      <div v-for="n in uploading" :key="`up${n}`" class="flex aspect-square items-center justify-center rounded-lg bg-canvas ring-1 ring-line">
        <AppIcon name="loader" :size="20" class="animate-spin text-primary-600" />
      </div>

      <button
        v-if="ids.length + uploading < max"
        type="button"
        class="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-sm font-medium text-primary-600 hover:border-primary-600/50 hover:bg-primary-50/50"
        @click="input.click()"
      >
        <AppIcon name="camera" :size="22" />
        Add photo
      </button>
    </div>
    <input ref="input" type="file" accept="image/*" multiple class="hidden" @change="onPick" />
    <p class="mt-1.5 text-xs text-ink-muted">Take a photo or pick from your gallery. The first photo is the cover. Remember to save.</p>
  </div>
</template>
