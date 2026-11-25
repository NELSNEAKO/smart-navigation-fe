// Geometry helpers. Shared by the browser and the Express server (no DOM / Node APIs here).

const R = 6371000 // Earth radius in metres

/** Great-circle distance in metres between two points. */
export function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export const distanceBetween = (a, b) => haversine(a.lat, a.lng, b.lat, b.lng)

/** Closest item (anything with lat/lng) to a point, or null. */
export function nearest(items, point) {
  let best = null
  let bestD = Infinity
  for (const item of items) {
    const d = distanceBetween(item, point)
    if (d < bestD) {
      best = item
      bestD = d
    }
  }
  return best ? { item: best, distance: bestD } : null
}

export function formatDistance(m) {
  if (m == null) return ''
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

/** Walking time at ~1.3 m/s (about 80 m per minute), at least 1 minute. */
export function walkingMinutes(m) {
  return Math.max(1, Math.round(m / 80))
}
