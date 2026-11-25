<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMapStore } from '../stores/map'

const map = useMapStore()
const route = useRoute()

const building = computed(() => map.buildingById.get(route.params.buildingId))
const targetRoomId = computed(() => route.query.room || null)
const roomInfo = computed(() => (targetRoomId.value ? map.findRoom(targetRoomId.value) : null))

const typeLabel = { classroom: 'Classroom', office: 'Office', restroom: 'Restroom', lab: 'Lab' }
</script>

<template>
  <main class="mx-auto min-h-dvh max-w-lg bg-slate-50 p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
    <p v-if="!building" class="text-slate-600">Loading…</p>

    <template v-else>
      <div class="rounded-2xl bg-green-600 p-5 text-white">
        <p class="text-sm font-semibold uppercase tracking-wide text-green-100">You have arrived</p>
        <h1 class="text-2xl font-bold">{{ building.name }}</h1>
        <p v-if="roomInfo" class="mt-2 text-green-50">
          <span class="font-semibold">{{ roomInfo.room.name }}</span> is on the
          <span class="font-semibold">{{ roomInfo.floor.label }}</span>.
          <template v-if="roomInfo.room.notes"> {{ roomInfo.room.notes }}</template>
        </p>
      </div>

      <img v-if="building.photoUrl" :src="building.photoUrl" :alt="building.name" class="mt-4 h-40 w-full rounded-2xl object-cover" />
      <p v-if="building.description" class="mt-4 text-slate-700">{{ building.description }}</p>

      <h2 class="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Floors and rooms</h2>
      <p v-if="!building.floors?.length" class="text-sm text-slate-500">No floor information yet.</p>
      <div v-for="floor in building.floors" :key="floor.id" class="mb-3 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        <h3 class="bg-slate-100 px-4 py-2 text-sm font-semibold">{{ floor.label }}</h3>
        <ul class="divide-y divide-slate-100">
          <li
            v-for="room in floor.rooms"
            :key="room.id"
            class="flex items-center justify-between px-4 py-2 text-sm"
            :class="room.id === targetRoomId ? 'bg-yellow-50 font-semibold' : ''"
          >
            <span>{{ room.name }}</span>
            <span class="text-slate-500">{{ typeLabel[room.type] }}</span>
          </li>
          <li v-if="!floor.rooms?.length" class="px-4 py-2 text-sm text-slate-500">No rooms listed.</li>
        </ul>
      </div>

      <p class="mt-4 text-xs text-slate-500">Room locations are written by the campus admin. The app shows buildings only, not your position inside them.</p>

      <RouterLink to="/" class="mt-6 block w-full rounded-xl bg-blue-700 py-3 text-center font-semibold text-white">Back to home</RouterLink>
    </template>
  </main>
</template>
