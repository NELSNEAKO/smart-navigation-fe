<script setup>
// Floors and rooms of one building. Text only: the app never claims indoor positioning.
import { ref } from 'vue'
import { admin } from '../../lib/api'
import { toast, confirmAction } from '../../lib/feedback'
import AppIcon from '../ui/AppIcon.vue'
import UiButton from '../ui/UiButton.vue'
import UiBadge from '../ui/UiBadge.vue'
import PhotosEditor from './PhotosEditor.vue'
import { coverOf } from '../../lib/photos'

const props = defineProps({
  building: { type: Object, required: true },
})
const emit = defineEmits(['changed'])

const ROOM_TYPES = [
  { value: 'classroom', label: 'Classroom' },
  { value: 'office', label: 'Office' },
  { value: 'lab', label: 'Laboratory' },
  { value: 'restroom', label: 'Restroom' },
]
const typeLabel = Object.fromEntries(ROOM_TYPES.map((t) => [t.value, t.label]))
const typeTone = { classroom: 'primary', office: 'neutral', lab: 'success', restroom: 'warning' }

const newFloor = ref('')
const addingRoomTo = ref(null) // floor id with the "add room" form open
const blankRoom = (type = 'classroom') => ({ name: '', type, notes: '', description: '', photoIds: [] })
const draft = ref(blankRoom())
const editingRoom = ref(null)
const editDraft = ref({})
const renaming = ref(null)
const renameValue = ref('')
const busy = ref(false)

const input =
  'block h-10 w-full rounded-md border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-muted focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100'

async function run(fn, success) {
  busy.value = true
  try {
    await fn()
    if (success) toast(success)
    emit('changed')
    return true
  } catch (e) {
    toast.error(e.message)
    return false
  } finally {
    busy.value = false
  }
}

const addFloor = async () => {
  const label = newFloor.value.trim()
  if (!label) return
  const ok = await run(() => admin.create('floors', { buildingId: props.building.id, label, order: props.building.floors?.length ?? 0 }), `${label} added`)
  if (ok) newFloor.value = ''
}

function startRename(floor) {
  renaming.value = floor.id
  renameValue.value = floor.label
}
const saveRename = async (floor) => {
  const label = renameValue.value.trim()
  if (label && label !== floor.label) await run(() => admin.update('floors', floor.id, { label }), 'Floor renamed')
  renaming.value = null
}

const deleteFloor = async (floor) => {
  const ok = await confirmAction({
    title: `Delete ${floor.label}?`,
    message: floor.rooms?.length ? `Its ${floor.rooms.length} room(s) will be deleted too. This can't be undone.` : "This can't be undone.",
  })
  if (ok) run(() => admin.remove('floors', floor.id), `${floor.label} deleted`)
}

function openAddRoom(floor) {
  addingRoomTo.value = floor.id
  draft.value = blankRoom()
}
const addRoom = async (floor) => {
  const ok = await run(() => admin.create('rooms', { floorId: floor.id, ...draft.value }), `${draft.value.name} added`)
  if (ok) draft.value = blankRoom(draft.value.type) // keep the form open for the next room
}

function startEdit(room) {
  editingRoom.value = room.id
  editDraft.value = { name: room.name, type: room.type, notes: room.notes || '', description: room.description || '', photoIds: [...(room.photoIds || [])] }
}
const saveRoom = async (room) => {
  const ok = await run(() => admin.update('rooms', room.id, editDraft.value), 'Room saved')
  if (ok) editingRoom.value = null
}
const deleteRoom = async (room) => {
  if (await confirmAction({ title: `Delete ${room.name}?`, message: "This can't be undone." })) run(() => admin.remove('rooms', room.id), 'Room deleted')
}
</script>

<template>
  <div class="space-y-3">
    <p v-if="!building.floors?.length" class="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
      No floors yet. Add the first one below, e.g. "Ground floor".
    </p>

    <div v-for="floor in building.floors" :key="floor.id" class="overflow-hidden rounded-xl border border-line">
      <!-- Floor header -->
      <div class="flex items-center gap-2 bg-canvas px-3 py-2">
        <AppIcon name="layers" :size="16" class="text-ink-muted" />
        <form v-if="renaming === floor.id" class="flex flex-1 gap-2" @submit.prevent="saveRename(floor)">
          <input v-model="renameValue" :class="[input, 'h-8 text-sm']" autofocus @keydown.esc="renaming = null" />
          <UiButton size="sm" type="submit">Save</UiButton>
        </form>
        <template v-else>
          <h4 class="flex-1 text-sm font-semibold text-ink">{{ floor.label }}</h4>
          <span class="text-xs text-ink-muted">{{ floor.rooms?.length || 0 }} rooms</span>
          <button type="button" class="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" :aria-label="`Rename ${floor.label}`" @click="startRename(floor)">
            <AppIcon name="pencil" :size="16" />
          </button>
          <button type="button" class="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-danger-600" :aria-label="`Delete ${floor.label}`" @click="deleteFloor(floor)">
            <AppIcon name="trash" :size="16" />
          </button>
        </template>
      </div>

      <!-- Rooms -->
      <ul class="divide-y divide-line">
        <li v-for="room in floor.rooms" :key="room.id" class="px-3 py-2.5">
          <form v-if="editingRoom === room.id" class="space-y-2" @submit.prevent="saveRoom(room)">
            <div class="grid grid-cols-[1fr_auto] gap-2">
              <input v-model="editDraft.name" required :class="input" aria-label="Room name" />
              <select v-model="editDraft.type" :class="input" aria-label="Room type">
                <option v-for="t in ROOM_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
            <input v-model="editDraft.notes" :class="input" placeholder="How to find it, e.g. Left stairs, beside the restroom" aria-label="How to find it" />
            <textarea v-model="editDraft.description" :class="[input, 'h-auto py-2']" rows="2" maxlength="2000" placeholder="Description, e.g. Computer lab with 40 PCs and a projector" aria-label="Description" />
            <PhotosEditor v-model="editDraft.photoIds" label="Room photos" />
            <div class="flex justify-end gap-2">
              <UiButton variant="quiet" size="sm" @click="editingRoom = null">Cancel</UiButton>
              <UiButton size="sm" type="submit" :loading="busy">Save room</UiButton>
            </div>
          </form>
          <div v-else class="flex items-center gap-2">
            <img v-if="coverOf(room)" :src="coverOf(room)" alt="" class="h-9 w-9 shrink-0 rounded-md object-cover" loading="lazy" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-ink">{{ room.name }}</p>
              <p v-if="room.notes || room.description" class="truncate text-xs text-ink-muted">{{ room.notes || room.description }}</p>
              <p v-if="room.photoIds?.length" class="text-xs text-ink-muted">{{ room.photoIds.length }} photo{{ room.photoIds.length === 1 ? '' : 's' }}</p>
            </div>
            <UiBadge :tone="typeTone[room.type]">{{ typeLabel[room.type] }}</UiBadge>
            <button type="button" class="rounded-md p-1.5 text-ink-muted hover:bg-canvas hover:text-ink" :aria-label="`Edit ${room.name}`" @click="startEdit(room)">
              <AppIcon name="pencil" :size="16" />
            </button>
            <button type="button" class="rounded-md p-1.5 text-ink-muted hover:bg-canvas hover:text-danger-600" :aria-label="`Delete ${room.name}`" @click="deleteRoom(room)">
              <AppIcon name="trash" :size="16" />
            </button>
          </div>
        </li>
      </ul>

      <!-- Add room -->
      <form v-if="addingRoomTo === floor.id" class="space-y-2 border-t border-line bg-primary-50/40 p-3" @submit.prevent="addRoom(floor)">
        <div class="grid grid-cols-[1fr_auto] gap-2">
          <input v-model="draft.name" required :class="input" placeholder="Room name, e.g. Room 204" aria-label="New room name" autofocus />
          <select v-model="draft.type" :class="input" aria-label="New room type">
            <option v-for="t in ROOM_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </div>
        <input v-model="draft.notes" :class="input" placeholder="How to find it (optional)" aria-label="How to find the new room" />
        <textarea v-model="draft.description" :class="[input, 'h-auto py-2']" rows="2" maxlength="2000" placeholder="Description (optional)" aria-label="New room description" />
        <PhotosEditor v-model="draft.photoIds" label="Room photos (optional)" />
        <div class="flex justify-end gap-2">
          <UiButton variant="quiet" size="sm" @click="addingRoomTo = null">Done</UiButton>
          <UiButton size="sm" type="submit" icon="plus" :loading="busy">Add room</UiButton>
        </div>
      </form>
      <button v-else type="button" class="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-sm font-medium text-primary-600 hover:bg-primary-50/50" @click="openAddRoom(floor)">
        <AppIcon name="plus" :size="16" /> Add room
      </button>
    </div>

    <form class="flex gap-2" @submit.prevent="addFloor">
      <input v-model="newFloor" :class="input" placeholder="New floor, e.g. Ground floor" aria-label="New floor name" />
      <UiButton type="submit" variant="secondary" icon="plus" :disabled="!newFloor.trim()" :loading="busy">Add floor</UiButton>
    </form>
  </div>
</template>
