// Turn-by-turn: turn a route (list of points) into maneuvers, and place a GPS position on it.
// Pure functions, no Vue.
import { bearing, compass, distanceBetween } from './geo'

/** Signed turn angle from heading a to heading b, in degrees: + = right, - = left (-180..180). */
export function turnAngle(a, b) {
  return ((b - a + 540) % 360) - 180
}

function classify(angle) {
  const abs = Math.abs(angle)
  const side = angle > 0 ? 'right' : 'left'
  if (abs < 30) return null // straight on: no instruction
  if (abs < 60) return { type: `slight-${side}`, verb: `Bear ${side}` }
  if (abs < 150) return { type: side, verb: `Turn ${side}` }
  return { type: `uturn-${side}`, verb: 'Turn around' }
}

/**
 * Maneuvers along the route, in order:
 * [{ type, text, landmark, along }]  along = metres from the start of the route.
 * types: depart, slight-left/right, left/right, uturn-left/right, arrive.
 */
export function buildManeuvers(points, { destination, targetLabel } = {}) {
  if (!points || points.length < 2) return []
  const along = [0]
  for (let i = 1; i < points.length; i++) along.push(along[i - 1] + distanceBetween(points[i - 1], points[i]))

  const out = [{ type: 'depart', along: 0, text: '', landmark: null }] // text set below

  for (let i = 1; i < points.length - 1; i++) {
    const inLen = distanceBetween(points[i - 1], points[i])
    const outLen = distanceBetween(points[i], points[i + 1])
    if (inLen < 2 || outLen < 2) continue // GPS crumbs: no reliable direction
    const c = classify(turnAngle(bearing(points[i - 1], points[i]), bearing(points[i], points[i + 1])))
    if (!c) continue
    const landmark = points[i].label || null
    out.push({ type: c.type, along: along[i], text: landmark ? `${c.verb} at ${landmark}` : c.verb, landmark })
  }

  const end = targetLabel || destination || 'your destination'
  out.push({ type: 'arrive', along: along[along.length - 1], text: `Arrive at ${end}`, landmark: end })

  // The depart text names where to head: the first landmark ahead, else the destination.
  const firstTurn = out[1]
  out[0].text = `Head ${compass(points[0], points[1])}${firstTurn?.type === 'arrive' ? ` toward ${destination}` : ''}`
  return out
}

// Local flat projection in metres around a reference point; accurate enough on a campus.
function projector(ref) {
  const kx = 111320 * Math.cos((ref.lat * Math.PI) / 180)
  const ky = 110540
  return {
    to: (p) => ({ x: (p.lng - ref.lng) * kx, y: (p.lat - ref.lat) * ky }),
    from: (q) => ({ lat: ref.lat + q.y / ky, lng: ref.lng + q.x / kx }),
  }
}

/**
 * Snap a position onto the route line.
 * Returns { point, along, offset, segment, segmentBearing, total }:
 * along = metres from the route start to the snapped point, offset = metres from the route.
 */
export function snapToRoute(points, pos) {
  if (!points?.length || !pos) return null
  const P = projector(points[0])
  const xy = points.map(P.to)
  const q = P.to(pos)
  let best = null
  let acc = 0
  let total = 0
  for (let i = 1; i < xy.length; i++) total += Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y)
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1]
    const b = xy[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    const t = len ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (len * len))) : 0
    const sx = a.x + t * dx
    const sy = a.y + t * dy
    const off = Math.hypot(q.x - sx, q.y - sy)
    if (!best || off < best.offset - 0.01) {
      best = { point: P.from({ x: sx, y: sy }), along: acc + t * len, offset: off, segment: i - 1, segmentBearing: bearing(points[i - 1], points[i]) }
    }
    acc += len
  }
  if (points.length === 1) best = { point: points[0], along: 0, offset: distanceBetween(points[0], pos), segment: 0, segmentBearing: 0 }
  return { ...best, total }
}

/** Point at `along` metres from the start of the route (for the simulated walk). */
export function pointAlong(points, alongM) {
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    const len = distanceBetween(points[i - 1], points[i])
    if (acc + len >= alongM) {
      const t = len ? (alongM - acc) / len : 0
      const a = points[i - 1]
      const b = points[i]
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, bearing: bearing(a, b) }
    }
    acc += len
  }
  const last = points[points.length - 1]
  const prev = points[points.length - 2] ?? last
  return { lat: last.lat, lng: last.lng, bearing: bearing(prev, last) }
}
