<script setup>
import { onMounted } from 'vue'
import { useMapStore } from './stores/map'

const map = useMapStore()
onMounted(() => map.load())
</script>

<template>
  <div class="min-h-dvh">
    <RouterView />
  </div>
</template>
