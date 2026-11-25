<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { admin } from '../../lib/api'

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
const pct = (n, list) => `${Math.round((n / Math.max(1, ...list.map((x) => x.count))) * 100)}%`
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Reports</h1>
      <select v-model.number="days" class="rounded-lg border border-slate-300 bg-white p-2 text-sm">
        <option :value="7">Last 7 days</option>
        <option :value="30">Last 30 days</option>
        <option :value="90">Last 90 days</option>
      </select>
    </div>
    <p v-if="error" class="rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading && !report" class="text-sm text-slate-500">Loading…</p>

    <template v-if="report">
      <div class="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p class="text-sm text-slate-500">Searches in the last {{ report.days }} days</p>
        <p class="text-3xl font-bold">{{ report.total }}</p>
        <div class="mt-3 flex h-24 items-end gap-px" role="img" :aria-label="`Searches per day over ${report.days} days`">
          <div
            v-for="d in report.perDay"
            :key="d.day"
            class="flex-1 rounded-t bg-blue-600"
            :style="{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count ? '2px' : '0' }"
            :title="`${d.day}: ${d.count}`"
          />
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <section v-for="block in [
          { title: 'Most searched buildings', rows: report.topBuildings.map((r) => ({ label: r.name, count: r.count })) },
          { title: 'Top search words', rows: report.topQueries.map((r) => ({ label: r.query, count: r.count })) },
          { title: 'Top QR start points', rows: report.topStarts.map((r) => ({ label: r.code, count: r.count })) },
        ]" :key="block.title" class="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h2 class="mb-3 text-sm font-semibold">{{ block.title }}</h2>
          <p v-if="!block.rows.length" class="text-sm text-slate-500">No data yet.</p>
          <ul class="space-y-2">
            <li v-for="row in block.rows" :key="row.label" class="text-sm">
              <div class="flex justify-between gap-2">
                <span class="truncate">{{ row.label }}</span>
                <span class="font-medium tabular-nums">{{ row.count }}</span>
              </div>
              <div class="mt-1 h-1.5 rounded-full bg-slate-100">
                <div class="h-1.5 rounded-full bg-blue-600" :style="{ width: pct(row.count, block.rows) }" />
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
