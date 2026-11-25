<script setup>
import { onMounted, ref } from 'vue'
import { admin } from '../../lib/api'

const events = ref([])
const loading = ref(true)
const error = ref('')
const editingId = ref(null) // null | 'new' | id
const form = ref(blank())

function blank() {
  return { title: '', body: '', startsAt: '', endsAt: '' }
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

async function refresh() {
  loading.value = true
  try {
    events.value = await admin.list('events')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(refresh)

function openNew() {
  editingId.value = 'new'
  form.value = blank()
  error.value = ''
}

function openEdit(ev) {
  editingId.value = ev.id
  form.value = { title: ev.title, body: ev.body, startsAt: toLocalInput(ev.startsAt), endsAt: toLocalInput(ev.endsAt) }
  error.value = ''
}

async function save() {
  error.value = ''
  const data = {
    title: form.value.title,
    body: form.value.body,
    startsAt: new Date(form.value.startsAt).toISOString(),
    endsAt: form.value.endsAt ? new Date(form.value.endsAt).toISOString() : null,
  }
  try {
    if (editingId.value === 'new') await admin.create('events', data)
    else await admin.update('events', editingId.value, data)
    editingId.value = null
    await refresh()
  } catch (e) {
    error.value = e.message
  }
}

async function remove(ev) {
  if (!confirm(`Delete "${ev.title}"?`)) return
  try {
    await admin.remove('events', ev.id)
    await refresh()
  } catch (e) {
    error.value = e.message
  }
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '')
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Events</h1>
      <button type="button" class="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white" @click="openNew">Add event</button>
    </div>
    <p v-if="error" class="rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error }}</p>

    <form v-if="editingId" class="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200" @submit.prevent="save">
      <h2 class="font-semibold">{{ editingId === 'new' ? 'New event' : 'Edit event' }}</h2>
      <label class="block">
        <span class="text-sm font-medium">Title</span>
        <input v-model="form.title" required maxlength="160" class="mt-1 w-full rounded-lg border border-slate-300 p-2" />
      </label>
      <label class="block">
        <span class="text-sm font-medium">Details</span>
        <textarea v-model="form.body" required rows="3" maxlength="4000" class="mt-1 w-full rounded-lg border border-slate-300 p-2" />
      </label>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium">Starts</span>
          <input v-model="form.startsAt" type="datetime-local" required class="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label class="block">
          <span class="text-sm font-medium">Ends (optional)</span>
          <input v-model="form.endsAt" type="datetime-local" class="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
      </div>
      <div class="flex gap-2">
        <button type="submit" class="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">Save</button>
        <button type="button" class="px-3 py-2 text-slate-500" @click="editingId = null">Cancel</button>
      </div>
    </form>

    <p v-if="loading" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="!events.length" class="text-sm text-slate-500">No events yet.</p>
    <ul v-else class="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      <li v-for="ev in events" :key="ev.id" class="flex items-start justify-between gap-3 px-4 py-3">
        <div class="min-w-0">
          <p class="font-medium">{{ ev.title }}</p>
          <p class="text-xs text-slate-500">{{ fmt(ev.startsAt) }}<template v-if="ev.endsAt"> – {{ fmt(ev.endsAt) }}</template></p>
          <p class="mt-1 line-clamp-2 text-sm text-slate-600">{{ ev.body }}</p>
        </div>
        <div class="flex shrink-0 gap-3 text-sm">
          <button type="button" class="text-blue-700" @click="openEdit(ev)">Edit</button>
          <button type="button" class="text-red-700" @click="remove(ev)">Delete</button>
        </div>
      </li>
    </ul>
  </div>
</template>
