<script setup>
import { ref, onMounted } from 'vue'

const model = defineModel({ type: String, default: '' })
const props = defineProps({
  autofocus: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Search a building or room' },
})
defineEmits(['activate'])

const input = ref(null)
onMounted(() => props.autofocus && input.value?.focus())
</script>

<template>
  <label class="flex items-center gap-2 rounded-full bg-white px-4 py-3 shadow-md ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-blue-600">
    <svg class="h-5 w-5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
    <input
      ref="input"
      v-model="model"
      type="text"
      role="searchbox"
      inputmode="search"
      enterkeyhint="search"
      autocomplete="off"
      :readonly="readonly"
      :placeholder="placeholder"
      class="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
      @focus="$emit('activate')"
      @click="$emit('activate')"
    />
    <button v-if="model && !readonly" type="button" class="text-slate-400" aria-label="Clear search" @click="model = ''">✕</button>
  </label>
</template>
