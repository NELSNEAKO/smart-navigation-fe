// Print-quality campus QR code and banner (tarpaulin) artwork, drawn in the browser.
// - Error correction H: still scans with up to ~30% of the code dirty, faded or folded.
// - Pure black on white, and a 4-module white border (the QR standard's quiet zone).
// - Every module is drawn on whole pixels, so big prints stay razor sharp (no blur from scaling).
import QRCode from 'qrcode'

export const QR_OPTS = { errorCorrectionLevel: 'H', margin: 4, color: { dark: '#000000', light: '#ffffff' } }
const BLUE = '#1d4ed8'
const INK = '#0f172a'
const MUTED = '#475569'
const FONT = 'Inter, Arial, Helvetica, sans-serif'

/** Vector QR code (SVG text). Best file for big banners: any size, always sharp. */
export const qrSvg = (url) => QRCode.toString(url, { ...QR_OPTS, type: 'svg' }).then((s) => s.replace('<svg ', '<svg shape-rendering="crispEdges" '))

/** Draw the QR code inside the square (x, y, size) on whole pixels. Returns the size actually used. */
function drawQr(ctx, url, x, y, size) {
  const qr = QRCode.create(url, { errorCorrectionLevel: QR_OPTS.errorCorrectionLevel })
  const n = qr.modules.size
  const total = n + QR_OPTS.margin * 2
  const m = Math.floor(size / total) // whole pixels per module
  const used = m * total
  const ox = Math.round(x + (size - used) / 2)
  const oy = Math.round(y + (size - used) / 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(ox, oy, used, used)
  ctx.fillStyle = '#000000'
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) ctx.fillRect(ox + (c + QR_OPTS.margin) * m, oy + (r + QR_OPTS.margin) * m, m, m)
  return { used, ox, oy, modules: n }
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('This device could not create such a large image. Try on a computer.'))), 'image/png'))
}

/** Square PNG of just the QR code, `px` wide (e.g. 1200 for flyers, 6000 for banners). */
export async function qrPng(url, px) {
  const c = document.createElement('canvas')
  c.width = c.height = px
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, px, px)
  drawQr(ctx, url, 0, 0, px)
  return toBlob(c)
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = t
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Banner artwork (portrait 2:3) as a PNG: blue header with the title, subtitle, a big QR code,
 * three steps, the web address and the school name. 3600 × 5400 px = 2 × 3 ft at 150 dpi.
 */
export async function bannerPng({ url, title, subtitle, footer, shortUrl }, width = 3600) {
  await Promise.all(['400', '600'].map((w) => document.fonts?.load(`${w} 40px Inter`).catch(() => {})))
  const W = width
  const H = Math.round(width * 1.5)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('This device could not create such a large image. Try on a computer.')
  const pad = W * 0.07
  const inner = W - pad * 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Header band with the title
  ctx.font = `600 ${W * 0.088}px ${FONT}`
  const titleLines = wrap(ctx, title, inner)
  const titleLh = W * 0.1
  const bandH = W * 0.2 + titleLines.length * titleLh
  ctx.fillStyle = BLUE
  ctx.fillRect(0, 0, W, bandH)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `600 ${W * 0.03}px ${FONT}`
  ctx.fillText('CAMPUS MAP & DIRECTIONS', W / 2, W * 0.1)
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 ${W * 0.088}px ${FONT}`
  titleLines.forEach((l, i) => ctx.fillText(l, W / 2, W * 0.1 + W * 0.04 + (i + 1) * titleLh - W * 0.015))

  // Subtitle
  let y = bandH + W * 0.085
  ctx.fillStyle = INK
  ctx.font = `400 ${W * 0.048}px ${FONT}`
  for (const l of wrap(ctx, subtitle, inner)) {
    ctx.fillText(l, W / 2, y)
    y += W * 0.062
  }

  // QR code in a blue frame (as big as fits)
  const footerSpace = W * 0.36
  const qrSize = Math.min(W * 0.74, H - y - footerSpace)
  const frame = W * 0.014
  const qx = (W - qrSize) / 2
  const qy = y + W * 0.01
  roundRect(ctx, qx - frame * 1.5, qy - frame * 1.5, qrSize + frame * 3, qrSize + frame * 3, W * 0.035)
  ctx.fillStyle = BLUE
  ctx.fill()
  roundRect(ctx, qx - frame * 0.5, qy - frame * 0.5, qrSize + frame, qrSize + frame, W * 0.025)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  drawQr(ctx, url, qx, qy, qrSize)
  y = qy + qrSize + frame * 1.5 + W * 0.09

  // Steps: 1 Open your camera · 2 Scan the code · 3 Search & go
  const steps = ['Open camera', 'Scan the code', 'Search & go']
  const colW = inner / 3
  steps.forEach((s, i) => {
    const cx = pad + colW * i + colW / 2
    ctx.fillStyle = '#dbeafe'
    ctx.beginPath()
    ctx.arc(cx, y - W * 0.012, W * 0.032, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = BLUE
    ctx.font = `600 ${W * 0.036}px ${FONT}`
    ctx.fillText(String(i + 1), cx, y)
    ctx.fillStyle = INK
    ctx.font = `600 ${W * 0.033}px ${FONT}`
    ctx.fillText(s, cx, y + W * 0.075)
  })

  // Web address + school name
  ctx.fillStyle = MUTED
  ctx.font = `400 ${W * 0.03}px ${FONT}`
  ctx.fillText(`or open ${shortUrl}`, W / 2, H - W * 0.11)
  ctx.fillStyle = INK
  ctx.font = `600 ${W * 0.04}px ${FONT}`
  ctx.fillText(footer, W / 2, H - W * 0.055)

  return toBlob(c)
}
