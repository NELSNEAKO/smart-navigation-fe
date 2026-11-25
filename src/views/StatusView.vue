<script setup>
// Connection check: frontend -> backend -> database. Open /status on any environment.
import { onMounted, ref } from 'vue'
import { API_BASE, getHealth, getMap } from '../lib/api'

const origin = window.location.origin
const checks = ref([])
const running = ref(false)

async function run() {
  running.value = true
  const results = []

  const started = performance.now()
  try {
    const h = await getHealth()
    const ms = Math.round(performance.now() - started)
    results.push({
      name: 'Backend reachable',
      ok: h.httpStatus === 200 || h.httpStatus === 503,
      detail: `HTTP ${h.httpStatus} in ${ms} ms${ms > 5000 ? ' (Render was probably waking up)' : ''}`,
    })
    results.push({
      name: 'Database connected',
      ok: h.db === 'ok',
      detail: h.db === 'ok' ? 'MongoDB Atlas answered' : `${h.dbHint || 'No answer'}${h.dbCode ? ` (${h.dbCode})` : ''}`,
    })
  } catch {
    results.push({ name: 'Backend reachable', ok: false, detail: 'No answer. Check the API address and that the backend is running.' })
  }

  try {
    const data = await getMap()
    results.push({
      name: 'Campus data',
      ok: true,
      detail: `${data.buildings.length} buildings, ${data.nodes.length} path points, ${data.edges.length} paths`,
    })
  } catch (e) {
    results.push({ name: 'Campus data', ok: false, detail: e.message })
  }

  checks.value = results
  running.value = false
}

onMounted(run)
</script>

<template>
  <main class="mx-auto min-h-dvh max-w-lg bg-slate-50 p-5">
    <h1 class="text-xl font-semibold">Connection status</h1>
    <p class="mt-1 text-sm text-slate-500">
      Frontend: <span class="font-mono">{{ origin }}</span><br />
      API: <span class="font-mono">{{ API_BASE.startsWith('http') ? API_BASE : origin + API_BASE }}</span>
    </p>

    <ul class="mt-4 space-y-2">
      <li v-for="c in checks" :key="c.name" class="flex gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <span class="text-lg" :class="c.ok ? 'text-green-600' : 'text-red-600'">{{ c.ok ? '✓' : '✕' }}</span>
        <span>
          <span class="block font-medium">{{ c.name }}</span>
          <span class="block text-sm text-slate-600">{{ c.detail }}</span>
        </span>
      </li>
    </ul>
    <p v-if="running" class="mt-4 text-sm text-slate-500">Checking… (the first request can take up to a minute while Render wakes up)</p>

    <div class="mt-6 flex gap-3">
      <button type="button" class="rounded-xl bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-60" :disabled="running" @click="run">Check again</button>
      <RouterLink to="/" class="px-4 py-2 font-semibold text-blue-700">Back to map</RouterLink>
    </div>
  </main>
</template>
