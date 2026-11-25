<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMapStore } from '../stores/map'
import { logSearch } from '../lib/api'
import SearchBar from '../components/SearchBar.vue'

const map = useMapStore()
const router = useRouter()
const query = ref('')

const results = computed(() => map.search(query.value))

const typeLabel = { classroom: 'Classroom', office: 'Office', restroom: 'Restroom', lab: 'Lab' }

function choose(item) {
  logSearch({ query: query.value.trim() || null, fromCode: map.fromCode, buildingId: item.buildingId })
  router.push({
    name: 'route',
    params: { buildingId: item.buildingId },
    query: item.kind === 'room' ? { room: item.id } : {},
  })
}
</script>

<template>
  <main class="mx-auto min-h-dvh max-w-lg bg-slate-50">
    <header class="sticky top-0 z-10 flex items-center gap-2 bg-slate-50 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <button type="button" class="p-2 text-xl" aria-label="Back" @click="router.back()">←</button>
      <div class="flex-1">
        <SearchBar v-model="query" autofocus />
      </div>
    </header>

    <div class="px-4 pb-8">
      <p v-if="map.status === 'loading'" class="py-6 text-center text-sm text-slate-500">Loading campus data…</p>

      <template v-else-if="!query.trim()">
        <h2 class="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">All buildings</h2>
        <ul class="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          <li v-for="b in map.buildings" :key="b.id">
            <button type="button" class="w-full px-4 py-3 text-left active:bg-slate-100" @click="choose({ kind: 'building', buildingId: b.id })">
              <p class="font-medium">{{ b.name }}</p>
              <p v-if="b.description" class="truncate text-sm text-slate-500">{{ b.description }}</p>
            </button>
          </li>
        </ul>
      </template>

      <p v-else-if="!results.length" class="py-6 text-center text-sm text-slate-500">
        No building or room matches “{{ query }}”.
      </p>

      <ul v-else class="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        <li v-for="item in results" :key="item.kind + item.id">
          <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-100" @click="choose(item)">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold" :class="item.kind === 'building' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'">
              {{ item.kind === 'building' ? 'B' : 'R' }}
            </span>
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ item.title }}</span>
              <span class="block truncate text-sm text-slate-500">
                <template v-if="item.type">{{ typeLabel[item.type] }} · </template>{{ item.subtitle }}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </main>
</template>
