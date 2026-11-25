<script setup>
// Floors and rooms of one building. Text only: the app never claims indoor positioning.
import { ref } from 'vue'
import { admin } from '../../lib/api'

const props = defineProps({
  building: { type: Object, required: true },
})
const emit = defineEmits(['changed'])

const ROOM_TYPES = ['classroom', 'office', 'restroom', 'lab']
const error = ref('')
const newFloor = ref('')
const newRoom = ref({}) // floorId -> { name, type, notes }
const editing = ref(null) // room id being edited
const editDraft = ref({})

function draftFor(floorId) {
  if (!newRoom.value[floorId]) newRoom.value[floorId] = { name: '', type: 'classroom', notes: '' }
  return newRoom.value[floorId]
}

async function run(fn) {
  error.value = ''
  try {
    await fn()
    emit('changed')
  } catch (e) {
    error.value = e.message
  }
}

const addFloor = () =>
  run(async () => {
    const order = props.building.floors?.length ?? 0
    await admin.create('floors', { buildingId: props.building.id, label: newFloor.value, order })
    newFloor.value = ''
  })

const renameFloor = (floor) => {
  const label = prompt('Floor name', floor.label)
  if (label && label !== floor.label) run(() => admin.update('floors', floor.id, { label }))
}

const deleteFloor = (floor) => {
  if (confirm(`Delete "${floor.label}" and all its rooms?`)) run(() => admin.remove('floors', floor.id))
}

const addRoom = (floor) =>
  run(async () => {
    await admin.create('rooms', { floorId: floor.id, ...draftFor(floor.id) })
    newRoom.value[floor.id] = { name: '', type: 'classroom', notes: '' }
  })

function startEdit(room) {
  editing.value = room.id
  editDraft.value = { name: room.name, type: room.type, notes: room.notes || '' }
}

const saveRoom = (room) =>
  run(async () => {
    await admin.update('rooms', room.id, editDraft.value)
    editing.value = null
  })

const deleteRoom = (room) => {
  if (confirm(`Delete room "${room.name}"?`)) run(() => admin.remove('rooms', room.id))
}
</script>

<template>
  <div class="space-y-3">
    <p v-if="error" class="rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error }}</p>

    <div v-for="floor in building.floors" :key="floor.id" class="rounded-xl ring-1 ring-slate-200">
      <div class="flex items-center justify-between bg-slate-100 px-3 py-2">
        <h4 class="font-semibold">{{ floor.label }}</h4>
        <div class="flex gap-3 text-sm">
          <button type="button" class="text-blue-700" @click="renameFloor(floor)">Rename</button>
          <button type="button" class="text-red-700" @click="deleteFloor(floor)">Delete</button>
        </div>
      </div>

      <ul class="divide-y divide-slate-100">
        <li v-for="room in floor.rooms" :key="room.id" class="px-3 py-2 text-sm">
          <form v-if="editing === room.id" class="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]" @submit.prevent="saveRoom(room)">
            <input v-model="editDraft.name" required class="rounded-lg border border-slate-300 p-2" />
            <select v-model="editDraft.type" class="rounded-lg border border-slate-300 p-2">
              <option v-for="t in ROOM_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
            <input v-model="editDraft.notes" placeholder="Notes" class="rounded-lg border border-slate-300 p-2" />
            <div class="flex gap-2">
              <button type="submit" class="rounded-lg bg-blue-700 px-3 py-2 text-white">Save</button>
              <button type="button" class="px-2 text-slate-500" @click="editing = null">Cancel</button>
            </div>
          </form>
          <div v-else class="flex items-center justify-between gap-2">
            <span>
              <span class="font-medium">{{ room.name }}</span>
              <span class="text-slate-500"> · {{ room.type }}</span>
              <span v-if="room.notes" class="text-slate-500"> · {{ room.notes }}</span>
            </span>
            <span class="flex shrink-0 gap-3">
              <button type="button" class="text-blue-700" @click="startEdit(room)">Edit</button>
              <button type="button" class="text-red-700" @click="deleteRoom(room)">Delete</button>
            </span>
          </div>
        </li>
      </ul>

      <form class="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-[1fr_auto_1fr_auto]" @submit.prevent="addRoom(floor)">
        <input v-model="draftFor(floor.id).name" required placeholder="New room name" class="rounded-lg border border-slate-300 p-2 text-sm" />
        <select v-model="draftFor(floor.id).type" class="rounded-lg border border-slate-300 p-2 text-sm">
          <option v-for="t in ROOM_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
        <input v-model="draftFor(floor.id).notes" placeholder="Notes (optional)" class="rounded-lg border border-slate-300 p-2 text-sm" />
        <button type="submit" class="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">Add room</button>
      </form>
    </div>

    <form class="flex gap-2" @submit.prevent="addFloor">
      <input v-model="newFloor" required placeholder="New floor, e.g. Ground floor" class="flex-1 rounded-lg border border-slate-300 p-2 text-sm" />
      <button type="submit" class="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">Add floor</button>
    </form>
  </div>
</template>
