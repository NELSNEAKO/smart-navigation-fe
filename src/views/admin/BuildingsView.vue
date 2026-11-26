<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { admin } from '../../lib/api'
import { toast, confirmAction } from '../../lib/feedback'
import { campusHealth } from '../../lib/campusHealth'
import { useMapStore } from '../../stores/map'
import AppIcon from '../../components/ui/AppIcon.vue'
import PageHeader from '../../components/ui/PageHeader.vue'
import UiButton from '../../components/ui/UiButton.vue'
import UiBadge from '../../components/ui/UiBadge.vue'
import UiDrawer from '../../components/ui/UiDrawer.vue'
import UiEmpty from '../../components/ui/UiEmpty.vue'
import UiField from '../../components/ui/UiField.vue'
import { CATEGORIES, categoryById } from '../../lib/categories'

const categoryOptions = [{ value: '', label: 'No category' }, ...CATEGORIES.map((c) => ({ value: c.id, label: c.label }))]
import LocationPicker from '../../components/admin/LocationPicker.vue'
import FloorsEditor from '../../components/admin/FloorsEditor.vue'
import EntrancesEditor from '../../components/admin/EntrancesEditor.vue'

const campus = useMapStore()
const route = useRoute()
const router = useRouter()

const query = ref('')
const editingId = ref(null) // null = closed, 'new' = creating, otherwise building id
const tab = ref('details') // details | entrances | floors
const form = ref(blank())
const errors = ref({})
const saving = ref(false)

function blank() {
  return { name: '', description: '', category: '', photoUrl: '', location: null }
}

const health = computed(() => campusHealth(campus))
const current = computed(() => (editingId.value && editingId.value !== 'new' ? campus.buildingById.get(editingId.value) : null))
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? campus.buildings.filter((b) => `${b.name} ${b.description || ''}`.toLowerCase().includes(q)) : campus.buildings
})

function status(b) {
  const s = health.value.perBuilding.get(b.id)
  const issue = health.value.issues.find((i) => i.buildingId === b.id)
  if (issue?.fix === 'Move pin') return { tone: 'danger', label: 'Check location' }
  if (!s?.entrances) return { tone: 'warning', label: 'No entrance' }
  if (issue) return { tone: 'warning', label: 'Not reachable' }
  return { tone: 'success', label: 'Ready' }
}

function openNew() {
  editingId.value = 'new'
  tab.value = 'details'
  form.value = blank()
  errors.value = {}
}

function openEdit(b, startTab = 'details') {
  editingId.value = b.id
  tab.value = startTab
  form.value = { name: b.name, description: b.description || '', category: b.category || '', photoUrl: b.photoUrl || '', location: { lat: b.lat, lng: b.lng } }
  errors.value = {}
}

function close() {
  editingId.value = null
  if (route.query.edit) router.replace({ query: {} })
}

// Deep link from Overview: /admin/buildings?edit=<id>
watch(
  () => [route.query.edit, campus.status],
  ([id]) => {
    const b = id && campus.buildingById.get(id)
    if (b && editingId.value !== id) openEdit(b, ['entrances', 'floors'].includes(route.query.tab) ? route.query.tab : 'details')
  },
  { immediate: true },
)

function validate() {
  const e = {}
  if (!form.value.name.trim()) e.name = 'Give the building a name.'
  if (!form.value.location) e.location = 'Set the building location on the map.'
  if (form.value.photoUrl && !/^https?:\/\//.test(form.value.photoUrl)) e.photoUrl = 'Use a full link starting with https://'
  errors.value = e
  return !Object.keys(e).length
}

async function save() {
  if (!validate()) return
  saving.value = true
  const data = {
    name: form.value.name,
    description: form.value.description,
    photoUrl: form.value.photoUrl,
    category: form.value.category || null,
    lat: form.value.location.lat,
    lng: form.value.location.lng,
  }
  try {
    if (editingId.value === 'new') {
      const created = await admin.create('buildings', data)
      await campus.load(true)
      toast(`${created.name} added. Now add its floors and rooms.`)
      editingId.value = created.id
      tab.value = 'floors'
    } else {
      await admin.update('buildings', editingId.value, data)
      await campus.load(true)
      toast('Changes saved')
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    saving.value = false
  }
}

async function remove(b) {
  const ok = await confirmAction({
    title: `Delete ${b.name}?`,
    message: 'Its floors and rooms will be deleted too. Entrance points stay on the paths map. This can’t be undone.',
  })
  if (!ok) return
  try {
    await admin.remove('buildings', b.id)
    if (editingId.value === b.id) close()
    await campus.load(true)
    toast(`${b.name} deleted`)
  } catch (e) {
    toast.error(e.message)
  }
}
</script>

<template>
  <div>
    <PageHeader title="Buildings" description="Every building visitors can search for and navigate to. Set an accurate pin so routes end in the right place.">
      <template #actions>
        <UiButton icon="plus" @click="openNew">Add building</UiButton>
      </template>
    </PageHeader>

    <section class="rounded-xl border border-line bg-surface shadow-xs">
      <!-- Toolbar -->
      <div class="flex items-center gap-3 border-b border-line px-4 py-3">
        <label class="relative flex-1 sm:max-w-xs">
          <AppIcon name="search" :size="18" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
          <input
            v-model="query"
            type="search"
            placeholder="Search buildings"
            aria-label="Search buildings"
            class="h-10 w-full rounded-md border border-line bg-surface pr-3 pl-10 text-base placeholder:text-ink-muted focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none"
          />
        </label>
        <span class="ml-auto hidden text-sm text-ink-muted sm:block">{{ campus.buildings.length }} total</span>
      </div>

      <div v-if="campus.status === 'loading'" class="space-y-3 p-4">
        <div v-for="i in 3" :key="i" class="h-14 animate-pulse rounded-lg bg-canvas" />
      </div>

      <UiEmpty v-else-if="!campus.buildings.length" icon="building" title="No buildings yet" text="Add your first building: give it a name and drop its pin on the map.">
        <UiButton icon="plus" @click="openNew">Add building</UiButton>
      </UiEmpty>

      <p v-else-if="!filtered.length" class="px-4 py-10 text-center text-sm text-ink-muted">No building matches “{{ query }}”.</p>

      <template v-else>
        <!-- Desktop table -->
        <table class="hidden w-full text-left text-sm md:table">
          <thead class="text-xs font-medium tracking-wide text-ink-muted uppercase">
            <tr class="border-b border-line">
              <th class="px-4 py-3 font-medium">Building</th>
              <th class="px-4 py-3 font-medium">Category</th>
              <th class="px-4 py-3 font-medium">Floors</th>
              <th class="px-4 py-3 font-medium">Rooms</th>
              <th class="px-4 py-3 font-medium">Entrances</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="b in filtered" :key="b.id" class="cursor-pointer hover:bg-canvas" @click="openEdit(b)">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <img v-if="b.photoUrl" :src="b.photoUrl" alt="" class="h-9 w-9 rounded-lg object-cover" />
                  <span v-else class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600"><AppIcon name="building" :size="18" /></span>
                  <div class="min-w-0">
                    <p class="truncate font-medium text-ink">{{ b.name }}</p>
                    <p v-if="b.description" class="max-w-xs truncate text-xs text-ink-muted">{{ b.description }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3">
                <span v-if="categoryById[b.category]" class="inline-flex items-center gap-1.5 text-ink-soft">
                  <AppIcon :name="categoryById[b.category].icon" :size="16" class="text-ink-muted" />{{ categoryById[b.category].label }}
                </span>
                <span v-else class="text-ink-muted">Not set</span>
              </td>
              <td class="px-4 py-3 tabular-nums text-ink-soft">{{ health.perBuilding.get(b.id)?.floors ?? 0 }}</td>
              <td class="px-4 py-3 tabular-nums text-ink-soft">{{ health.perBuilding.get(b.id)?.rooms ?? 0 }}</td>
              <td class="px-4 py-3 tabular-nums text-ink-soft">{{ health.perBuilding.get(b.id)?.entrances ?? 0 }}</td>
              <td class="px-4 py-3"><UiBadge :tone="status(b).tone">{{ status(b).label }}</UiBadge></td>
              <td class="px-4 py-3">
                <div class="flex justify-end gap-1" @click.stop>
                  <button type="button" class="rounded-md p-2 text-ink-muted hover:bg-surface hover:text-ink" :aria-label="`Edit ${b.name}`" title="Edit" @click="openEdit(b)">
                    <AppIcon name="pencil" :size="18" />
                  </button>
                  <button type="button" class="rounded-md p-2 text-ink-muted hover:bg-surface hover:text-danger-600" :aria-label="`Delete ${b.name}`" title="Delete" @click="remove(b)">
                    <AppIcon name="trash" :size="18" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Phone list -->
        <ul class="divide-y divide-line md:hidden">
          <li v-for="b in filtered" :key="b.id">
            <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-canvas" @click="openEdit(b)">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600"><AppIcon name="building" :size="20" /></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-ink">{{ b.name }}</span>
                <span class="block text-xs text-ink-muted">{{ health.perBuilding.get(b.id)?.floors ?? 0 }} floors · {{ health.perBuilding.get(b.id)?.rooms ?? 0 }} rooms</span>
              </span>
              <UiBadge :tone="status(b).tone">{{ status(b).label }}</UiBadge>
              <AppIcon name="chevron-right" :size="18" class="text-ink-muted" />
            </button>
          </li>
        </ul>
      </template>
    </section>

    <!-- Editor drawer -->
    <UiDrawer
      :open="!!editingId"
      :title="editingId === 'new' ? 'New building' : current?.name || 'Edit building'"
      :subtitle="editingId === 'new' ? 'Name it and set its location' : 'Building details, location, floors and rooms'"
      @close="close"
    >
      <!-- Tabs (only after it exists) -->
      <div v-if="current" class="-mt-1 mb-5 grid grid-cols-3 rounded-lg bg-canvas p-1 ring-1 ring-line ring-inset">
        <button
          v-for="t in [{ id: 'details', label: 'Details' }, { id: 'entrances', label: `Entrances (${health.perBuilding.get(current.id)?.entrances ?? 0})` }, { id: 'floors', label: `Floors (${current.floors?.length || 0})` }]"
          :key="t.id"
          type="button"
          class="rounded-md py-2 text-sm font-medium transition-colors"
          :class="tab === t.id ? 'bg-surface text-ink shadow-xs' : 'text-ink-muted hover:text-ink'"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <form v-show="tab === 'details' || !current" id="building-form" class="space-y-5" novalidate @submit.prevent="save">
        <UiField v-model="form.name" label="Building name" required maxlength="120" placeholder="e.g. Science Building" :error="errors.name" />
        <UiField v-model="form.description" as="textarea" label="Description" rows="2" maxlength="2000" placeholder="What's inside, which offices are here…" hint="Shown to visitors when they tap the building." />
        <UiField v-model="form.category" as="select" label="Category" :options="categoryOptions" hint="Visitors can browse buildings by category on the home screen." />
        <UiField v-model="form.photoUrl" type="url" label="Photo link" placeholder="https://…" hint="Optional. A photo helps visitors recognise the building." :error="errors.photoUrl" />
        <div>
          <p class="mb-1.5 text-sm font-medium text-ink-soft">Location <span class="text-danger-600">*</span></p>
          <LocationPicker v-model="form.location" :exclude-id="current?.id" />
          <p v-if="errors.location" class="mt-1.5 text-sm text-danger-600">{{ errors.location }}</p>
        </div>
      </form>

      <EntrancesEditor v-if="current && tab === 'entrances'" :building="current" />
      <FloorsEditor v-if="current && tab === 'floors'" :building="current" @changed="campus.load(true)" />

      <template #footer>
        <template v-if="tab === 'details' || !current">
          <UiButton v-if="current" variant="quiet" class="mr-auto !text-danger-600" icon="trash" @click="remove(current)">Delete</UiButton>
          <UiButton variant="secondary" @click="close">Cancel</UiButton>
          <UiButton type="submit" form="building-form" :loading="saving">{{ editingId === 'new' ? 'Create building' : 'Save changes' }}</UiButton>
        </template>
        <UiButton v-else variant="secondary" @click="close">Done</UiButton>
      </template>
    </UiDrawer>
  </div>
</template>
