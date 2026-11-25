<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { admin } from '../../lib/api'
import AppIcon from '../../components/ui/AppIcon.vue'
import PageHeader from '../../components/ui/PageHeader.vue'
import UiEmpty from '../../components/ui/UiEmpty.vue'

const days = ref(30)
const report = ref(null)
const error = ref('')
const loading = ref(false)

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    report.value = await admin.reports(days.value)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(refresh)
watch(days, refresh)

const maxDay = computed(() => Math.max(1, ...(report.value?.perDay.map((d) => d.count) ?? [1])))
const busiest = computed(() => report.value?.perDay.reduce((a, b) => (b.count > a.count ? b : a), { count: 0 }))
const avg = computed(() => (report.value ? (report.value.total / report.value.days).toFixed(1) : '0'))
const pct = (n, rows) => `${Math.round((n / Math.max(1, ...rows.map((x) => x.count))) * 100)}%`
const fmtDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const blocks = computed(() =>
  report.value
    ? [
        { title: 'Most searched buildings', icon: 'building', rows: report.value.topBuildings.map((r) => ({ label: r.name, count: r.count })), empty: 'No building searches yet.' },
        { title: 'Top search words', icon: 'search', rows: report.value.topQueries.map((r) => ({ label: r.query, count: r.count })), empty: 'No searches yet.' },
        { title: 'Busiest QR start points', icon: 'qr', rows: report.value.topStarts.map((r) => ({ label: r.code, count: r.count })), empty: 'No QR scans recorded yet.' },
      ]
    : [],
)
</script>

<template>
  <div>
    <PageHeader title="Reports" description="How visitors use the navigator. Searches are anonymous; no personal data is stored.">
      <template #actions>
        <select v-model.number="days" aria-label="Time range" class="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink shadow-xs focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none">
          <option :value="7">Last 7 days</option>
          <option :value="30">Last 30 days</option>
          <option :value="90">Last 90 days</option>
        </select>
      </template>
    </PageHeader>

    <p v-if="error" class="mb-4 flex items-center gap-2 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-600"><AppIcon name="alert" :size="18" />{{ error }}</p>

    <div v-if="loading && !report" class="grid gap-4 sm:grid-cols-3">
      <div v-for="i in 3" :key="i" class="h-28 animate-pulse rounded-xl bg-surface" />
    </div>

    <template v-if="report">
      <!-- Stat cards -->
      <div class="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <div class="rounded-xl border border-line bg-surface p-5 shadow-xs">
          <p class="text-sm font-medium text-ink-muted">Searches</p>
          <p class="mt-1 text-3xl font-semibold tabular-nums">{{ report.total }}</p>
          <p class="text-xs text-ink-muted">in the last {{ report.days }} days</p>
        </div>
        <div class="rounded-xl border border-line bg-surface p-5 shadow-xs">
          <p class="text-sm font-medium text-ink-muted">Daily average</p>
          <p class="mt-1 text-3xl font-semibold tabular-nums">{{ avg }}</p>
          <p class="text-xs text-ink-muted">searches per day</p>
        </div>
        <div class="rounded-xl border border-line bg-surface p-5 shadow-xs">
          <p class="text-sm font-medium text-ink-muted">Busiest day</p>
          <p class="mt-1 text-3xl font-semibold tabular-nums">{{ busiest?.count || 0 }}</p>
          <p class="text-xs text-ink-muted">{{ busiest?.count ? fmtDay(busiest.day) : 'No activity yet' }}</p>
        </div>
      </div>

      <!-- Per-day chart -->
      <section class="mt-4 rounded-xl border border-line bg-surface p-5 shadow-xs">
        <h2 class="text-base font-semibold">Searches per day</h2>
        <UiEmpty v-if="!report.total" icon="chart" title="No searches yet" text="Once visitors start searching, daily activity shows here." />
        <template v-else>
          <div class="mt-4 flex h-40 items-end gap-[2px]" role="img" :aria-label="`Searches per day over ${report.days} days`">
            <div v-for="d in report.perDay" :key="d.day" class="group relative flex-1">
              <div class="w-full rounded-t-sm bg-primary-600/85 transition-colors group-hover:bg-primary-700" :style="{ height: `${(d.count / maxDay) * 160}px`, minHeight: d.count ? '3px' : '0' }" />
              <span class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block">
                {{ fmtDay(d.day) }}: {{ d.count }}
              </span>
            </div>
          </div>
          <div class="mt-2 flex justify-between border-t border-line pt-2 text-xs text-ink-muted">
            <span>{{ fmtDay(report.perDay[0].day) }}</span>
            <span>{{ fmtDay(report.perDay[report.perDay.length - 1].day) }}</span>
          </div>
        </template>
      </section>

      <!-- Top lists -->
      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <section v-for="block in blocks" :key="block.title" class="rounded-xl border border-line bg-surface p-5 shadow-xs">
          <h2 class="flex items-center gap-2 text-base font-semibold"><AppIcon :name="block.icon" :size="18" class="text-ink-muted" />{{ block.title }}</h2>
          <p v-if="!block.rows.length" class="mt-4 text-sm text-ink-muted">{{ block.empty }}</p>
          <ol class="mt-4 space-y-3">
            <li v-for="(row, i) in block.rows" :key="row.label" class="text-sm">
              <div class="flex items-center justify-between gap-2">
                <span class="flex min-w-0 items-center gap-2">
                  <span class="w-4 text-xs text-ink-muted tabular-nums">{{ i + 1 }}</span>
                  <span class="truncate text-ink">{{ row.label }}</span>
                </span>
                <span class="font-medium tabular-nums">{{ row.count }}</span>
              </div>
              <div class="mt-1.5 ml-6 h-1.5 rounded-full bg-canvas">
                <div class="h-1.5 rounded-full bg-primary-600" :style="{ width: pct(row.count, block.rows) }" />
              </div>
            </li>
          </ol>
        </section>
      </div>
    </template>
  </div>
</template>
