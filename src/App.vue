<script setup>
import { onMounted } from 'vue'
import { useMapStore } from './stores/map'
import LocationSheet from './components/LocationSheet.vue'

const map = useMapStore()
onMounted(() => map.load())
</script>

<template>
  <div class="min-h-dvh">
    <RouterView />
    <LocationSheet />
  </div>
</template>
