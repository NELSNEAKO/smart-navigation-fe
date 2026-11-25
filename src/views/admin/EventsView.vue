<script setup>
import { computed, onMounted, ref } from 'vue'
import { admin } from '../../lib/api'
import { toast, confirmAction } from '../../lib/feedback'
import AppIcon from '../../components/ui/AppIcon.vue'
import PageHeader from '../../components/ui/PageHeader.vue'
import UiButton from '../../components/ui/UiButton.vue'
import UiBadge from '../../components/ui/UiBadge.vue'
import UiDrawer from '../../components/ui/UiDrawer.vue'
import UiEmpty from '../../components/ui/UiEmpty.vue'
import UiField from '../../components/ui/UiField.vue'

const events = ref([])
const loading = ref(true)
const editingId = ref(null) // null | 'new' | id
const form = ref(blank())
const errors = ref({})
const saving = ref(false)
const filter = ref('upcoming') // upcoming | past | all

function blank() {
  return { title: '', body: '', startsAt: '', endsAt: '' }
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function statusOf(ev) {
  const now = Date.now()
  const start = new Date(ev.startsAt).getTime()
  const end = ev.endsAt ? new Date(ev.endsAt).getTime() : start + 2 * 3600 * 1000
  if (now >= start && now <= end) return { key: 'live', tone: 'success', label: 'Happening now' }
  if (now < start) return { key: 'upcoming', tone: 'primary', label: 'Upcoming' }
  return { key: 'past', tone: 'neutral', label: 'Ended' }
}

const counts = computed(() => {
  const c = { upcoming: 0, past: 0, all: events.value.length }
  for (const ev of events.value) statusOf(ev).key === 'past' ? c.past++ : c.upcoming++
  return c
})
const shown = computed(() => {
  const list = events.value.filter((ev) => {
    const k = statusOf(ev).key
    return filter.value === 'all' || (filter.value === 'past' ? k === 'past' : k !== 'past')
  })
  // Upcoming soonest first; past most recent first.
  return filter.value === 'upcoming' ? [...list].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)) : list
})

async function refresh() {
  loading.value = true
  try {
    events.value = await admin.list('events')
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}
onMounted(refresh)

function openNew() {
  editingId.value = 'new'
  form.value = blank()
  errors.value = {}
}

function openEdit(ev) {
  editingId.value = ev.id
  form.value = { title: ev.title, body: ev.body, startsAt: toLocalInput(ev.startsAt), endsAt: toLocalInput(ev.endsAt) }
  errors.value = {}
}

function validate() {
  const e = {}
  if (!form.value.title.trim()) e.title = 'Add a title.'
  if (!form.value.body.trim()) e.body = 'Add a short description.'
  if (!form.value.startsAt) e.startsAt = 'Choose when it starts.'
  if (form.value.endsAt && form.value.startsAt && form.value.endsAt < form.value.startsAt) e.endsAt = 'The end must be after the start.'
  errors.value = e
  return !Object.keys(e).length
}

async function save() {
  if (!validate()) return
  saving.value = true
  const data = {
    title: form.value.title,
    body: form.value.body,
    startsAt: new Date(form.value.startsAt).toISOString(),
    endsAt: form.value.endsAt ? new Date(form.value.endsAt).toISOString() : null,
  }
  try {
    if (editingId.value === 'new') await admin.create('events', data)
    else await admin.update('events', editingId.value, data)
    toast(editingId.value === 'new' ? 'Event published' : 'Event saved')
    editingId.value = null
    await refresh()
  } catch (e) {
    toast.error(e.message)
  } finally {
    saving.value = false
  }
}

async function remove(ev) {
  if (!(await confirmAction({ title: `Delete “${ev.title}”?`, message: 'Visitors will no longer see it. This can’t be undone.' }))) return
  try {
    await admin.remove('events', ev.id)
    if (editingId.value === ev.id) editingId.value = null
    toast('Event deleted')
    await refresh()
  } catch (e) {
    toast.error(e.message)
  }
}

const day = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric' })
const month = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short' })
const when = (ev) => {
  const opts = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
  const start = new Date(ev.startsAt).toLocaleString(undefined, opts)
  return ev.endsAt ? `${start} – ${new Date(ev.endsAt).toLocaleString(undefined, opts)}` : start
}
</script>

<template>
  <div>
    <PageHeader title="Events" description="Announcements shown on the visitor map, such as enrollment days, exams or campus activities.">
      <template #actions>
        <UiButton icon="plus" @click="openNew">New event</UiButton>
      </template>
    </PageHeader>

    <section class="rounded-xl border border-line bg-surface shadow-xs">
      <div class="flex gap-1 border-b border-line px-3 py-2" role="tablist">
        <button
          v-for="f in [{ id: 'upcoming', label: 'Upcoming' }, { id: 'past', label: 'Past' }, { id: 'all', label: 'All' }]"
          :key="f.id"
          type="button"
          role="tab"
          :aria-selected="filter === f.id"
          class="rounded-md px-3 py-1.5 text-sm font-medium"
          :class="filter === f.id ? 'bg-primary-50 text-primary-700' : 'text-ink-soft hover:bg-canvas'"
          @click="filter = f.id"
        >
          {{ f.label }} <span class="ml-1 text-xs tabular-nums opacity-70">{{ counts[f.id] }}</span>
        </button>
      </div>

      <div v-if="loading" class="space-y-3 p-4">
        <div v-for="i in 3" :key="i" class="h-16 animate-pulse rounded-lg bg-canvas" />
      </div>
      <UiEmpty v-else-if="!events.length" icon="calendar" title="No events yet" text="Post your first announcement. It appears on the visitor map until it ends.">
        <UiButton icon="plus" @click="openNew">New event</UiButton>
      </UiEmpty>
      <p v-else-if="!shown.length" class="px-4 py-10 text-center text-sm text-ink-muted">Nothing here.</p>

      <ul v-else class="divide-y divide-line">
        <li v-for="ev in shown" :key="ev.id" class="flex items-start gap-4 px-4 py-4 hover:bg-canvas">
          <div class="flex w-12 shrink-0 flex-col items-center rounded-lg border border-line bg-surface py-1.5">
            <span class="text-[11px] font-semibold text-danger-600 uppercase">{{ month(ev.startsAt) }}</span>
            <span class="text-lg leading-tight font-semibold tabular-nums">{{ day(ev.startsAt) }}</span>
          </div>
          <button type="button" class="min-w-0 flex-1 text-left" @click="openEdit(ev)">
            <span class="flex flex-wrap items-center gap-2">
              <span class="font-medium text-ink">{{ ev.title }}</span>
              <UiBadge :tone="statusOf(ev).tone">{{ statusOf(ev).label }}</UiBadge>
            </span>
            <span class="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted"><AppIcon name="clock" :size="14" />{{ when(ev) }}</span>
            <span class="mt-1 line-clamp-2 block text-sm text-ink-soft">{{ ev.body }}</span>
          </button>
          <div class="flex shrink-0 gap-1">
            <button type="button" class="rounded-md p-2 text-ink-muted hover:bg-surface hover:text-ink" :aria-label="`Edit ${ev.title}`" @click="openEdit(ev)">
              <AppIcon name="pencil" :size="18" />
            </button>
            <button type="button" class="rounded-md p-2 text-ink-muted hover:bg-surface hover:text-danger-600" :aria-label="`Delete ${ev.title}`" @click="remove(ev)">
              <AppIcon name="trash" :size="18" />
            </button>
          </div>
        </li>
      </ul>
    </section>

    <UiDrawer :open="!!editingId" :title="editingId === 'new' ? 'New event' : 'Edit event'" subtitle="Visitors see it on the map until it ends" @close="editingId = null">
      <form id="event-form" class="space-y-5" novalidate @submit.prevent="save">
        <UiField v-model="form.title" label="Title" required maxlength="160" placeholder="e.g. Enrollment for 2nd semester" :error="errors.title" />
        <UiField v-model="form.body" as="textarea" label="Details" required rows="4" maxlength="4000" placeholder="Where, who it's for, what to bring…" :error="errors.body" />
        <div class="grid gap-4 sm:grid-cols-2">
          <UiField v-model="form.startsAt" type="datetime-local" label="Starts" required :error="errors.startsAt" />
          <UiField v-model="form.endsAt" type="datetime-local" label="Ends" hint="Optional" :error="errors.endsAt" />
        </div>
      </form>
      <template #footer>
        <UiButton v-if="editingId !== 'new'" variant="quiet" icon="trash" class="mr-auto !text-danger-600" @click="remove(events.find((e) => e.id === editingId))">Delete</UiButton>
        <UiButton variant="secondary" @click="editingId = null">Cancel</UiButton>
        <UiButton type="submit" form="event-form" :loading="saving">{{ editingId === 'new' ? 'Publish event' : 'Save changes' }}</UiButton>
      </template>
    </UiDrawer>
  </div>
</template>
