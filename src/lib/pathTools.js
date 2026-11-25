// Geometry helpers for drawing and recording walkways in the admin. Pure functions.
import { distanceBetween } from './geo'

// Local flat projection (metres) around a reference point; accurate enough on a campus.
function projector(ref) {
  const kx = 111320 * Math.cos((ref.lat * Math.PI) / 180)
  const ky = 110540
  return (p) => ({ x: (p.lng - ref.lng) * kx, y: (p.lat - ref.lat) * ky })
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Douglas–Peucker: drop points that sit within `toleranceM` of a straight line. Keeps corners. */
export function simplify(points, toleranceM = 3) {
  if (points.length < 3) return points.slice()
  const proj = projector(points[0])
  const xy = points.map(proj)
  const keep = new Array(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    let maxD = 0
    let idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(xy[i], xy[s], xy[e])
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = true
      stack.push([s, idx], [idx, e])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** Remove points closer than `minM` to the previous kept point (always keeps the last one). */
export function enforceSpacing(points, minM = 4) {
  if (points.length < 3) return points.slice()
  const out = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    if (distanceBetween(out[out.length - 1], points[i]) >= minM) out.push(points[i])
  }
  const last = points[points.length - 1]
  if (distanceBetween(out[out.length - 1], last) < minM && out.length > 1) out.pop()
  out.push(last)
  return out
}

/** Closest existing node within `radiusM`, or null. */
export function nearestNode(nodes, point, radiusM) {
  let best = null
  let bestD = radiusM
  for (const n of nodes) {
    const d = distanceBetween(n, point)
    if (d <= bestD) {
      best = n
      bestD = d
    }
  }
  return best
}

/**
 * Auto-join: points within `radiusM` of an existing node become that node ({ id }), so a new
 * walkway connects to the network instead of stopping just short of it. Consecutive repeats
 * of the same node are collapsed. Returns [{ id } | { lat, lng }].
 */
export function snapToNetwork(points, nodes, radiusM = 6) {
  const out = []
  for (const p of points) {
    const hit = p.id ? null : nearestNode(nodes, p, radiusM)
    const item = p.id ? { id: p.id } : hit ? { id: hit.id, lat: hit.lat, lng: hit.lng } : { lat: p.lat, lng: p.lng }
    const prev = out[out.length - 1]
    if (prev?.id && item.id && prev.id === item.id) continue
    out.push(item)
  }
  return out
}

export function pathLength(points) {
  let m = 0
  for (let i = 1; i < points.length; i++) m += distanceBetween(points[i - 1], points[i])
  return m
}

/**
 * Average several GPS fixes, weighting precise ones more (1 / accuracy²).
 * Returns { lat, lng, accuracy } where accuracy is an estimate in metres.
 */
export function averageFixes(fixes) {
  if (!fixes.length) return null
  let w = 0
  let lat = 0
  let lng = 0
  for (const f of fixes) {
    const wi = 1 / Math.max(f.accuracy, 1) ** 2
    w += wi
    lat += f.lat * wi
    lng += f.lng * wi
  }
  return { lat: lat / w, lng: lng / w, accuracy: Math.sqrt(1 / w) }
}
