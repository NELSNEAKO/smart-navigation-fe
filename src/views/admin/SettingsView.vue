<script setup>
// Settings: the campus QR code. Scanning it only opens this website (the home screen);
// the visitor's location comes from phone GPS, not from the QR code.
import { computed, ref, watch } from 'vue'
import { qrSvg, qrPng, bannerPng } from '../../lib/qrPoster'
import { toast } from '../../lib/feedback'
import AppIcon from '../../components/ui/AppIcon.vue'
import PageHeader from '../../components/ui/PageHeader.vue'
import UiButton from '../../components/ui/UiButton.vue'
import UiField from '../../components/ui/UiField.vue'

const KEY = 'campusnav.qr'
const LIVE_URL = 'https://smart-navigation-fe-tau.vercel.app/'
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
const defaults = () => ({
  url: isLocal ? LIVE_URL : `${location.origin}/`,
  title: 'New on campus?',
  subtitle: 'Scan to find any building, office or room',
  footer: 'Smart Campus Navigator',
})

function load() {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return defaults()
  }
}
const form = ref(load())
watch(
  form,
  (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v))
    } catch {
      /* fine */
    }
  },
  { deep: true },
)

const urlError = computed(() => {
  try {
    const u = new URL(form.value.url)
    if (!/^https?:$/.test(u.protocol)) return 'Use a link starting with https://'
    if (/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return 'This is your computer’s address; phones can’t open it. Use the live website link.'
    return ''
  } catch {
    return 'Enter the full website link, e.g. https://…'
  }
})
const shortUrl = computed(() => form.value.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))

// Print quality (high error correction, pure black, standard white border): see lib/qrPoster.js.
const svg = ref('')
const busy = ref('')
watch(
  () => form.value.url,
  async (url) => {
    if (urlError.value) return (svg.value = '')
    svg.value = await qrSvg(url)
  },
  { immediate: true },
)

function save(blob, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
async function task(name, fn) {
  busy.value = name
  try {
    await fn()
  } catch (e) {
    toast.error(e.message)
  } finally {
    busy.value = ''
  }
}
const downloadPng = (px, name) =>
  task(name, async () => {
    save(await qrPng(form.value.url, px), `campus-qr-code-${px}px.png`)
    toast(`QR code downloaded (${px} × ${px} px)`)
  })
function downloadSvg() {
  save(new Blob([svg.value], { type: 'image/svg+xml' }), 'campus-qr-code.svg')
  toast('QR code downloaded (SVG). Stays sharp at any size.')
}
const downloadBanner = () =>
  task('banner', async () => {
    const data = { ...form.value, shortUrl: shortUrl.value }
    const blob = await bannerPng(data, 3600).catch(() => bannerPng(data, 2400)) // phones have a canvas size limit
    save(blob, 'campus-qr-banner.png')
    toast('Banner design downloaded (2 × 3 ft at 150 dpi)')
  })

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
function printPoster() {
  const w = window.open('', '_blank')
  if (!w) return toast.error('Allow pop-ups for this site to print the poster')
  const f = form.value
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Campus QR poster</title>
<style>
  @page { size: A4; margin: 0 }
  * { box-sizing: border-box }
  body { margin: 0; font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0f172a }
  .poster { width: 210mm; height: 297mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20mm }
  .badge { background: #1d4ed8; color: #fff; border-radius: 999px; padding: 3mm 7mm; font-weight: 600; font-size: 14pt; letter-spacing: .02em }
  h1 { font-size: 40pt; line-height: 1.1; margin: 10mm 0 4mm }
  p.sub { font-size: 18pt; color: #475569; margin: 0 0 12mm }
  .qr { width: 125mm; height: 125mm; padding: 4mm; border: 1.2mm solid #1d4ed8; border-radius: 6mm }
  .qr svg { width: 100%; height: 100% }
  .steps { display: flex; gap: 8mm; margin-top: 12mm; font-size: 13pt; color: #334155 }
  .steps b { display: inline-flex; width: 8mm; height: 8mm; border-radius: 50%; background: #dbeafe; color: #1d4ed8; align-items: center; justify-content: center; margin-right: 2mm }
  .url { margin-top: 10mm; font-size: 12pt; color: #64748b }
  .foot { margin-top: 3mm; font-weight: 600; font-size: 13pt }
</style></head><body><div class="poster">
  <span class="badge">Campus map &amp; directions</span>
  <h1>${esc(f.title)}</h1>
  <p class="sub">${esc(f.subtitle)}</p>
  <div class="qr">${svg.value}</div>
  <div class="steps"><span><b>1</b>Open your camera</span><span><b>2</b>Scan the code</span><span><b>3</b>Search &amp; go</span></div>
  <div class="url">or open ${esc(shortUrl.value)}</div>
  <div class="foot">${esc(f.footer)}</div>
</div><script>window.onload = () => { window.focus(); window.print() }<\/script></body></html>`)
  w.document.close()
}

function reset() {
  form.value = defaults()
  toast('Back to the default text and link')
}
</script>

<template>
  <div>
    <PageHeader title="Settings" description="Print the campus QR code. Visitors scan it to open this navigation app on their phone." />

    <section class="rounded-xl border border-line bg-surface shadow-xs">
      <div class="flex items-start gap-3 border-b border-line p-4 sm:p-5">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600"><AppIcon name="qr" :size="20" /></span>
        <div>
          <h2 class="text-base font-semibold">Visitor QR code</h2>
          <p class="text-sm text-ink-muted">Put it at the gate, the lobby or the guard house. Scanning opens the home screen; the phone's GPS finds where they are.</p>
        </div>
      </div>

      <div class="grid gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <!-- Settings -->
        <div class="space-y-5">
          <UiField v-model="form.url" type="url" label="Link the QR code opens" :error="urlError" hint="Your live visitor website. Change it only if the website address changes." />
          <UiField v-model="form.title" label="Poster title" maxlength="60" />
          <UiField v-model="form.subtitle" label="Poster subtitle" maxlength="90" />
          <UiField v-model="form.footer" label="Bottom line (campus or school name)" maxlength="80" />

          <div class="space-y-3 border-t border-line pt-4">
            <p class="text-sm font-semibold text-ink">For a banner or tarpaulin</p>
            <div class="flex flex-wrap gap-2">
              <UiButton icon="download" :disabled="!svg" :loading="busy === 'banner'" @click="downloadBanner">Banner design (PNG)</UiButton>
              <UiButton variant="secondary" icon="download" :disabled="!svg" @click="downloadSvg">QR only (SVG, any size)</UiButton>
              <UiButton variant="secondary" icon="download" :disabled="!svg" :loading="busy === 'big'" @click="downloadPng(6000, 'big')">QR only (PNG 6000 px)</UiButton>
            </div>
            <p class="text-sm font-semibold text-ink">For paper</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UiButton icon="printer" variant="secondary" :disabled="!svg" @click="printPoster">Print poster (A4)</UiButton>
            <UiButton variant="secondary" icon="download" :disabled="!svg" :loading="busy === 'small'" @click="downloadPng(1200, 'small')">QR only (PNG 1200 px)</UiButton>
            <a :href="form.url" target="_blank" rel="noopener" class="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-primary-600 hover:bg-primary-50" :class="urlError ? 'pointer-events-none opacity-50' : ''">
              <AppIcon name="external" :size="16" /> Test the link
            </a>
          </div>
          <ul class="space-y-1.5 rounded-lg bg-canvas p-3 text-sm text-ink-soft">
            <li><b class="font-medium text-ink">Built for outdoors:</b> high error correction, so it still scans when up to 30% is dirty, faded or folded. Pure black on white with the standard white border.</li>
            <li><b class="font-medium text-ink">Size by distance:</b> the QR code should be at least <b class="font-medium text-ink">1/10 of the scanning distance</b>. Read from 3 m away → at least 30 cm wide; from 5 m → 50 cm.</li>
            <li><b class="font-medium text-ink">Banner design (PNG)</b>: the whole layout, 3600 × 5400 px (2 × 3 ft at 150 dpi). The printer can enlarge it for a bigger tarp.</li>
            <li><b class="font-medium text-ink">QR only (SVG)</b>: give this to the printer if they make their own layout. It stays sharp at any size.</li>
            <li>Ask for <b class="font-medium text-ink">matte</b> tarpaulin if possible (glossy reflects sunlight), don't let the printer change the colours or crop the white border, and <b class="font-medium text-ink">scan the printed proof</b> before the full run.</li>
          </ul>
          <button type="button" class="text-sm font-medium text-ink-muted hover:text-ink" @click="reset">Reset to default</button>
        </div>

        <!-- Poster preview -->
        <div>
          <p class="mb-2 text-sm font-medium text-ink-soft">Preview</p>
          <div class="mx-auto flex aspect-[210/297] max-w-[320px] flex-col items-center justify-center rounded-lg bg-white p-5 text-center text-slate-900 shadow-md ring-1 ring-line">
            <span class="rounded-full bg-primary-700 px-2.5 py-1 text-[10px] font-semibold text-white">Campus map &amp; directions</span>
            <p class="mt-3 text-xl leading-tight font-bold">{{ form.title }}</p>
            <p class="mt-1 text-xs text-slate-500">{{ form.subtitle }}</p>
            <div class="mt-4 w-[62%] rounded-lg border-[3px] border-primary-700 p-1">
              <div v-if="svg" class="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full" v-html="svg" />
              <div v-else class="flex aspect-square items-center justify-center text-xs text-danger-600">Fix the link</div>
            </div>
            <p class="mt-3 text-[10px] text-slate-500">or open {{ shortUrl }}</p>
            <p class="mt-0.5 text-[11px] font-semibold">{{ form.footer }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
