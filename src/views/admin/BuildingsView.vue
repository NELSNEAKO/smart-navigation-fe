<script setup>
import { computed, onMounted, ref } from 'vue'
import { admin } from '../../lib/api'
import { useMapStore } from '../../stores/map'
import LocationPicker from '../../components/admin/LocationPicker.vue'
import FloorsEditor from '../../components/admin/FloorsEditor.vue'

const campus = useMapStore()
onMounted(() => campus.load(true))

const editingId = ref(null) // null = closed, 'new' = creating, otherwise building id
const form = ref(blank())
const error = ref('')
const busy = ref(false)

function blank() {
  return { name: '', description: '', photoUrl: '', location: null }
}

// Floors/rooms come from the refreshed campus data so edits show immediately.
const current = computed(() => (editingId.value && editingId.value !== 'new' ? campus.buildingById.get(editingId.value) : null))

function openNew() {
  editingId.value = 'new'
  form.value = blank()
  error.value = ''
}

function openEdit(b) {
  editingId.value = b.id
  form.value = { name: b.name, description: b.description || '', photoUrl: b.photoUrl || '', location: { lat: b.lat, lng: b.lng } }
  error.value = ''
}

async function save() {
  if (!form.value.location) {
    error.value = 'Set the building location on the map.'
    return
  }
  busy.value = true
  error.value = ''
  const data = {
    name: form.value.name,
    description: form.value.description,
    photoUrl: form.value.photoUrl,
    lat: form.value.location.lat,
    lng: form.value.location.lng,
  }
  try {
    if (editingId.value === 'new') {
      const created = await admin.create('buildings', data)
      editingId.value = created.id // stay open so floors can be added
    } else {
      await admin.update('buildings', editingId.value, data)
    }
    await campus.load(true)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function remove(b) {
  if (!confirm(`Delete "${b.name}" with all its floors and rooms? Its entrance points stay on the path map.`)) return
  try {
    await admin.remove('buildings', b.id)
    if (editingId.value === b.id) editingId.value = null
    await campus.load(true)
  } catch (e) {
    alert(e.message)
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Buildings</h1>
      <button type="button" class="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white" @click="openNew">Add building</button>
    </div>

    <!-- Editor -->
    <section v-if="editingId" class="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold">{{ editingId === 'new' ? 'New building' : `Edit ${current?.name ?? ''}` }}</h2>
        <button type="button" class="text-sm text-slate-500" @click="editingId = null">Close</button>
      </div>

      <form class="space-y-3" @submit.prevent="save">
        <label class="block">
          <span class="text-sm font-medium">Name</span>
          <input v-model="form.name" required maxlength="120" class="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label class="block">
          <span class="text-sm font-medium">Description</span>
          <textarea v-model="form.description" rows="2" maxlength="2000" class="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label class="block">
          <span class="text-sm font-medium">Photo URL (optional)</span>
          <input v-model="form.photoUrl" type="url" class="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <div>
          <span class="text-sm font-medium">Location</span>
          <LocationPicker v-model="form.location" class="mt-1" />
        </div>
        <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
        <button type="submit" :disabled="busy" class="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-60">
          {{ busy ? 'Saving…' : 'Save building' }}
        </button>
      </form>

      <div v-if="current" class="border-t border-slate-100 pt-4">
        <h3 class="mb-2 font-semibold">Floors and rooms</h3>
        <FloorsEditor :building="current" @changed="campus.load(true)" />
      </div>
    </section>

    <!-- List -->
    <p v-if="campus.status === 'loading'" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="!campus.buildings.length" class="text-sm text-slate-500">No buildings yet. Add the first one.</p>
    <ul v-else class="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      <li v-for="b in campus.buildings" :key="b.id" class="flex items-center justify-between gap-3 px-4 py-3">
        <div class="min-w-0">
          <p class="truncate font-medium">{{ b.name }}</p>
          <p class="text-xs text-slate-500">
            {{ b.floors.length }} floor(s) ·
            {{ campus.nodes.filter((n) => n.buildingId === b.id).length }} entrance(s)
          </p>
        </div>
        <div class="flex shrink-0 gap-3 text-sm">
          <button type="button" class="text-blue-700" @click="openEdit(b)">Edit</button>
          <button type="button" class="text-red-700" @click="remove(b)">Delete</button>
        </div>
      </li>
    </ul>
  </div>
</template>
