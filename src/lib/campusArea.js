// The campus area: a circle (centre + radius) set by the admin. Maps show only what's inside.
// Pure helpers, shared by Leaflet (MapCanvas) and MapLibre (LiveNavigation).

const M_PER_DEG_LAT = 110540
const mPerDegLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)

/** Points around the circle, as { lat, lng }, closed (first = last). */
export function circleRing(area, steps = 96) {
  const out = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    out.push({
      lat: area.lat + (area.radiusM * Math.cos(a)) / M_PER_DEG_LAT,
      lng: area.lng + (area.radiusM * Math.sin(a)) / mPerDegLng(area.lat),
    })
  }
  return out
}

/** Bounding box of the circle, grown by `marginRatio` (0.1 = 10%): { south, west, north, east }. */
export function areaBounds(area, marginRatio = 0) {
  const r = area.radiusM * (1 + marginRatio)
  const dLat = r / M_PER_DEG_LAT
  const dLng = r / mPerDegLng(area.lat)
  return { south: area.lat - dLat, west: area.lng - dLng, north: area.lat + dLat, east: area.lng + dLng }
}

/** True when the point is inside the circle (plus `slackM`). */
export function insideArea(area, p, slackM = 0) {
  if (!area || !p) return true
  const dy = (p.lat - area.lat) * M_PER_DEG_LAT
  const dx = (p.lng - area.lng) * mPerDegLng(area.lat)
  return Math.hypot(dx, dy) <= area.radiusM + slackM
}

/**
 * Read coordinates pasted from Google Maps or typed by hand:
 * "10.2430, 123.8483", "10.2430 123.8483", "@10.2430,123.8483,145m", or a Google Maps link.
 * Returns { lat, lng } or null.
 */
export function parseLatLng(text) {
  if (!text) return null
  const m = String(text).match(/(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}
